import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
  getTitle,
} from "../helpers/players.js";

import {
  getPlayerPet,
  getPetTraitSlots,
} from "../helpers/petRewards.js";


function formatTrait(trait) {
  if (!trait) {
    return null;
  }

  const name =
    trait.name ||
    trait.key ||
    "Unknown Trait";

  const rank =
    Number(trait.rank || 0);

  const value =
    Number(trait.value || 0);


  /*
   * Reality Bender has two linked effects:
   *
   * -X% normal dungeon success
   * +X% Reality Break chance
   */
  if (
    trait.key === "reality_bender"
  ) {
    return (
      `${name} R${rank} ` +
      `(-${value}% clear, +${value}% break)`
    );
  }


  /*
   * Other traits currently use
   * straightforward percentage values.
   */
  return (
    `${name} R${rank} (${value}%)`
  );
}


function formatPet(pet) {
  if (!pet) {
    return "None";
  }


  if (
    pet.pet_state === "egg" ||
    Number(pet.pet_level || 0) <= 0
  ) {
    return "🥚 Mysterious Egg";
  }


  const name =
    pet.pet_name ||
    "Unnamed Slime";


  const level =
    Number(
      pet.pet_level || 1
    );


  /*
   * This helper reads:
   *
   * trait_1 + trait_1_level
   * trait_2 + trait_2_level
   *
   * so each trait is displayed using
   * its own independent rank.
   */
  const traitSlots =
    getPetTraitSlots(pet);


  const traits =
    traitSlots
      .map(formatTrait)
      .filter(Boolean);


  let text =
    `🟢 ${name} Lv.${level}`;


  if (
    traits.length > 0
  ) {
    text +=
      ` [${traits.join(", ")}]`;
  }


  return text;
}


export async function handleInspect(
  env,
  url
) {
  const viewer =
    cleanUsername(
      url.searchParams.get("user")
    );


  const viewerDisplay =
    cleanDisplayName(
      url.searchParams.get("user")
    );


  let target =
    cleanUsername(
      url.searchParams.get("target")
    );


  if (!viewer) {
    return new Response(
      "Usage: !inspect or !inspect @goblin"
    );
  }


  /*
   * If no target is provided,
   * inspect yourself.
   */
  if (!target) {
    target = viewer;
  }


  const player =
    await getOrCreatePlayer(
      env,
      target,
      target === viewer
        ? viewerDisplay
        : target
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
      .bind(target)
      .all();


  /*
   * ==========================================================
   * PET
   * ==========================================================
   */

  let pet = null;


  try {
    pet =
      await getPlayerPet(
        env,
        target
      );
  } catch (error) {
    console.log(
      "Inspect pet lookup failed:",
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


  const itemText =
    items.results?.length
      ? items.results
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
          .join(" | ")
      : "empty";


  const petText =
    formatPet(pet);


  const response =
    `${player.display_name} | ` +
    `${title} | ` +
    `${player.gold}g | ` +
    `Delves: ${
      player.delve_successes || 0
    }W/${
      player.delve_failures || 0
    }L | ` +
    `Duels: ${
      player.duel_wins || 0
    }W/${
      player.duel_losses || 0
    }L | ` +
    `Pet: ${petText} | ` +
    `Gobbos: ${itemText}`;


  return new Response(
    response.slice(
      0,
      490
    )
  );
}