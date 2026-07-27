import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

export async function handleRaid(env, url) {
  const username = cleanUsername(
    url.searchParams.get("user")
  );

  const displayName = cleanDisplayName(
    url.searchParams.get("user")
  );

  if (!username) {
    return new Response("Usage: !raid");
  }

  const raid = await env.DB.prepare(`
    SELECT *
    FROM raid_state
    WHERE id = 1
  `).first();

  if (!raid || Number(raid.active) !== 1) {
    return new Response(
      "⚔️ There is no active raid."
    );
  }

  if (raid.encounter_status !== "joining") {
    return new Response(
      "⚔️ The raid is not accepting new goblins right now."
    );
  }

  const player = await getOrCreatePlayer(
    env,
    username,
    displayName
  );

  const playerDisplay =
    player.display_name ||
    displayName ||
    username;

  const alreadyJoined = await env.DB.prepare(`
    SELECT 1
    FROM raid_participants
    WHERE
      raid_key = ?
      AND encounter_index = ?
      AND username = ?
  `)
    .bind(
      raid.raid_key,
      raid.encounter_index,
      username
    )
    .first();

  if (alreadyJoined) {
    return new Response(
      `⚔️ ${playerDisplay}, you're already marching with the goblin army!`
    );
  }

  await env.DB.prepare(`
    INSERT INTO raid_participants (
      raid_key,
      encounter_index,
      username,
      display_name
    )
    VALUES (?, ?, ?, ?)
  `)
    .bind(
      raid.raid_key,
      raid.encounter_index,
      username,
      playerDisplay
    )
    .run();

  const result = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM raid_participants
    WHERE
      raid_key = ?
      AND encounter_index = ?
  `)
    .bind(
      raid.raid_key,
      raid.encounter_index
    )
    .first();

  const total =
    Number(result?.total || 0);

  return new Response(
    `⚔️ ${playerDisplay} joins the raid! (${total} goblin${total === 1 ? "" : "s"} assembled.)`
  );
}