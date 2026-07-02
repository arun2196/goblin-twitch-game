const PARTY_SIZE = 4;

export async function buildDungeonParty(env) {
  const queued = await env.DB.prepare(`
    SELECT id, username, display_name, queued_at
    FROM dungeon_queue
    ORDER BY queued_at ASC, id ASC
  `).all();

  const allQueuedPlayers = queued.results || [];
  const selectedPlayers = allQueuedPlayers.slice(0, PARTY_SIZE);
  const unselectedPlayers = allQueuedPlayers.slice(PARTY_SIZE);

  if (selectedPlayers.length === 0) {
    return null;
  }

  const members = selectedPlayers.map((player) => ({
    type: "player",
    queueId: player.id,
    username: player.username,
    displayName: player.display_name || player.username,
  }));

  const selectionLog = selectedPlayers.map((player, index) => ({
    slot: index + 1,
    selectedType: "player",
    queueId: player.id,
    username: player.username,
    displayName: player.display_name || player.username,
    selectionReason: "fifo_queue_order",
  }));

  while (members.length < PARTY_SIZE) {
    const hero = await getRandomHero(env);

    if (!hero) break;

    members.push({
      type: "hero",
      heroId: hero.id,
      name: hero.name,
      title: hero.title,
      powerBonus: hero.power_bonus || 0,
      personality: hero.personality,
      catchphrase: hero.catchphrase,
    });

    selectionLog.push({
      slot: members.length,
      selectedType: "hero",
      heroId: hero.id,
      name: hero.name,
      title: hero.title,
      selectionReason: "hero_filled_empty_party_slot",
    });
  }

  return {
    members,
    playerQueueIds: selectedPlayers.map((player) => player.id),

    debug: {
      queueBeforeBuild: allQueuedPlayers,
      selectedPlayers,
      unselectedPlayers,
      selectionLog,
    },
  };
}

async function getRandomHero(env) {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM eso_heroes
    WHERE is_active = 1
  `).all();

  const heroes = rows.results || [];

  if (heroes.length === 0) {
    return null;
  }

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

    if (roll <= 0) {
      return hero;
    }
  }

  return heroes[heroes.length - 1];
}