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

export async function sendTwitchAnnouncement(
  env,
  message,
  color = "purple"
) {
  const res = await fetch(
    `https://api.twitch.tv/helix/chat/announcements?broadcaster_id=${encodeURIComponent(
      env.TWITCH_BROADCASTER_ID
    )}&moderator_id=${encodeURIComponent(
      env.TWITCH_SENDER_ID
    )}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TWITCH_CHAT_TOKEN}`,
        "Client-Id": env.TWITCH_CHAT_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        color,
      }),
    }
  );

  const text = await res.text();

  if (!res.ok) {
    console.error(
      "Twitch announcement error:",
      text
    );
    return false;
  }

  console.log(
    "Twitch announcement sent:",
    text
  );

  return true;
}