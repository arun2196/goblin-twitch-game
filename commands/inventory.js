import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
  getTitle,
} from "../helpers/players.js";

import {
  getEssenceCount,
  getSuperKeyCount,
  getPlayerPet,
  getPetTraitSlots,
} from "../helpers/petRewards.js";


const MAX_COMPANION_ITEMS = 4;


/*
 * ============================================================
 * PET DISPLAY
 * ============================================================
 */

function formatPet(pet) {
  if (!pet) {
    return "None";
  }


  /*
   * Player has received the Egg,
   * but it has not hatched yet.
   */
  if (
    pet.pet_state === "egg" ||
    Number(pet.pet_level || 0) <= 0
  ) {
    return "🥚 Mysterious Egg";
  }


  const petName =
    pet.pet_name ||
    "Unnamed Slime";


  const level =
    Number(
      pet.pet_level || 1
    );


  /*
   * getPetTraitSlots() handles:
   *
   * trait_1 + trait_1_level
   * trait_2 + trait_2_level
   *
   * It also automatically understands any future
   * traits added to PET_TRAITS in petRewards.js.
   */
  const traitSlots =
    getPetTraitSlots(pet);


  const traits =
    traitSlots.map(
      (trait) =>
        `${trait.name} R${trait.rank}`
    );


  let text =
    `🟢 ${petName} Lv.${level}`;


  if (
    traits.length > 0
  ) {
    text +=
      ` [${traits.join(", ")}]`;
  }


  return text;
}


/*
 * ============================================================
 * INVENTORY
 * ============================================================
 */

export async function handleInventory(
  env,
  url
) {
  const username =
    cleanUsername(
      url.searchParams.get("user")
    );


  const displayName =
    cleanDisplayName(
      url.searchParams.get("user")
    );


  if (!username) {
    return new Response(
      "Usage: !inventory"
    );
  }


  const player =
    await getOrCreatePlayer(
      env,
      username,
      displayName
    );


  /*
   * ==========================================================
   * COMPANION CARDS
   * ==========================================================
   */

  const items =
    await env.DB.prepare(
      `SELECT
         inv.id,
         itm.item_name,
         itm.item_type,
         itm.rarity,
         inv.uses_left
       FROM inventory inv
       JOIN items itm
         ON inv.item_key = itm.item_key
       WHERE inv.username = ?
       ORDER BY inv.id DESC`
    )
      .bind(username)
      .all();


  const companionItems =
    items.results || [];


  /*
   * ==========================================================
   * PET + PET RESOURCES
   * ==========================================================
   */

  let pet = null;

  let essenceCount = 0;

  let keyCount = 0;


  /*
   * Pet-system failures should not
   * prevent !inventory from working.
   */
  try {
    [
      pet,
      essenceCount,
      keyCount,
    ] = await Promise.all([
      getPlayerPet(
        env,
        username
      ),

      getEssenceCount(
        env,
        username
      ),

      getSuperKeyCount(
        env,
        username
      ),
    ]);
  } catch (error) {
    console.log(
      "Inventory pet lookup failed:",
      error?.message || error
    );
  }


  /*
   * ==========================================================
   * DISPLAY
   * ==========================================================
   */

  const title =
    getTitle(
      player.gold
    );


  let itemText;


  if (
    companionItems.length === 0
  ) {
    itemText =
      `Gobbos: 0/${MAX_COMPANION_ITEMS}`;
  } else {
    const cards =
      companionItems
        .map(
          (item) =>
            `${item.item_name} ` +
            `[${item.item_type}, ` +
            `${item.rarity}, ` +
            `${item.uses_left} use${
              Number(
                item.uses_left
              ) === 1
                ? ""
                : "s"
            }]`
        )
        .join(" | ");


    itemText =
      `Gobbos: ${companionItems.length}/${MAX_COMPANION_ITEMS} | ` +
      cards;
  }


  const petText =
    formatPet(pet);


  const resourceText =
    `Essence: ${essenceCount} | ` +
    `Mysterious Keys: ${keyCount}`;


  const response =
    `${player.display_name} | ` +
    `${title} | ` +
    `${player.gold}g | ` +
    `${itemText} | ` +
    `Pet: ${petText} | ` +
    `${resourceText}`;


  return new Response(
    response.slice(
      0,
      490
    )
  );
}