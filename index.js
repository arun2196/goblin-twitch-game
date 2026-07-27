import { handleGold } from "./commands/gold.js";
import { handleInventory } from "./commands/inventory.js";
import { handleDelve } from "./commands/delve.js";
import { handleChallenge } from "./commands/challenge.js";
import { handleAccept } from "./commands/accept.js";
import { handleDecline } from "./commands/decline.js";
import { handleInspect } from "./commands/inspect.js";
import { handleGift } from "./commands/gift.js";
import { handleChest } from "./commands/chest.js";
import { handleRichlist } from "./commands/richlist.js";
import { handleAskGobbo } from "./commands/askGobbo.js";
import { handleSound } from "./commands/sound.js";
import { handleEventSub } from "./commands/twitch.js";
import { handleQueue } from "./commands/queue.js";
import { handleDungeon } from "./commands/dungeon.js";
import { handleAlias } from "./commands/alias.js";
import { handleQueueList } from "./commands/queueList.js";
import { handleSmite } from "./commands/smite.js";
import { handleStartRaid } from "./commands/startRaid.js";
import { handleRaid } from "./commands/raid.js";

import { generateGobboSpeech } from "./helpers/gobboVoice.js";
import { uploadAudioToR2 } from "./helpers/r2.js";
import { getNextGobboSound } from "./helpers/gobboSoundQueue.js";
import {
  getRaidEncounter,
  announceRaidJoinOpen,
  announceRaidSuccess,
  announceRaidFailure,
  announceRaidNoParticipants,
  announceRaidComplete,
} from "./helpers/raidAnnouncements.js";
import { randomInt } from "./helpers/random.js";

const routes = {
  "/gold": handleGold,
  "/inventory": handleInventory,
  "/delve": handleDelve,
  "/challenge": handleChallenge,
  "/ready": handleAccept,
  "/run": handleDecline,
  "/inspect": handleInspect,
  "/gift": handleGift,
  "/chest": handleChest,
  "/richlist": handleRichlist,
  "/askgobbo": handleAskGobbo,
  "/ask": handleAskGobbo,
  "/queue": handleQueue,
  "/dungeon": handleDungeon,
  "/alias": handleAlias,
  "/nickname": handleAlias,
  "/queuelist": handleQueueList,
  "/smite": handleSmite,
  "/startraid": handleStartRaid,
  "/raid": handleRaid,
};

