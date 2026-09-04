import {
  cleanUsername,
  cleanDisplayName,
} from "../helpers/players.js";

import {
  randomInt,
  getRandomInventoryItem,
} from "../helpers/random.js";

import {
  expireOldChallenges,
} from "../helpers/challenges.js";

import {
  getAdvantage,
} from "../helpers/duels.js";

import {
  generateCommentary,
} from "../helpers/commentary.js";

import {
  applyStoryNames,
} from "../helpers/aliases.js";

import {
  maybeAwardEssence,
  getPvPPetEffects,
} from "../helpers/petRewards.js";


/*
 * ============================================================
 * RARITY POWER
 * ============================================================
 */

function getRarityPower(rarity) {
  const powers = {
    desperate: 1,
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
  };

  return (
    powers[
      String(
        rarity || ""
      ).toLowerCase()
    ] || 1
  );
}


/*
 * ============================================================
 * FALLBACK PLAYER FIGHTER
 * ============================================================
 */

function makePlayerFighter(
  player
) {
  return {
    id: null,

    item_key:
      "player_self",

    item_name:
      player.storyName ||
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
      "No Gobbo was available, so the goblin entered the arena personally.",

    pvp_behavior:
      "Fights using improvised attacks, questionable confidence, and no clear plan.",
  };
}


/*
 * ============================================================
 * FIGHTER DATA
 * ============================================================
 */

async function enrichFighter(
  env,
  fighter
) {
  if (
    !fighter ||
    fighter.is_player ||
    !fighter.item_key
  ) {
    return fighter;
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
         pvp_behavior,
         card_title,
         flavor_text
       FROM items
       WHERE item_key = ?
       LIMIT 1`
    )
      .bind(
        fighter.item_key
      )
      .first();


  if (!itemData) {
    return fighter;
  }


  return {
    ...fighter,
    ...itemData,

    /*
     * Keep inventory-specific
     * state.
     */
    id:
      fighter.id,

    uses_left:
      fighter.uses_left,

    is_player:
      false,
  };
}


/*
 * ============================================================
 * FIGHTER POWER
 * ============================================================
 */

function getFighterPower(
  fighter
) {
  if (
    fighter?.is_player
  ) {
    return 1;
  }


  const storedPower =
    Number(
      fighter?.power
    );


  if (
    Number.isFinite(
      storedPower
    ) &&
    storedPower > 0
  ) {
    return storedPower;
  }


  return getRarityPower(
    fighter?.rarity
  );
}


/*
 * ============================================================
 * DISPLAY LABEL
 * ============================================================
 */

function getFighterLabel(
  player,
  fighter
) {
  const playerName =
    player.storyName ||
    player.display_name;


  if (
    fighter?.is_player
  ) {
    return (
      `${playerName} personally`
    );
  }


  return (
    `${playerName}'s ${fighter.item_name}`
  );
}


/*
 * ============================================================
 * DURABILITY
 * ============================================================
 */

async function damageFighter(
  env,
  fighter,
  brokenItems
) {
  if (
    !fighter ||
    fighter.is_player ||
    !fighter.id
  ) {
    return;
  }


  const newUses =
    Number(
      fighter.uses_left
    ) - 1;


  if (
    newUses <= 0
  ) {
    await env.DB.prepare(
      `DELETE FROM inventory
       WHERE id = ?`
    )
      .bind(
        fighter.id
      )
      .run();


    brokenItems.push(
      fighter.item_name
    );

    return;
  }


  await env.DB.prepare(
    `UPDATE inventory
     SET uses_left = ?
     WHERE id = ?`
  )
    .bind(
      newUses,
      fighter.id
    )
    .run();
}


/*
 * ============================================================
 * EMPTY PET EFFECTS
 * ============================================================
 */

function getEmptyPvPEffects() {
  return {
    secondChancePercent: 0,
    crowdFavoritePercent: 0,
  };
}


/*
 * ============================================================
 * ACCEPT / READY
 * ============================================================
 */

