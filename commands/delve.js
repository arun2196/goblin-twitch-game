import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

import {
  weightedPick,
  randomInt,
  getRandomInventoryItem,
} from "../helpers/random.js";

import {
  generateCommentary,
} from "../helpers/commentary.js";

import {
  applyStoryNames,
} from "../helpers/aliases.js";

import {
  maybeAwardEssence,
  getDelvePetEffects,
} from "../helpers/petRewards.js";


const DELVE_SACRIFICE_CHANCE = 0.5;


/*
 * ============================================================
 * SOLO COMPANION
 * ============================================================
 */

function makeSoloCompanion(
  player,
  storyName
) {
  return {
    id: null,

    item_key:
      "player_self",

    item_name:
      storyName ||
      player.display_name,

    item_type:
      "Chaotic",

    rarity:
      "desperate",

    power: 1,

    uses_left:
      null,

    is_player:
      true,

    description:
      "No Gobbo companion was available, so the goblin entered the delve alone.",

    delve_role:
      "Chaotic",

    delve_behavior:
      "Core instinct: survive through improvised decisions. Preferred approach: explore cautiously until panic or curiosity takes over. Useful actions: improvise, hide, run, and use whatever is nearby. Failure tendency: follows questionable instincts without a companion to intervene. Tone: determined, nervous, accidentally heroic.",

    flavor_text:
      "Going alone seemed reasonable at the time.",
  };
}


/*
 * ============================================================
 * COMPANION DATA
 * ============================================================
 */

async function enrichCompanion(
  env,
  companion
) {
  if (
    !companion ||
    companion.is_player ||
    !companion.item_key
  ) {
    return companion;
  }


  const itemData =
    await env.DB.prepare(
      `SELECT
         item_key,
         item_name,
         item_type,
         rarity,
         description,
         power,
         card_title,
         flavor_text,
         delve_role,
         delve_behavior
       FROM items
       WHERE item_key = ?
       LIMIT 1`
    )
      .bind(
        companion.item_key
      )
      .first();


  if (!itemData) {
    return companion;
  }


  return {
    ...companion,
    ...itemData,

    /*
     * Preserve inventory-specific
     * values.
     */
    id:
      companion.id,

    username:
      companion.username,

    uses_left:
      companion.uses_left,

    is_player:
      false,
  };
}


/*
 * ============================================================
 * EMPTY PET EFFECTS
 * ============================================================
 */

function getEmptyDelvePetEffects() {
  return {
    treasureSnifferPercent: 0,
  };
}


/*
 * ============================================================
 * FALLBACK COMMENTARY
 * ============================================================
 */

function buildFallbackCommentary({
  storyName,
  companion,
  delve,
  difficulty,
  didFail,
  wasSacrificed,
  goldChange,
  treasureSnifferBonus,
}) {
  const delveName =
    delve.delve_name ||
    "an unknown delve";

  const difficultyName =
    difficulty.name ||
    "Unknown";


  if (!didFail) {
    const treasureText =
      treasureSnifferBonus > 0
        ? ` Their pet sniffed out another ${treasureSnifferBonus}g.`
        : "";


    if (
      companion.is_player
    ) {
      return (
        `🕳️ ${storyName} enters ${delveName} alone on ${difficultyName} difficulty. ` +
        `Against all reasonable expectations, ${storyName} returns victorious with ${goldChange}g.` +
        treasureText
      );
    }


    return (
      `🕳️ ${storyName} and ${companion.item_name} brave ${delveName} on ` +
      `${difficultyName} difficulty. The expedition succeeds, and they return together with ${goldChange}g.` +
      treasureText
    );
  }


  if (
    wasSacrificed
  ) {
    return (
      `🕳️ Disaster strikes in ${delveName}! ${companion.item_name} holds the line, ` +
      `giving ${storyName} enough time to escape without a scratch. ` +
      `${storyName} loses no gold—but ${companion.item_name} does not return.`
    );
  }


  if (
    companion.is_player
  ) {
    return (
      `🕳️ ${storyName} enters ${delveName} alone on ${difficultyName} difficulty. ` +
      `The expedition collapses into a frantic retreat, but ${storyName} escapes without losing any gold.`
    );
  }


  return (
    `🕳️ ${storyName} and ${companion.item_name} retreat from ${delveName} after the ` +
    `${difficultyName} expedition goes terribly wrong. Both escape safely, and no gold is lost.`
  );
}