export default {
  async scheduled(event, env, ctx) {
    console.log("[Cron] Triggered:", event.cron);

    // Runs at xx:30 UTC, which is xx:00 IST.
    if (event.cron === "0,30 * * * *") {
      ctx.waitUntil(runDungeonCron(env));
      return;
    }

    // Checks once every minute for any scheduled raid action.
    if (event.cron === "* * * * *") {
      ctx.waitUntil(processRaidSchedule(env));
      return;
    }

    console.log("[Cron] Unknown schedule:", event.cron);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/dbtest") {
        const result = await env.DB.prepare("SELECT 1 AS ok").first();

        return new Response(
          `D1 Connected! Test value: ${result.ok}`
        );
      }

      if (url.pathname === "/dungeon-timer") {
        return new Response(getDungeonTimerHtml(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }

      if (url.pathname === "/testvoice") {
        const text =
          url.searchParams.get("text") ||
          "Ahoy mate! Gobbo has found treasure, trouble, and possibly a chicken.";

        const audioBuffer = await generateGobboSpeech(env, text);

        const key = await uploadAudioToR2(
          env,
          audioBuffer,
          "gobbo-voice"
        );

        const audioUrl =
          `${url.origin}/sound?key=${encodeURIComponent(key)}`;

        return Response.json({
          ok: true,
          key,
          audioUrl,
        });
      }

      if (url.pathname === "/gobbo-player") {
        return new Response(getGobboPlayerHtml(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }

      if (url.pathname === "/gobbo/next-sound") {
        const allowed = await claimGobboPollSlot(env);

        if (!allowed) {
          return Response.json({
            ok: true,
            sound: null,
            throttled: true,
          });
        }

        const sound = await getNextGobboSound(env);

        if (!sound) {
          return Response.json({
            ok: true,
            sound: null,
          });
        }

        return Response.json({
          ok: true,
          sound: {
            id: sound.id,
            url: sound.sound_url,
          },
        });
      }

      if (url.pathname === "/twitch/eventsub") {
        return await handleEventSub(
          request,
          env,
          ctx
        );
      }

      if (url.pathname === "/sound") {
        return await handleSound(env, url);
      }

      const handler = routes[url.pathname];

      if (!handler) {
        return new Response(
          "Goblin RPG Worker is alive."
        );
      }

      return await handler(
        env,
        url,
        request,
        ctx
      );
    } catch (err) {
      console.error(
        "[Fetch Error]",
        err?.stack || err?.message || err
      );

      return new Response(
        `Goblin error: ${err?.message || "Unknown error"}`,
        {
          status: 500,
        }
      );
    }
  },
};

function getGobboPlayerHtml() {
  return `<!DOCTYPE html>
<html>
<body>
  <audio id="player" autoplay controls></audio>

  <script>
    const player = document.getElementById("player");
    player.volume = 1.0;

    let isPlaying = false;
    let isPolling = false;

    async function pollSound(reason = "interval") {
      if (isPlaying || isPolling) {
        console.log("Poll skipped:", {
          reason,
          isPlaying,
          isPolling
        });

        return;
      }

      isPolling = true;

      console.log(
        "Polling Gobbo sound:",
        reason
      );

      try {
        const res = await fetch(
          "/gobbo/next-sound?ts=" + Date.now(),
          {
            cache: "no-store"
          }
        );

        const data = await res.json();

        if (
          !data.ok ||
          !data.sound ||
          !data.sound.url
        ) {
          isPolling = false;
          return;
        }

        const audioUrl = new URL(
          data.sound.url,
          window.location.origin
        ).href;

        console.log(
          "Playing Gobbo sound:",
          audioUrl
        );

        player.src = audioUrl;
        player.load();

        isPlaying = true;

        await player.play();

        isPolling = false;
      } catch (err) {
        console.error(
          "Gobbo player error:",
          err
        );

        isPlaying = false;
        isPolling = false;
        player.src = "";
      }
    }

    player.onended = () => {
      console.log("Gobbo sound ended");

      isPlaying = false;
      isPolling = false;
      player.src = "";

      setTimeout(() => {
        pollSound("after-ended");
      }, 2000);
    };

    player.onerror = () => {
      console.error(
        "Audio error:",
        player.error
      );

      isPlaying = false;
      isPolling = false;
      player.src = "";
    };

    setInterval(() => {
      pollSound("interval");
    }, 10000);

    setTimeout(() => {
      pollSound("initial");
    }, 3000);
  </script>
</body>
</html>`;
}

function getDungeonTimerHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />

  <style>
    body {
      margin: 0;
      background: transparent;
      overflow: hidden;
      font-family: "Trebuchet MS", Arial, sans-serif;
      user-select: none;
    }

    .box {
      display: inline-block;
      padding: 10px 18px;
      background: transparent;
      text-align: center;
    }

    .label {
      font-size: 22px;
      font-weight: 900;
      font-family: comic sans ms, "Arial Black", sans-serif;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #000000;
      text-shadow:
        1px 1px 0 rgba(255,255,255,0.35);
    }

    .timer {
      margin-top: 2px;
      font-size: 58px;
      font-family: comic sans ms, "Arial Black", sans-serif;
      font-weight: 900;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      color: #111111;
      text-shadow:
        1px 1px 0 rgba(255,255,255,0.35);
    }

    .subtitle {
      margin-top: -2px;
      font-size: 13px;
      font-family: comic sans ms, "Arial Black", sans-serif;
      font-weight: 900;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #111111;
      text-shadow:
        1px 1px 0 #f7ddb0;
    }

    .now {
      font-size: 48px;
      color: #111111;
    }
  </style>
</head>

<body>
  <div class="box">
    <div class="label">Next Dungeon</div>
    <div id="timer" class="timer">30:00</div>
    <div class="subtitle">IN</div>
  </div>

  <script>
    const timer =
      document.getElementById("timer");

    const gobboMessages = [
      "DELVE!",
      "CHARGE!",
      "LOOT!",
      "GO GO!",
      "BONK!",
      "SMASH!",
      "DIG IN!"
    ];

    let lastDungeonHour = -1;

    function updateTimer() {
      const now = new Date();

      const secondsSinceHour =
        now.getMinutes() * 60 +
        now.getSeconds();

      const dungeonOffset =
        30 * 60;

      const remaining =
        (
          dungeonOffset -
          secondsSinceHour +
          1800
        ) % 1800;

      if (remaining <= 5) {
        timer.classList.add("now");

        const currentDungeonHour =
          now.getHours();

        if (
          currentDungeonHour !==
          lastDungeonHour
        ) {
          lastDungeonHour =
            currentDungeonHour;

          timer.textContent =
            gobboMessages[
              Math.floor(
                Math.random() *
                gobboMessages.length
              )
            ];
        }

        return;
      }

      timer.classList.remove("now");

      const minutes =
        Math.floor(remaining / 60);

      const seconds =
        remaining % 60;

      timer.textContent =
        String(minutes).padStart(2, "0") +
        ":" +
        String(seconds).padStart(2, "0");
    }

    updateTimer();

    setInterval(
      updateTimer,
      1000
    );
  </script>
</body>
</html>`;
}

async function claimGobboPollSlot(env) {
  const now = Date.now();
  const minGapMs = 1500;

  const updated = await env.DB.prepare(`
    UPDATE app_state
    SET value = ?
    WHERE key = 'gobbo_last_poll'
      AND value <= ?
    RETURNING value
  `)
    .bind(
      now,
      now - minGapMs
    )
    .first();

  if (updated) {
    return true;
  }

  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO app_state (
      key,
      value
    )
    VALUES (
      'gobbo_last_poll',
      ?
    )
    RETURNING value
  `)
    .bind(now)
    .first();

  return !!inserted;
}

