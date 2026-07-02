import { buildDungeonParty } from "../helpers/dungeonPartyBuilder.js";
import { getRandomDungeonEncounter } from "../helpers/dungeonData.js";
import { getRandomInventoryItem, randomInt } from "../helpers/random.js";
import { generateCommentary } from "../helpers/commentary.js";
import { sendTwitchChatMessage } from "../helpers/twitchChat.js";
import { getRandomDungeonSpecialEvent } from "../helpers/dungeonSpecialEvents.js";
import { applyStoryNames } from "../helpers/aliases.js";

async function ensurePlayer(env, member) {
  if (!member?.username) return;

  await env.DB.prepare(`
    INSERT OR IGNORE INTO players (
      username,
      display_name,
      gold,
      created_at,
      updated_at
    )
    VALUES (?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)
    .bind(
      member.username,
      member.displayName || member.display_name || member.username
    )
    .run();

  await env.DB.prepare(`
    UPDATE players
    SET display_name = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE username = ?
  `)
    .bind(
      member.displayName || member.display_name || member.username,
      member.username
    )
    .run();
}

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
    item_name: member.storyName || member.displayName || member.username,
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

async function rewardPlayer(env, username, displayName, amount, reason) {
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO players (
        username,
        display_name,
        gold,
        created_at,
        updated_at
      )
      VALUES (?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(username, displayName || username),

    env.DB.prepare(`
      UPDATE players
      SET gold = gold + ?,
          display_name = COALESCE(?, display_name),
          updated_at = CURRENT_TIMESTAMP
      WHERE username = ?
    `).bind(amount, displayName || username, username),

    env.DB.prepare(`
      INSERT INTO transactions (username, amount, reason)
      VALUES (?, ?, ?)
    `).bind(username, amount, reason),
  ]);
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "JSON stringify failed" });
  }
}

async function getQueueSnapshot(env) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM dungeon_queue
    ORDER BY id ASC
  `).all();

  return result.results || [];
}

async function createDungeonRun(env, runId, queueSnapshot) {
  await env.DB.prepare(`
    INSERT INTO dungeon_runs (
      run_id,
      status,
      queue_snapshot_json
    )
    VALUES (?, 'started', ?)
  `)
    .bind(runId, safeJson(queueSnapshot))
    .run();
}

async function updateDungeonRun(env, runId, fields) {
  const entries = Object.entries(fields);
  if (!entries.length) return;

  const setSql = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => value);

  await env.DB.prepare(`
    UPDATE dungeon_runs
    SET ${setSql}
    WHERE run_id = ?
  `)
    .bind(...values, runId)
    .run();
}

