import { runAskGobboVoice } from "./askGobbo.js";

const ASK_GOBBO_POWER_UP_ID = "fdc9d3c6-1b87-4825-ac9c-5cebbb95e3df";

export async function handleEventSub(request, env, ctx) {
  const messageType = request.headers.get("Twitch-Eventsub-Message-Type");
  const messageId = request.headers.get("Twitch-Eventsub-Message-Id");

  const bodyText = await request.text();

  // const validSignature = await verifyTwitchSignature(request, bodyText, env); Will I need to verify the signature? I don't think so, since this is a public endpoint and Twitch will only send valid requests. But maybe it's a good idea to verify it anyway, just in case.

  // if (!validSignature) {
  //   console.log("Invalid Twitch EventSub signature");
  //   return new Response("Forbidden", { status: 403 });
  // }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (err) {
    console.log("JSON parse error:", err.message);
    return new Response("Bad JSON", { status: 400 });
  }

  if (messageType === "webhook_callback_verification") {
    return new Response(body.challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  if (messageType !== "notification") {
    return new Response("OK", { status: 200 });
  }

  const event = body.event;

  if (event.custom_power_up?.id !== ASK_GOBBO_POWER_UP_ID) {
    return new Response("OK", { status: 200 });
  }

  const claimed = await claimEventSubMessage(env, messageId);

  if (!claimed) {
    console.log("Duplicate EventSub ignored:", messageId);
    return new Response("OK", { status: 200 });
  }

  ctx.waitUntil(
    runAskGobboVoice(
      env,
      new URL(request.url).origin,
      event.user_login,
      event.user_name,
      event.user_input || "",
      ctx
    ).catch((err) => {
      console.error("AskGobbo voice failed:", err.message);
    })
  );

  return new Response("OK", { status: 200 });
}

async function claimEventSubMessage(env, messageId) {
  if (!messageId) return false;

  try {
    await env.DB.prepare(
      `INSERT INTO eventsub_messages (message_id, created_at)
       VALUES (?, ?)`
    )
      .bind(messageId, Date.now())
      .run();

    return true;
  } catch (err) {
    return false;
  }
}

async function verifyTwitchSignature(request, bodyText, env) {
  const messageId = request.headers.get("Twitch-Eventsub-Message-Id");
  const timestamp = request.headers.get("Twitch-Eventsub-Message-Timestamp");
  const signature = request.headers.get("Twitch-Eventsub-Message-Signature");

  if (!messageId || !timestamp || !signature) {
    return false;
  }

  if (!env.TWITCH_EVENTSUB_SECRET) {
    console.error("Missing TWITCH_EVENTSUB_SECRET");
    return false;
  }

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.TWITCH_EVENTSUB_SECRET),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const message = messageId + timestamp + bodyText;

  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );

  const expectedSignature =
    "sha256=" +
    [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

  return timingSafeEqual(expectedSignature, signature);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}