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
    `UPDATE gobbo_sounds
     SET played = 1
     WHERE id = (
       SELECT id
       FROM gobbo_sounds
       WHERE played = 0
       ORDER BY id ASC
       LIMIT 1
     )
     RETURNING id, sound_url`
  ).first();

  if (!sound) {
    console.log("Gobbo sound queue empty");
    return null;
  }

  console.log("Gobbo sound claimed:", sound.id);
  return sound;
}