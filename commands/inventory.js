import { cleanUsername, cleanDisplayName, getOrCreatePlayer, getTitle } from "../helpers/players.js";

export async function handleInventory(env, url) {
  const username = cleanUsername(url.searchParams.get("user"));
  const displayName = cleanDisplayName(url.searchParams.get("user"));

  if (!username) return new Response("Usage: !inventory");

  const player = await getOrCreatePlayer(env, username, displayName);

  const items = await env.DB.prepare(
    `SELECT 
      inv.id,
      itm.item_name,
      itm.item_type,
      itm.rarity,
      inv.uses_left
    FROM inventory inv
    JOIN items itm
      ON inv.item_key = itm.item_key
    WHERE inv.username = ?
    ORDER BY inv.id DESC`
  ).bind(username).all();

  const title = getTitle(player.gold);

  if (!items.results.length) {
    return new Response(
      `${player.display_name} | ${title} | ${player.gold}g | Inventory: empty. Open a chest with !chest.`
    );
  }

  const itemText = items.results
    .map(item => `${item.item_name} [${item.item_type}, ${item.rarity}, ${item.uses_left} use]`)
    .join(" | ");

  return new Response(
    `${player.display_name} | ${title} | ${player.gold}g | Items: ${itemText}`
  );
}
