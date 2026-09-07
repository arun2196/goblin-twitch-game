import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

import {
  randomInt,
  pickWeighted,
} from "../helpers/random.js";

import {
  getSuperKeyCount,
  consumeSuperKey,
  grantPetEggIfMissing,
  maybeAwardEssence,
} from "../helpers/petRewards.js";

const MAX_INVENTORY_ITEMS = 4;

const MAGIC_CHEST_GOLD_MIN = 500;
const MAGIC_CHEST_GOLD_MAX = 1000;


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


function getHiddenCardDescription(item) {
  const rarity = capitalize(item.rarity);
  const type = capitalize(item.item_type);

  return `a mysterious ${rarity} ${type} Gobbo`;
}


export async function handleChest(env, url) {
  const rawUser =
    url.searchParams.get("user");

  const username =
    cleanUsername(rawUser);

  const displayName =
    cleanDisplayName(rawUser);

  if (!username) {
    return new Response("Usage: !chest");
  }

  const player =
    await getOrCreatePlayer(
      env,
      username,
      displayName
    );


  /*
   * ==========================================================
   * CHECK FOR MYSTERIOUS KEY
   * ==========================================================
   */

  let superKeyCount = 0;

  try {
    superKeyCount =
      await getSuperKeyCount(
        env,
        username
      );
  } catch (error) {
    console.log(
      "Chest key check failed:",
      error?.message || error
    );
  }

  const isMagicChest =
    superKeyCount > 0;


  /*
   * ==========================================================
   * INVENTORY CHECK
   * ==========================================================
   */

  const inventoryCountResult =
    await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM inventory
       WHERE username = ?`
    )
      .bind(username)
      .first();

  const inventoryCount =
    Number(
      inventoryCountResult?.count || 0
    );


  /*
   * Magic Chest:
   *
   * Never consume the key if
   * inventory is already full.
   */
  if (
    isMagicChest &&
    inventoryCount >= MAX_INVENTORY_ITEMS
  ) {
    return new Response(
      (
        `🔑 ${player.display_name} has a Mysterious Key, ` +
        `but their Gobbo inventory is full! ` +
        `Make room before opening the Magic Chest.`
      ).slice(0, 490)
    );
  }


  const currentGold =
    Number(player.gold || 0);


  /*
   * ==========================================================
   * GOLD
   * ==========================================================
   */

  let foundGold;

  if (isMagicChest) {
    foundGold =
      randomInt(
        MAGIC_CHEST_GOLD_MIN,
        MAGIC_CHEST_GOLD_MAX
      );
  } else {
    const bonusMultiplier = 1;
    const baseGold = randomInt(8, 25);

    foundGold =
      Math.floor(
        baseGold *
          bonusMultiplier *
          1
      ) + 0;
  }


  /*
   * ==========================================================
   * ITEM POOL
   * ==========================================================
   */

  let items;

  if (isMagicChest) {
    /*
     * Magic Chest:
     *
     * Guaranteed Epic or Legendary.
     *
     * drop_weight still controls
     * which eligible Gobbo gets picked.
     */
    items =
      await env.DB.prepare(
        `SELECT *
         FROM items
         WHERE rarity IN ('epic', 'legendary')
           AND min_gold_bonus <= ?
         ORDER BY drop_weight DESC`
      )
        .bind(currentGold)
        .all();
  } else {
    /*
     * Normal Chest:
     *
     * Common / Uncommon / Rare /
     * Epic / Legendary are all possible.
     */
    items =
      await env.DB.prepare(
        `SELECT *
         FROM items
         WHERE min_gold_bonus <= ?
         ORDER BY drop_weight DESC`
      )
        .bind(currentGold)
        .all();
  }


  if (!items.results?.length) {
    return new Response(
      isMagicChest
        ? "No Epic or Legendary Gobbos are currently available for the Magic Chest."
        : "No Gobbos exist in the database yet."
    );
  }


  const item =
    pickWeighted(items.results);


  /*
   * ==========================================================
   * NORMAL CHEST + FULL INVENTORY
   * ==========================================================
   */

  if (
    !isMagicChest &&
    inventoryCount >= MAX_INVENTORY_ITEMS
  ) {
    const failLines = [
      "but their Gobbo collection was full, so the chest snapped shut.",
      "but they had no room, so the mysterious Gobbo wandered away.",
      "but their pockets were already full of Gobbos and questionable supplies.",
      "but Gobbo Law allows only 4 companions at a time. The claim was rejected.",
      "but a tiny Gobbo accountant shouted NO SPACE and cancelled the transaction.",
      "but four Gobbos were already crammed into their inventory and refused to move over.",
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

    const responseMessage =
      `${player.display_name} opened a chest ` +
      `and spotted ${foundGold}g beside ` +
      `${hiddenCard}, ${flavor}`;

    return new Response(
      responseMessage.slice(0, 490)
    );
  }


  /*
   * ==========================================================
   * MAGIC CHEST KEY CONSUMPTION
   * ==========================================================
   */

  if (isMagicChest) {
    const consumed =
      await consumeSuperKey(
        env,
        username
      );

    if (!consumed) {
      return new Response(
        (
          `${player.display_name}'s Mysterious Key ` +
          `could not be used. Try !chest again.`
        ).slice(0, 490)
      );
    }
  }


  /*
   * ==========================================================
   * AWARD CARD + GOLD
   * ==========================================================
   */

  const usesLeft =
    Number(
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
      isMagicChest
        ? "magic_chest_gold"
        : "chest_gold"
    ),

    env.DB.prepare(
      `INSERT INTO events (
         event_type,
         message
       )
       VALUES (?, ?)`
    ).bind(
      isMagicChest
        ? "magic_chest"
        : "chest",

      `${player.display_name} opened ` +
      `${isMagicChest
        ? "a Magic Chest"
        : "a chest"} ` +
      `and found ${item.item_name} ` +
      `[${item.item_type}, ${item.rarity}], ` +
      `plus ${foundGold} gold.`
    ),
  ];


  /*
   * Your current items schema does not show
   * image_url.
   *
   * Keep this block ONLY if your actual S4
   * items table still has image_url.
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


  /*
   * ==========================================================
   * FIRST MAGIC CHEST → EGG
   * ==========================================================
   */

  let eggGranted = false;

  if (isMagicChest) {
    try {
      const eggResult =
        await grantPetEggIfMissing(
          env,
          username
        );

      eggGranted =
        Boolean(
          eggResult?.created
        );
    } catch (error) {
      console.log(
        "Pet Egg creation failed:",
        error?.message || error
      );
    }
  }


  /*
   * ==========================================================
   * ESSENCE ROLL
   * ==========================================================
   */

  let essenceDrop = null;

  try {
    essenceDrop =
      await maybeAwardEssence(
        env,
        username,
        "chest"
      );
  } catch (error) {
    console.log(
      "Chest Essence reward failed:",
      error?.message || error
    );
  }


  /*
   * ==========================================================
   * RESPONSE
   * ==========================================================
   */

  const description =
    item.description
      ? ` ${item.description}`
      : "";

  let responseMessage;

  if (isMagicChest) {
    responseMessage =
      `🔑 ${player.display_name} used a Mysterious Key ` +
      `and opened a Magic Chest! ` +
      `${chestMessage} ` +
      `[${item.item_type}, ${item.rarity}].` +
      description;

    if (eggGranted) {
      responseMessage +=
        " 🥚 A mysterious Egg was hiding inside!";
    }
  } else {
    responseMessage =
      `${player.display_name} opened a chest! ` +
      `${chestMessage} ` +
      `[${item.item_type}, ${item.rarity}].` +
      description;
  }

  if (essenceDrop) {
    responseMessage +=
      ` ✨ ${player.display_name} also found an Essence!`;
  }

  return new Response(
    responseMessage.slice(0, 490)
  );
}