export async function handleAccept(
  env,
  url
) {
  const target =
    cleanUsername(
      url.searchParams.get(
        "user"
      )
    );

  const targetDisplay =
    cleanDisplayName(
      url.searchParams.get(
        "user"
      )
    );


  if (!target) {
    return new Response(
      "Usage: !ready"
    );
  }


  await expireOldChallenges(
    env
  );


  /*
   * ==========================================================
   * FIND CHALLENGE
   * ==========================================================
   */

  const challenge =
    await env.DB.prepare(
      `SELECT *
       FROM duels
       WHERE target = ?
         AND status = 'pending'
         AND datetime(expires_at) >
             datetime('now')
       ORDER BY id DESC
       LIMIT 1`
    )
      .bind(target)
      .first();


  if (!challenge) {
    return new Response(
      `${targetDisplay}, you have no pending challenge.`
    );
  }


  const challenger =
    challenge.challenger;

  const stake =
    Number(
      challenge.stake
    );


  /*
   * ==========================================================
   * PLAYERS
   * ==========================================================
   */

  let challengerPlayer =
    await env.DB.prepare(
      `SELECT *
       FROM players
       WHERE username = ?`
    )
      .bind(
        challenger
      )
      .first();


  let targetPlayer =
    await env.DB.prepare(
      `SELECT *
       FROM players
       WHERE username = ?`
    )
      .bind(
        target
      )
      .first();


  if (
    !challengerPlayer ||
    !targetPlayer
  ) {
    return new Response(
      "One of the goblins vanished before the duel could begin."
    );
  }


  /*
   * ==========================================================
   * STORY NAMES
   * ==========================================================
   */

  const storyPlayers =
    await applyStoryNames(
      env,
      [
        {
          ...challengerPlayer,

          displayName:
            challengerPlayer
              .display_name,
        },

        {
          ...targetPlayer,

          displayName:
            targetPlayer
              .display_name,
        },
      ]
    );


  challengerPlayer = {
    ...challengerPlayer,

    ...storyPlayers.find(
      (player) =>
        player.username ===
        challengerPlayer.username
    ),
  };


  targetPlayer = {
    ...targetPlayer,

    ...storyPlayers.find(
      (player) =>
        player.username ===
        targetPlayer.username
    ),
  };


  /*
   * ==========================================================
   * GOLD CHECK
   * ==========================================================
   */

  const challengerGold =
    Number(
      challengerPlayer.gold ||
      0
    );

  const targetGold =
    Number(
      targetPlayer.gold ||
      0
    );


  if (
    challengerGold < stake ||
    targetGold < stake
  ) {
    await env.DB.prepare(
      `UPDATE duels
       SET status = 'cancelled'
       WHERE id = ?`
    )
      .bind(
        challenge.id
      )
      .run();


    return new Response(
      "Challenge cancelled. One goblin no longer has enough gold."
    );
  }


  /*
   * ==========================================================
   * PET EFFECTS
   * ==========================================================
   */

  let challengerPetEffects =
    getEmptyPvPEffects();

  let targetPetEffects =
    getEmptyPvPEffects();


  try {
    [
      challengerPetEffects,
      targetPetEffects,
    ] =
      await Promise.all([
        getPvPPetEffects(
          env,
          challenger
        ),

        getPvPPetEffects(
          env,
          target
        ),
      ]);
  } catch (error) {
    console.log(
      "PvP pet effect lookup failed:",
      error?.message ||
        error
    );
  }


  challengerPetEffects =
    challengerPetEffects ||
    getEmptyPvPEffects();

  targetPetEffects =
    targetPetEffects ||
    getEmptyPvPEffects();


  /*
   * ==========================================================
   * SELECT FIGHTERS
   * ==========================================================
   */

  const selectedChallengerItem =
    (
      await getRandomInventoryItem(
        env,
        challenger
      )
    ) ||
    makePlayerFighter(
      challengerPlayer
    );


  const selectedTargetItem =
    (
      await getRandomInventoryItem(
        env,
        target
      )
    ) ||
    makePlayerFighter(
      targetPlayer
    );


  const challengerItem =
    await enrichFighter(
      env,
      selectedChallengerItem
    );


  const targetItem =
    await enrichFighter(
      env,
      selectedTargetItem
    );


  /*
   * ==========================================================
   * ADVANTAGE
   * ==========================================================
   */

  const challengerAdvantage =
    Number(
      (
        await getAdvantage(
          env,

          challengerItem
            .item_type,

          targetItem
            .item_type
        )
      ) || 0
    );


  const targetAdvantage =
    Number(
      (
        await getAdvantage(
          env,

          targetItem
            .item_type,

          challengerItem
            .item_type
        )
      ) || 0
    );


  /*
   * ==========================================================
   * COMBAT ROLL
   * ==========================================================
   */

  const challengerRoll =
    randomInt(
      0,
      2
    );

  const targetRoll =
    randomInt(
      0,
      2
    );


  const challengerPower =
    getFighterPower(
      challengerItem
    );

  const targetPower =
    getFighterPower(
      targetItem
    );


  const challengerScore =
    challengerPower +
    challengerAdvantage +
    challengerRoll;


  const targetScore =
    targetPower +
    targetAdvantage +
    targetRoll;


  /*
   * ==========================================================
   * WINNER
   * ==========================================================
   */

  let winner;
  let loser;

  let winnerItem;
  let loserItem;

  let tieBreakerUsed =
    false;


  if (
    challengerScore >
    targetScore
  ) {
    winner =
      challengerPlayer;

    loser =
      targetPlayer;

    winnerItem =
      challengerItem;

    loserItem =
      targetItem;

  } else if (
    targetScore >
    challengerScore
  ) {
    winner =
      targetPlayer;

    loser =
      challengerPlayer;

    winnerItem =
      targetItem;

    loserItem =
      challengerItem;

  } else {
    tieBreakerUsed =
      true;


    if (
      Math.random() < 0.5
    ) {
      winner =
        challengerPlayer;

      loser =
        targetPlayer;

      winnerItem =
        challengerItem;

      loserItem =
        targetItem;
    } else {
      winner =
        targetPlayer;

      loser =
        challengerPlayer;

      winnerItem =
        targetItem;

      loserItem =
        challengerItem;
    }
  }


  const winnerUsername =
    winner.username;

  const loserUsername =
    loser.username;


  /*
   * ==========================================================
   * WINNER / LOSER PET EFFECTS
   * ==========================================================
   */

  const winnerPetEffects =
    winnerUsername ===
    challenger
      ? challengerPetEffects
      : targetPetEffects;


  const loserPetEffects =
    loserUsername ===
    challenger
      ? challengerPetEffects
      : targetPetEffects;


  /*
   * ==========================================================
   * AUDIENCE BONUS
   * ==========================================================
   *
   * Crowd Favorite applies ONLY to
   * audience gold.
   */

  const baseAudienceBonus =
    Math.min(
      50,

      randomInt(
        5,
        10
      ) +
      Math.floor(
        stake * 0.5
      )
    ) * 4;


  const crowdFavoritePercent =
    Number(
      winnerPetEffects
        ?.crowdFavoritePercent ||
      0
    );


  const crowdFavoriteBonus =
    crowdFavoritePercent > 0
      ? Math.floor(
          baseAudienceBonus *
          crowdFavoritePercent /
          100
        )
      : 0;


  const audienceBonus =
    baseAudienceBonus +
    crowdFavoriteBonus;


  /*
   * ==========================================================
   * SECOND CHANCE
   * ==========================================================
   *
   * Second Chance reduces only the
   * amount actually lost.
   *
   * It does NOT change what the winner
   * receives from the wager.
   */

  const secondChancePercent =
    Number(
      loserPetEffects
        ?.secondChancePercent ||
      0
    );


  const savedGold =
    secondChancePercent > 0
      ? Math.floor(
          stake *
          secondChancePercent /
          100
        )
      : 0;


  const actualLoss =
    Math.max(
      0,
      stake - savedGold
    );


  /*
   * Winner still receives the original
   * wager plus audience gold.
   *
   * Second Chance is effectively a pet
   * subsidy for the loser.
   */
  const totalReward =
    stake +
    audienceBonus;


  /*
   * ==========================================================
   * DURABILITY
   * ==========================================================
   */

  const brokenItems = [];


  await damageFighter(
    env,
    challengerItem,
    brokenItems
  );


  await damageFighter(
    env,
    targetItem,
    brokenItems
  );


  const winnerStoryName =
    winner.storyName ||
    winner.display_name;


  const loserStoryName =
    loser.storyName ||
    loser.display_name;


  /*
   * ==========================================================
   * DATABASE UPDATE
   * ==========================================================
   */

  const statements = [
    /*
     * Winner.
     */
    env.DB.prepare(
      `UPDATE players
       SET gold = gold + ?,
           total_gold_earned =
             total_gold_earned + ?,
           duel_wins =
             duel_wins + 1,
           updated_at =
             CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(
      totalReward,
      totalReward,
      winnerUsername
    ),


    /*
     * Loser.
     */
    env.DB.prepare(
      `UPDATE players
       SET gold = gold - ?,
           duel_losses =
             duel_losses + 1,
           updated_at =
             CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(
      actualLoss,
      loserUsername
    ),


    /*
     * Winner's wager reward.
     */
    env.DB.prepare(
      `INSERT INTO transactions (
         username,
         amount,
         reason
       )
       VALUES (?, ?, ?)`
    ).bind(
      winnerUsername,
      stake,
      "challenge_wager_win"
    ),


    /*
     * Normal audience bonus.
     */
    env.DB.prepare(
      `INSERT INTO transactions (
         username,
         amount,
         reason
       )
       VALUES (?, ?, ?)`
    ).bind(
      winnerUsername,
      baseAudienceBonus,
      "challenge_audience_bonus"
    ),


    /*
     * Loser's actual wager loss.
     */
    env.DB.prepare(
      `INSERT INTO transactions (
         username,
         amount,
         reason
       )
       VALUES (?, ?, ?)`
    ).bind(
      loserUsername,
      -actualLoss,
      "challenge_loss"
    ),


    /*
     * Duel state.
     */
    env.DB.prepare(
      `UPDATE duels
       SET status = 'completed',
           accepted_at =
             CURRENT_TIMESTAMP,
           result = ?
       WHERE id = ?`
    ).bind(
      `${winner.display_name} defeated ${loser.display_name}`,
      challenge.id
    ),
  ];


  /*
   * ==========================================================
   * CROWD FAVORITE TRANSACTION
   * ==========================================================
   */

  if (
    crowdFavoriteBonus > 0
  ) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO transactions (
           username,
           amount,
           reason
         )
         VALUES (?, ?, ?)`
      ).bind(
        winnerUsername,
        crowdFavoriteBonus,
        "pet_crowd_favorite_bonus"
      )
    );
  }


  /*
   * ==========================================================
   * SECOND CHANCE TRANSACTION
   * ==========================================================
   *
   * This is a zero-sum bookkeeping note,
   * not an additional gold transaction.
   *
   * The loser simply loses less.
   *
   * We log the saved amount separately
   * for later analytics.
   */

  if (
    savedGold > 0
  ) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO transactions (
           username,
           amount,
           reason
         )
         VALUES (?, ?, ?)`
      ).bind(
        loserUsername,
        savedGold,
        "pet_second_chance_saved"
      )
    );
  }


  /*
   * ==========================================================
   * EVENT
   * ==========================================================
   */

  let eventMessage =
    `${winner.display_name} defeated ${loser.display_name}, ` +
    `won the ${stake}g wager, and received ` +
    `${audienceBonus}g from the audience.`;


  if (
    crowdFavoriteBonus > 0
  ) {
    eventMessage +=
      ` Crowd Favorite added ${crowdFavoriteBonus}g.`;
  }


  if (
    savedGold > 0
  ) {
    eventMessage +=
      ` Second Chance saved ${loser.display_name} ${savedGold}g.`;
  }


  statements.push(
    env.DB.prepare(
      `INSERT INTO events (
         event_type,
         message
       )
       VALUES (?, ?)`
    ).bind(
      "challenge_result",
      eventMessage
    )
  );


  await env.DB.batch(
    statements
  );


  /*
   * ==========================================================
   * ESSENCE
   * ==========================================================
   *
   * Winner only.
   */

  let essenceDrop =
    null;


  try {
    essenceDrop =
      await maybeAwardEssence(
        env,
        winnerUsername,
        "pvp"
      );
  } catch (error) {
    console.log(
      "PvP Essence reward failed:",
      error?.message ||
        error
    );
  }


  /*
   * ==========================================================
   * FALLBACK COMMENTARY
   * ==========================================================
   */

  let fallback =
    `⚔️ ${getFighterLabel(
      challengerPlayer,
      challengerItem
    )} faced ${getFighterLabel(
      targetPlayer,
      targetItem
    )}. ${winnerStoryName} wins the ${stake}g wager, and the crowd throws in another ${audienceBonus}g!`;


  if (
    savedGold > 0
  ) {
    fallback +=
      ` ${loserStoryName}'s pet saves ${savedGold}g from the loss!`;
  }


  /*
   * ==========================================================
   * COMMENTARY
   * ==========================================================
   */

  let commentary =
    fallback;


  try {
    commentary =
      await generateCommentary(
        env,
        "duel",
        {
          challenger: {
            username:
              challengerPlayer
                .username,

            displayName:
              challengerPlayer
                .display_name,

            storyName:
              challengerPlayer
                .storyName,

            alias:
              challengerPlayer
                .alias,

            aliases:
              challengerPlayer
                .aliases,

            goldBefore:
              challengerGold,

            petEffects:
              challengerPetEffects,
          },


          target: {
            username:
              targetPlayer
                .username,

            displayName:
              targetPlayer
                .display_name,

            storyName:
              targetPlayer
                .storyName,

            alias:
              targetPlayer
                .alias,

            aliases:
              targetPlayer
                .aliases,

            goldBefore:
              targetGold,

            petEffects:
              targetPetEffects,
          },


          challengerFighter: {
            itemKey:
              challengerItem
                .item_key,

            name:
              challengerItem
                .item_name,

            type:
              challengerItem
                .item_type,

            rarity:
              challengerItem
                .rarity,

            description:
              challengerItem
                .description,

            pvpBehavior:
              challengerItem
                .pvp_behavior,

            flavorText:
              challengerItem
                .flavor_text,

            isPlayer:
              Boolean(
                challengerItem
                  .is_player
              ),

            power:
              challengerPower,

            roll:
              challengerRoll,

            advantage:
              challengerAdvantage,

            score:
              challengerScore,
          },


          targetFighter: {
            itemKey:
              targetItem
                .item_key,

            name:
              targetItem
                .item_name,

            type:
              targetItem
                .item_type,

            rarity:
              targetItem
                .rarity,

            description:
              targetItem
                .description,

            pvpBehavior:
              targetItem
                .pvp_behavior,

            flavorText:
              targetItem
                .flavor_text,

            isPlayer:
              Boolean(
                targetItem
                  .is_player
              ),

            power:
              targetPower,

            roll:
              targetRoll,

            advantage:
              targetAdvantage,

            score:
              targetScore,
          },


          result: {
            winner:
              winnerStoryName,

            winnerDisplayName:
              winner.display_name,

            loser:
              loserStoryName,

            loserDisplayName:
              loser.display_name,

            winnerFighter:
              winnerItem.item_name,

            loserFighter:
              loserItem.item_name,

            stake,

            baseAudienceBonus,

            crowdFavoritePercent,

            crowdFavoriteBonus,

            audienceBonus,

            secondChancePercent,

            savedGold,

            actualLoss,

            totalReward,

            tieBreakerUsed,

            brokenItems,
          },
        }
      );

  } catch (error) {
    console.log(
      "Duel commentary failed:",
      error?.message ||
        error
    );
  }


  /*
   * ==========================================================
   * BROKEN ITEM TEXT
   * ==========================================================
   */

  let breakText = "";


  if (
    brokenItems.length === 1
  ) {
    breakText =
      ` ${brokenItems[0]} is exhausted and heads back to camp for a long rest.`;

  } else if (
    brokenItems.length > 1
  ) {
    breakText =
      ` ${brokenItems.join(
        " and "
      )} are exhausted and head back to camp for a long rest.`;
  }


  /*
   * ==========================================================
   * PET TRAIT TEXT
   * ==========================================================
   */

  let petText = "";


  if (
    crowdFavoriteBonus > 0
  ) {
    petText +=
      ` 🐾 Crowd Favorite added ${crowdFavoriteBonus}g for ${winner.display_name}!`;
  }


  if (
    savedGold > 0
  ) {
    petText +=
      ` 🐾 Second Chance saved ${loser.display_name} ${savedGold}g!`;
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
      ` ✨ ${winner.display_name} also found an Essence!`;
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
    }${
      breakText
    }`.slice(
      0,
      490
    )
  );
}