import { buildDungeonParty } from "../helpers/dungeonPartyBuilder.js";
import { getRandomDungeonEncounter } from "../helpers/dungeonData.js";
import { getRandomInventoryItem, randomInt } from "../helpers/random.js";
import { generateCommentary } from "../helpers/commentary.js";
import { sendTwitchChatMessage } from "../helpers/twitchChat.js";
import { getRandomDungeonSpecialEvent } from "../helpers/dungeonSpecialEvents.js";

function getItemPower(item) {
  if (!item) return 1;

  if (item.power !== null && item.power !== undefined) {
    return Number(item.power) || 1;
  }

  const rarityPower = {
    desperate: 1,
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
  };

  return rarityPower[String(item.rarity || "").toLowerCase()] || 1;
}

function makePersonalChampion(member) {
  return {
    id: null,
    item_name: member.displayName,
    item_type: "Mortal",
    rarity: "desperate",
    power: 1,
    uses_left: null,
    is_player: true,
    description: "No champion was available, so the goblin entered personally.",
  };
}

async function damageItem(env, item, brokenItems) {
  if (!item || item.is_player || !item.id) return;

  const newUses = Number(item.uses_left) - 1;

  if (newUses <= 0) {
    await env.DB.prepare(`DELETE FROM inventory WHERE id = ?`)
      .bind(item.id)
      .run();

    brokenItems.push(item.item_name);
    return;
  }

  await env.DB.prepare(`
    UPDATE inventory
    SET uses_left = ?
    WHERE id = ?
  `)
    .bind(newUses, item.id)
    .run();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateSuccessChance({ party, playerItems, encounter }) {
  let chance = 75;

  const realTank = party.members.some(
    (m) => m.type === "player" && m.role === "tank"
  );

  const realHealer = party.members.some(
    (m) => m.type === "player" && m.role === "healer"
  );

  const realPlayers = party.members.filter((m) => m.type === "player");
  const heroes = party.members.filter((m) => m.type === "hero");

  if (realTank) chance += 5;
  else chance -= 5;

  if (realHealer) chance += 5;
  else chance -= 5;

  chance += realPlayers.length * 2;
  chance += heroes.reduce((sum, hero) => sum + Number(hero.powerBonus || 0), 0);

  const totalItemPower = playerItems.reduce(
    (sum, row) => sum + getItemPower(row.item),
    0
  );

  chance += totalItemPower;
  chance -= Math.floor(Number(encounter.minimum_level || 10) / 10);

  return clamp(chance, 20, 95);
}

async function rewardPlayer(env, username, amount, reason) {
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE players
      SET gold = gold + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE username = ?
    `).bind(amount, username),

    env.DB.prepare(`
      INSERT INTO transactions (username, amount, reason)
      VALUES (?, ?, ?)
    `).bind(username, amount, reason),
  ]);
}

export async function handleDungeon(env, url) {
  console.log("[Dungeon Cron] Starting scheduled dungeon.");

  const party = await buildDungeonParty(env);

  if (!party || party.members.length === 0) {
    return new Response("");
  }

  const encounter = await getRandomDungeonEncounter(env);

  if (!encounter) {
    return new Response("No dungeon encounter found.");
  }

  const realPlayers = party.members.filter((m) => m.type === "player");
  const playerItems = [];

  for (const member of realPlayers) {
    const item =
      (await getRandomInventoryItem(env, member.username)) ||
      makePersonalChampion(member);

    playerItems.push({
      username: member.username,
      displayName: member.displayName,
      role: member.role,
      item,
      itemPower: getItemPower(item),
    });
  }

  const brokenItems = [];

  const successChance = calculateSuccessChance({
    party,
    playerItems,
    encounter,
  });

  const success = Math.random() * 100 < successChance;
  const specialEvent = await getRandomDungeonSpecialEvent(env);

  for (const row of playerItems) {
    await damageItem(env, row.item, brokenItems);
  }

  const rewards = [];

  for (const member of realPlayers) {
    let amount = success ? randomInt(80, 160) : randomInt(10, 40);
    let bonusAmount = 0;

    if (specialEvent) {
      bonusAmount = randomInt(
        Number(specialEvent.bonus_gold_min || 0),
        Number(specialEvent.bonus_gold_max || 0)
      );

      amount += bonusAmount;
    }

    await rewardPlayer(
      env,
      member.username,
      amount,
      specialEvent
        ? success
          ? "dungeon_special_success"
          : "dungeon_special_failure"
        : success
          ? "dungeon_success"
          : "dungeon_failure"
    );

    rewards.push({
      username: member.username,
      displayName: member.displayName,
      amount,
      bonusAmount,
    });
  }

  if (party.playerQueueIds?.length) {
    const placeholders = party.playerQueueIds.map(() => "?").join(",");

    await env.DB.prepare(`
      DELETE FROM dungeon_queue
      WHERE id IN (${placeholders})
    `)
      .bind(...party.playerQueueIds)
      .run();
  }

  const specialPrompt = specialEvent
    ? success
      ? specialEvent.success_prompt
      : specialEvent.failure_prompt
    : null;

  const data = {
    party,
    encounter,
    playerItems,
    heroes: party.members.filter((m) => m.type === "hero"),
    specialEvent,
    specialPrompt,
    result: {
      success,
      successChance,
      rewards,
      brokenItems,
    },
  };

  const fallbackNames = party.members
    .map((m) => m.displayName || m.name)
    .join(", ");

  const fallback = specialEvent
    ? success
      ? `🌌 ${fallbackNames} survived a Reality Glitch: ${specialEvent.event_name}!`
      : `🌌 ${fallbackNames} were humbled by a Reality Glitch: ${specialEvent.event_name}!`
    : success
      ? `🏰 ${fallbackNames} conquered ${encounter.dungeon_name} and defeated ${encounter.boss_name}!`
      : `💀 ${fallbackNames} entered ${encounter.dungeon_name}, but ${encounter.boss_name} sent them crawling back.`;

  let commentary = fallback;

  try {
    commentary = await generateCommentary(
      env,
      specialEvent ? "dungeon_special" : "dungeon",
      data
    );
  } catch (error) {
    console.log("Dungeon commentary failed:", error?.message || error);
  }

  let rewardText = "";

  if (rewards.length) {
    rewardText =
      " Rewards: " +
      rewards.map((r) => `${r.displayName} +${r.amount}g`).join(", ") +
      ".";
  }

  let brokenText = "";

  if (brokenItems.length) {
    brokenText = ` Broken: ${brokenItems.join(", ")}.`;
  }

  const finalMessage = `${commentary}${rewardText}${brokenText}`.slice(0, 490);

  try {
    await sendTwitchChatMessage(env, finalMessage);
  } catch (error) {
    console.log("Dungeon chat post failed:", error?.message || error);
  }

  return new Response(finalMessage);
}