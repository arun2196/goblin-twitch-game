export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function cleanUsername(name) {
  return (name || "")
    .replace("@", "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 25);
}

export function cleanDisplayName(name) {
  return (name || "Goblin")
    .replace("@", "")
    .trim()
    .slice(0, 25);
}

export function getTitle(gold) {
  if (gold >= 10000) return "Goblin Prince";
  if (gold >= 5000) return "Rat Duke";
  if (gold >= 3500) return "Spoon Viscount";
  if (gold >= 2000) return "Cheese Count";
  if (gold >= 1000) return "Barrel Baron";
  if (gold >= 500) return "Loot Goblin";
  if (gold >= 250) return "Shiny Collector";
  if (gold >= 100) return "Coin Poucher";
  return "Goblin Peasant";
}

export async function getOrCreatePlayer(env, username, displayName) {
  let player = await env.DB.prepare(
    "SELECT * FROM players WHERE username = ?"
  ).bind(username).first();

  if (!player) {
    await env.DB.prepare(
      `INSERT INTO players (username, display_name, gold)
       VALUES (?, ?, 0)`
    ).bind(username, displayName).run();

    player = await env.DB.prepare(
      "SELECT * FROM players WHERE username = ?"
    ).bind(username).first();
  }

  return player;
}