async function runDungeonCron(env) {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await handleDungeon(
        env,
        new URL(
          "https://cron.local/dungeon"
        )
      );

      const text = await res.text();

      if (!text) {
        console.log(
          "[Dungeon Cron] No more queued players."
        );

        break;
      }

      console.log(
        `[Dungeon Cron] Dungeon group ${i + 1} completed:`,
        text
      );

      // Small delay between separate dungeon chat messages.
      await new Promise((resolve) =>
        setTimeout(resolve, 1500)
      );
    } catch (err) {
      console.error(
        "[Dungeon Cron] Failed:",
        err?.stack || err?.message || err
      );

      break;
    }
  }
}

async function processRaidSchedule(env) {
  console.log("[Raid Cron] Schedule check.");

  /*
   * First priority:
   * Resolve a join window whose resolution time has arrived.
   */
  const resolvingRaid = await env.DB.prepare(`
    UPDATE raid_state
    SET
      encounter_status = 'resolving',
      next_action_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
      AND active = 1
      AND encounter_status = 'joining'
      AND resolve_at IS NOT NULL
      AND datetime(resolve_at) <= datetime('now')
    RETURNING
      raid_key,
      encounter_index,
      encounter_status,
      attempt_number,
      join_opens_at,
      resolve_at,
      next_action_at
  `).first();

  if (resolvingRaid) {
    try {
      await handleRaidResolution(
        env,
        resolvingRaid
      );
    } catch (err) {
      console.error(
        "[Raid Cron] Resolution failed:",
        err?.stack || err?.message || err
      );

      await env.DB.prepare(`
        UPDATE raid_state
        SET
          active = 0,
          encounter_status = 'error',
          next_action_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
          AND encounter_status = 'resolving'
      `).run();
    }

    return;
  }

  /*
   * If nothing needs resolving, open any scheduled
   * join window whose time has arrived.
   */
  const joiningRaid = await env.DB.prepare(`
    UPDATE raid_state
    SET
      encounter_status = 'joining',
      next_action_at = resolve_at,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
      AND active = 1
      AND encounter_status = 'scheduled'
      AND next_action_at IS NOT NULL
      AND datetime(next_action_at) <= datetime('now')
    RETURNING
      raid_key,
      encounter_index,
      encounter_status,
      attempt_number,
      join_opens_at,
      resolve_at,
      next_action_at
  `).first();

  if (!joiningRaid) {
    console.log(
      "[Raid Cron] No raid action is due."
    );

    return;
  }

  const encounterIndex = Number(
    joiningRaid.encounter_index || 0
  );

  const encounter =
    getRaidEncounter(encounterIndex);

  if (!encounter) {
    await stopRaidWithError(
      env,
      encounterIndex
    );

    return;
  }

  const resolveTime =
    formatRaidTimeIST(
      joiningRaid.resolve_at
    );

  console.log("[Raid Cron] Join window opened:", {
    raidKey: joiningRaid.raid_key,
    encounterIndex,
    encounterName: encounter.name,
    attemptNumber: Math.max(
      1,
      Number(
        joiningRaid.attempt_number || 1
      )
    ),
    resolveAt: joiningRaid.resolve_at,
  });

  try {
    await announceRaidJoinOpen(
      env,
      encounterIndex,
      resolveTime
    );
  } catch (err) {
    console.error(
      "[Raid Cron] Join announcement failed:",
      err?.stack || err?.message || err
    );
  }
}

