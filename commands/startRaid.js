import {
  cleanUsername,
} from "../helpers/players.js";

import {
  sendTwitchAnnouncement,
} from "../helpers/twitchChat.js";

const RAID_KEY = "lebro_finale";
const ADMIN_USERNAME = "eryynftw";

const RAID_PROLOGUE =
  "📯 HEAR YE, GOBLINS! Emperor LeBro clings to the Goblin Crown from deep within the Imperial Fortress. Seven deadly trials stand between the Goblin Army and the throne. Ancient guardians, cursed obstacles, legendary champions, and broken realities await. Win each battle to march deeper. Fall, regroup, and attack again. Tonight, we fight to overthrow an Emperor and claim the crown for a new ruler!";

export async function handleStartRaid(env, url) {
  const username = cleanUsername(
    url.searchParams.get("user")
  );

  if (!username) {
    return new Response(
      "Usage: !startraid"
    );
  }

  if (username !== ADMIN_USERNAME) {
    return new Response(
      "🚫 Only the Goblin King may begin the finale.",
      {
        status: 403,
      }
    );
  }

  const currentRaid = await env.DB.prepare(`
    SELECT
      active,
      encounter_index,
      encounter_status
    FROM raid_state
    WHERE id = 1
  `).first();

  if (Number(currentRaid?.active || 0) === 1) {
    return new Response(
      `⚔️ The Season 2 Finale is already active. Encounter ${
        Number(currentRaid.encounter_index || 0) + 1
      } is currently ${currentRaid.encounter_status}.`
    );
  }

  const schedule = getNextEncounterSchedule();

  await env.DB.prepare(`
    INSERT INTO raid_state (
      id,
      active,
      raid_key,
      encounter_index,
      encounter_status,
      attempt_number,
      join_opens_at,
      resolve_at,
      next_action_at,
      started_at,
      updated_at,
      completed_at
    )
    VALUES (
      1,
      1,
      ?,
      0,
      'scheduled',
      1,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      NULL
    )
    ON CONFLICT(id) DO UPDATE SET
      active = 1,
      raid_key = excluded.raid_key,
      encounter_index = 0,
      encounter_status = 'scheduled',
      attempt_number = 1,
      join_opens_at = excluded.join_opens_at,
      resolve_at = excluded.resolve_at,
      next_action_at = excluded.next_action_at,
      started_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP,
      completed_at = NULL
  `)
    .bind(
      RAID_KEY,
      schedule.joinOpensAt,
      schedule.resolveAt,
      schedule.joinOpensAt
    )
    .run();

  await env.DB.prepare(`
    DELETE FROM raid_participants
    WHERE raid_key = ?
  `)
    .bind(RAID_KEY)
    .run();

  const joinTime = formatTimeIST(
    schedule.joinOpensAt
  );

  const resolveTime = formatTimeIST(
    schedule.resolveAt
  );

  try {
    await sendTwitchAnnouncement(
      env,
      RAID_PROLOGUE,
      "purple"
    );
  } catch (error) {
    console.error(
      "[Start Raid] Prologue announcement failed:",
      error?.stack || error?.message || error
    );
  }

  console.log("[Start Raid] Finale scheduled:", {
    startedBy: username,
    joinOpensAt: schedule.joinOpensAt,
    resolveAt: schedule.resolveAt,
  });

  return new Response(
    `👑 The Season 2 Finale has begun! Encounter 1 opens at ${joinTime} IST and resolves at ${resolveTime} IST. Rally your goblins!`
  );
}

function getNextEncounterSchedule() {
  const now = new Date();

  const join = new Date(now);
  join.setUTCSeconds(0, 0);

  const minute = join.getUTCMinutes();

  if (minute < 15) {
    join.setUTCMinutes(15);
  } else {
    join.setUTCHours(
      join.getUTCHours() + 1
    );
    join.setUTCMinutes(15);
  }

  const resolve = new Date(join);
  resolve.setUTCMinutes(
    resolve.getUTCMinutes() + 5
  );

  return {
    joinOpensAt: join.toISOString(),
    resolveAt: resolve.toISOString(),
  };
}

function formatTimeIST(timestamp) {
  if (!timestamp) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
  ).format(new Date(timestamp));
}