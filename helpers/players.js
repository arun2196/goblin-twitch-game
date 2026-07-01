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
  if (gold >= 100000) return "Goblin Emperor";
  if (gold >= 75000) return "High King of the Hoard";
  if (gold >= 50000) return "Goblin King";
  if (gold >= 35000) return "Crownhoard Lord";
  if (gold >= 25000) return "Treasure Duke";
  if (gold >= 15000) return "Vault Baron";
  if (gold >= 10000) return "Goldfang Prince";
  if (gold >= 7500) return "Coin Count";
  if (gold >= 5000) return "Rat Duke";
  if (gold >= 3500) return "Spoon Viscount";
  if (gold >= 2500) return "Barrel Baron";
  if (gold >= 1500) return "Loot Captain";
  if (gold >= 1000) return "Shiny Collector";
  if (gold >= 500) return "Coin Poucher";
  if (gold >= 250) return "Scrap Saver";
  if (gold >= 100) return "Pocket Goblin";
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
