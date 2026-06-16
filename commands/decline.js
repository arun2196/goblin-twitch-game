import { cleanUsername, cleanDisplayName } from "../helpers/players.js";
import { expireOldChallenges } from "../helpers/challenges.js";

export async function handleDecline(env, url) {
  const target = cleanUsername(url.searchParams.get("user"));
  const targetDisplay = cleanDisplayName(url.searchParams.get("user"));

  if (!target) {
    return new Response("Usage: !decline");
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

  await env.DB.prepare(
    `UPDATE duels
     SET status = 'declined'
     WHERE id = ?`
  ).bind(challenge.id).run();

  await env.DB.prepare(
    `INSERT INTO events (event_type, message)
     VALUES (?, ?)`
  ).bind(
    "challenge_declined",
    `${targetDisplay} declined a challenge from ${challenge.challenger}.`
  ).run();

  return new Response(
    `${targetDisplay} declined the challenge. The goblin crowd boos respectfully.`
  );
}