/*
 * ============================================================
 * DELVE
 * ============================================================
 */

export async function handleDelve(
  env,
  url
) {
  const username =
    cleanUsername(
      url.searchParams.get(
        "user"
      )
    );


  const displayName =
    cleanDisplayName(
      url.searchParams.get(
        "user"
      )
    );


  if (!username) {
    return new Response(
      "Usage: !delve"
    );
  }


  /*
   * ==========================================================
   * PLAYER
   * ==========================================================
   */

  const player =
    await getOrCreatePlayer(
      env,
      username,
      displayName
    );


  const playerDisplayName =
    player.display_name ||
    displayName ||
    username;


  const [
    storyPlayer,
  ] =
    await applyStoryNames(
      env,
      [
        {
          ...player,

          username,

          displayName:
            playerDisplayName,
        },
      ]
    );


  const storyName =
    storyPlayer?.storyName ||
    storyPlayer?.displayName ||
    playerDisplayName;


  /*
   * ==========================================================
   * PET EFFECT
   * ==========================================================
   */

  let petEffects =
    getEmptyDelvePetEffects();


  try {
    petEffects =
      await getDelvePetEffects(
        env,
        username
      ) ||
      getEmptyDelvePetEffects();

  } catch (error) {
    console.log(
      "Delve pet effect lookup failed:",
      username,
      error?.message ||
        error
    );
  }


  /*
   * ==========================================================
   * DELVE
   * ==========================================================
   *
   * delve_lore remains the complete source
   * for delve selection and narration context.
   */

  const delve =
    await env.DB.prepare(
      `SELECT
         delve_name,
         alliance,
         zone,
         place_type,
         location,
         primary_enemy,
         atmosphere,
         lore,
         narrative_hook
       FROM delve_lore
       ORDER BY RANDOM()
       LIMIT 1`
    )
      .first();


  if (!delve) {
    return new Response(
      "No delve lore exists in the database yet."
    );
  }


  /*
   * ==========================================================
   * DIFFICULTY
   * ==========================================================
   */

  const difficulties =
    await env.DB.prepare(
      `SELECT *
       FROM delve_difficulties
       ORDER BY id`
    )
      .all();


  if (
    !difficulties.results
      ?.length
  ) {
    return new Response(
      "No delve difficulties exist in the database yet."
    );
  }


  const difficulty =
    weightedPick(
      difficulties.results
    );


  /*
   * ==========================================================
   * COMPANION
   * ==========================================================
   *
   * Select the companion BEFORE resolving the
   * delve. This exact companion is the only
   * one that can be lost.
   */

  const selectedCompanion =
    (
      await getRandomInventoryItem(
        env,
        username
      )
    ) ||
    makeSoloCompanion(
      player,
      storyName
    );


  const companion =
    await enrichCompanion(
      env,
      selectedCompanion
    );


  /*
   * ==========================================================
   * SUCCESS / FAILURE
   * ==========================================================
   */

  const failChance =
    Number(
      difficulty.fail_chance ||
      0
    );


  const didFail =
    Math.random() * 100 <
    failChance;


  /*
   * A companion can only be sacrificed
   * after a failed delve.
   *
   * Solo players have no inventory
   * companion to sacrifice.
   */

  const wasSacrificed =
    didFail &&
    !companion.is_player &&
    Boolean(
      companion.id
    ) &&
    Math.random() <
      DELVE_SACRIFICE_CHANCE;


  /*
   * ==========================================================
   * BASE GOLD
   * ==========================================================
   *
   * Failed delves award 0g and lose 0g.
   */

  const baseGold =
    didFail
      ? 0
      : randomInt(
          10,
          40
        );


  const goldMultiplier =
    Number(
      difficulty
        .gold_multiplier ||
      1
    );


  /*
   * Preserve the current S4 reward
   * calculation.
   */

  const baseGoldChange =
    didFail
      ? 0
      : (
        Math.floor(
          baseGold *
          goldMultiplier *
          2
        ) * 1
      ) + 0;


  /*
   * ==========================================================
   * TREASURE SNIFFER
   * ==========================================================
   *
   * Applies only to successful Delves.
   *
   * It increases the final Delve reward,
   * not the base roll.
   */

  const treasureSnifferPercent =
    Number(
      petEffects
        ?.treasureSnifferPercent ||
      0
    );


  const treasureSnifferBonus =
    !didFail &&
    treasureSnifferPercent > 0
      ? Math.floor(
          baseGoldChange *
          treasureSnifferPercent /
          100
        )
      : 0;


  const goldChange =
    baseGoldChange +
    treasureSnifferBonus;


  /*
   * ==========================================================
   * GOLD STATE
   * ==========================================================
   */

  const currentGold =
    Number(
      player.gold || 0
    );


  const newGold =
    currentGold +
    goldChange;


  const companionLogName =
    companion.is_player
      ? "no Gobbo companion"
      : companion.item_name;


  /*
   * ==========================================================
   * DATABASE STATEMENTS
   * ==========================================================
   */

  const statements = [
    env.DB.prepare(
      `UPDATE players
       SET gold = ?,
           delve_successes =
             delve_successes + ?,
           delve_failures =
             delve_failures + ?,
           updated_at =
             CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(
      newGold,

      didFail
        ? 0
        : 1,

      didFail
        ? 1
        : 0,

      username
    ),
  ];


  /*
   * ==========================================================
   * GOLD TRANSACTIONS
   * ==========================================================
   *
   * Keep normal Delve gold and pet-created
   * gold separate for analytics.
   */

  if (
    baseGoldChange > 0
  ) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO transactions (
           username,
           amount,
           reason
         )
         VALUES (?, ?, ?)`
      )
        .bind(
          username,
          baseGoldChange,
          "delve_success"
        )
    );
  }


  if (
    treasureSnifferBonus > 0
  ) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO transactions (
           username,
           amount,
           reason
         )
         VALUES (?, ?, ?)`
      )
        .bind(
          username,

          treasureSnifferBonus,

          "pet_treasure_sniffer_bonus"
        )
    );
  }


  /*
   * ==========================================================
   * COMPANION SACRIFICE
   * ==========================================================
   */

  if (
    wasSacrificed
  ) {
    statements.push(
      env.DB.prepare(
        `DELETE FROM inventory
         WHERE id = ?
           AND username = ?`
      )
        .bind(
          companion.id,
          username
        )
    );
  }


  /*
   * ==========================================================
   * EVENT
   * ==========================================================
   */

  let eventMessage;


  if (
    wasSacrificed
  ) {
    eventMessage =
      `${playerDisplayName} failed ${delve.delve_name} with ` +
      `${companion.item_name}. ${companion.item_name} sacrificed itself ` +
      `so ${playerDisplayName} could escape. No gold was lost.`;

  } else {
    eventMessage =
      `${playerDisplayName} ${
        didFail
          ? "failed"
          : "completed"
      } ${delve.delve_name} with ${companionLogName} ` +
      `on ${difficulty.name} difficulty for ${goldChange}g.`;


    if (
      treasureSnifferBonus > 0
    ) {
      eventMessage +=
        ` Treasure Sniffer added ${treasureSnifferBonus}g.`;
    }
  }


  statements.push(
    env.DB.prepare(
      `INSERT INTO events (
         event_type,
         message
       )
       VALUES (?, ?)`
    )
      .bind(
        wasSacrificed
          ? "delve_companion_lost"
          : didFail
            ? "delve_failure"
            : "delve_success",

        eventMessage
      )
  );


  /*
   * ==========================================================
   * COMMIT
   * ==========================================================
   */

  await env.DB.batch(
    statements
  );


  /*
   * ==========================================================
   * ESSENCE
   * ==========================================================
   *
   * Delve Essence may drop on success or failure.
   * Chance and global cooldown live entirely
   * inside petRewards.js.
   */

  let essenceDrop = null;


  try {
    essenceDrop =
      await maybeAwardEssence(
        env,
        username,
        "delve"
      );
  } catch (error) {
    console.log(
      "Delve Essence reward failed:",
      username,
      error?.message ||
        error
    );
  }


  /*
   * ==========================================================
   * FALLBACK COMMENTARY
   * ==========================================================
   */

  const fallback =
    buildFallbackCommentary({
      storyName,

      companion,

      delve,

      difficulty,

      didFail,

      wasSacrificed,

      goldChange,

      treasureSnifferBonus,
    });


  /*
   * ==========================================================
   * AI COMMENTARY
   * ==========================================================
   */

  let commentary =
    fallback;


  try {
    const commentaryType =
      wasSacrificed
        ? "delve_loss"
        : "delve";


    commentary =
      await generateCommentary(
        env,
        commentaryType,
        {
          player: {
            username,

            displayName:
              playerDisplayName,

            storyName,

            alias:
              storyPlayer
                ?.alias ||
              "",

            aliases:
              storyPlayer
                ?.aliases ||
              [],

            goldBefore:
              currentGold,

            petEffects,
          },


          companion: {
            inventoryId:
              companion.id,

            itemKey:
              companion.item_key,

            name:
              companion.item_name,

            type:
              companion.item_type,

            rarity:
              companion.rarity,

            power:
              Number(
                companion.power ||
                1
              ),

            description:
              companion.description ||
              "",

            delveRole:
              companion.delve_role ||
              "",

            delveBehavior:
              companion.delve_behavior ||
              "",

            flavorText:
              companion.flavor_text ||
              "",

            isPlayer:
              Boolean(
                companion.is_player
              ),
          },


          delve: {
            name:
              delve.delve_name ||
              "",

            alliance:
              delve.alliance ||
              "",

            zone:
              delve.zone ||
              "",

            placeType:
              delve.place_type ||
              "",

            location:
              delve.location ||
              "",

            primaryEnemy:
              delve.primary_enemy ||
              "",

            atmosphere:
              delve.atmosphere ||
              "",

            lore:
              delve.lore ||
              "",

            narrativeHook:
              delve.narrative_hook ||
              "",
          },


          difficulty: {
            name:
              difficulty.name ||
              "",

            goldMultiplier,

            failChance,
          },


          result: {
            success:
              !didFail,

            failed:
              didFail,

            baseGoldChange,

            treasureSnifferPercent,

            treasureSnifferBonus,

            goldChange,

            goldAmount:
              goldChange,

            newGold,

            companionSacrificed:
              wasSacrificed,

            sacrificedCompanionName:
              wasSacrificed
                ? companion.item_name
                : "",
          },
        }
      );

  } catch (error) {
    console.log(
      "Delve commentary failed:",
      error?.message ||
        error
    );
  }


  /*
   * ==========================================================
   * PET TEXT
   * ==========================================================
   */

  let petText = "";


  if (
    treasureSnifferBonus > 0
  ) {
    petText =
      ` 🐾 Treasure Sniffer found an extra ${treasureSnifferBonus}g!`;
  }


  /*
   * ==========================================================
   * ESSENCE TEXT
   * ==========================================================
   */

  let essenceText = "";


  if (
    essenceDrop
  ) {
    essenceText =
      ` ✨ ${playerDisplayName} also found an Essence!`;
  }


  /*
   * ==========================================================
   * FINAL RESPONSE
   * ==========================================================
   */

  return new Response(
    `${
      commentary
    }${
      petText
    }${
      essenceText
    }`.slice(
      0,
      490
    )
  );
}