async function handleRaidResolution(
  env,
  raid
) {
  const raidKey = raid.raid_key;

  const encounterIndex = Number(
    raid.encounter_index || 0
  );

  const attemptNumber = Math.max(
    1,
    Number(raid.attempt_number || 1)
  );

  const encounter =
    getRaidEncounter(encounterIndex);

  if (!encounter) {
    await stopRaidWithError(
      env,
      encounterIndex
    );

    return;
  }

  const participants =
    await getRaidParticipants(
      env,
      raidKey,
      encounterIndex
    );

  console.log("[Raid Cron] Resolving encounter:", {
    raidKey,
    encounterIndex,
    encounterName: encounter.name,
    attemptNumber,
    participantCount: participants.length,
  });

  /*
   * Nobody joined.
   */
  if (participants.length === 0) {
    await scheduleRaidRetry({
      env,
      raid,
      encounter,
      attemptNumber,
      noParticipants: true,
    });

    return;
  }

  /*
   * Mark everyone as having participated in this attempt.
   */
  await markRaidParticipantsAttempt(
    env,
    raidKey,
    encounterIndex,
    attemptNumber
  );

  const combat = resolveRaidCombat({
    encounter,
    participantCount: participants.length,
    attemptNumber,
  });

  console.log("[Raid Combat] Result:", {
    encounter: encounter.name,

    playerFormula: combat.playerFormula,
    enemyFormula: combat.enemyFormula,

    playerRoll: combat.playerRoll,
    enemyRoll: combat.enemyRoll,

    playerModifier: combat.playerModifier,
    enemyModifier: combat.enemyModifier,

    playerTotal: combat.playerTotal,
    enemyTotal: combat.enemyTotal,

    success: combat.success,
  });

  if (combat.success) {
    await handleRaidSuccess({
      env,
      raid,
      encounter,
      participants,
      combat,
      attemptNumber,
    });

    return;
  }

  await handleRaidFailure({
    env,
    raid,
    encounter,
    participants,
    combat,
    attemptNumber,
  });
}

