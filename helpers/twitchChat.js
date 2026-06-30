export async function sendTwitchChatMessage(env, message) {
  const res = await fetch("https://api.twitch.tv/helix/chat/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.TWITCH_CHAT_TOKEN}`,
      "Client-Id": env.TWITCH_CHAT_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcaster_id: env.TWITCH_BROADCASTER_ID,
      sender_id: env.TWITCH_SENDER_ID,
      message,
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error("Twitch chat error:", text);
    return false;
  }

  console.log("Twitch chat sent:", text);
  return true;
}