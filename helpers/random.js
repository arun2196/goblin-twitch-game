export function pickWeighted(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row.drop_weight || 1), 0);
  let roll = Math.random() * total;

  for (const row of rows) {
    roll -= Number(row.drop_weight || 1);
    if (roll <= 0) return row;
  }

  return rows[rows.length - 1];
}

export function weightedPick(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }

  return items[items.length - 1];
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function getRandomInventoryItem(env, username) {
  return await env.DB.prepare(
    `SELECT *
     FROM inventory
     WHERE username = ?
     ORDER BY RANDOM()
     LIMIT 1`
  ).bind(username).first();
}