async function handleRaidSuccess({
  env,
  raid,
  encounter,
  participants,
  combat,
  attemptNumber,
}) {
  const encounterIndex = Number(
    raid.encounter_index
  );

  /*
   * Give every participant the same randomly selected
   * reward for this encounter.
   */
  const goldReward = await awardRaidGold(
    env,
    participants,
    encounter
  );

  await insertRaidLog({
    env,
    raid,
    encounter,
    participants,
    combat,
    attemptNumber,
    goldReward,
  });

  const nextEncounterIndex =
    encounterIndex + 1;

  const nextEncounter =
    getRaidEncounter(nextEncounterIndex);

  /*
   * No next encounter means the finale is complete.
   */
  if (!nextEncounter) {
    await env.DB.prepare(`
      UPDATE raid_state
      SET
        active = 0,
        encounter_status = 'completed',
        next_action_at = NULL,
        join_opens_at = NULL,
        resolve_at = NULL,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
        AND raid_key = ?
        AND encounter_index = ?
        AND encounter_status = 'resolving'
    `)
      .bind(
        raid.raid_key,
        encounterIndex
      )
      .run();

    try {
      await announceRaidSuccess(
        env,
        encounterIndex,
        attemptNumber
      );
    } catch (err) {
      console.error(
        "[Raid] Final success announcement failed:",
        err?.stack || err?.message || err
      );
    }

    try {
      await announceRaidComplete(env);
    } catch (err) {
      console.error(
        "[Raid] Completion announcement failed:",
        err?.stack || err?.message || err
      );
    }

    console.log("[Raid] Finale completed:", {
      raidKey: raid.raid_key,
      finalEncounter: encounter.name,
      attemptNumber,
      goldPerParticipant: goldReward,
      participantCount: participants.length,
    });

    return;
  }

  /*
   * After an xx:20 resolution, the next encounter opens
   * at the following hour's xx:15 and resolves at xx:20.
   *
   * Resolve +55 minutes = next join
   * Resolve +60 minutes = next resolution
   */
  const nextJoinAt =
    getNextRaidJoinTimestamp(
      raid.resolve_at
    );

  const nextResolveAt =
    addMinutesToTimestamp(
      nextJoinAt,
      5
    );

  await env.DB.prepare(`
    UPDATE raid_state
    SET
      encounter_index = ?,
      encounter_status = 'scheduled',
      attempt_number = 1,

      join_opens_at = ?,
      resolve_at = ?,
      next_action_at = ?,

      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
      AND active = 1
      AND raid_key = ?
      AND encounter_index = ?
      AND encounter_status = 'resolving'
  `)
    .bind(
      nextEncounterIndex,

      nextJoinAt,
      nextResolveAt,
      nextJoinAt,

      raid.raid_key,
      encounterIndex
    )
    .run();

  try {
    await announceRaidSuccess(
      env,
      encounterIndex,
      attemptNumber
    );
  } catch (err) {
    console.error(
      "[Raid] Success announcement failed:",
      err?.stack || err?.message || err
    );
  }

  console.log("[Raid] Next encounter scheduled:", {
    completedEncounter: encounter.name,
    completedAttempt: attemptNumber,
    nextEncounter: nextEncounter.name,
    nextJoinAt,
    nextResolveAt,
    goldPerParticipant: goldReward,
    participantCount: participants.length,
  });
}

