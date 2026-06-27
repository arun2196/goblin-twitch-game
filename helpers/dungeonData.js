export async function getRandomDungeonEncounter(env) {
  const dungeon = await env.DB.prepare(`
    SELECT id, name, zone
    FROM eso_dungeons
    WHERE is_active = 1
    ORDER BY RANDOM()
    LIMIT 1
  `).first();

  if (!dungeon) return null;

  const boss = await env.DB.prepare(`
    SELECT id, name, notes
    FROM eso_dungeon_bosses
    WHERE dungeon_id = ?
    ORDER BY RANDOM()
    LIMIT 1
  `)
    .bind(dungeon.id)
    .first();

  if (!boss) return null;

  return {
    dungeon_id: dungeon.id,
    dungeon_name: dungeon.name,
    zone: dungeon.zone,
    boss_id: boss.id,
    boss_name: boss.name,
    boss_notes: boss.notes,
  };
}