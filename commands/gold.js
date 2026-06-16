import { cleanUsername, cleanDisplayName, getOrCreatePlayer, getTitle } from "../helpers/players.js";

export async function handleGold(env, url) {
  const username = cleanUsername(url.searchParams.get("user"));
  const displayName = cleanDisplayName(url.searchParams.get("user"));

  if (!username) return new Response("Usage: !gold");

  const player = await getOrCreatePlayer(env, username, displayName);
  const title = getTitle(player.gold);

  return new Response(
    `${player.display_name} has ${player.gold} gold. Title: ${title}.`
  );
}
