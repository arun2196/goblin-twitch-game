import { cleanUsername, cleanDisplayName } from "../helpers/players.js";
import { randomInt, getRandomInventoryItem } from "../helpers/random.js";
import { expireOldChallenges } from "../helpers/challenges.js";
import { getAdvantage } from "../helpers/duels.js";
import { generateCommentary } from "../helpers/commentary.js";
import { applyStoryNames } from "../helpers/aliases.js";

function getRarityPower(rarity) {
  const powers = {
    desperate: 1,
  common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
  };

  return powers[String(rarity || "").toLowerCase()] || 1;
}

function makePlayerFighter(player) {
  return {
    id: null,
    item_key: "player_self",
    item_name: player.storyName || player.display_name,
    item_type: "Chaotic",
    rarity: "desperate",
    power: 1,
    uses_left: null,
    is_player: true,
    description:
      "No Gobbo was available, so the goblin entered the arena personally.",
    pvp_behavior:
      "Fights using improvised attacks, questionable confidence, and no clear plan.",
  };
}

async function enrichFighter(env, fighter) {
  if (!fighter || fighter.is_player || !fighter.item_key) {
    return fighter;
  }

  const itemData = await env.DB.prepare(
    `SELECT
       item_key,
       item_name,
       item_type,
       rarity,
       description,
       power,
       pvp_behavior,
       card_title,
       flavor_text
     FROM items
     WHERE item_key = ?
     LIMIT 1`
  )
    .bind(fighter.item_key)
    .first();

  if (!itemData) {
    return fighter;
  }

  return {
    ...fighter,
    ...itemData,

    // Keep inventory-specific values.
    id: fighter.id,
    uses_left: fighter.uses_left,
    is_player: false,
  };
}

function getFighterPower(fighter) {
  if (fighter?.is_player) {
    return 1;
  }

  const storedPower = Number(fighter?.power);

  if (Number.isFinite(storedPower) && storedPower > 0) {
    return storedPower;
  }

  return getRarityPower(fighter?.rarity);
}

function getFighterLabel(player, fighter) {
  const playerName = player.storyName || player.display_name;

  if (fighter?.is_player) {
    return `${playerName} personally`;
  }

  return `${playerName}'s ${fighter.item_name}`;
}

async function damageFighter(env, fighter, brokenItems) {
  if (!fighter || fighter.is_player || !fighter.id) {
    return;
  }

  const newUses = Number(fighter.uses_left) - 1;

  if (newUses <= 0) {
    await env.DB.prepare(
      `DELETE FROM inventory
       WHERE id = ?`
    )
      .bind(fighter.id)
      .run();

    brokenItems.push(fighter.item_name);
    return;
  }

  await env.DB.prepare(
    `UPDATE inventory
     SET uses_left = ?
     WHERE id = ?`
  )
    .bind(newUses, fighter.id)
    .run();
}

