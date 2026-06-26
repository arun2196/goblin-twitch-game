export async function getRandomInventoryItem(env, username) {
  return await env.DB.prepare(
    `SELECT
        inventory.id,
        inventory.username,
        inventory.item_key,
        inventory.item_name,
        inventory.item_type,
        inventory.uses_left,
        inventory.created_at,
        inventory.obtained_at,

        items.rarity,
        items.durability,
        items.description,
        items.drop_weight,
        items.min_gold_bonus,
        items.power

     FROM inventory

     INNER JOIN items
       ON inventory.item_key = items.item_key

     WHERE inventory.username = ?

     ORDER BY RANDOM()

     LIMIT 1`
  )
    .bind(username)
    .first();
}