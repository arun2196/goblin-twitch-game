import { cleanUsername, cleanDisplayName } from "../helpers/players.js";
import { randomInt, getRandomInventoryItem } from "../helpers/random.js";
import { expireOldChallenges } from "../helpers/challenges.js";
import { getAdvantage, getDuelText } from "../helpers/duels.js";
import { fillDuelText } from "../helpers/templates.js";

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
  ).bind(target).first();

  if (!challenge) {
    return new Response(`${targetDisplay}, you have no pending challenge.`);
  }

  const challenger = challenge.challenger;
  const stake = Number(challenge.stake);

  const challengerPlayer = await env.DB.prepare(
    `SELECT * FROM players WHERE username = ?`
  ).bind(challenger).first();

  const targetPlayer = await env.DB.prepare(
    `SELECT * FROM players WHERE username = ?`
  ).bind(target).first();

  if (!challengerPlayer || !targetPlayer) {
    return new Response("One of the goblins vanished from the hoard.");
  }

  if (challengerPlayer.gold < stake) {
    await env.DB.prepare(
      `UPDATE duels SET status = 'cancelled' WHERE id = ?`
    ).bind(challenge.id).run();

    return new Response(
      `${challengerPlayer.display_name} no longer has enough gold. Challenge cancelled.`
    );
  }

  if (targetPlayer.gold < stake) {
    await env.DB.prepare(
      `UPDATE duels SET status = 'cancelled' WHERE id = ?`
    ).bind(challenge.id).run();

    return new Response(
      `${targetPlayer.display_name} no longer has enough gold. Challenge cancelled.`
    );
  }

  const challengerItem = await getRandomInventoryItem(env, challenger);
  const targetItem = await getRandomInventoryItem(env, target);

  if (!challengerItem || !targetItem) {
    await env.DB.prepare(
      `UPDATE duels SET status = 'cancelled' WHERE id = ?`
    ).bind(challenge.id).run();

    return new Response(
      "Challenge cancelled. One goblin has no items left."
    );
  }

  const challengerAdvantage = await getAdvantage(
    env,
    challengerItem.item_type,
    targetItem.item_type
  );

  const targetAdvantage = await getAdvantage(
    env,
    targetItem.item_type,
    challengerItem.item_type
  );

  const challengerRoll = randomInt(1, 100);
  const targetRoll = randomInt(1, 100);

  const challengerScore =
    challengerRoll + (challengerAdvantage > 0 ? 30 : 0);

  const targetScore =
    targetRoll + (targetAdvantage > 0 ? 30 : 0);

  let winner;
  let loser;
  let winnerItem;
  let loserItem;
  let commentaryCategory = "tie";

  if (challengerScore > targetScore) {
    winner = challengerPlayer;
    loser = targetPlayer;
    winnerItem = challengerItem;
    loserItem = targetItem;

    commentaryCategory =
      challengerAdvantage > 0 ? "advantage" :
      targetAdvantage > 0 ? "upset" :
      "victory";
  } else if (targetScore > challengerScore) {
    winner = targetPlayer;
    loser = challengerPlayer;
    winnerItem = targetItem;
    loserItem = challengerItem;

    commentaryCategory =
      targetAdvantage > 0 ? "advantage" :
      challengerAdvantage > 0 ? "upset" :
      "victory";
  } else {
    // Rare exact tie: coin flip.
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

    commentaryCategory = "tie";
  }

  const introTextRaw = await getDuelText(env, "intro");
  const mainTextRaw = await getDuelText(
    env,
    commentaryCategory,
    winnerItem.item_type,
    loserItem.item_type
  );
  const victoryTextRaw = await getDuelText(env, "victory");

  const values = {
    A: challengerPlayer.display_name,
    B: targetPlayer.display_name,
    A_ITEM: challengerItem.item_name,
    B_ITEM: targetItem.item_name,
    WINNER: winner.display_name,
    LOSER: loser.display_name,
    STAKE: String(stake),
    ITEM: ""
  };

  const introText = fillDuelText(introTextRaw, values);
  const mainText = fillDuelText(mainTextRaw, {
    ...values,
    A: winner.display_name,
    B: loser.display_name,
    A_ITEM: winnerItem.item_name,
    B_ITEM: loserItem.item_name
  });
  const victoryText = fillDuelText(victoryTextRaw, values);

  const brokenItems = [];

  for (const item of [challengerItem, targetItem]) {
    const newUses = Number(item.uses_left) - 1;

    if (newUses <= 0) {
      await env.DB.prepare(
        `DELETE FROM inventory WHERE id = ?`
      ).bind(item.id).run();

      brokenItems.push(item.item_name);
    } else {
      await env.DB.prepare(
        `UPDATE inventory
         SET uses_left = ?
         WHERE id = ?`
      ).bind(newUses, item.id).run();
    }
  }

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
       SET status = 'completed'
       WHERE id = ?`
    ).bind(challenge.id),

    env.DB.prepare(
      `INSERT INTO events (event_type, message)
       VALUES (?, ?)`
    ).bind(
      "challenge_result",
      `${winner.display_name} defeated ${loser.display_name} for ${stake}g.`
    )
  ]);

  let breakText = "";

  if (brokenItems.length) {
    const breakLines = [];

    for (const itemName of brokenItems) {
      const breakTextRaw = await getDuelText(env, "break");
      breakLines.push(
        fillDuelText(breakTextRaw, { ITEM: itemName })
      );
    }

    breakText = " " + breakLines.join(" ");
  }

  return new Response(
    `⚔️ ${introText} ${mainText} ${victoryText} Rolls: ${challengerPlayer.display_name} ${challengerScore}, ${targetPlayer.display_name} ${targetScore}.${breakText}`
      .slice(0, 490)
  );
}
