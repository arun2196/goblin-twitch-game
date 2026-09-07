/*
 * ============================================================
 * PET SYSTEM
 * ============================================================
 *
 * Central helper for shared pet-related systems:
 *
 * - Essence drops and storage
 * - Mysterious Key drops and storage
 * - Pet state
 * - Pet trait definitions
 * - Pet trait values
 * - Gameplay bonuses
 *
 * Active pet progression / feeding is handled separately
 * by commands/petfeed.js.
 *
 * Other gameplay modules should use these exported functions
 * instead of reading/writing pet tables directly.
 */


/*
 * ============================================================
 * CONFIG
 * ============================================================
 */

const ESSENCE_COOLDOWN_MINUTES = 10;

const ESSENCE_DROP_CHANCES = {
  chest: 20,
  delve: 30,
  pvp: 35,
  dungeon: 40,
};

const SUPER_KEY_DROP_CHANCE = 59;

const SUPER_KEY_REQUIRES_DUNGEON_SUCCESS = true;


/*
 * Universal Essence.
 *
 * We keep "essence" as an internal key so the existing
 * pet_essences table can continue to be used.
 */

const ESSENCE_KEY = "essence";

const ESSENCE_NAME = "Essence";

const SUPER_KEY_NAME =
  "Mysterious Key";


/*
 * ============================================================
 * PET PROGRESSION
 * ============================================================
 *
 * These values control how much Essence is required
 * to reach each overall pet level.
 *
 * Actual feeding/progression is handled in petfeed.js.
 *
 * Example:
 *
 * Level 0 -> Level 1 requires 5 Essence.
 * Level 1 -> Level 2 requires 5 Essence.
 */

const PET_LEVEL_COSTS = {
  1: 5,
  2: 5,
  3: 7,
  4: 7,
  5: 10,
  6: 10,
  7: 12,
  8: 12,
  9: 15,
  10: 15,
};

const MAX_PET_LEVEL = 10;

const MAX_TRAIT_LEVEL = 10;


/*
 * ============================================================
 * TRAIT VALUES
 * ============================================================
 *
 * Each array index corresponds to TRAIT RANK.
 *
 * Index 0 = Rank 1
 * Index 1 = Rank 2
 * ...
 * Index 9 = Rank 10
 *
 * IMPORTANT:
 *
 * Trait strength is no longer based on overall pet_level.
 *
 * Each pet stores:
 *
 * trait_1
 * trait_1_level
 *
 * trait_2
 * trait_2_level
 */


/*
 * Second Chance
 *
 * Percentage of PvP wager protected
 * after losing.
 */

const PVP_LOSS_SAVE_VALUES = [
  10,
  12,
  15,
  18,
  20,
  25,
  30,
  35,
  40,
  50,
];


/*
 * Crowd Favorite
 *
 * Percentage increase to audience bonus
 * after a PvP victory.
 */

const PVP_CROWD_BONUS_VALUES = [
  10,
  12,
  15,
  18,
  20,
  25,
  30,
  35,
  40,
  50,
];


/*
 * Shared gold bonus curve.
 *
 * Currently used by:
 *
 * - Treasure Sniffer
 * - Dungeon Looter
 */

const GOLD_BONUS_VALUES = [
  5,
  6,
  7,
  9,
  10,
  12,
  15,
  18,
  20,
  25,
];


/*
 * Reality Bender:
 *
 * Rank N currently means:
 *
 * -N% normal Dungeon clear chance
 * +N% Reality Break chance
 *
 * Only the strongest Reality Bender in a Dungeon party
 * should apply.
 */

const REALITY_BENDER_VALUES = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
];


/*
 * ============================================================
 * CANONICAL PET TRAIT REGISTRY
 * ============================================================
 *
 * THIS is the authoritative trait list.
 *
 * petfeed.js dynamically reads this registry through
 * getPetTraitDefinitions().
 *
 * Therefore:
 *
 * Adding a new trait here automatically makes it eligible
 * to be discovered by future pets.
 *
 * You do NOT need to add the trait to petfeed.js.
 *
 * You will still need to implement the trait's gameplay
 * effect in the appropriate helper/activity.
 */

