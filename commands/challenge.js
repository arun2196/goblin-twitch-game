import { cleanUsername, cleanDisplayName, getOrCreatePlayer } from "../helpers/players.js";

export async function handleChallenge(env, url) {
  const challenger = cleanUsername(url.searchParams.get("user"));
  const challengerDisplay = cleanDisplayName(url.searchParams.get("user"));

  const target = cleanUsername(url.searchParams.get("target"));
  const targetDisplay = cleanDisplayName(url.searchParams.get("target"));

  const rawStake = Number(url.searchParams.get("stake"));

  if (!challenger || !target) {
    return new Response("Usage: !duel @goblin <gold>");
  }

  if (challenger === target) {
    return new Response("You cannot duel yourself, unstable goblin.");
  }

  const challengerPlayer = await getOrCreatePlayer(env, challenger, challengerDisplay);
  const targetPlayer = await getOrCreatePlayer(env, target, targetDisplay);

  if (challengerPlayer.gold < 1) {
    return new Response(`${challengerPlayer.display_name}, you need at least 1g to duel.`);
  }

  if (targetPlayer.gold < 1) {
    return new Response(`${targetPlayer.display_name} has no gold to wager.`);
  }

  const challengerItems = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM inventory WHERE username = ?`
  ).bind(challenger).first();

  const targetItems = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM inventory WHERE username = ?`
  ).bind(target).first();

  if (challengerItems.count < 1) {
    return new Response(`${challengerPlayer.display_name}, you need at least 1 item to duel.`);
  }

  if (targetItems.count < 1) {
    return new Response(`${targetPlayer.display_name} needs at least 1 item to duel.`);
  }

  const poorerGold = Math.min(
    Number(challengerPlayer.gold || 0),
    Number(targetPlayer.gold || 0)
  );

  const maxStake = Math.max(
    1,
    Math.min(100, Math.floor(poorerGold * 0.2))
  );

  let stake = rawStake;

  if (!Number.isInteger(stake) || stake <= 0) {
    stake = Math.min(5, maxStake);
  }

  if (stake > maxStake) {
    stake = maxStake;
  }

  if (stake < 1) {
    return new Response("Neither goblin has enough gold for a duel.");
  }

  let stakeNote = "";

  if (!Number.isInteger(rawStake) || rawStake <= 0) {
    stakeNote = " No wager was given, so the Goblin Treasury picked a safe stake.";
  } else if (rawStake > maxStake) {
    stakeNote = ` Requested stake was too high, so the Goblin Treasury capped it at ${stake}g.`;
  }

  const existingDuel = await env.DB.prepare(
    `SELECT *
     FROM duels
     WHERE target = ?
       AND status = 'pending'
       AND datetime(expires_at) > datetime('now')
     ORDER BY id DESC
     LIMIT 1`
  ).bind(target).first();

  if (existingDuel) {
    return new Response(
      `${targetPlayer.display_name} already has a pending duel. They must !ready or !run first.`
    );
  }

  const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO duels (challenger, target, stake, status, expires_at)
     VALUES (?, ?, ?, 'pending', ?)`
  ).bind(challenger, target, stake, expiresAt).run();

  await env.DB.prepare(
    `INSERT INTO events (event_type, message)
     VALUES (?, ?)`
  ).bind(
    "duel_challenge",
    `${challengerPlayer.display_name} challenged ${targetPlayer.display_name} for ${stake}g.`
  ).run();

  return new Response(
    `⚔️ ${challengerPlayer.display_name} challenged ${targetPlayer.display_name} for ${stake}g!${stakeNote} ${targetPlayer.display_name}, type !ready or !run.`
      .slice(0, 490)
  );
}
