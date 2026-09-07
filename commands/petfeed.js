import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

import {
  getPlayerPet,
  getEssenceCount,
  consumeEssence,
  getPetTraitDefinitions,
  getPetTraitDefinition,
  getPetLevelCost,
  getMaxPetLevel,
} from "../helpers/petRewards.js";


/*
 * ============================================================
 * PET FEED
 * ============================================================
 *
 * Main pet progression command.
 *
 * !petfeed
 *
 * Responsibilities:
 *
 * - Feed Essence to an Egg / pet
 * - Hatch the Egg
 * - Discover first trait
 * - Discover second trait
 * - Randomly strengthen traits
 * - Advance overall pet level
 * - Handle no-Essence affection interactions
 *
 * Trait definitions themselves remain inside petRewards.js.
 *
 * This means new traits added to PET_TRAITS automatically
 * become eligible for newly discovered pet traits.
 */


/*
 * ============================================================
 * CONFIG
 * ============================================================
 */

const MAX_TRAIT_LEVEL = 10;

const AFFECTION_GOLD_MIN = 5;
const AFFECTION_GOLD_MAX = 50;


/*
 * ============================================================
 * FLAVOR
 * ============================================================
 */

const PET_TREATS = [
  "a tiny bag of crunchy mushrooms",
  "a very small wooden sword",
  "an unnecessarily fancy snack",
  "a tiny cape",
  "a polished pebble",
  "a squeaky mushroom",
  "a tiny pair of socks",
  "a miniature wooden shield",
  "a handful of premium crumbs",
  "a tiny hat",
  "a shiny button",
  "a little stuffed rat",
  "a piece of cheese of questionable origin",
  "a very impressive stick",
  "a snack wrapped like royal treasure",
];


const PET_AFFECTION_REACTIONS = [
  "immediately becomes extremely affectionate.",
  "climbs onto them and refuses to leave.",
  "looks up at them with enormous happy eyes.",
  "does several excited little hops.",
  "decides they are clearly the greatest goblin alive.",
  "leans against them and looks very pleased.",
  "demands several celebratory head pats.",
  "happily follows them around for the rest of the day.",
  "makes a tiny happy noise.",
  "appears deeply impressed by this act of generosity.",
];


const FREE_AFFECTION_REACTIONS = [
  "settles for several enthusiastic head pats.",
  "climbs into their lap and seems perfectly happy.",
  "receives a very serious belly rub instead.",
  "gets picked up and carried around like royalty.",
  "happily accepts some quality goblin time.",
  "gets its ears scratched and immediately forgets about food.",
  "leans against them and refuses to move.",
  "receives a long cuddle and considers this acceptable payment.",
];


const ESSENCE_FEED_REACTIONS = [
  "devours the Essence with alarming enthusiasm.",
  "sniffs the Essence once and immediately gobbles it down.",
  "absorbs the Essence and does a victorious little hop.",
  "eats the Essence, then looks around hopefully for another.",
  "nibbles the Essence very carefully before swallowing it whole.",
  "takes the Essence and proudly parades around afterward.",
];


const HATCH_REACTIONS = [
  "The Egg wiggles violently, cracks open, and something very small emerges.",
  "The Egg begins bouncing around before finally cracking open.",
  "A tiny crack appears in the Egg. Then several more. It is happening.",
  "The Egg makes a concerning noise and suddenly bursts open.",
  "The Egg rolls in a circle, cracks, and reveals its tiny occupant.",
];


const TRAIT_UPGRADE_REACTIONS = [
  "seems to have learned something.",
  "looks noticeably more capable than it did five seconds ago.",
  "has apparently been practicing.",
  "suddenly looks extremely proud of itself.",
  "appears to have unlocked a new level of goblin competence.",
];


/*
 * ============================================================
 * SMALL HELPERS
 * ============================================================
 */

function randomInt(min, max) {
  return (
    Math.floor(
      Math.random() * (max - min + 1)
    ) + min
  );
}


function pickRandom(array) {
  if (
    !Array.isArray(array) ||
    array.length === 0
  ) {
    return null;
  }

  return array[
    Math.floor(
      Math.random() * array.length
    )
  ];
}


function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}


