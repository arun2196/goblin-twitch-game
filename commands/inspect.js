import { cleanUsername, cleanDisplayName, getOrCreatePlayer, getTitle } from "../helpers/players.js";

export async function handleInspect(env, url) {
  const viewer = cleanUsername(url.searchParams.get("user"));
  const viewerDisplay = cleanDisplayName(url.searchParams.get("user"));

  let target = cleanUsername(url.searchParams.get("target"));

  if (!viewer) {
    return new Response("Usage: !inspect or !inspect @goblin");
  }

  // If no target is provided, inspect yourself.
  if (!target) {
    target = viewer;
  }

  const player = await getOrCreatePlayer(env, target, target === viewer ? viewerDisplay : target);

  const items = await env.DB.prepare(
    `SELECT item_name, item_type, uses_left
     FROM inventory
     WHERE username = ?
     ORDER BY id DESC`
  ).bind(target).all();

  const title = getTitle(player.gold);

  const itemText = items.results.length
    ? items.results
        .map(item => `${item.item_name} [${item.item_type}, ${item.uses_left} use]`)
        .join(" | ")
    : "empty";

  return new Response(
    `${player.display_name} | ${title} | ${player.gold}g | Delves: ${player.delve_successes || 0}W/${player.delve_failures || 0}L | Duels: ${player.duel_wins || 0}W/${player.duel_losses || 0}L | Items: ${itemText}`
  );
}
