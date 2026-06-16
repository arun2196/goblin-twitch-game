import { cleanUsername, cleanDisplayName, getOrCreatePlayer } from "../helpers/players.js";
import { randomInt, pickWeighted } from "../helpers/random.js";

const MAX_INVENTORY_ITEMS = 3;

export async function handleChest(env, url) {
  const username = cleanUsername(url.searchParams.get("user"));
  const displayName = cleanDisplayName(url.searchParams.get("user"));

  if (!username) return new Response("Usage: !chest");

  const player = await getOrCreatePlayer(env, username, displayName);

  const inventoryCount = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM inventory
     WHERE username = ?`
  ).bind(username).first();

  const currentGold = Number(player.gold || 0);
  let bonusMultiplier = 1;

  if (currentGold < 100) bonusMultiplier = 1.6;
  else if (currentGold < 250) bonusMultiplier = 1.35;
  else if (currentGold < 500) bonusMultiplier = 1.15;

  const baseGold = randomInt(8, 25);
  const foundGold = Math.floor(baseGold * bonusMultiplier);

  const items = await env.DB.prepare(
    `SELECT *
     FROM items
     WHERE min_gold_bonus <= ?
     ORDER BY rarity`
  ).bind(currentGold).all();

  if (!items.results.length) {
    return new Response(
      "No items exist in the database yet. Add items to the items table first."
    );
  }

  const weightedItems = items.results.map(item => {
    let weight = Number(item.drop_weight || 100);

    if (currentGold < 250 && item.rarity === "rare") weight *= 2;
    if (currentGold < 100 && item.rarity === "rare") weight *= 3;
    if (currentGold < 100 && item.rarity === "uncommon") weight *= 2;

    return { ...item, drop_weight: weight };
  });

  const item = pickWeighted(weightedItems);

  if (inventoryCount.count >= MAX_INVENTORY_ITEMS) {
    const failLines = [
      "but their bag was already full, so the chest goblin slammed it shut.",
      "but they had no room, so the loot vanished into goblin bureaucracy.",
      "but their pockets were full of nonsense, so they got absolutely nothing.",
      "but inventory law says 3 items only. The loot union rejected the claim.",
      "but a tiny goblin accountant yelled NO SPACE and confiscated everything."
    ];

    const flavor = failLines[randomInt(0, failLines.length - 1)];

    await env.DB.prepare(
      `INSERT INTO events (event_type, message)
       VALUES (?, ?)`
    ).bind(
      "chest_failed_full_inventory",
      `${player.display_name} saw ${foundGold} gold and ${item.item_name}, but their inventory was full.`
    ).run();

    return new Response(
      `${player.display_name} opened a chest and saw ${foundGold}g + ${item.item_name} [${item.item_type}, ${item.rarity}]... ${flavor}`
    );
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO inventory
       (username, item_key, item_name, item_type, uses_left)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      username,
      item.item_key,
      item.item_name,
      item.item_type,
      item.durability || 1
    ),

    env.DB.prepare(
      `UPDATE players
       SET gold = gold + ?,
           total_gold_earned = total_gold_earned + ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(foundGold, foundGold, username),

    env.DB.prepare(
      `INSERT INTO transactions (username, amount, reason)
       VALUES (?, ?, ?)`
    ).bind(username, foundGold, "chest_gold"),

    env.DB.prepare(
      `INSERT INTO events (event_type, message)
       VALUES (?, ?)`
    ).bind(
      "chest",
      `${player.display_name} opened a chest and found ${foundGold} gold plus ${item.item_name}.`
    )
  ]);

  return new Response(
    `${player.display_name} opened a chest! Found ${foundGold}g and ${item.item_name} [${item.item_type}, ${item.rarity}, ${item.durability} use].`
  );
}
