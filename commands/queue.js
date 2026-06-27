const VALID_ROLES = ["tank", "healer", "dd", "flex"];

const ROLE_LABELS = {
  tank: "Tank",
  healer: "Healer",
  dd: "Damage Dealer",
  flex: "Flex",
};

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

  const rawRole = url.searchParams.get("role")?.trim().toLowerCase() || "flex";
  const role = VALID_ROLES.includes(rawRole) ? rawRole : "flex";

  const existing = await env.DB.prepare(`
    SELECT role
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
      role = excluded.role,
      queued_at = CURRENT_TIMESTAMP
  `)
    .bind(username, displayName, role)
    .run();

  const roleLabel = ROLE_LABELS[role];

  if (existing) {
    return new Response(
      `@${displayName} updated their dungeon role to ${roleLabel}!`
    );
  }

  return new Response(
    `@${displayName} joined the dungeon queue as ${roleLabel}!`
  );
}