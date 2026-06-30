export async function getPlayerAliases(env, usernames) {
  if (!usernames?.length) {
    return new Map();
  }

  const uniqueUsernames = [...new Set(
    usernames
      .filter(Boolean)
      .map((u) => u.toLowerCase())
  )];

  if (!uniqueUsernames.length) {
    return new Map();
  }

  const placeholders = uniqueUsernames.map(() => "?").join(",");

  const rows = await env.DB.prepare(`
    SELECT username, alias
    FROM player_aliases
    WHERE enabled = 1
      AND username IN (${placeholders})
  `)
    .bind(...uniqueUsernames)
    .all();

  const aliasesByUser = new Map();

  for (const row of rows.results || []) {
    if (!aliasesByUser.has(row.username)) {
      aliasesByUser.set(row.username, []);
    }

    aliasesByUser.get(row.username).push(row.alias);
  }

  return aliasesByUser;
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export async function applyStoryNames(env, members, aliasChance = 0.45) {
  if (!members?.length) {
    return members;
  }

  const aliasesByUser = await getPlayerAliases(
    env,
    members.map((m) => m.username)
  );

  return members.map((member) => {
    const username = member.username?.toLowerCase();
    const aliases = aliasesByUser.get(username) || [];

    const useAlias = aliases.length > 0 && Math.random() < aliasChance;
    const alias = useAlias ? pickRandom(aliases) : null;

    return {
      ...member,
      aliases,
      alias,
      storyName: alias || member.displayName || member.name || username,
    };
  });
}