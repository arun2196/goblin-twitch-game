export async function getRandomDungeonSpecialEvent(env) {
  const events = await env.DB.prepare(`
    SELECT *
    FROM dungeon_special_events
    WHERE enabled = 1
  `).all();

  const rows = events.results || [];

  for (const event of rows) {
    const chance = Number(event.trigger_chance) || 0;

    if (Math.random() < chance) {
      return event;
    }
  }

  return null;
}