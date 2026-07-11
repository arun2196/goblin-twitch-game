import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

import { sendTwitchChatMessage } from "../helpers/twitchChat.js";

const SMITE_COST = 100;

export async function handleSmite(env, url, request, ctx) {
  const username = cleanUsername(url.searchParams.get("user"));
  const displayName = cleanDisplayName(url.searchParams.get("user"));

  if (!username) {
    return new Response("Missing user", { status: 400 });
  }

  const player = await getOrCreatePlayer(env, username, displayName);

  if (player.gold < SMITE_COST) {
    await sendTwitchChatMessage(
      env,
      `⚡ ${displayName}, smiting costs ${SMITE_COST} gold. You only have ${player.gold} gold.`
    );

    return new Response("Not enough gold");
  }

  const weakestItem = await env.DB.prepare(
    `
    SELECT 
      inventory.id,
      inventory.item_name,
      inventory.item_type,
      inventory.uses_left,
      items.rarity
    FROM inventory
    JOIN items ON inventory.item_key = items.item_key
    WHERE inventory.username = ?
    ORDER BY
      CASE items.rarity
        WHEN 'common' THEN 1
        WHEN 'uncommon' THEN 2
        WHEN 'rare' THEN 3
        WHEN 'epic' THEN 4
        WHEN 'legendary' THEN 5
        ELSE 99
      END ASC,
      RANDOM()
    LIMIT 1
    `
  )
    .bind(username)
    .first();

  if (!weakestItem) {
    await sendTwitchChatMessage(
      env,
      `⚡ ${displayName}, you have no item to smite. Open some chests first, greedy gobbo.`
    );

    return new Response("No item found");
  }

  await env.DB.batch([
    env.DB.prepare(
      `
      UPDATE players
      SET gold = gold - ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE username = ?
        AND gold >= ?
      `
    ).bind(SMITE_COST, username, SMITE_COST),

    env.DB.prepare(
      `
      DELETE FROM inventory
      WHERE id = ?
        AND username = ?
      `
    ).bind(weakestItem.id, username),
  ]);

  const messages = [
    `⚡ ${displayName} offered their ${weakestItem.rarity} ${weakestItem.item_name} to the Goblin Gods for ${SMITE_COST} gold. The altar crackles with approval.`,
    
    `⚡ A bolt of green lightning vaporized ${displayName}'s ${weakestItem.rarity} ${weakestItem.item_name}. The Goblin Gods cackle happily.`,
    
    `⚡ ${displayName} paid ${SMITE_COST} gold to perform an ancient goblin ritual. Their ${weakestItem.rarity} ${weakestItem.item_name} was consumed by divine greed.`,
    
    `⚡ The Goblin Gods examined ${displayName}'s ${weakestItem.rarity} ${weakestItem.item_name}, nodded once, and obliterated it into sparkling dust.`,
    
    `⚡ ${displayName}'s ${weakestItem.rarity} ${weakestItem.item_name} has been sacrificed. Somewhere, a goblin priest whispers, "Acceptable."`,
    
    `⚡ The heavens split open. A tiny goblin hand reached down, grabbed ${displayName}'s ${weakestItem.rarity} ${weakestItem.item_name}, and vanished.`,
    
    `⚡ ${displayName} tossed their ${weakestItem.rarity} ${weakestItem.item_name} into the Sacred Bonfire. The flames burned a suspicious shade of green.`,
    
    `⚡ ${displayName} paid ${SMITE_COST} gold. The Goblin Gods demanded the ${weakestItem.rarity} ${weakestItem.item_name} as tribute... and got exactly what they wanted.`,
    
    `⚡ The Goblin Gods declared ${displayName}'s ${weakestItem.rarity} ${weakestItem.item_name} "unworthy" before striking it from existence.`,
    
    `⚡ ${displayName}'s ${weakestItem.rarity} ${weakestItem.item_name} was smitten so hard that nearby goblins applauded.`,
    ];
  const message = messages[Math.floor(Math.random() * messages.length)];
  
  await sendTwitchChatMessage(env, message);

  return new Response("");
}