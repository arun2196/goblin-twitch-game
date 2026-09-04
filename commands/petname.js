import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

import {
  getPlayerPet,
} from "../helpers/petRewards.js";


const PET_RENAME_COST = 1000;
const MAX_PET_NAME_LENGTH = 20;


/*
 * ============================================================
 * PET NAME SANITIZATION
 * ============================================================
 */

function cleanPetName(value) {
  const name =
    String(value || "")
      .trim()
      .replace(/\s+/g, " ");

  if (!name) {
    return "";
  }

  /*
   * Keep names chat-friendly.
   *
   * Allows:
   * - letters
   * - numbers
   * - spaces
   * - apostrophes
   * - hyphens
   * - underscores
   *
   * Unicode letters/numbers are allowed.
   */
  return name
    .replace(
      /[^\p{L}\p{N}\s'_-]/gu,
      ""
    )
    .trim()
    .slice(
      0,
      MAX_PET_NAME_LENGTH
    );
}


/*
 * ============================================================
 * COMMAND
 * ============================================================
 *
 * !petname Gumbo
 *
 * Rename cost:
 * 1000 gold
 *
 * Can be used repeatedly.
 */

export async function handlePetName(
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
      "Usage: !petname <name>"
    );
  }


  /*
   * Depending on your command parser,
   * the argument may currently arrive as:
   *
   * ?name=Gumbo
   *
   * If your router uses a different parameter
   * such as "target", "args", or "query",
   * change this line accordingly.
   */
  const requestedName =
    cleanPetName(
      url.searchParams.get("name")
    );


  if (!requestedName) {
    return new Response(
      `Usage: !petname <name> | Renaming costs ${PET_RENAME_COST}g.`
    );
  }


  if (
    requestedName.length >
    MAX_PET_NAME_LENGTH
  ) {
    return new Response(
      `Pet names can be at most ${MAX_PET_NAME_LENGTH} characters.`
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
   * PET CHECK
   * ==========================================================
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
   * I would only allow naming once the pet
   * has actually hatched.
   */
  if (
    pet.pet_state !== "hatched"
  ) {
    return new Response(
      `${player.display_name}'s pet has not hatched yet.`
    );
  }


  /*
   * ==========================================================
   * SAME NAME CHECK
   * ==========================================================
   */

  const currentName =
    String(
      pet.pet_name || ""
    )
      .trim();


  if (
    currentName &&
    currentName.toLowerCase() ===
      requestedName.toLowerCase()
  ) {
    return new Response(
      `${player.display_name}'s pet is already named ${currentName}.`
    );
  }


  /*
   * ==========================================================
   * GOLD CHECK
   * ==========================================================
   */

  const currentGold =
    Math.max(
      0,
      Number(
        player.gold || 0
      )
    );


  if (
    currentGold <
    PET_RENAME_COST
  ) {
    return new Response(
      `${player.display_name} needs ${PET_RENAME_COST}g to rename their pet.`
    );
  }


  /*
   * ==========================================================
   * ATOMIC GOLD DEDUCTION
   * ==========================================================
   *
   * The conditional UPDATE prevents the player
   * from going negative if their balance changes
   * between the earlier SELECT and this UPDATE.
   */

  const goldResult =
    await env.DB.prepare(
      `UPDATE players
       SET gold = gold - ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?
         AND gold >= ?`
    )
      .bind(
        PET_RENAME_COST,
        username,
        PET_RENAME_COST
      )
      .run();


  if (
    !goldResult?.meta?.changes
  ) {
    return new Response(
      `${player.display_name} does not have enough gold to rename their pet.`
    );
  }


  /*
   * ==========================================================
   * UPDATE PET NAME
   * ==========================================================
   */

  try {
    await env.DB.prepare(
      `UPDATE pets
       SET pet_name = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    )
      .bind(
        requestedName,
        username
      )
      .run();
  } catch (error) {
    /*
     * Refund the rename cost if the pet update fails.
     */
    await env.DB.prepare(
      `UPDATE players
       SET gold = gold + ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    )
      .bind(
        PET_RENAME_COST,
        username
      )
      .run();

    console.log(
      "Pet rename failed:",
      username,
      error?.message || error
    );

    return new Response(
      "Something went wrong while renaming the pet. No gold was taken."
    );
  }


  /*
   * ==========================================================
   * TRANSACTION LOG
   * ==========================================================
   *
   * Optional. Failure here should not undo
   * the successful rename.
   */

  try {
    await env.DB.prepare(
      `INSERT INTO transactions (
         username,
         amount,
         reason,
         created_at
       )
       VALUES (
         ?,
         ?,
         ?,
         CURRENT_TIMESTAMP
       )`
    )
      .bind(
        username,
        -PET_RENAME_COST,
        "pet_rename"
      )
      .run();
  } catch (error) {
    console.log(
      "Pet rename transaction log failed:",
      username,
      error?.message || error
    );
  }


  /*
   * ==========================================================
   * RESPONSE
   * ==========================================================
   */

  if (currentName) {
    return new Response(
      (
        `${player.display_name} spends ${PET_RENAME_COST}g. ` +
        `${currentName} is now known as ${requestedName}.`
      ).slice(
        0,
        490
      )
    );
  }


  return new Response(
    (
      `${player.display_name} spends ${PET_RENAME_COST}g and names their pet ${requestedName}.`
    ).slice(
      0,
      490
    )
  );
}