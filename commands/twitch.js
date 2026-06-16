import { runAskGobboVoice } from "./askGobbo.js";

export async function handleEventSub(request, env, ctx) {
  const messageType = request.headers.get("Twitch-Eventsub-Message-Type");

  const bodyText = await request.text();
  console.log("MESSAGE TYPE:", messageType);
  console.log("RAW BODY:", bodyText);

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (err) {
    console.log("JSON parse error:", err);
    return new Response("Bad JSON", { status: 400 });
  }

  if (messageType === "webhook_callback_verification") {
    console.log("CHALLENGE:", body.challenge);

    return new Response(body.challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  if (messageType === "notification") {

    const event = body.event;

    if (event.custom_power_up?.id === "fdc9d3c6-1b87-4825-ac9c-5cebbb95e3df") {
    ctx.waitUntil(
        runAskGobboVoice(
        env,
        new URL(request.url).origin,
        event.user_login,
        event.user_name,
        event.user_input || "",
        ctx
        )
    );
    }

    return new Response("OK");
    }

  return new Response("OK", { status: 200 });
}