function getPetDisplayName(pet) {
  const name =
    String(pet?.pet_name || "")
      .trim();

  return name || "the little creature";
}


/*
 * Returns all currently registered trait definitions.
 *
 * IMPORTANT:
 * Nothing here contains a hardcoded trait list.
 *
 * Adding another entry to PET_TRAITS in petRewards.js
 * automatically makes it eligible here.
 */
function getAvailableTraits() {
  const traits =
    getPetTraitDefinitions();

  if (!Array.isArray(traits)) {
    return [];
  }

  return traits.filter(
    trait =>
      trait &&
      trait.key
  );
}


/*
 * Pick a trait the pet does not already own.
 */
function pickNewTrait(pet) {
  const ownedTraits =
    new Set(
      [
        pet?.trait_1,
        pet?.trait_2,
      ]
        .filter(Boolean)
        .map(value =>
          String(value)
            .trim()
            .toLowerCase()
        )
    );

  const available =
    getAvailableTraits()
      .filter(
        trait =>
          !ownedTraits.has(
            String(trait.key)
              .trim()
              .toLowerCase()
          )
      );

  return pickRandom(available);
}


/*
 * ============================================================
 * PROGRESSION HELPERS
 * ============================================================
 */

/*
 * Egg:
 *
 * pet_level = 0
 *
 * Feeding 5 Essence causes:
 *
 * - hatch
 * - pet_level becomes 1
 * - first trait is discovered
 * - trait_1_level becomes 1
 */
async function hatchPet(
  env,
  username,
  pet
) {
  const trait =
    pickNewTrait(pet);

  if (!trait) {
    throw new Error(
      "No pet traits are available for hatching."
    );
  }

  await env.DB.prepare(
    `UPDATE pets
     SET pet_state = 'hatched',
         pet_level = 1,
         essence_progress = 0,
         trait_1 = ?,
         trait_1_level = 1,
         updated_at = CURRENT_TIMESTAMP,
         hatched_at = COALESCE(
           hatched_at,
           CURRENT_TIMESTAMP
         )
     WHERE username = ?`
  )
    .bind(
      trait.key,
      username
    )
    .run();

  return {
    trait,
    petLevel: 1,
  };
}


/*
 * Level 1 -> Level 2:
 *
 * Discover the second trait.
 *
 * We deliberately guarantee this rather than leaving
 * discovery up to RNG.
 */
