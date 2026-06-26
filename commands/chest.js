import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

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
  )
    .bind(username)
    .first();

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
     ORDER BY drop_weight DESC`
  )
    .bind(currentGold)
    .all();

  if (!items.results.length) {
    return new Response(
      "No champions exist in the database yet. Add rows to the items table first."
    );
  }

  const item = pickWeighted(items.results);

  if (inventoryCount.count >= MAX_INVENTORY_ITEMS) {
    const failLines = [
      "but their warband was full, so the chest goblin slammed it shut.",
      "but they had no room, so the champion wandered off to find better management.",
      "but their pockets were full of nonsense, so the recruit escaped.",
      "but Goblin Warband Law says 3 champions only. The loot union rejected the claim.",
      "but a tiny goblin accountant yelled NO SPACE and confiscated everything.",
    ];

    const flavor = failLines[randomInt(0, failLines.length - 1)];

    await env.DB.prepare(
      `INSERT INTO events (event_type, message)
       VALUES (?, ?)`
    )
      .bind(
        "chest_failed_full_inventory",
        `${player.display_name} saw ${foundGold} gold and ${item.item_name}, but their warband was full.`
      )
      .run();

    return new Response(
      `${player.display_name} opened a chest and saw ${foundGold}g + ${item.item_name} [${item.item_type}, ${item.rarity}]... ${flavor}`.slice(
        0,
        490
      )
    );
  }

  const usesLeft = Number(item.durability || 1);

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
      usesLeft
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
      `${player.display_name} opened a chest and recruited ${item.item_name}, plus ${foundGold} gold.`
    ),
  ]);

  return new Response(
    `${player.display_name} opened a chest! Found ${foundGold}g and recruited ${item.item_name} [${item.item_type}, ${item.rarity}, ${usesLeft} durability].`.slice(
      0,
      490
    )
  );
}