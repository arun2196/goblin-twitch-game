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

import { generateCommentary } from "../helpers/commentary.js";
import { applyStoryNames } from "../helpers/aliases.js";

function makeSoloCompanion(player, storyName) {
  return {
    id: null,
    item_key: "player_self",
    item_name: storyName || player.display_name,
    item_type: "Chaotic",
    rarity: "desperate",
    power: 1,
    uses_left: null,
    is_player: true,

    description:
      "No Gobbo companion was available, so the goblin entered the delve alone.",

    delve_role: "Chaotic",

    delve_behavior:
      "Core instinct: survive through improvised decisions. Preferred approach: explore cautiously until panic or curiosity takes over. Useful actions: improvise, hide, run, and use whatever is nearby. Failure tendency: follows questionable instincts without a companion to intervene. Tone: determined, nervous, accidentally heroic.",

    flavor_text:
      "Going alone seemed reasonable at the time.",
  };
}

async function enrichCompanion(env, companion) {
  if (!companion || companion.is_player || !companion.item_key) {
    return companion;
  }

  const itemData = await env.DB.prepare(
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
    .bind(companion.item_key)
    .first();

  if (!itemData) {
    return companion;
  }

  return {
    ...companion,
    ...itemData,

    // Preserve inventory-specific values.
    id: companion.id,
    uses_left: companion.uses_left,
    is_player: false,
  };
}

function buildFallbackCommentary({
  storyName,
  companion,
  delve,
  difficulty,
  didFail,
  goldChange,
}) {
  const delveName = delve.delve_name || "an unknown delve";
  const difficultyName = difficulty.name || "Unknown";
  const goldAmount = Math.abs(goldChange);

  if (companion.is_player) {
    if (didFail) {
      return (
        `🕳️ ${storyName} enters ${delveName} alone on ${difficultyName} difficulty. ` +
        `The expedition becomes a hurried retreat, and ${goldAmount}g is lost during the escape.`
      );
    }

    return (
      `🕳️ ${storyName} enters ${delveName} alone on ${difficultyName} difficulty ` +
      `and somehow returns victorious with ${goldAmount}g.`
    );
  }

  if (didFail) {
    return (
      `🕳️ ${storyName} and ${companion.item_name} enter ${delveName} on ` +
      `${difficultyName} difficulty. ${companion.item_name} tries to help, ` +
      `but the expedition falls apart and they retreat after losing ${goldAmount}g.`
    );
  }

  return (
    `🕳️ ${storyName} and ${companion.item_name} explore ${delveName} on ` +
    `${difficultyName} difficulty. ${companion.item_name} proves useful, ` +
    `and they return with ${goldAmount}g.`
  );
}

export async function handleDelve(env, url) {
  const username = cleanUsername(url.searchParams.get("user"));
  const displayName = cleanDisplayName(url.searchParams.get("user"));

  if (!username) {
    return new Response("Usage: !delve");
  }

  const player = await getOrCreatePlayer(
    env,
    username,
    displayName
  );

  const playerDisplayName =
    player.display_name ||
    displayName ||
    username;

  const [storyPlayer] = await applyStoryNames(env, [
    {
      ...player,
      username,
      displayName: playerDisplayName,
    },
  ]);

  const storyName =
    storyPlayer?.storyName ||
    storyPlayer?.displayName ||
    playerDisplayName;

  /*
   * delve_lore is now the complete source for delve selection
   * and prompt context.
   */
  const delve = await env.DB.prepare(
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
  ).first();

  if (!delve) {
    return new Response(
      "No delve lore exists in the database yet."
    );
  }

  const difficulties = await env.DB.prepare(
    `SELECT *
     FROM delve_difficulties
     ORDER BY id`
  ).all();

  if (!difficulties.results?.length) {
    return new Response(
      "No delve difficulties exist in the database yet."
    );
  }

  const difficulty = weightedPick(
    difficulties.results
  );

  /*
   * Select one random Gobbo from the player's inventory.
   * If they have no Gobbo, they enter alone.
   */
  const selectedCompanion =
    (await getRandomInventoryItem(env, username)) ||
    makeSoloCompanion(player, storyName);

  const companion = await enrichCompanion(
    env,
    selectedCompanion
  );

  /*
   * Existing difficulty and failure mechanics remain unchanged.
   */
  const failChance = Number(
    difficulty.fail_chance || 0
  );

  const didFail =
    Math.random() * 100 < failChance;

  const baseGold = didFail
    ? -randomInt(5, 20)
    : randomInt(10, 40);

  const goldMultiplier = Number(
    difficulty.gold_multiplier || 1
  );

  const rolledGoldChange = Math.floor(
    baseGold *
      goldMultiplier *
      (didFail ? 1 : 2)
  );

  const currentGold = Number(player.gold || 0);

  /*
   * Failed delves cannot reduce a player below 0 gold.
   */
  const goldChange =
    rolledGoldChange < 0
      ? -Math.min(
          currentGold,
          Math.abs(rolledGoldChange)
        )
      : rolledGoldChange;

  const newGold = currentGold + goldChange;

  const companionLogName = companion.is_player
    ? "no Gobbo companion"
    : companion.item_name;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE players
       SET gold = ?,
           delve_successes = delve_successes + ?,
           delve_failures = delve_failures + ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(
      newGold,
      didFail ? 0 : 1,
      didFail ? 1 : 0,
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
      goldChange,
      didFail
        ? "delve_fail"
        : "delve_success"
    ),

    env.DB.prepare(
      `INSERT INTO events (
         event_type,
         message
       )
       VALUES (?, ?)`
    ).bind(
      didFail
        ? "delve_failure"
        : "delve_success",

      `${playerDisplayName} ${
        didFail ? "failed" : "completed"
      } ${delve.delve_name} with ${companionLogName} ` +
        `on ${difficulty.name} difficulty for ${goldChange}g.`
    ),
  ]);

  const fallback = buildFallbackCommentary({
    storyName,
    companion,
    delve,
    difficulty,
    didFail,
    goldChange,
  });

  let commentary = fallback;

  try {
    commentary = await generateCommentary(
      env,
      "delve",
      {
        player: {
          username,
          displayName: playerDisplayName,
          storyName,
          alias: storyPlayer?.alias || "",
          aliases: storyPlayer?.aliases || [],
          goldBefore: currentGold,
        },

        companion: {
          itemKey: companion.item_key,
          name: companion.item_name,
          type: companion.item_type,
          rarity: companion.rarity,
          power: Number(companion.power || 1),

          description:
            companion.description || "",

          delveRole:
            companion.delve_role || "",

          delveBehavior:
            companion.delve_behavior || "",

          flavorText:
            companion.flavor_text || "",

          isPlayer:
            Boolean(companion.is_player),
        },

        delve: {
          name:
            delve.delve_name || "",

          alliance:
            delve.alliance || "",

          zone:
            delve.zone || "",

          placeType:
            delve.place_type || "",

          location:
            delve.location || "",

          primaryEnemy:
            delve.primary_enemy || "",

          atmosphere:
            delve.atmosphere || "",

          lore:
            delve.lore || "",

          narrativeHook:
            delve.narrative_hook || "",
        },

        difficulty: {
          name:
            difficulty.name || "",

          goldMultiplier,

          failChance,
        },

        result: {
          success: !didFail,
          failed: didFail,

          goldChange,

          goldAmount:
            Math.abs(goldChange),

          newGold,
        },
      }
    );
  } catch (error) {
    console.log(
      "Delve commentary failed:",
      error?.message || error
    );
  }

  return new Response(
    String(commentary || fallback).slice(0, 490)
  );
}