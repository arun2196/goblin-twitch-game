import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

import {
  randomInt,
  pickWeighted,
} from "../helpers/random.js";

const MAX_INVENTORY_ITEMS = 5;

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
            typeof message === "string" &&
            message.trim().length > 0
        );
      } else if (
        typeof parsed === "string" &&
        parsed.trim()
      ) {
        templates = [parsed];
      }
    } catch {
      // Supports old rows containing one normal text message.
      templates = [item.chest_message];
    }
  }

  if (!templates.length) {
    templates = fallbackMessages;
  }

  const template =
    templates[randomInt(0, templates.length - 1)];

  const replacements = {
    "{player}": player.display_name,
    "{item}": item.item_name,
    "{gold}": String(foundGold),
    "{type}": item.item_type,
    "{rarity}": item.rarity,
    "{power}": String(item.power || 1),
  };

  let message = template;

  for (
    const [placeholder, value]
    of Object.entries(replacements)
  ) {
    message = message
      .split(placeholder)
      .join(value ?? "");
  }

  return message.trim();
}

/**
 * Formats text for display in chat.
 *
 * Example:
 * "legendary" becomes "Legendary"
 */
function capitalize(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "Unknown";
  }

  return (
    text.charAt(0).toUpperCase() +
    text.slice(1)
  );
}

/**
 * Creates a mysterious description without revealing
 * the actual card name.
 *
 * Example:
 * "a mysterious Rare Mortal Gobbo"
 */
function getHiddenCardDescription(item) {
  const rarity = capitalize(item.rarity);
  const type = capitalize(item.item_type);

  return `a mysterious ${rarity} ${type} Gobbo`;
}

export async function handleChest(env, url) {
  const rawUser = url.searchParams.get("user");
  const username = cleanUsername(rawUser);
  const displayName = cleanDisplayName(rawUser);

  if (!username) {
    return new Response("Usage: !chest");
  }

  const player = await getOrCreatePlayer(
    env,
    username,
    displayName
  );

  const inventoryCountResult =
    await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM inventory
       WHERE username = ?`
    )
      .bind(username)
      .first();

  const inventoryCount = Number(
    inventoryCountResult?.count || 0
  );

  const currentGold = Number(
    player.gold || 0
  );

  /*
   * All multipliers currently equal 1.
   * This can be expanded later if low-gold
   * bonuses return.
   */
  const bonusMultiplier = 1;

  const baseGold = randomInt(8, 25);

  const foundGold = Math.floor(
    baseGold * bonusMultiplier
  );

  /*
   * We still select an item even when the
   * inventory is full.
   *
   * This lets us reveal rarity and type while
   * keeping the exact card name secret.
   */
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
      "No Gobbos exist in the database yet. " +
      "Add rows to the items table first."
    );
  }

  const item = pickWeighted(items.results);

  /*
   * Full inventory:
   *
   * - Do not award gold.
   * - Do not award the item.
   * - Do not create an overlay event.
   * - Do not reveal the card name in chat.
   * - Keep the real card name in the private event log.
   */
  if (
    inventoryCount >= MAX_INVENTORY_ITEMS
  ) {
    const failLines = [
      "but their Gobbo collection was full, so the chest snapped shut.",
      "but they had no room, so the mysterious Gobbo wandered away.",
      "but their pockets were already full of Gobbos and questionable supplies.",
      "but Gobbo Law allows only 3 companions at a time. The claim was rejected.",
      "but a tiny Gobbo accountant shouted NO SPACE and cancelled the transaction.",
      "but three Gobbos were already crammed into their inventory and refused to move over.",
      "but the unknown Gobbo took one look at the crowded inventory and quietly closed the chest again.",
    ];

    const flavor =
      failLines[
        randomInt(
          0,
          failLines.length - 1
        )
      ];

    const hiddenCard =
      getHiddenCardDescription(item);

    /*
     * Store the full information internally
     * for debugging and game records.
     */
    const failedEventMessage =
      `${player.display_name} opened a chest ` +
      `containing ${foundGold} gold and ` +
      `${item.item_name} ` +
      `[${item.item_type}, ${item.rarity}], ` +
      `but their inventory was full.`;

    await env.DB.prepare(
      `INSERT INTO events (
        event_type,
        message
      )
      VALUES (?, ?)`
    )
      .bind(
        "chest_failed_full_inventory",
        failedEventMessage
      )
      .run();

    /*
     * Chat sees the rarity and type,
     * but not the actual card name.
     */
    const responseMessage =
      `${player.display_name} opened a chest ` +
      `and spotted ${foundGold}g beside ` +
      `${hiddenCard}, ${flavor}`;

    return new Response(
      responseMessage.slice(0, 490)
    );
  }

  /*
   * Durability is still stored in inventory.
   * It is no longer shown in the chest response.
   */
  const usesLeft = Number(
    item.durability || 1
  );

  const chestMessage =
    formatChestMessage(
      item,
      player,
      foundGold
    );

  const batchStatements = [
    env.DB.prepare(
      `INSERT INTO inventory (
        username,
        item_key,
        item_name,
        item_type,
        uses_left
      )
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
           total_gold_earned =
             total_gold_earned + ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(
      foundGold,
      foundGold,
      username
    ),

    env.DB.prepare(
      `INSERT INTO transactions (
        username,
        amount,
        reason
      )
      VALUES (?, ?, ?)`
    ).bind(
      username,
      foundGold,
      "chest_gold"
    ),

    env.DB.prepare(
      `INSERT INTO events (
        event_type,
        message
      )
      VALUES (?, ?)`
    ).bind(
      "chest",
      `${player.display_name} opened a chest ` +
      `and found ${item.item_name} ` +
      `[${item.item_type}, ${item.rarity}], ` +
      `plus ${foundGold} gold.`
    ),
  ];

  /*
   * Only create a card reveal when:
   *
   * - The player has inventory space.
   * - The item is actually awarded.
   * - The item has a valid image URL.
   */
  if (item.image_url) {
    batchStatements.push(
      env.DB.prepare(
        `INSERT INTO chest_overlay_events (
          username,
          item_key,
          item_name,
          image_url
        )
        VALUES (?, ?, ?, ?)`
      ).bind(
        username,
        item.item_key,
        item.item_name,
        item.image_url
      )
    );
  }

  await env.DB.batch(
    batchStatements
  );

  const description = item.description
    ? ` ${item.description}`
    : "";

  const responseMessage =
    `${player.display_name} opened a chest! ` +
    `${chestMessage} ` +
    `[${item.item_type}, ${item.rarity}].` +
    description;

  return new Response(
    responseMessage.slice(0, 490)
  );
}