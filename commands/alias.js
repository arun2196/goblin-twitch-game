export async function handleAlias(env, url) {
  const rawTarget = url.searchParams.get("target")?.trim();
  const rawAlias = url.searchParams.get("alias")?.trim();
  const rawUpdatedBy = url.searchParams.get("updatedBy")?.trim() || "unknown";

  if (!rawTarget || !rawAlias) {
    return new Response("Usage: !alias @username nickname");
  }

  const allowed = await claimAliasCooldown(env);

  if (!allowed) {
    return new Response("Alias goblin is tired. Try again in a minute.");
  }

  const cleanTarget = rawTarget.replace(/^@/, "").trim();
  const username = cleanTarget.toLowerCase();
  const alias = rawAlias.slice(0, 32);

  await env.DB.prepare(`
    INSERT INTO player_aliases (username, display_name, alias, updated_by)
    VALUES (?, ?, ?, ?)
  `)
    .bind(username, cleanTarget, alias, rawUpdatedBy)
    .run();

  return new Response(`@${cleanTarget} gained nickname "${alias}"!`);
}

async function claimAliasCooldown(env) {
  const now = Date.now();
  const cooldownMs = 60_000;

  const updated = await env.DB.prepare(`
    UPDATE command_cooldowns
    SET last_used_at = ?
    WHERE command_key = 'alias'
      AND last_used_at <= ?
    RETURNING last_used_at
  `)
    .bind(now, now - cooldownMs)
    .first();

  if (updated) return true;

  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO command_cooldowns (command_key, last_used_at)
    VALUES ('alias', ?)
    RETURNING last_used_at
  `)
    .bind(now)
    .first();

  return !!inserted;
}