import { cleanUsername, cleanDisplayName } from "../helpers/players.js";
import { randomInt, getRandomInventoryItem } from "../helpers/random.js";
import { expireOldChallenges } from "../helpers/challenges.js";
import { getAdvantage } from "../helpers/duels.js";
import { generateCommentary } from "../helpers/commentary.js";

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
    item_name: player.display_name,
    item_type: "Mortal",
    rarity: "desperate",
    uses_left: null,
    is_player: true,
    description:
      "No champion was available, so the goblin entered the arena personally.",
  };
}

function getFighterPower(fighter) {
  if (fighter.is_player) return 1;
  return getRarityPower(fighter.rarity);
}

function getFighterLabel(player, fighter) {
  if (fighter?.is_player) {
    return `${player.display_name} personally`;
  }

  return `${player.display_name}'s ${fighter.item_name}`;
}

async function damageFighter(env, fighter, brokenItems) {
  if (!fighter || fighter.is_player || !fighter.id) return;

  const newUses = Number(fighter.uses_left) - 1;

  if (newUses <= 0) {
    await env.DB.prepare(`DELETE FROM inventory WHERE id = ?`)
      .bind(fighter.id)
      .run();

    brokenItems.push(fighter.item_name);
  } else {
    await env.DB.prepare(
      `UPDATE inventory
       SET uses_left = ?
       WHERE id = ?`
    )
      .bind(newUses, fighter.id)
      .run();
  }
}

export async function handleAccept(env, url) {
  const target = cleanUsername(url.searchParams.get("user"));
  const targetDisplay = cleanDisplayName(url.searchParams.get("user"));

  if (!target) {
    return new Response("Usage: !accept");
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

  const challengerPlayer = await env.DB.prepare(
    `SELECT * FROM players WHERE username = ?`
  )
    .bind(challenger)
    .first();

  const targetPlayer = await env.DB.prepare(
    `SELECT * FROM players WHERE username = ?`
  )
    .bind(target)
    .first();

  if (!challengerPlayer || !targetPlayer) {
    return new Response("One of the goblins vanished from the hoard.");
  }

  if (challengerPlayer.gold < stake || targetPlayer.gold < stake) {
    await env.DB.prepare(`UPDATE duels SET status = 'cancelled' WHERE id = ?`)
      .bind(challenge.id)
      .run();

    return new Response(
      "Challenge cancelled. One goblin no longer has enough gold."
    );
  }

  const challengerItem =
    (await getRandomInventoryItem(env, challenger)) ||
    makePlayerFighter(challengerPlayer);

  const targetItem =
    (await getRandomInventoryItem(env, target)) ||
    makePlayerFighter(targetPlayer);

  const challengerAdvantage = Number(
    (await getAdvantage(env, challengerItem.item_type, targetItem.item_type)) || 0
  );

  const targetAdvantage = Number(
    (await getAdvantage(env, targetItem.item_type, challengerItem.item_type)) || 0
  );

  const challengerRoll = randomInt(0, 2);
  const targetRoll = randomInt(0, 2);

  const challengerPower = getFighterPower(challengerItem);
  const targetPower = getFighterPower(targetItem);

  const challengerScore = challengerPower + challengerAdvantage + challengerRoll;
  const targetScore = targetPower + targetAdvantage + targetRoll;

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

  const brokenItems = [];

  await damageFighter(env, challengerItem, brokenItems);
  await damageFighter(env, targetItem, brokenItems);

  const winnerUsername = winner.username;
  const loserUsername = loser.username;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE players
       SET gold = gold + ?,
           duel_wins = duel_wins + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(stake, winnerUsername),

    env.DB.prepare(
      `UPDATE players
       SET gold = gold - ?,
           duel_losses = duel_losses + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(stake, loserUsername),

    env.DB.prepare(
      `INSERT INTO transactions (username, amount, reason)
       VALUES (?, ?, ?)`
    ).bind(winnerUsername, stake, "challenge_win"),

    env.DB.prepare(
      `INSERT INTO transactions (username, amount, reason)
       VALUES (?, ?, ?)`
    ).bind(loserUsername, -stake, "challenge_loss"),

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
      `INSERT INTO events (event_type, message)
       VALUES (?, ?)`
    ).bind(
      "challenge_result",
      `${winner.display_name} defeated ${loser.display_name} for ${stake}g.`
    ),
  ]);

  const fallback =
    `⚔️ ${getFighterLabel(
      challengerPlayer,
      challengerItem
    )} faced ${getFighterLabel(targetPlayer, targetItem)}. ` +
    `${winner.display_name} wins ${stake}g!`;

  let commentary = fallback;

  try {
    commentary = await generateCommentary(env, "duel", {
      challenger: {
        username: challengerPlayer.username,
        displayName: challengerPlayer.display_name,
        goldBefore: challengerPlayer.gold,
      },
      target: {
        username: targetPlayer.username,
        displayName: targetPlayer.display_name,
        goldBefore: targetPlayer.gold,
      },
      challengerFighter: {
        ...challengerItem,
        power: challengerPower,
        roll: challengerRoll,
        advantage: challengerAdvantage,
        score: challengerScore,
      },
      targetFighter: {
        ...targetItem,
        power: targetPower,
        roll: targetRoll,
        advantage: targetAdvantage,
        score: targetScore,
      },
      result: {
        winner: winner.display_name,
        loser: loser.display_name,
        stake,
        tieBreakerUsed,
        brokenItems,
      },
    });
  } catch (error) {
    console.log("Duel commentary failed:", error?.message || error);
  }

  let breakText = "";

  if (brokenItems.length) {
    breakText = ` Broken: ${brokenItems.join(", ")}.`;
  }

  return new Response(`${commentary}${breakText}`.slice(0, 490));
}