async function discoverSecondTrait(
  env,
  username,
  pet,
  newPetLevel
) {
  const trait =
    pickNewTrait(pet);

  /*
   * This should only occur if there is only one trait
   * registered in the entire game.
   */
  if (!trait) {
    await env.DB.prepare(
      `UPDATE pets
       SET pet_level = ?,
           essence_progress = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    )
      .bind(
        newPetLevel,
        username
      )
      .run();

    return {
      trait: null,
      petLevel: newPetLevel,
    };
  }

  await env.DB.prepare(
    `UPDATE pets
     SET pet_level = ?,
         essence_progress = 0,
         trait_2 = ?,
         trait_2_level = 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE username = ?`
  )
    .bind(
      newPetLevel,
      trait.key,
      username
    )
    .run();

  return {
    trait,
    petLevel: newPetLevel,
  };
}


/*
 * Level 2+:
 *
 * Increase overall pet level AND randomly improve
 * one of the two traits.
 *
 * A trait already at MAX_TRAIT_LEVEL cannot be selected.
 */
async function upgradeRandomTrait(
  env,
  username,
  pet,
  newPetLevel
) {
  const candidates = [];

  const trait1Level =
    clamp(
      Number(
        pet?.trait_1_level || 0
      ),
      0,
      MAX_TRAIT_LEVEL
    );

  const trait2Level =
    clamp(
      Number(
        pet?.trait_2_level || 0
      ),
      0,
      MAX_TRAIT_LEVEL
    );


  if (
    pet?.trait_1 &&
    trait1Level < MAX_TRAIT_LEVEL
  ) {
    candidates.push({
      slot: 1,
      key: pet.trait_1,
      currentLevel: trait1Level,
    });
  }


  if (
    pet?.trait_2 &&
    trait2Level < MAX_TRAIT_LEVEL
  ) {
    candidates.push({
      slot: 2,
      key: pet.trait_2,
      currentLevel: trait2Level,
    });
  }


  const selected =
    pickRandom(candidates);


  /*
   * Both traits somehow reached maximum before
   * overall pet level did.
   *
   * Just increase pet level.
   */
  if (!selected) {
    await env.DB.prepare(
      `UPDATE pets
       SET pet_level = ?,
           essence_progress = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    )
      .bind(
        newPetLevel,
        username
      )
      .run();

    return {
      upgraded: false,
      petLevel: newPetLevel,
    };
  }


  const newTraitLevel =
    Math.min(
      MAX_TRAIT_LEVEL,
      selected.currentLevel + 1
    );


  if (selected.slot === 1) {
    await env.DB.prepare(
      `UPDATE pets
       SET pet_level = ?,
           essence_progress = 0,
           trait_1_level = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    )
      .bind(
        newPetLevel,
        newTraitLevel,
        username
      )
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE pets
       SET pet_level = ?,
           essence_progress = 0,
           trait_2_level = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    )
      .bind(
        newPetLevel,
        newTraitLevel,
        username
      )
      .run();
  }


  const trait =
    getPetTraitDefinition(
      selected.key
    );


  return {
    upgraded: true,

    trait:
      trait || {
        key: selected.key,
        name: selected.key,
      },

    traitLevel: newTraitLevel,

    petLevel: newPetLevel,
  };
}


/*
 * ============================================================
 * NO ESSENCE INTERACTION
 * ============================================================
 */

async function handleAffectionInteraction(
  env,
  player,
  pet
) {
  const username =
    player.username;

  const petName =
    getPetDisplayName(pet);

  const currentGold =
    Math.max(
      0,
      Number(player.gold || 0)
    );


  /*
   * Completely broke.
   */
  if (currentGold <= 0) {
    return {
      type: "free",

      message:
        `${player.display_name} has no Essence and checks their pockets anyway. Nothing. ` +
        `${petName} ${pickRandom(FREE_AFFECTION_REACTIONS)}`,
    };
  }


  /*
   * Random desired spending amount.
   *
   * Never spend more gold than the player actually has.
   */
  const desiredCost =
    randomInt(
      AFFECTION_GOLD_MIN,
      AFFECTION_GOLD_MAX
    );

  const goldSpent =
    Math.min(
      currentGold,
      desiredCost
    );


  /*
   * A player with only 1-4g can still buy some tiny nonsense.
   */
  if (goldSpent <= 0) {
    return {
      type: "free",

      message:
        `${player.display_name} has no Essence, so ${petName} receives some free attention instead. ` +
        `${pickRandom(FREE_AFFECTION_REACTIONS)}`,
    };
  }


  const itemBought =
    pickRandom(PET_TREATS);

  const reaction =
    pickRandom(
      PET_AFFECTION_REACTIONS
    );


  /*
   * This is intentionally flavor only.
   *
   * Buying things for the pet does NOT grant
   * progression.
   */
  const result =
    await env.DB.prepare(
      `UPDATE players
       SET gold = gold - ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?
         AND gold >= ?`
    )
      .bind(
        goldSpent,
        username,
        goldSpent
      )
      .run();


  /*
   * Balance may theoretically change between
   * reading the player and this UPDATE.
   */
  if (!result?.meta?.changes) {
    return {
      type: "free",

      message:
        `${player.display_name} tries to buy something for ${petName}, but the money appears to have vanished. ` +
        `${petName} ${pickRandom(FREE_AFFECTION_REACTIONS)}`,
    };
  }


  /*
   * Optional economy record.
   *
   * This isn't required for pet mechanics,
   * but is useful for seeing where gold went.
   */
  try {
    await env.DB.prepare(
      `INSERT INTO transactions (
         username,
         amount,
         reason,
         created_at
       )
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    )
      .bind(
        username,
        -goldSpent,
        "pet_affection"
      )
      .run();
  } catch (error) {
    /*
     * Do not fail the command merely because
     * transaction logging failed.
     */
    console.log(
      "Pet affection transaction log failed:",
      username,
      error?.message || error
    );
  }


  return {
    type: "gold",

    goldSpent,

    message:
      `${player.display_name} has no Essence, so ${goldSpent}g goes toward ${itemBought}. ` +
      `${petName} ${reaction}`,
  };
}


