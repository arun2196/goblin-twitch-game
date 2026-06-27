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
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/dbtest") {
        const result = await env.DB.prepare("SELECT 1 AS ok").first();
        return new Response(`D1 Connected! Test value: ${result.ok}`);
      }

      if (url.pathname === "/testvoice") {
        const text =
          url.searchParams.get("text") ||
          "Ahoy mate! Gobbo has found treasure, trouble, and possibly a chicken.";

        const audioBuffer = await generateGobboSpeech(env, text);
        const key = await uploadAudioToR2(env, audioBuffer, "gobbo-voice");
        const audioUrl = `${url.origin}/sound?key=${encodeURIComponent(key)}`;

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