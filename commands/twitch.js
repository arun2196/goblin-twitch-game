import { runAskGobbo, runAskGobboVoice } from "./askGobbo.js";

const ASK_GOBBO_POWER_UP_ID = "fdc9d3c6-1b87-4825-ac9c-5cebbb95e3df";

export async function handleEventSub(request, env, ctx) {
  const messageType = request.headers.get("Twitch-Eventsub-Message-Type");
  const messageId = request.headers.get("Twitch-Eventsub-Message-Id");

  const bodyText = await request.text();

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
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (messageType !== "notification") {
    return new Response("OK", { status: 200 });
  }

  const subscriptionType = body.subscription?.type;
  const event = body.event;

  console.log("EventSub type:", subscriptionType);
  console.log("EventSub messageId:", messageId);

  if (subscriptionType === "channel.chat.message") {
    return await handleChatMessage(event, request, env, ctx, messageId);
  }

  if (event.custom_power_up?.id === ASK_GOBBO_POWER_UP_ID) {
    return await handleAskGobboPowerUp(event, request, env, ctx, messageId);
  }

  return new Response("OK", { status: 200 });
}

async function handleChatMessage(event, request, env, ctx, messageId) {
  const text = event.message?.text || "";
  const chatterLogin = event.chatter_user_login || "";
  const chatterName = event.chatter_user_name || chatterLogin;

  console.log("Chat message:", chatterLogin, text);

  if (!text.toLowerCase().startsWith("!askgobbo")) {
    return new Response("OK", { status: 200 });
  }

  if (chatterLogin.toLowerCase() === "gobboherald") {
    return new Response("OK", { status: 200 });
  }

  const claimed = await claimEventSubMessage(env, messageId);

  if (!claimed) {
    console.log("Duplicate chat EventSub ignored:", messageId);
    return new Response("OK", { status: 200 });
  }

  const question = text.replace(/^!askgobbo\s*/i, "").trim();

  console.log("AskGobbo chat command detected:", chatterLogin, question);

  ctx.waitUntil(
    runAskGobbo({
      env,
      username: chatterLogin,
      displayName: chatterName,
      question,
      chargeGold: true,
      makeVoice: false,
      origin: new URL(request.url).origin,
      ctx,
      eventType: "ask_gobbo",
    }).catch((err) => {
      console.error("AskGobbo chat failed:", err.message);
    })
  );

  return new Response("OK", { status: 200 });
}

async function handleAskGobboPowerUp(event, request, env, ctx, messageId) {
  const claimed = await claimEventSubMessage(env, messageId);

  if (!claimed) {
    console.log("Duplicate power-up EventSub ignored:", messageId);
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
  if (!messageId) {
    console.log("No EventSub messageId");
    return false;
  }

  try {
    await env.DB.prepare(
      `INSERT INTO eventsub_messages (message_id, created_at)
       VALUES (?, ?)`
    )
      .bind(messageId, Date.now())
      .run();

    console.log("EventSub claimed:", messageId);
    return true;
  } catch (err) {
    console.error("EventSub claim failed:", err.message);
    return false;
  }
}