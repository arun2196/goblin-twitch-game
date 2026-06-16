export async function queueGobboSound(env, soundUrl, r2Key) {
  await env.DB.prepare(
    `INSERT INTO gobbo_sounds (sound_url, r2_key, played, created_at)
     VALUES (?, ?, 0, ?)`
  )
    .bind(soundUrl, r2Key, Date.now())
    .run();
}

export async function getNextGobboSound(env) {
  const sound = await env.DB.prepare(
    `SELECT id, sound_url
     FROM gobbo_sounds
     WHERE played = 0
     ORDER BY id ASC
     LIMIT 1`
  ).first();

  if (!sound) return null;

  await env.DB.prepare(
    `UPDATE gobbo_sounds
     SET played = 1
     WHERE id = ?`
  )
    .bind(sound.id)
    .run();

  return sound;
}