const PET_TRAITS = {
  second_chance: {
    key: "second_chance",

    name:
      "Second Chance",

    description:
      "Saves part of your wager when you lose a PvP match.",

    values:
      PVP_LOSS_SAVE_VALUES,
  },


  crowd_favorite: {
    key: "crowd_favorite",

    name:
      "Crowd Favorite",

    description:
      "Increases the bonus gold thrown by the crowd after a PvP victory.",

    values:
      PVP_CROWD_BONUS_VALUES,
  },


  reality_bender: {
    key: "reality_bender",

    name:
      "Reality Bender",

    description:
      "Lowers normal dungeon clear chance but increases Reality Break chance.",

    values:
      REALITY_BENDER_VALUES,
  },


  treasure_sniffer: {
    key: "treasure_sniffer",

    name:
      "Treasure Sniffer",

    description:
      "Increases gold earned from successful Delves.",

    values:
      GOLD_BONUS_VALUES,
  },


  dungeon_looter: {
    key: "dungeon_looter",

    name:
      "Dungeon Looter",

    description:
      "Increases gold earned from Dungeons.",

    values:
      GOLD_BONUS_VALUES,
  },
};


/*
 * ============================================================
 * INTERNAL HELPERS
 * ============================================================
 */


/*
 * Ensure a player's general pet reward/state row exists.
 *
 * This table currently stores:
 *
 * - Mysterious Keys
 * - last successful Essence drop timestamp
 */

async function ensurePetPlayerState(
  env,
  username
) {
  if (!username) {
    return;
  }


  await env.DB.prepare(
    `INSERT OR IGNORE INTO pet_player_state (
       username,
       super_keys,
       created_at,
       updated_at
     )
     VALUES (
       ?,
       0,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
     )`
  )
    .bind(
      username
    )
    .run();
}


/*
 * Get the player's pet reward state.
 */

async function getPetPlayerState(
  env,
  username
) {
  if (!username) {
    return null;
  }


  await ensurePetPlayerState(
    env,
    username
  );


  return env.DB.prepare(
    `SELECT *
     FROM pet_player_state
     WHERE username = ?`
  )
    .bind(
      username
    )
    .first();
}


/*
 * Percentage roll.
 */

function rollPercent(
  chance
) {
  const numericChance =
    Number(
      chance || 0
    );


  if (
    numericChance <= 0
  ) {
    return false;
  }


  if (
    numericChance >= 100
  ) {
    return true;
  }


  return (
    Math.random() * 100 <
    numericChance
  );
}


/*
 * Determines whether a player is currently eligible
 * for another Essence drop.
 *
 * Cooldown starts only after a SUCCESSFUL Essence drop.
 */

function essenceCooldownExpired(
  lastEssenceAt
) {
  if (!lastEssenceAt) {
    return true;
  }


  const lastDrop =
    new Date(
      lastEssenceAt
    );


  if (
    Number.isNaN(
      lastDrop.getTime()
    )
  ) {
    return true;
  }


  const cooldownMs =
    ESSENCE_COOLDOWN_MINUTES *
    60 *
    1000;


  return (
    Date.now() -
      lastDrop.getTime() >=
    cooldownMs
  );
}


/*
 * Convert an arbitrary value into a valid trait rank.
 */

function normalizeTraitLevel(
  level
) {
  const numericLevel =
    Number(
      level || 0
    );


  if (
    !Number.isFinite(
      numericLevel
    )
  ) {
    return 0;
  }


  return Math.max(
    0,
    Math.min(
      MAX_TRAIT_LEVEL,
      Math.floor(
        numericLevel
      )
    )
  );
}


/*
 * Get the gameplay value of a trait at a particular
 * TRAIT RANK.
 *
 * Example:
 *
 * getTraitValue(
 *   "second_chance",
 *   3
 * )
 *
 * => 15
 */

function getTraitValue(
  traitKey,
  traitLevel
) {
  const key =
    String(
      traitKey || ""
    )
      .trim()
      .toLowerCase();


  const trait =
    PET_TRAITS[key];


  if (!trait) {
    return 0;
  }


  const level =
    normalizeTraitLevel(
      traitLevel
    );


  /*
   * Rank 0 means the trait is not active.
   */
  if (
    level <= 0
  ) {
    return 0;
  }


  return Number(
    trait.values[
      level - 1
    ] || 0
  );
}


/*
 * Find the independent rank of a particular trait
 * on a pet.
 *
 * This deliberately hides whether that trait lives
 * in slot 1 or slot 2.
 *
 * Example:
 *
 * trait_1 = treasure_sniffer
 * trait_1_level = 4
 *
 * getPetTraitRank(
 *   pet,
 *   "treasure_sniffer"
 * )
 *
 * => 4
 */

