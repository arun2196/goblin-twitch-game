export async function handleQueue(env, url) {
  const rawUsername = url.searchParams.get("username")?.trim();

  if (!rawUsername) {
    return new Response("Missing username.", { status: 400 });
  }

  const username = rawUsername.toLowerCase();

  const displayName =
    url.searchParams.get("displayName")?.trim() ||
    url.searchParams.get("display_name")?.trim() ||
    rawUsername;

  const role = "flex";

  const existing = await env.DB.prepare(`
    SELECT 1
    FROM dungeon_queue
    WHERE username = ?
  `)
    .bind(username)
    .first();

  await env.DB.prepare(`
    INSERT INTO dungeon_queue (username, display_name, role)
    VALUES (?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      display_name = excluded.display_name,
      queued_at = CURRENT_TIMESTAMP
  `)
    .bind(username, displayName, role)
    .run();

  if (existing) {
    return new Response(
      `@${displayName} is already in the dungeon queue!`
    );
  }

  return new Response(
    `@${displayName} joined the dungeon queue!`
  );
}