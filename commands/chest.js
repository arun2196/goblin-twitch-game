import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

import { randomInt, pickWeighted } from "../helpers/random.js";

const MAX_INVENTORY_ITEMS = 3;

/**
 * Replaces supported placeholders inside a Gobbo's chest message.
 *
 * Supported placeholders:
 * {player}
 * {item}
 * {gold}
 * {type}
 * {rarity}
 * {power}
 */
function formatChestMessage(item, player, foundGold) {
  const fallbackMessages = [
    "✨ {item} hops out of the chest carrying {gold}g.",
    "📦 The chest rattles open and reveals {item} beside {gold}g.",
    "🎉 {item} emerges from the chest with {gold}g in tow.",
  ];

  let templates = fallbackMessages;

  if (item.chest_message) {
    try {
      const parsed = JSON.parse(item.chest_message);

      if (Array.isArray(parsed) && parsed.length > 0) {
        templates = parsed.filter(
          (message) =>
            typeof message === "string" && message.trim().length > 0
        );
      } else if (typeof parsed === "string" && parsed.trim()) {
        templates = [parsed];
      }
    } catch {
      // Supports old rows that contain one normal text message.
      templates = [item.chest_message];
    }
  }

  if (!templates.length) {
    templates = fallbackMessages;
  }

  const template = templates[randomInt(0, templates.length - 1)];

  const replacements = {
    "{player}": player.display_name,
    "{item}": item.item_name,
    "{gold}": String(foundGold),
    "{type}": item.item_type,
    "{rarity}": item.rarity,
    "{power}": String(item.power || 1),
  };

  let message = template;

  for (const [placeholder, value] of Object.entries(replacements)) {
    message = message.split(placeholder).join(value ?? "");
  }

  return message.trim();
}

export async function handleChest(env, url) {
  const rawUser = url.searchParams.get("user");
  const username = cleanUsername(rawUser);
  const displayName = cleanDisplayName(rawUser);

  if (!username) {
    return new Response("Usage: !chest");
  }

  const player = await getOrCreatePlayer(env, username, displayName);

  const inventoryCountResult = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM inventory
     WHERE username = ?`
  )
    .bind(username)
    .first();

  const inventoryCount = Number(inventoryCountResult?.count || 0);
  const currentGold = Number(player.gold || 0);

  let bonusMultiplier = 1;

  if (currentGold < 100) {
    bonusMultiplier = 1.0;
  } else if (currentGold < 250) {
    bonusMultiplier = 1.0;
  } else if (currentGold < 500) {
    bonusMultiplier = 1.0;
  }

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

  if (!items.results?.length) {
    return new Response(
      "No Gobbos exist in the database yet. Add rows to the items table first."
    );
  }

  const item = pickWeighted(items.results);

  if (inventoryCount >= MAX_INVENTORY_ITEMS) {
    const failLines = [
      "but their Gobbo collection was full, so the chest snapped shut.",
      "but they had no room, so the Gobbo wandered away in search of a less crowded backpack.",
      "but their pockets were already full of Gobbos and questionable supplies.",
      "but Gobbo Law allows only 3 companions at a time. The claim was rejected.",
      "but a tiny Gobbo accountant shouted NO SPACE and cancelled the transaction.",
      "but three Gobbos were already crammed into their inventory and refused to move over.",
      "but the new Gobbo took one look at the crowded inventory and quietly closed the chest again.",
    ];

    const flavor = failLines[randomInt(0, failLines.length - 1)];

    const failedEventMessage =
      `${player.display_name} opened a chest containing ` +
      `${foundGold} gold and ${item.item_name}, but their inventory was full.`;

    await env.DB.prepare(
      `INSERT INTO events (event_type, message)
       VALUES (?, ?)`
    )
      .bind("chest_failed_full_inventory", failedEventMessage)
      .run();

    const responseMessage =
      `${player.display_name} opened a chest and spotted ` +
      `${foundGold}g and ${item.item_name} ` +
      `[${item.item_type}, ${item.rarity}], ${flavor}`;

    return new Response(responseMessage.slice(0, 490));
  }

  /*
   * Durability is still stored in inventory.
   * It is no longer shown in the chest-opening response.
   */
  const usesLeft = Number(item.durability || 1);

  const chestMessage = formatChestMessage(item, player, foundGold);

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
      `${player.display_name} opened a chest and found ` +
        `${item.item_name} [${item.item_type}, ${item.rarity}], ` +
        `plus ${foundGold} gold.`
    ),
  ]);

  const description = item.description
    ? ` ${item.description}`
    : "";

  const responseMessage =
    `${player.display_name} opened a chest! ` +
    `${chestMessage} ` +
    `[${item.item_type}, ${item.rarity}].` +
    description;

  return new Response(responseMessage.slice(0, 490));
}