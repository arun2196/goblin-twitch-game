import { sendTwitchChatMessage } from "../helpers/twitchChat.js";

export async function handleQueueList(env) {
  const result = await env.DB.prepare(`
    SELECT username, display_name, queued_at
    FROM dungeon_queue
    ORDER BY queued_at ASC, id ASC
  `).all();

  const players = result.results || [];

  if (players.length === 0) {
    await sendTwitchChatMessage(env, "🕳️ The dungeon queue is empty.");
    return new Response("Queue empty.");
  }

  const names = players
    .map((player, index) => {
      const name = player.display_name || player.username;
      return `${index + 1}. ${name}`;
    })
    .join(" | ");

  const message = `🕳️ Dungeon queue (${players.length}): ${names}`.slice(0, 490);

  await sendTwitchChatMessage(env, message);

  return new Response(message);
}