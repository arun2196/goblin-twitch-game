export async function expireOldChallenges(env) {
  await env.DB.prepare(
    `UPDATE duels
     SET status = 'expired'
     WHERE status = 'pending'
       AND datetime(expires_at) <= datetime('now')`
  ).run();
}
