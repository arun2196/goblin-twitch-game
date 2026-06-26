import { cleanUsername, cleanDisplayName } from "../helpers/players.js";
import { expireOldChallenges } from "../helpers/challenges.js";

export async function handleDecline(env, url) {
  const target = cleanUsername(url.searchParams.get("user"));
  const targetDisplay = cleanDisplayName(url.searchParams.get("user"));

  if (!target) {
    return new Response("Usage: !run");
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

  const challengerPlayer = await env.DB.prepare(
    `SELECT display_name
     FROM players
     WHERE username = ?`
  )
    .bind(challenge.challenger)
    .first();

  const challengerDisplay =
    challengerPlayer?.display_name || challenge.challenger;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE duels
       SET status = 'declined',
           result = 'declined'
       WHERE id = ?`
    ).bind(challenge.id),

    env.DB.prepare(
      `INSERT INTO events (event_type, message)
       VALUES (?, ?)`
    ).bind(
      "challenge_declined",
      `${targetDisplay} declined a challenge from ${challengerDisplay}.`
    ),
  ]);

  return new Response(
    `🏃 ${targetDisplay} fled from ${challengerDisplay}'s challenge. The goblin crowd boos, but secretly understands.`
  );
}