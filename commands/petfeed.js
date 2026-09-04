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
   * DETERMINE CURRENT FEED TARGET
   * ============================================================
   *
   * Egg:
   * target level = 1
   *
   * Hatched:
   * target level = current level + 1
   */

  const targetLevel =
    pet.pet_state === "egg"
      ? 1
      : currentPetLevel + 1;


  const requiredEssence =
    getPetLevelCost(
      targetLevel
    );


  if (requiredEssence <= 0) {
    return new Response(
      "Pet progression is currently unavailable."
    );
  }


  const currentProgress =
    Math.max(
      0,
      Number(
        pet.essence_progress || 0
      )
    );


  /*
   * ============================================================
   * CONSUME ESSENCE
   * ============================================================
   */

  const consumed =
    await consumeEssence(
      env,
      username,
      1
    );


  if (!consumed) {
    /*
     * Another request could theoretically consume
     * the last Essence between SELECT and UPDATE.
     */
    return new Response(
      `${player.display_name} reaches for an Essence, but there isn't one there anymore.`
    );
  }


  const newProgress =
    currentProgress + 1;


  /*
   * ============================================================
   * NORMAL FEED
   * ============================================================
   */

  if (
    newProgress <
    requiredEssence
  ) {
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


    const subjectName =
      pet.pet_state === "egg"
        ? "the mysterious Egg"
        : getPetDisplayName(pet);


    const reaction =
      pet.pet_state === "egg"
        ? "The Egg gives a tiny wobble."
        : pickRandom(
            ESSENCE_FEED_REACTIONS
          );


    return new Response(
      (
        `✨ ${player.display_name} feeds an Essence to ${subjectName}. ` +
        `${reaction} Progress: ${newProgress}/${requiredEssence}.`
      ).slice(
        0,
        490
      )
    );
  }


  /*
   * ============================================================
   * EGG HATCH
   * ============================================================
   */

  if (
    pet.pet_state === "egg"
  ) {
    const hatch =
      await hatchPet(
        env,
        username,
        pet
      );


    const hatchText =
      pickRandom(
        HATCH_REACTIONS
      );


    return new Response(
      (
        `🥚 ${hatchText} ` +
        `${player.display_name}'s pet has hatched at Lv.1 and revealed its first trait: ` +
        `${hatch.trait.name}!`
      ).slice(
        0,
        490
      )
    );
  }


  /*
   * ============================================================
   * LEVEL 2 - SECOND TRAIT
   * ============================================================
   */

  if (!pet.trait_2) {
    const discovery =
      await discoverSecondTrait(
        env,
        username,
        pet,
        targetLevel
      );


    const petName =
      getPetDisplayName(pet);


    if (discovery.trait) {
      return new Response(
        (
          `✨ ${petName} reaches Lv.${targetLevel} and reveals a second trait: ` +
          `${discovery.trait.name}!`
        ).slice(
          0,
          490
        )
      );
    }


    return new Response(
      (
        `🐾 ${petName} reaches Lv.${targetLevel}!`
      ).slice(
        0,
        490
      )
    );
  }


  /*
   * ============================================================
   * LEVEL 3+
   * ============================================================
   *
   * Randomly improve one of the pet's traits.
   */

  const upgrade =
    await upgradeRandomTrait(
      env,
      username,
      pet,
      targetLevel
    );


  const petName =
    getPetDisplayName(pet);


  if (upgrade.upgraded) {
    const reaction =
      pickRandom(
        TRAIT_UPGRADE_REACTIONS
      );

    return new Response(
      (
        `🐾 ${petName} reaches Lv.${targetLevel}! ` +
        `${petName}'s ${upgrade.trait.name} improves to Rank ${upgrade.traitLevel} and ${reaction}`
      ).slice(
        0,
        490
      )
    );
  }


  return new Response(
    (
      `🐾 ${petName} reaches Lv.${targetLevel}!`
    ).slice(
      0,
      490
    )
  );
}