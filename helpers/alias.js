export async function getPlayerAlias(env, username, fallbackName) {
  const row = await env.DB.prepare(`
    SELECT aliases
    FROM player_aliases
    WHERE username = ?
  `)
    .bind(username.toLowerCase())
    .first();

  if (!row?.aliases) return fallbackName;

  try {
    const aliases = JSON.parse(row.aliases);

    if (!Array.isArray(aliases) || aliases.length === 0) {
      return fallbackName;
    }

    return aliases[Math.floor(Math.random() * aliases.length)];
  } catch {
    return fallbackName;
  }
}