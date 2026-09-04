import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";


const DUEL_MAX_PERCENT = 0.10;
const DUEL_ABSOLUTE_CAP = 20000;


export async function handleChallenge(env, url) {
  const challenger =
    cleanUsername(
      url.searchParams.get("user")
    );

  const challengerDisplay =
    cleanDisplayName(
      url.searchParams.get("user")
    );

  const target =
    cleanUsername(
      url.searchParams.get("target")
    );

  const targetDisplay =
    cleanDisplayName(
      url.searchParams.get("target")
    );

  const rawStake =
    Number(
      url.searchParams.get("stake")
    );


  /*
   * ==========================================================
   * VALIDATION
   * ==========================================================
   */

  if (!challenger || !target) {
    return new Response(
      "Usage: !challenge @goblin <gold>"
    );
  }


  if (challenger === target) {
    return new Response(
      "You cannot challenge yourself, unstable goblin."
    );
  }


  /*
   * ==========================================================
   * PLAYERS
   * ==========================================================
   */

  const challengerPlayer =
    await getOrCreatePlayer(
      env,
      challenger,
      challengerDisplay
    );


  const targetPlayer =
    await getOrCreatePlayer(
      env,
      target,
      targetDisplay
    );


  const challengerGold =
    Number(
      challengerPlayer.gold || 0
    );


  const targetGold =
    Number(
      targetPlayer.gold || 0
    );


  if (challengerGold < 1) {
    return new Response(
      `${challengerPlayer.display_name}, ` +
      `you need at least 1g to challenge someone.`
    );
  }


  if (targetGold < 1) {
    return new Response(
      `${targetPlayer.display_name} has no gold to wager.`
    );
  }


  /*
   * ==========================================================
   * MAXIMUM WAGER
   * ==========================================================
   *
   * The maximum wager is based on the poorer
   * player's current gold.
   *
   * Players may wager up to 10% of the poorer
   * player's wealth, with an absolute ceiling
   * of 20,000g.
   *
   * Examples:
   *
   * 1,000g poorer player   -> 100g max
   * 10,000g poorer player  -> 1,000g max
   * 50,000g poorer player  -> 5,000g max
   * 150,000g poorer player -> 15,000g max
   * 300,000g poorer player -> 20,000g max
   */

  const poorerGold =
    Math.min(
      challengerGold,
      targetGold
    );


  const percentageCap =
    Math.floor(
      poorerGold *
      DUEL_MAX_PERCENT
    );


  const maxStake =
    Math.min(
      percentageCap,
      DUEL_ABSOLUTE_CAP
    );


  /*
   * If 10% of the poorer player's gold is
   * less than 1g, they are too poor to wager.
   */
  if (maxStake < 1) {
    return new Response(
      "Neither goblin has enough gold for a challenge."
    );
  }


  /*
   * ==========================================================
   * SELECT WAGER
   * ==========================================================
   */

  let stake =
    rawStake;


  /*
   * If the player did not provide a valid wager,
   * Treasury chooses a small default.
   */
  if (
    !Number.isInteger(stake) ||
    stake <= 0
  ) {
    stake =
      Math.min(
        5,
        maxStake
      );
  }


  /*
   * Clamp excessive wagers.
   */
  if (
    stake > maxStake
  ) {
    stake =
      maxStake;
  }


  if (stake < 1) {
    return new Response(
      "Neither goblin has enough gold for a challenge."
    );
  }


  /*
   * ==========================================================
   * TREASURY MESSAGE
   * ==========================================================
   */

  let stakeNote = "";


  if (
    !Number.isInteger(rawStake) ||
    rawStake <= 0
  ) {
    stakeNote =
      ` No wager was given, so the Goblin Treasury selected ${stake}g.`;

  } else if (
    rawStake > maxStake
  ) {
    stakeNote =
      ` The Goblin Treasury capped the wager at ${stake}g.`;
  }


  /*
   * ==========================================================
   * EXISTING CHALLENGE CHECK
   * ==========================================================
   */

  const existingDuel =
    await env.DB.prepare(
      `SELECT *
       FROM duels
       WHERE target = ?
         AND status = 'pending'
         AND datetime(expires_at) > datetime('now')
       ORDER BY id DESC
       LIMIT 1`
    )
      .bind(target)
      .first();


  if (existingDuel) {
    return new Response(
      `${targetPlayer.display_name} already has a pending challenge. ` +
      `They must type !ready or !run first.`
    );
  }


  /*
   * ==========================================================
   * CREATE CHALLENGE
   * ==========================================================
   */

  const expiresAt =
    new Date(
      Date.now() +
      120 * 1000
    ).toISOString();


  await env.DB.prepare(
    `INSERT INTO duels (
       challenger,
       target,
       stake,
       status,
       expires_at
     )
     VALUES (
       ?,
       ?,
       ?,
       'pending',
       ?
     )`
  )
    .bind(
      challenger,
      target,
      stake,
      expiresAt
    )
    .run();


  /*
   * ==========================================================
   * EVENT LOG
   * ==========================================================
   */

  await env.DB.prepare(
    `INSERT INTO events (
       event_type,
       message
     )
     VALUES (?, ?)`
  )
    .bind(
      "duel_challenge",

      `${challengerPlayer.display_name} challenged ` +
      `${targetPlayer.display_name} for ${stake}g.`
    )
    .run();


  /*
   * ==========================================================
   * RESPONSE
   * ==========================================================
   */

  const responseMessage =
    `⚔️ ${challengerPlayer.display_name} challenged ` +
    `${targetPlayer.display_name} for ${stake}g!` +
    `${stakeNote} ` +
    `${targetPlayer.display_name}, type !ready to fight or !run to flee. ` +
    `Anyone without a Gobbo must enter the arena personally.`;


  return new Response(
    responseMessage.slice(
      0,
      490
    )
  );
}