async function handleRaidFailure({
  env,
  raid,
  encounter,
  participants,
  combat,
  attemptNumber,
}) {
  await insertRaidLog({
    env,
    raid,
    encounter,
    participants,
    combat,
    attemptNumber,
    goldReward: 0,
  });

  await scheduleRaidRetry({
    env,
    raid,
    encounter,
    attemptNumber,
    noParticipants: false,
  });
}
async function stopRaidWithError(
  env,
  encounterIndex
) {
  console.error(
    `[Raid Cron] Unknown encounter index: ${encounterIndex}`
  );

  await env.DB.prepare(`
    UPDATE raid_state
    SET
      active = 0,
      encounter_status = 'error',
      next_action_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run();
}

async function scheduleRaidRetry({
  env,
  raid,
  encounter,
  attemptNumber,
  noParticipants,
}) {
  const encounterIndex = Number(
    raid.encounter_index
  );

  const nextAttemptNumber =
    attemptNumber + 1;

  /*
   * First failure:
   *
   * xx:20 resolve
   * xx:45 retry opens
   * xx:50 retry resolves
   *
   * Later failures:
   *
   * xx:50 resolve
   * next hour xx:45 opens
   * next hour xx:50 resolves
   */
  const joinDelayMinutes = 5;
  const resolveDelayMinutes = 10;

  const retryJoinAt =
    addMinutesToTimestamp(
      raid.resolve_at,
      joinDelayMinutes
    );

  const retryResolveAt =
    addMinutesToTimestamp(
      raid.resolve_at,
      resolveDelayMinutes
    );

  await env.DB.prepare(`
    UPDATE raid_state
    SET
      encounter_status = 'scheduled',
      attempt_number = ?,

      join_opens_at = ?,
      resolve_at = ?,
      next_action_at = ?,

      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
      AND active = 1
      AND raid_key = ?
      AND encounter_index = ?
      AND encounter_status = 'resolving'
  `)
    .bind(
      nextAttemptNumber,

      retryJoinAt,
      retryResolveAt,
      retryJoinAt,

      raid.raid_key,
      encounterIndex
    )
    .run();

  const retryTime =
    formatRaidTimeIST(retryJoinAt);

  try {
    if (noParticipants) {
      await announceRaidNoParticipants(
        env,
        encounterIndex,
        retryTime
      );
    } else {
      await announceRaidFailure(
        env,
        encounterIndex,
        retryTime,
        attemptNumber
      );
    }
  } catch (err) {
    console.error(
      "[Raid] Retry announcement failed:",
      err?.stack || err?.message || err
    );
  }

  console.log("[Raid] Retry scheduled:", {
    encounter: encounter.name,
    completedAttempt: attemptNumber,
    nextAttempt: nextAttemptNumber,
    retryJoinAt,
    retryResolveAt,
    noParticipants,
  });
}

async function getRaidParticipants(
  env,
  raidKey,
  encounterIndex
) {
  const result = await env.DB.prepare(`
    SELECT
      username,
      display_name,
      last_attempt
    FROM raid_participants
    WHERE raid_key = ?
      AND encounter_index = ?
    ORDER BY joined_at ASC
  `)
    .bind(
      raidKey,
      encounterIndex
    )
    .all();

  return result.results || [];
}

async function markRaidParticipantsAttempt(
  env,
  raidKey,
  encounterIndex,
  attemptNumber
) {
  await env.DB.prepare(`
    UPDATE raid_participants
    SET last_attempt = ?
    WHERE raid_key = ?
      AND encounter_index = ?
  `)
    .bind(
      attemptNumber,
      raidKey,
      encounterIndex
    )
    .run();
}

async function insertRaidLog({
  env,
  raid,
  encounter,
  participants,
  combat,
  attemptNumber,
  goldReward,
}) {
  await env.DB.prepare(`
    INSERT INTO raid_logs (
      raid_key,

      encounter_index,
      encounter_name,

      attempt_number,
      goblin_count,

      player_formula,
      enemy_formula,

      player_roll,
      enemy_roll,

      player_modifier,
      enemy_modifier,

      player_total,
      enemy_total,

      momentum,
      success,

      gold_reward,

      participants_json,

      commentary,
      prompt
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      NULL,
      NULL
    )
  `)
    .bind(
      raid.raid_key,

      Number(raid.encounter_index),
      encounter.name,

      attemptNumber,
      participants.length,

      combat.playerFormula,
      combat.enemyFormula,

      combat.playerRoll,
      combat.enemyRoll,

      combat.playerModifier,
      combat.enemyModifier,

      combat.playerTotal,
      combat.enemyTotal,

      combat.momentum,
      combat.success ? 1 : 0,

      goldReward,

      JSON.stringify(
        participants.map(
          (participant) => ({
            username:
              participant.username,

            display_name:
              participant.display_name,
          })
        )
      )
    )
    .run();
}

async function awardRaidGold(
  env,
  participants,
  encounter
) {
  if (!participants.length) {
    return 0;
  }

  const minGold =
    Number(encounter.minGold);

  const maxGold =
    Number(encounter.maxGold);

  if (
    !Number.isFinite(minGold) ||
    !Number.isFinite(maxGold) ||
    minGold < 0 ||
    maxGold < minGold
  ) {
    throw new Error(
      `Invalid gold reward range for ${encounter.name}`
    );
  }

  const goldReward = randomInt(
    minGold,
    maxGold
  );

  const statements =
    participants.map(
      (participant) =>
        env.DB.prepare(`
          UPDATE players
          SET gold = gold + ?
          WHERE username = ?
        `).bind(
          goldReward,
          participant.username
        )
    );

  await env.DB.batch(statements);

  console.log("[Raid Rewards] Gold distributed:", {
    encounter: encounter.name,
    participantCount: participants.length,
    goldPerParticipant: goldReward,
    totalGoldDistributed:
      goldReward *
      participants.length,
  });

  return goldReward;
}

function resolveRaidCombat({
  encounter,
  participantCount,
  attemptNumber,
}) {
  const goblinCount = Math.max(
    1,
    Number(participantCount || 1)
  );

  const attempt = Math.max(
    1,
    Number(attemptNumber || 1)
  );

  /*
   * Attempt 1: +0
   * Attempt 2: +5
   * Attempt 3: +10
   */
  const momentum =
    Math.max(0, attempt - 1) * 5;

  const playerDice =
    goblinCount;

  const enemyDice =
    getRaidEnemyDice({
      encounterKey: encounter.key,
      goblinCount,
      attemptNumber: attempt,
    });

  const playerRoll =
    rollDiceTotal(
      playerDice,
      10
    );

  const enemyRoll =
    rollDiceTotal(
      enemyDice,
      10
    );

  const playerModifier =
    momentum;

  const enemyModifier =
    0;

  const playerTotal =
    playerRoll + playerModifier;

  const enemyTotal =
    enemyRoll + enemyModifier;

  /*
   * Ties favour the Goblin Army.
   */
  const success =
    playerTotal >= enemyTotal;

  return {
    playerDice,
    enemyDice,

    playerFormula:
      formatDiceFormula(
        playerDice,
        10,
        playerModifier
      ),

    enemyFormula:
      formatDiceFormula(
        enemyDice,
        10,
        enemyModifier
      ),

    playerRoll,
    enemyRoll,

    playerModifier,
    enemyModifier,

    playerTotal,
    enemyTotal,

    momentum,
    success,
  };
}

function getRaidEnemyDice({
  encounterKey,
  goblinCount,
  attemptNumber,
}) {
  const safeGoblinCount = Math.max(
    1,
    Number(goblinCount || 1)
  );

  /*
   * Twin Champions
   *
   * Attempt 1: Nd10
   * Retry:     (N - 5)d10
   */
  if (
    encounterKey ===
    "twin_champions"
  ) {
    if (attemptNumber === 1) {
      return safeGoblinCount;
    }

    return Math.max(
      1,
      safeGoblinCount - 5
    );
  }

  /*
   * Simulacrum and final Emperor
   *
   * Attempt 1: (N + 1)d10
   * Attempt 2: Nd10
   * Attempt 3+: (N - 5)d10
   */
  if (
    encounterKey ===
      "lebro_simulacrum" ||
    encounterKey ===
      "emperors_last_stand"
  ) {
    if (attemptNumber === 1) {
      return safeGoblinCount + 1;
    }

    if (attemptNumber === 2) {
      return safeGoblinCount;
    }

    return Math.max(
      1,
      safeGoblinCount - 5
    );
  }

  /*
   * All other encounters use equal dice pools.
   *
   * Retries become easier through the accumulating
   * player momentum bonus.
   */
  return safeGoblinCount;
}

function formatRaidTimeIST(timestamp) {
  if (!timestamp) {
    return "an unknown time";
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
  ).format(
    new Date(timestamp)
  );
}

function rollDiceTotal(
  diceCount,
  dieSize
) {
  const count = Math.max(
    1,
    Math.floor(
      Number(diceCount) || 1
    )
  );

  const size = Math.max(
    2,
    Math.floor(
      Number(dieSize) || 10
    )
  );

  let total = 0;

  for (let i = 0; i < count; i++) {
    total += randomInt(
      1,
      size
    );
  }

  return total;
}

function formatDiceFormula(
  diceCount,
  dieSize,
  modifier = 0
) {
  const base =
    `${diceCount}d${dieSize}`;

  if (modifier > 0) {
    return `${base} + ${modifier}`;
  }

  if (modifier < 0) {
    return `${base} - ${Math.abs(modifier)}`;
  }

  return base;
}

function addMinutesToTimestamp(
  timestamp,
  minutes
) {
  const date = new Date(timestamp);

  if (
    Number.isNaN(date.getTime())
  ) {
    throw new Error(
      `Invalid raid timestamp: ${timestamp}`
    );
  }

  date.setUTCMinutes(
    date.getUTCMinutes() +
    minutes
  );

  return date.toISOString();
}

function getNextRaidJoinTimestamp(
  timestamp
) {
  const date = new Date(timestamp);

  if (
    Number.isNaN(date.getTime())
  ) {
    throw new Error(
      `Invalid raid timestamp: ${timestamp}`
    );
  }

  /*
   * Every main encounter opens at xx:45 IST.
   *
   * IST is UTC +5:30, so:
   * xx:45 IST = xx:15 UTC.
   */

  date.setUTCSeconds(0, 0);

  if (date.getUTCMinutes() < 15) {
    date.setUTCMinutes(
      15,
      0,
      0
    );
  } else {
    date.setUTCHours(
      date.getUTCHours() + 1,
      15,
      0,
      0
    );
  }

  return date.toISOString();
}