/*
 * ============================================================
 * COMMAND
 * ============================================================
 */

export async function handlePetFeed(
  env,
  url
) {
  const rawUser =
    url.searchParams.get("user");

  const username =
    cleanUsername(rawUser);

  const displayName =
    cleanDisplayName(rawUser);


  if (!username) {
    return new Response(
      "Usage: !petfeed"
    );
  }


  const player =
    await getOrCreatePlayer(
      env,
      username,
      displayName
    );


  /*
   * ============================================================
   * PET CHECK
   * ============================================================
   */

  const pet =
    await getPlayerPet(
      env,
      username
    );


  if (!pet) {
    return new Response(
      `${player.display_name} does not have a pet yet.`
    );
  }


  /*
   * ============================================================
   * ESSENCE CHECK
   * ============================================================
   */

  const essenceCount =
    await getEssenceCount(
      env,
      username
    );


  /*
   * No Essence = affection/flavor event.
   */
  if (essenceCount <= 0) {
    const affection =
      await handleAffectionInteraction(
        env,
        player,
        pet
      );

    return new Response(
      affection.message.slice(
        0,
        490
      )
    );
  }


  /*
   * ============================================================
   * MAX LEVEL
   * ============================================================
   */

  const currentPetLevel =
    Math.max(
      0,
      Number(
        pet.pet_level || 0
      )
    );

  const maxPetLevel =
    getMaxPetLevel();


  if (
    pet.pet_state === "hatched" &&
    currentPetLevel >= maxPetLevel
  ) {
    /*
     * Do NOT consume Essence when progression
     * is already complete.
     */
    const petName =
      getPetDisplayName(pet);

    return new Response(
      (
        `🐾 ${petName} has already reached Lv.${maxPetLevel}. ` +
        `The Essence is safely kept for another day, but ${petName} still accepts the attention.`
      ).slice(
        0,
        490
      )
    );
  }


    /*
   * ============================================================
   * BULK ESSENCE FEED
   * ============================================================
   *
   * !petfeed now attempts to use ALL Essence owned by
   * the player.
   *
   * Essence is consumed one progression threshold at a time
   * so that:
   *
   * - partial progress is preserved
   * - multiple levels can be gained
   * - hatching can continue directly into later levels
   * - Essence is never wasted beyond max pet level
   */

  let workingPet = pet;

  let essenceRemaining =
    Math.max(
      0,
      Number(essenceCount || 0)
    );

  let essenceUsed = 0;

  const progressionMessages = [];


  while (essenceRemaining > 0) {
    const workingLevel =
      Math.max(
        0,
        Number(
          workingPet.pet_level || 0
        )
      );


    /*
     * Stop immediately if progression is complete.
     *
     * Any remaining Essence stays in the player's inventory.
     */
    if (
      workingPet.pet_state === "hatched" &&
      workingLevel >= maxPetLevel
    ) {
      break;
    }


    /*
     * Egg progresses toward Lv.1.
     * Hatched pets progress toward their next level.
     */
    const targetLevel =
      workingPet.pet_state === "egg"
        ? 1
        : workingLevel + 1;


    const requiredEssence =
      getPetLevelCost(
        targetLevel
      );


    if (requiredEssence <= 0) {
      break;
    }


    const currentProgress =
      Math.max(
        0,
        Number(
          workingPet.essence_progress || 0
        )
      );


    /*
     * Only consume as much Essence as this particular
     * progression threshold still needs.
     */
    const essenceNeeded =
      Math.max(
        0,
        requiredEssence - currentProgress
      );


    /*
     * Defensive fallback in case stored progress somehow
     * already meets/exceeds the configured requirement.
     */
    if (essenceNeeded <= 0) {
      console.log(
        "Pet Essence progress exceeded requirement:",
        username,
        targetLevel,
        currentProgress,
        requiredEssence
      );

      break;
    }


    const amountToFeed =
      Math.min(
        essenceRemaining,
        essenceNeeded
      );


    const consumed =
      await consumeEssence(
        env,
        username,
        amountToFeed
      );


    if (!consumed) {
      /*
       * The Essence balance may theoretically have changed
       * between reading it and consuming it.
       */
      break;
    }


    essenceRemaining -= amountToFeed;
    essenceUsed += amountToFeed;

    const newProgress =
      currentProgress + amountToFeed;


    /*
     * ============================================================
     * PARTIAL LEVEL PROGRESS
     * ============================================================
     *
     * We ran out of Essence before reaching the next level.
     *
     * Save the partial progress and stop.
     */
    if (newProgress < requiredEssence) {
      await env.DB.prepare(
        `UPDATE pets
         SET essence_progress = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE username = ?`
      )
        .bind(
          newProgress,
          username
        )
        .run();


      workingPet = {
        ...workingPet,
        essence_progress: newProgress,
      };


      progressionMessages.push(
        `Progress ${newProgress}/${requiredEssence}`
      );

      break;
    }


    /*
     * ============================================================
     * EGG HATCH
     * ============================================================
     */

    if (workingPet.pet_state === "egg") {
      const hatch =
        await hatchPet(
          env,
          username,
          workingPet
        );


      progressionMessages.push(
        `hatched at Lv.1 with ${hatch.trait.name}`
      );


      /*
       * Reload the pet because hatchPet changed several
       * database fields.
       *
       * This allows remaining Essence to immediately continue
       * toward Lv.2.
       */
      workingPet =
        await getPlayerPet(
          env,
          username
        );


      if (!workingPet) {
        break;
      }

      continue;
    }


    /*
     * ============================================================
     * LEVEL 2 - SECOND TRAIT
     * ============================================================
     */

    if (!workingPet.trait_2) {
      const discovery =
        await discoverSecondTrait(
          env,
          username,
          workingPet,
          targetLevel
        );


      if (discovery.trait) {
        progressionMessages.push(
          `reached Lv.${targetLevel} and revealed ${discovery.trait.name}`
        );
      } else {
        progressionMessages.push(
          `reached Lv.${targetLevel}`
        );
      }


      workingPet =
        await getPlayerPet(
          env,
          username
        );


      if (!workingPet) {
        break;
      }

      continue;
    }


    /*
     * ============================================================
     * LEVEL 3+
     * ============================================================
     */

    const upgrade =
      await upgradeRandomTrait(
        env,
        username,
        workingPet,
        targetLevel
      );


    if (upgrade.upgraded) {
      progressionMessages.push(
        `reached Lv.${targetLevel}; ${upgrade.trait.name} became Rank ${upgrade.traitLevel}`
      );
    } else {
      progressionMessages.push(
        `reached Lv.${targetLevel}`
      );
    }


    workingPet =
      await getPlayerPet(
        env,
        username
      );


    if (!workingPet) {
      break;
    }
  }


  /*
   * ============================================================
   * RESPONSE
   * ============================================================
   */

  const petName =
    workingPet?.pet_state === "egg"
      ? "the mysterious Egg"
      : getPetDisplayName(
          workingPet || pet
        );


  /*
   * This should be extremely rare, but avoids returning
   * a misleading message if no Essence could actually
   * be consumed.
   */
  if (essenceUsed <= 0) {
    return new Response(
      (
        `${player.display_name} tries to feed ${petName}, ` +
        `but the Essence could not be consumed.`
      ).slice(
        0,
        490
      )
    );
  }


  let message =
    `✨ ${player.display_name} feeds ${essenceUsed} Essence to ${petName}.`;


  if (progressionMessages.length > 0) {
    message +=
      ` ${progressionMessages.join(". ")}.`;
  }


  /*
   * If max level was reached before all available Essence
   * was required, explicitly tell the player that the
   * leftovers were kept.
   */
  if (
    workingPet &&
    workingPet.pet_state === "hatched" &&
    Number(
      workingPet.pet_level || 0
    ) >= maxPetLevel &&
    essenceRemaining > 0
  ) {
    message +=
      ` ${essenceRemaining} Essence remains unused because ${petName} is max level.`;
  }


  return new Response(
    message.slice(
      0,
      490
    )
  );
}