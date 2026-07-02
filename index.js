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

import { generateGobboSpeech } from "./helpers/gobboVoice.js";
import { uploadAudioToR2 } from "./helpers/r2.js";
import { getNextGobboSound } from "./helpers/gobboSoundQueue.js";

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
};

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDungeonCron(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/dbtest") {
        const result = await env.DB.prepare("SELECT 1 AS ok").first();
        return new Response(`D1 Connected! Test value: ${result.ok}`);
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
        const key = await uploadAudioToR2(env, audioBuffer, "gobbo-voice");
        const audioUrl = `${url.origin}/sound?key=${encodeURIComponent(key)}`;

        return Response.json({ ok: true, key, audioUrl });
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
          return Response.json({ ok: true, sound: null });
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
        return await handleEventSub(request, env, ctx);
      }

      if (url.pathname === "/sound") {
        return await handleSound(env, url);
      }

      const handler = routes[url.pathname];

      if (!handler) {
        return new Response("Goblin RPG Worker is alive.");
      }

      return await handler(env, url, request, ctx);
    } catch (err) {
      return new Response(`Goblin error: ${err.message}`, { status: 500 });
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
        console.log("Poll skipped:", { reason, isPlaying, isPolling });
        return;
      }

      isPolling = true;
      console.log("Polling Gobbo sound:", reason);

      try {
        const res = await fetch("/gobbo/next-sound?ts=" + Date.now(), {
          cache: "no-store"
        });

        const data = await res.json();

        if (!data.ok || !data.sound || !data.sound.url) {
          isPolling = false;
          return;
        }

        const audioUrl = new URL(
          data.sound.url,
          window.location.origin
        ).href;

        console.log("Playing Gobbo sound:", audioUrl);

        player.src = audioUrl;
        player.load();

        isPlaying = true;

        await player.play();

        isPolling = false;
      } catch (err) {
        console.error("Gobbo player error:", err);

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
      console.error("Audio error:", player.error);

      isPlaying = false;
      isPolling = false;
      player.src = "";
    };

    setInterval(() => {
      pollSound("interval");
    }, 30000);

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

const timer = document.getElementById("timer");

const gobboMessages = [
  "DELVE!",
  "CHARGE!",
  "LOOT!",
  "GO GO!",
  "BONK!",
  "SMASH!",
  "DIG IN!"
];

let lastHalfHour = -1;

function updateTimer() {

  const now = new Date();

  const secondsSinceHour =
      now.getMinutes() * 60 +
      now.getSeconds();

  let remaining =
      1800 - (secondsSinceHour % 1800);

  if (remaining === 1800)
      remaining = 0;

  if (remaining <= 5) {

      timer.classList.add("now");

      const currentHalfHour =
          Math.floor(secondsSinceHour / 1800);

      if (currentHalfHour !== lastHalfHour) {
          lastHalfHour = currentHalfHour;

          timer.textContent =
              gobboMessages[
                  Math.floor(Math.random() * gobboMessages.length)
              ];
      }

      return;
  }

  timer.classList.remove("now");

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  timer.textContent =
      String(minutes).padStart(2, "0") +
      ":" +
      String(seconds).padStart(2, "0");
}

updateTimer();
setInterval(updateTimer, 1000);

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
    .bind(now, now - minGapMs)
    .first();

  if (updated) {
    return true;
  }

  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO app_state (key, value)
    VALUES ('gobbo_last_poll', ?)
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
        new URL("https://cron.local/dungeon")
      );

      const text = await res.text();

      if (!text) {
        console.log("[Dungeon Cron] No more queued players.");
        break;
      }

      console.log(`[Dungeon Cron] Dungeon group ${i + 1} completed:`, text);

      // Small delay between separate dungeon chat messages.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (err) {
      console.log("Dungeon cron failed:", err?.message || err);
      break;
    }
  }
}