export async function handleAccept(env, url) {
  const target = cleanUsername(url.searchParams.get("user"));
  const targetDisplay = cleanDisplayName(url.searchParams.get("user"));

  if (!target) {
    return new Response("Usage: !ready");
  }

  await expireOldChallenges(env);

  const challenge = await env.DB.prepare(
    `SELECT *
     FROM duels
     WHERE target = ?
       AND status = 'pending'
       AND datetime(expires_at) > datetime('now')
     ORDER BY id DESC
     LIMIT 1`
  )
    .bind(target)
    .first();

  if (!challenge) {
    return new Response(`${targetDisplay}, you have no pending challenge.`);
  }

  const challenger = challenge.challenger;
  const stake = Number(challenge.stake);

  let challengerPlayer = await env.DB.prepare(
    `SELECT *
     FROM players
     WHERE username = ?`
  )
    .bind(challenger)
    .first();

  let targetPlayer = await env.DB.prepare(
    `SELECT *
     FROM players
     WHERE username = ?`
  )
    .bind(target)
    .first();

  if (!challengerPlayer || !targetPlayer) {
    return new Response(
      "One of the goblins vanished before the duel could begin."
    );
  }

  const storyPlayers = await applyStoryNames(env, [
    {
      ...challengerPlayer,
      displayName: challengerPlayer.display_name,
    },
    {
      ...targetPlayer,
      displayName: targetPlayer.display_name,
    },
  ]);

  challengerPlayer = {
    ...challengerPlayer,
    ...storyPlayers.find(
      (player) => player.username === challengerPlayer.username
    ),
  };

  targetPlayer = {
    ...targetPlayer,
    ...storyPlayers.find(
      (player) => player.username === targetPlayer.username
    ),
  };

  const challengerGold = Number(challengerPlayer.gold || 0);
  const targetGold = Number(targetPlayer.gold || 0);

  if (challengerGold < stake || targetGold < stake) {
    await env.DB.prepare(
      `UPDATE duels
       SET status = 'cancelled'
       WHERE id = ?`
    )
      .bind(challenge.id)
      .run();

    return new Response(
      "Challenge cancelled. One goblin no longer has enough gold."
    );
  }

  const selectedChallengerItem =
    (await getRandomInventoryItem(env, challenger)) ||
    makePlayerFighter(challengerPlayer);

  const selectedTargetItem =
    (await getRandomInventoryItem(env, target)) ||
    makePlayerFighter(targetPlayer);

  const challengerItem = await enrichFighter(
    env,
    selectedChallengerItem
  );

  const targetItem = await enrichFighter(
    env,
    selectedTargetItem
  );

  const challengerAdvantage = Number(
    (await getAdvantage(
      env,
      challengerItem.item_type,
      targetItem.item_type
    )) || 0
  );

  const targetAdvantage = Number(
    (await getAdvantage(
      env,
      targetItem.item_type,
      challengerItem.item_type
    )) || 0
  );

  const challengerRoll = randomInt(0, 2);
  const targetRoll = randomInt(0, 2);

  const challengerPower = getFighterPower(challengerItem);
  const targetPower = getFighterPower(targetItem);

  const challengerScore =
    challengerPower +
    challengerAdvantage +
    challengerRoll;

  const targetScore =
    targetPower +
    targetAdvantage +
    targetRoll;

  let winner;
  let loser;
  let winnerItem;
  let loserItem;
  let tieBreakerUsed = false;

  if (challengerScore > targetScore) {
    winner = challengerPlayer;
    loser = targetPlayer;
    winnerItem = challengerItem;
    loserItem = targetItem;
  } else if (targetScore > challengerScore) {
    winner = targetPlayer;
    loser = challengerPlayer;
    winnerItem = targetItem;
    loserItem = challengerItem;
  } else {
    tieBreakerUsed = true;

    if (Math.random() < 0.5) {
      winner = challengerPlayer;
      loser = targetPlayer;
      winnerItem = challengerItem;
      loserItem = targetItem;
    } else {
      winner = targetPlayer;
      loser = challengerPlayer;
      winnerItem = targetItem;
      loserItem = challengerItem;
    }
  }

  /*
   * The winner receives the wager plus extra gold thrown by the audience.
   * The loser only loses the original wager.
   */
  const audienceBonus = Math.min(
    50,
    randomInt(5, 10) + Math.floor(stake * 0.5)
  );
  const totalReward = stake + audienceBonus;

  const brokenItems = [];

  await damageFighter(env, challengerItem, brokenItems);
  await damageFighter(env, targetItem, brokenItems);

  const winnerUsername = winner.username;
  const loserUsername = loser.username;

  const winnerStoryName =
    winner.storyName || winner.display_name;

  const loserStoryName =
    loser.storyName || loser.display_name;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE players
       SET gold = gold + ?,
           total_gold_earned = total_gold_earned + ?,
           duel_wins = duel_wins + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(totalReward, totalReward, winnerUsername),

    env.DB.prepare(
      `UPDATE players
       SET gold = gold - ?,
           duel_losses = duel_losses + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(stake, loserUsername),

    env.DB.prepare(
      `INSERT INTO transactions (
         username,
         amount,
         reason
       )
       VALUES (?, ?, ?)`
    ).bind(
      winnerUsername,
      stake,
      "challenge_wager_win"
    ),

    env.DB.prepare(
      `INSERT INTO transactions (
         username,
         amount,
         reason
       )
       VALUES (?, ?, ?)`
    ).bind(
      winnerUsername,
      audienceBonus,
      "challenge_audience_bonus"
    ),

    env.DB.prepare(
      `INSERT INTO transactions (
         username,
         amount,
         reason
       )
       VALUES (?, ?, ?)`
    ).bind(
      loserUsername,
      -stake,
      "challenge_loss"
    ),

    env.DB.prepare(
      `UPDATE duels
       SET status = 'completed',
           accepted_at = CURRENT_TIMESTAMP,
           result = ?
       WHERE id = ?`
    ).bind(
      `${winner.display_name} defeated ${loser.display_name}`,
      challenge.id
    ),

    env.DB.prepare(
      `INSERT INTO events (
         event_type,
         message
       )
       VALUES (?, ?)`
    ).bind(
      "challenge_result",
      `${winner.display_name} defeated ${loser.display_name}, won the ${stake}g wager, and received ${audienceBonus}g from the audience.`
    ),
  ]);

  const fallback =
    `⚔️ ${getFighterLabel(
      challengerPlayer,
      challengerItem
    )} faced ${getFighterLabel(
      targetPlayer,
      targetItem
    )}. ${winnerStoryName} wins the ${stake}g wager, and the crowd throws in another ${audienceBonus}g!`;

  let commentary = fallback;

  try {
    commentary = await generateCommentary(env, "duel", {
      challenger: {
        username: challengerPlayer.username,
        displayName: challengerPlayer.display_name,
        storyName: challengerPlayer.storyName,
        alias: challengerPlayer.alias,
        aliases: challengerPlayer.aliases,
        goldBefore: challengerGold,
      },

      target: {
        username: targetPlayer.username,
        displayName: targetPlayer.display_name,
        storyName: targetPlayer.storyName,
        alias: targetPlayer.alias,
        aliases: targetPlayer.aliases,
        goldBefore: targetGold,
      },

      challengerFighter: {
        itemKey: challengerItem.item_key,
        name: challengerItem.item_name,
        type: challengerItem.item_type,
        rarity: challengerItem.rarity,
        description: challengerItem.description,
        pvpBehavior: challengerItem.pvp_behavior,
        flavorText: challengerItem.flavor_text,
        isPlayer: Boolean(challengerItem.is_player),
        power: challengerPower,
        roll: challengerRoll,
        advantage: challengerAdvantage,
        score: challengerScore,
      },

      targetFighter: {
        itemKey: targetItem.item_key,
        name: targetItem.item_name,
        type: targetItem.item_type,
        rarity: targetItem.rarity,
        description: targetItem.description,
        pvpBehavior: targetItem.pvp_behavior,
        flavorText: targetItem.flavor_text,
        isPlayer: Boolean(targetItem.is_player),
        power: targetPower,
        roll: targetRoll,
        advantage: targetAdvantage,
        score: targetScore,
      },

      result: {
        winner: winnerStoryName,
        winnerDisplayName: winner.display_name,
        loser: loserStoryName,
        loserDisplayName: loser.display_name,
        winnerFighter: winnerItem.item_name,
        loserFighter: loserItem.item_name,
        stake,
        audienceBonus,
        totalReward,
        tieBreakerUsed,
        brokenItems,
      },
    });
  } catch (error) {
    console.log(
      "Duel commentary failed:",
      error?.message || error
    );
  }

  let breakText = "";

  if (brokenItems.length === 1) {
    breakText =
      ` ${brokenItems[0]} is exhausted and heads back to camp for a long rest.`;
  } else if (brokenItems.length > 1) {
    breakText =
      ` ${brokenItems.join(
        " and "
      )} are exhausted and head back to camp for a long rest.`;
  }

  return new Response(
    `${commentary}${breakText}`.slice(0, 490)
  );
}