async function logDungeonMember(env, runId, row) {
  await env.DB.prepare(`
    INSERT INTO dungeon_run_members (
      run_id,
      queue_id,
      username,
      display_name,
      story_name,
      role,
      selected,
      reward_amount,
      item_name,
      item_id,
      item_power
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      runId,
      row.queueId ?? null,
      row.username ?? null,
      row.displayName ?? null,
      row.storyName ?? null,
      row.role ?? null,
      row.selected ? 1 : 0,
      row.rewardAmount ?? 0,
      row.itemName ?? null,
      row.itemId ?? null,
      row.itemPower ?? null
    )
    .run();
}

export async function handleDungeon(env, url) {
  const runId = crypto.randomUUID();

  console.log(`[Dungeon Cron] Starting scheduled dungeon. Run: ${runId}`);

  const queueSnapshot = await getQueueSnapshot(env);
  await createDungeonRun(env, runId, queueSnapshot);

  try {
    const party = await buildDungeonParty(env);

    await updateDungeonRun(env, runId, {
      party_json: safeJson(party),
      selected_queue_ids_json: safeJson(party?.playerQueueIds || []),
    });

    if (!party || party.members.length === 0) {
      await updateDungeonRun(env, runId, {
        status: "no_players",
        finished_at: new Date().toISOString(),
      });

      console.log("[Dungeon Cron] No queued players.");
      return new Response("");
    }

    const encounter = await getRandomDungeonEncounter(env);

    if (!encounter) {
      await updateDungeonRun(env, runId, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error: "No dungeon encounter found.",
      });

      return new Response("No dungeon encounter found.");
    }

    let realPlayers = party.members.filter((m) => m.type === "player");

    for (const member of realPlayers) {
      await ensurePlayer(env, member);
    }

    realPlayers = await applyStoryNames(env, realPlayers);

    const storyParty = {
      ...party,
      members: party.members.map((member) => {
        if (member.type !== "player") return member;

        return realPlayers.find((p) => p.username === member.username) || member;
      }),
    };

    const playerItems = [];

    for (const member of realPlayers) {
      const item =
        (await getRandomInventoryItem(env, member.username)) ||
        makePersonalChampion(member);

      playerItems.push({
        username: member.username,
        displayName: member.displayName || member.username,
        storyName: member.storyName,
        alias: member.alias,
        aliases: member.aliases,
        role: member.role,
        item,
        itemPower: getItemPower(item),
      });
    }

    for (const row of playerItems) {
      const queueRow = queueSnapshot.find((q) => q.username === row.username);

      await logDungeonMember(env, runId, {
        queueId: queueRow?.id,
        username: row.username,
        displayName: row.displayName,
        storyName: row.storyName,
        role: row.role,
        selected: true,
        itemName: row.item?.item_name,
        itemId: row.item?.id,
        itemPower: row.itemPower,
      });
    }

    const brokenItems = [];

    const successChance = calculateSuccessChance({
      party: storyParty,
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
      let amount = success ? randomInt(80, 160) : 0;
      let bonusAmount = 0;

      if (specialEvent && success) {
        bonusAmount = randomInt(
          Number(specialEvent.bonus_gold_min || 0),
          Number(specialEvent.bonus_gold_max || 0)
        );

        amount += bonusAmount;
      }

      await rewardPlayer(
        env,
        member.username,
        member.displayName || member.username,
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
        displayName: member.displayName || member.username,
        storyName: member.storyName,
        alias: member.alias,
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
      party: storyParty,
      encounter,
      playerItems,
      heroes: storyParty.members.filter((m) => m.type === "hero"),
      specialEvent,
      specialPrompt,
      result: {
        success,
        successChance,
        rewards,
        brokenItems,
      },
    };

    const fallbackNames = storyParty.members
      .map((m) => m.storyName || m.displayName || m.name || m.username)
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

    const rewardText = rewards.some((r) => r.amount > 0)
      ? " Rewards: " +
        rewards
          .filter((r) => r.amount > 0)
          .map((r) => `${r.displayName} +${r.amount}g`)
          .join(", ") +
        "."
      : "";

    const brokenText = brokenItems.length
      ? ` Broken: ${brokenItems.join(", ")}.`
      : "";

    const finalMessage = `${commentary}${rewardText}${brokenText}`.slice(0, 490);

    try {
      await sendTwitchChatMessage(env, finalMessage);
    } catch (error) {
      console.log("Dungeon chat post failed:", error?.message || error);
    }

    const remainingQueue = await getQueueSnapshot(env);

    await updateDungeonRun(env, runId, {
      status: "completed",
      finished_at: new Date().toISOString(),
      remaining_queue_json: safeJson(remainingQueue),
      encounter_json: safeJson(encounter),
      special_event_json: safeJson(specialEvent),
      player_items_json: safeJson(playerItems),
      rewards_json: safeJson(rewards),
      broken_items_json: safeJson(brokenItems),
      success: success ? 1 : 0,
      success_chance: successChance,
      fallback_message: fallback,
      commentary,
      final_message: finalMessage,
    });

    return new Response(finalMessage);
  } catch (error) {
    console.log("Dungeon run failed:", error?.message || error);

    await updateDungeonRun(env, runId, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error: String(error?.stack || error?.message || error),
    });

    return new Response("Dungeon run failed.", { status: 500 });
  }
}