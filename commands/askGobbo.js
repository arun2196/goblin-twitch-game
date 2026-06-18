import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

import { createGobboAudio } from "../helpers/gobboAudio.js";
import { queueGobboSound } from "../helpers/gobboSoundQueue.js";
import { buildGobboPrompt } from "../helpers/gobboPrompt.js";
import { sendTwitchChatMessage } from "../helpers/twitchChat.js";

const ASK_GOBBO_COST = 0;
const MAX_QUESTION_LENGTH = 220;
const NARRATOR_VOICE_ID = "B4WD87mB08osg18bpXRF";

export async function handleAskGobbo(env, url, request, ctx) {
  const username = cleanUsername(url.searchParams.get("user"));
  const displayName = cleanDisplayName(url.searchParams.get("user"));

  const question =
    url.searchParams.get("question") ||
    url.searchParams.get("q") ||
    url.searchParams.get("text") ||
    "";

  const result = await runAskGobbo({
    env,
    username,
    displayName,
    question,
    chargeGold: true,
    makeVoice: false,
    origin: url.origin,
    ctx,
    eventType: "ask_gobbo",
  });

  return new Response(result.message);
}

export async function runAskGobboVoice(
  env,
  origin,
  username,
  displayName,
  question,
  ctx
) {
  return await runAskGobbo({
    env,
    username,
    displayName,
    question,
    chargeGold: false,
    makeVoice: true,
    origin,
    ctx,
    eventType: "ask_gobbo_voice",
  });
}

async function runAskGobbo({
  env,
  username,
  displayName,
  question,
  chargeGold,
  makeVoice,
  origin,
  ctx,
  eventType,
}) {
  const cleanQuestion = String(question || "").trim();

  if (!username) {
    return { ok: false, message: "Usage: !askgobbo <question>" };
  }

  if (!cleanQuestion) {
    return { ok: false, message: `${displayName}, ask Gobbo something first.` };
  }

  if (cleanQuestion.length > MAX_QUESTION_LENGTH) {
    return {
      ok: false,
      message: `${displayName}, Gobbo stopped listening halfway through that scroll.`,
    };
  }

  if (looksLikePromptInjection(cleanQuestion)) {
    return {
      ok: false,
      message: `${displayName}, Gobbo refuses to read forbidden wizard paperwork.`,
    };
  }

  const player = await getOrCreatePlayer(env, username, displayName);

  if (chargeGold && Number(player.gold || 0) < ASK_GOBBO_COST) {
    return {
      ok: false,
      message: `${player.display_name}, Gobbo charges ${ASK_GOBBO_COST}g. You only have ${player.gold}g.`,
    };
  }

  const worldState = await buildGobboWorldState(env);

  const prompt = buildGobboPrompt({
    displayName: player.display_name,
    question: cleanQuestion,
    worldState,
  });

  const answer = await askGemini(env, prompt);

  if (eventType === "ask_gobbo_voice") {
    console.log("Trying to send Gobbo answer to chat");

    ctx?.waitUntil(
      sendTwitchChatMessage(
        env,
        `👺 Gobbo answers ${player.display_name}: ${answer}`.slice(0, 500)
      )
        .then((sent) => {
          console.log("Twitch chat send result:", sent);
        })
        .catch((err) => {
          console.error("Twitch chat send crashed:", err.message);
        })
    );
  }

  const batch = [];

  if (chargeGold) {
    batch.push(
      env.DB.prepare(`
        UPDATE players
        SET gold = gold - ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE username = ?
      `).bind(ASK_GOBBO_COST, username),

      env.DB.prepare(`
        INSERT INTO transactions (username, amount, reason)
        VALUES (?, ?, ?)
      `).bind(username, -ASK_GOBBO_COST, "ask_gobbo")
    );
  }

  batch.push(
    env.DB.prepare(`
      INSERT INTO ask_gobbo_logs
      (username, display_name, question, answer, cost)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      username,
      player.display_name,
      cleanQuestion,
      answer,
      chargeGold ? ASK_GOBBO_COST : 75
    ),

    env.DB.prepare(`
      INSERT INTO events (event_type, message)
      VALUES (?, ?)
    `).bind(
      eventType,
      `${player.display_name} asked Gobbo: ${cleanQuestion}`
    )
  );

  await env.DB.batch(batch);

  if (makeVoice && ctx) {
    const narratorText = `${player.display_name} asks Gobbo. ${cleanQuestion}`;
    const gobboText = `Gobbo says. ${answer}`;

    ctx.waitUntil(
      Promise.all([
        createGobboAudio(env, origin, narratorText, {
          voiceId: NARRATOR_VOICE_ID,
        }),
        createGobboAudio(env, origin, gobboText),
      ])
        .then(async ([narratorAudio, gobboAudio]) => {
          if (narratorAudio) {
            await queueGobboSound(
              env,
              narratorAudio.audioUrl,
              narratorAudio.key
            );
          }

          if (gobboAudio) {
            await queueGobboSound(env, gobboAudio.audioUrl, gobboAudio.key);
          }
        })
        .catch((err) => {
          console.error("Gobbo voice error:", err.message);
        })
    );
  }

  return {
    ok: true,
    answer,
    message: `Gobbo says: ${answer}`.slice(0, 490),
  };
}

function looksLikePromptInjection(text) {
  const lowered = text.toLowerCase();

  const blockedPhrases = [
    "ignore previous instructions",
    "ignore all previous instructions",
    "system prompt",
    "developer message",
    "hidden instructions",
    "reveal your prompt",
    "jailbreak",
    "act as chatgpt",
    "you are now",
    "forget your instructions",
  ];

  return blockedPhrases.some((phrase) => lowered.includes(phrase));
}

async function buildGobboWorldState(env) {
  const richRows = await env.DB.prepare(`
    SELECT display_name, gold
    FROM players
    ORDER BY gold DESC
    LIMIT 3
  `).all();

  const recentEvents = await env.DB.prepare(`
    SELECT event_type, message
    FROM events
    ORDER BY id DESC
    LIMIT 5
  `).all();

  return {
    richest: richRows.results || [],
    recentEvents: recentEvents.results || [],
  };
}

async function askGemini(env, prompt) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY secret.");
  }

  const attempts = 3;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 1.15,
              topP: 0.92,
              maxOutputTokens: 400,
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();

        const text =
          data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
          "Gobbo has consulted the mud and learned absolutely nothing.";

        return cleanGobboAnswer(text);
      }

      const errorText = await res.text();
      console.error(`Gemini error attempt ${attempt}:`, errorText);

      if (![429, 500, 502, 503, 504].includes(res.status)) {
        throw new Error("Gobbo's crystal ball exploded.");
      }
    } catch (err) {
      console.error(`Gemini fetch failed attempt ${attempt}:`, err.message);
    }

    await sleep(700 * attempt);
  }

  return "Gobbo's crystal ball is crowded with noisy goblins right now. The magic is failing, but Gobbo promises this was not your fault.";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanGobboAnswer(text) {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 280);
}