const PARTY_TEMPLATE = ["tank", "healer", "dd", "dd"];

export async function buildDungeonParty(env) {
  const queued = await env.DB.prepare(`
    SELECT id, username, display_name, role, queued_at
    FROM dungeon_queue
    ORDER BY queued_at ASC
  `).all();

  const players = queued.results || [];

  if (players.length === 0) {
    return null;
  }

  const usedPlayerIds = new Set();
  const members = [];

  for (const neededRole of PARTY_TEMPLATE) {
    const player = pickPlayerForRole(players, usedPlayerIds, neededRole);

    if (player) {
      usedPlayerIds.add(player.id);

      members.push({
        type: "player",
        queueId: player.id,
        username: player.username,
        displayName: player.display_name,
        role: neededRole,
        queuedRole: player.role,
      });

      continue;
    }

    const hero = await getRandomHeroForRole(env, neededRole);

    if (hero) {
      members.push({
        type: "hero",
        heroId: hero.id,
        name: hero.name,
        title: hero.title,
        role: neededRole,
        powerBonus: hero.power_bonus || 0,
        personality: hero.personality,
        catchphrase: hero.catchphrase,
      });
    }
  }

  return {
    members,
    playerQueueIds: [...usedPlayerIds],
  };
}

function pickPlayerForRole(players, usedPlayerIds, neededRole) {
  // Exact role first
  let player = players.find(
    (p) => !usedPlayerIds.has(p.id) && p.role === neededRole
  );

  if (player) return player;

  // Flex can fill anything
  player = players.find(
    (p) => !usedPlayerIds.has(p.id) && p.role === "flex"
  );

  if (player) return player;

  // DD can fill tank/healer only if desperate
  if (neededRole !== "dd") {
    player = players.find(
      (p) => !usedPlayerIds.has(p.id) && p.role === "dd"
    );
  }

  return player || null;
}

async function getRandomHeroForRole(env, role) {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM eso_heroes
    WHERE is_active = 1
      AND (role = ? OR role = 'flex')
  `)
    .bind(role)
    .all();

  const heroes = rows.results || [];
  if (heroes.length === 0) return null;

  return weightedPickHeroes(heroes);
}

function weightedPickHeroes(heroes) {
  const total = heroes.reduce(
    (sum, hero) => sum + Number(hero.spawn_weight || 100),
    0
  );

  let roll = Math.random() * total;

  for (const hero of heroes) {
    roll -= Number(hero.spawn_weight || 100);
    if (roll <= 0) return hero;
  }

  return heroes[heroes.length - 1];
}