function getPetTraitRankInternal(
  pet,
  traitKey
) {
  if (
    !pet ||
    !traitKey
  ) {
    return 0;
  }


  const requestedKey =
    String(
      traitKey
    )
      .trim()
      .toLowerCase();


  const trait1Key =
    String(
      pet.trait_1 || ""
    )
      .trim()
      .toLowerCase();


  const trait2Key =
    String(
      pet.trait_2 || ""
    )
      .trim()
      .toLowerCase();


  if (
    trait1Key ===
    requestedKey
  ) {
    return normalizeTraitLevel(
      pet.trait_1_level
    );
  }


  if (
    trait2Key ===
    requestedKey
  ) {
    return normalizeTraitLevel(
      pet.trait_2_level
    );
  }


  return 0;
}


/*
 * ============================================================
 * ESSENCE DROPS
 * ============================================================
 */

export async function maybeAwardEssence(
  env,
  username,
  activityType
) {
  if (!username) {
    return null;
  }


  const activity =
    String(
      activityType || ""
    )
      .trim()
      .toLowerCase();


  const dropChance =
    ESSENCE_DROP_CHANCES[
      activity
    ];


  /*
   * Unknown activities cannot award Essence.
   */
  if (
    dropChance === undefined ||
    dropChance === null
  ) {
    return null;
  }


  const state =
    await getPetPlayerState(
      env,
      username
    );


  /*
   * Cooldown uses the last SUCCESSFUL drop.
   */
  if (
    !essenceCooldownExpired(
      state?.last_essence_at
    )
  ) {
    return null;
  }


  if (
    !rollPercent(
      dropChance
    )
  ) {
    return null;
  }


  const now =
    new Date()
      .toISOString();


  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pet_essences (
         username,
         essence_key,
         quantity,
         updated_at
       )
       VALUES (
         ?,
         ?,
         1,
         CURRENT_TIMESTAMP
       )

       ON CONFLICT(username, essence_key)
       DO UPDATE SET
         quantity =
           quantity + 1,
         updated_at =
           CURRENT_TIMESTAMP`
    )
      .bind(
        username,
        ESSENCE_KEY
      ),


    env.DB.prepare(
      `UPDATE pet_player_state
       SET last_essence_at = ?,
           updated_at =
             CURRENT_TIMESTAMP
       WHERE username = ?`
    )
      .bind(
        now,
        username
      ),
  ]);


  return {
    type:
      "essence",

    essenceKey:
      ESSENCE_KEY,

    essenceName:
      ESSENCE_NAME,

    amount:
      1,

    activity,
  };
}


/*
 * ============================================================
 * PET STATE
 * ============================================================
 */


/*
 * Returns the player's pet row.
 *
 * null means they have never received their first Egg.
 */

export async function getPlayerPet(
  env,
  username
) {
  if (!username) {
    return null;
  }


  return env.DB.prepare(
    `SELECT *
     FROM pets
     WHERE username = ?`
  )
    .bind(
      username
    )
    .first();
}


/*
 * Called after a player's first Magic Chest.
 *
 * Pet begins as:
 *
 * pet_state = egg
 * pet_level = 0
 * trait_1 = NULL
 * trait_2 = NULL
 * trait_1_level = 0
 * trait_2_level = 0
 *
 * INSERT OR IGNORE prevents duplicate pets.
 */

export async function grantPetEggIfMissing(
  env,
  username
) {
  if (!username) {
    return {
      created:
        false,
    };
  }


  const existingPet =
    await getPlayerPet(
      env,
      username
    );


  if (existingPet) {
    return {
      created:
        false,

      pet:
        existingPet,
    };
  }


  const insertResult =
    await env.DB.prepare(
      `INSERT OR IGNORE INTO pets (
         username,
         pet_level,
         essence_progress,
         pet_state,
         trait_1_level,
         trait_2_level,
         created_at,
         updated_at
       )
       VALUES (
         ?,
         0,
         0,
         'egg',
         0,
         0,
         CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP
       )`
    )
      .bind(
        username
      )
      .run();


  const pet =
    await getPlayerPet(
      env,
      username
    );


  /*
   * Using the INSERT result makes the returned
   * created flag race-safe.
   */
  return {
    created:
      Boolean(
        insertResult
          ?.meta
          ?.changes
      ),

    pet,
  };
}


/*
 * ============================================================
 * ESSENCE STORAGE
 * ============================================================
 */

export async function getEssenceCount(
  env,
  username
) {
  if (!username) {
    return 0;
  }


  const row =
    await env.DB.prepare(
      `SELECT quantity
       FROM pet_essences
       WHERE username = ?
         AND essence_key = ?`
    )
      .bind(
        username,
        ESSENCE_KEY
      )
      .first();


  return Math.max(
    0,
    Number(
      row?.quantity || 0
    )
  );
}


/*
 * Atomic Essence consumption.
 */

export async function consumeEssence(
  env,
  username,
  amount = 1
) {
  if (!username) {
    return false;
  }


  const quantity =
    Math.max(
      1,
      Math.floor(
        Number(
          amount || 1
        )
      )
    );


  const result =
    await env.DB.prepare(
      `UPDATE pet_essences
       SET quantity =
             quantity - ?,
           updated_at =
             CURRENT_TIMESTAMP
       WHERE username = ?
         AND essence_key = ?
         AND quantity >= ?`
    )
      .bind(
        quantity,
        username,
        ESSENCE_KEY,
        quantity
      )
      .run();


  return Boolean(
    result
      ?.meta
      ?.changes
  );
}


/*
 * Compatibility helper.
 *
 * Older command code may expect:
 *
 * getPlayerEssences()
 */

export async function getPlayerEssences(
  env,
  username
) {
  const quantity =
    await getEssenceCount(
      env,
      username
    );


  if (
    quantity <= 0
  ) {
    return [];
  }


  return [
    {
      essence_key:
        ESSENCE_KEY,

      quantity,
    },
  ];
}


/*
 * ============================================================
 * MYSTERIOUS KEYS
 * ============================================================
 */

export async function maybeAwardSuperKey(
  env,
  username,
  {
    activityType =
      "dungeon",

    success =
      true,
  } = {}
) {
  if (!username) {
    return null;
  }


  const activity =
    String(
      activityType || ""
    )
      .trim()
      .toLowerCase();


  /*
   * Mysterious Keys only come from Dungeons.
   */
  if (
    activity !==
    "dungeon"
  ) {
    return null;
  }


  /*
   * Successful Dungeon only.
   */
  if (
    SUPER_KEY_REQUIRES_DUNGEON_SUCCESS &&
    !success
  ) {
    return null;
  }


  if (
    !rollPercent(
      SUPER_KEY_DROP_CHANCE
    )
  ) {
    return null;
  }


  await ensurePetPlayerState(
    env,
    username
  );


  await env.DB.prepare(
    `UPDATE pet_player_state
     SET super_keys =
           super_keys + 1,
         updated_at =
           CURRENT_TIMESTAMP
     WHERE username = ?`
  )
    .bind(
      username
    )
    .run();


  return {
    type:
      "super_key",

    displayName:
      SUPER_KEY_NAME,

    amount:
      1,
  };
}


/*
 * Current Mysterious Key count.
 */

export async function getSuperKeyCount(
  env,
  username
) {
  if (!username) {
    return 0;
  }


  const state =
    await getPetPlayerState(
      env,
      username
    );


  return Math.max(
    0,
    Number(
      state?.super_keys || 0
    )
  );
}


/*
 * Convenience helper.
 */

export async function hasSuperKey(
  env,
  username
) {
  return (
    (
      await getSuperKeyCount(
        env,
        username
      )
    ) > 0
  );
}


/*
 * Atomic Mysterious Key consumption.
 */

export async function consumeSuperKey(
  env,
  username
) {
  if (!username) {
    return false;
  }


  await ensurePetPlayerState(
    env,
    username
  );


  const result =
    await env.DB.prepare(
      `UPDATE pet_player_state
       SET super_keys =
             super_keys - 1,
           updated_at =
             CURRENT_TIMESTAMP
       WHERE username = ?
         AND super_keys > 0`
    )
      .bind(
        username
      )
      .run();


  return Boolean(
    result
      ?.meta
      ?.changes
  );
}


/*
 * ============================================================
 * PET TRAITS
 * ============================================================
 */


/*
 * Returns a single trait definition.
 */

export function getPetTraitDefinition(
  traitKey
) {
  const key =
    String(
      traitKey || ""
    )
      .trim()
      .toLowerCase();


  return (
    PET_TRAITS[key] ||
    null
  );
}


/*
 * Returns all registered pet traits.
 *
 * petfeed.js uses this function to dynamically
 * discover assignable traits.
 *
 * This is what allows petfeed.js to automatically
 * support newly-added traits.
 */

export function getPetTraitDefinitions() {
  return Object.values(
    PET_TRAITS
  );
}


/*
 * Returns a trait's gameplay value at a specific
 * TRAIT RANK.
 *
 * Example:
 *
 * getPetTraitValue(
 *   "treasure_sniffer",
 *   5
 * )
 *
 * => 10
 */

export function getPetTraitValue(
  traitKey,
  traitLevel
) {
  return getTraitValue(
    traitKey,
    traitLevel
  );
}


/*
 * Returns the independent rank of a specific trait
 * on a particular pet.
 *
 * This is useful for display commands such as:
 *
 * !pet
 * !inventory
 * !inspect
 */

export function getPetTraitRank(
  pet,
  traitKey
) {
  return getPetTraitRankInternal(
    pet,
    traitKey
  );
}


/*
 * Return information about both trait slots.
 *
 * Useful for player-facing display commands.
 */

export function getPetTraitSlots(
  pet
) {
  if (!pet) {
    return [];
  }


  const slots = [];


  if (pet.trait_1) {
    const definition =
      getPetTraitDefinition(
        pet.trait_1
      );

    const rank =
      normalizeTraitLevel(
        pet.trait_1_level
      );


    slots.push({
      slot:
        1,

      key:
        pet.trait_1,

      name:
        definition?.name ||
        pet.trait_1,

      description:
        definition?.description ||
        "",

      rank,

      value:
        getTraitValue(
          pet.trait_1,
          rank
        ),
    });
  }


  if (pet.trait_2) {
    const definition =
      getPetTraitDefinition(
        pet.trait_2
      );

    const rank =
      normalizeTraitLevel(
        pet.trait_2_level
      );


    slots.push({
      slot:
        2,

      key:
        pet.trait_2,

      name:
        definition?.name ||
        pet.trait_2,

      description:
        definition?.description ||
        "",

      rank,

      value:
        getTraitValue(
          pet.trait_2,
          rank
        ),
    });
  }


  return slots;
}


/*
 * ============================================================
 * GAMEPLAY BONUS HELPERS
 * ============================================================
 *
 * IMPORTANT:
 *
 * These helpers accept TRAIT RANK.
 *
 * They do NOT accept overall pet_level.
 *
 * PvP / Delve / Dungeon remain responsible for
 * applying the returned percentages.
 */


/*
 * SECOND CHANCE
 *
 * Percentage of wager protected after losing PvP.
 */

export function getSecondChancePercent(
  traitLevel
) {
  return getTraitValue(
    "second_chance",
    traitLevel
  );
}


/*
 * CROWD FAVORITE
 *
 * Percentage added to PvP audience bonus.
 */

export function getCrowdFavoritePercent(
  traitLevel
) {
  return getTraitValue(
    "crowd_favorite",
    traitLevel
  );
}


/*
 * TREASURE SNIFFER
 *
 * Percentage bonus to successful Delve gold.
 */

export function getDelveBonusPercent(
  traitLevel
) {
  return getTraitValue(
    "treasure_sniffer",
    traitLevel
  );
}


/*
 * Explicit alias using the actual trait name.
 *
 * The previous file's getDelvePetEffects()
 * referenced getTreasureSnifferPercent(),
 * but that helper did not exist.
 *
 * Keep both names for compatibility.
 */

export function getTreasureSnifferPercent(
  traitLevel
) {
  return getDelveBonusPercent(
    traitLevel
  );
}


/*
 * DUNGEON LOOTER
 *
 * Percentage bonus to Dungeon gold.
 */

export function getDungeonBonusPercent(
  traitLevel
) {
  return getTraitValue(
    "dungeon_looter",
    traitLevel
  );
}


/*
 * REALITY BENDER
 *
 * Same number currently applies to both:
 *
 * - normal success penalty
 * - Reality Break bonus
 */

export function getRealityBenderEffect(
  traitLevel
) {
  const percent =
    getTraitValue(
      "reality_bender",
      traitLevel
    );


  return {
    successChancePenalty:
      percent,

    realityBreakBonus:
      percent,
  };
}


/*
 * ============================================================
 * DISPLAY / CONFIG HELPERS
 * ============================================================
 */

export function getEssenceDefinition() {
  return {
    key:
      ESSENCE_KEY,

    name:
      ESSENCE_NAME,
  };
}


export function getSuperKeyDefinition() {
  return {
    key:
      "super_key",

    name:
      SUPER_KEY_NAME,
  };
}


/*
 * Essence required to reach target overall pet level.
 */

export function getPetLevelCost(
  targetLevel
) {
  return Number(
    PET_LEVEL_COSTS[
      Number(
        targetLevel
      )
    ] || 0
  );
}


export function getMaxPetLevel() {
  return MAX_PET_LEVEL;
}


export function getMaxPetTraitLevel() {
  return MAX_TRAIT_LEVEL;
}


/*
 * ============================================================
 * DUNGEON PET EFFECTS
 * ============================================================
 */

export async function getDungeonPetEffects(
  env,
  username
) {
  const pet =
    await getPlayerPet(
      env,
      username
    );


  const empty = {
    dungeonGoldBonusPercent:
      0,

    dungeonLooterRank:
      0,

    /*
     * realityBenderLevel is preserved because the
     * currently-updated Dungeon code may already use it.
     *
     * It now represents TRAIT RANK.
     */

    realityBenderLevel:
      0,

    realityBenderRank:
      0,

    realitySuccessPenalty:
      0,

    realityBreakBonus:
      0,
  };


  if (
    !pet ||
    pet.pet_state !==
      "hatched"
  ) {
    return empty;
  }


  const result = {
    ...empty,
  };


  /*
   * Dungeon Looter
   */

  const dungeonLooterRank =
    getPetTraitRankInternal(
      pet,
      "dungeon_looter"
    );


  if (
    dungeonLooterRank > 0
  ) {
    result.dungeonLooterRank =
      dungeonLooterRank;


    result.dungeonGoldBonusPercent =
      getDungeonBonusPercent(
        dungeonLooterRank
      );
  }


  /*
   * Reality Bender
   */

  const realityBenderRank =
    getPetTraitRankInternal(
      pet,
      "reality_bender"
    );


  if (
    realityBenderRank > 0
  ) {
    const effect =
      getRealityBenderEffect(
        realityBenderRank
      );


    /*
     * Compatibility property.
     */

    result.realityBenderLevel =
      realityBenderRank;


    /*
     * Preferred property going forward.
     */

    result.realityBenderRank =
      realityBenderRank;


    result.realitySuccessPenalty =
      effect
        .successChancePenalty;


    result.realityBreakBonus =
      effect
        .realityBreakBonus;
  }


  return result;
}


/*
 * ============================================================
 * PVP PET EFFECTS
 * ============================================================
 */

export async function getPvPPetEffects(
  env,
  username
) {
  const pet =
    await getPlayerPet(
      env,
      username
    );


  const empty = {
    secondChancePercent:
      0,

    secondChanceRank:
      0,

    crowdFavoritePercent:
      0,

    crowdFavoriteRank:
      0,
  };


  if (
    !pet ||
    pet.pet_state !==
      "hatched"
  ) {
    return empty;
  }


  const result = {
    ...empty,
  };


  /*
   * Second Chance
   */

  const secondChanceRank =
    getPetTraitRankInternal(
      pet,
      "second_chance"
    );


  if (
    secondChanceRank > 0
  ) {
    result.secondChanceRank =
      secondChanceRank;


    result.secondChancePercent =
      getSecondChancePercent(
        secondChanceRank
      );
  }


  /*
   * Crowd Favorite
   */

  const crowdFavoriteRank =
    getPetTraitRankInternal(
      pet,
      "crowd_favorite"
    );


  if (
    crowdFavoriteRank > 0
  ) {
    result.crowdFavoriteRank =
      crowdFavoriteRank;


    result.crowdFavoritePercent =
      getCrowdFavoritePercent(
        crowdFavoriteRank
      );
  }


  return result;
}


/*
 * ============================================================
 * DELVE PET EFFECTS
 * ============================================================
 */

export async function getDelvePetEffects(
  env,
  username
) {
  const pet =
    await getPlayerPet(
      env,
      username
    );


  const empty = {
    treasureSnifferPercent:
      0,

    treasureSnifferRank:
      0,
  };


  if (
    !pet ||
    pet.pet_state !==
      "hatched"
  ) {
    return empty;
  }


  const result = {
    ...empty,
  };


  const treasureSnifferRank =
    getPetTraitRankInternal(
      pet,
      "treasure_sniffer"
    );


  if (
    treasureSnifferRank > 0
  ) {
    result.treasureSnifferRank =
      treasureSnifferRank;


    result.treasureSnifferPercent =
      getTreasureSnifferPercent(
        treasureSnifferRank
      );
  }


  return result;
}