export async function getAdvantage(env, attackerType, defenderType) {
  const rule = await env.DB.prepare(
    `SELECT advantage
     FROM combat_rules
     WHERE attacker_type = ?
       AND defender_type = ?`
  ).bind(attackerType, defenderType).first();

  return rule ? Number(rule.advantage) : 0;
}

export async function getDuelText(env, category, attackerType = null, defenderType = null) {
  let row = null;

  if (attackerType && defenderType) {
    row = await env.DB.prepare(
      `SELECT text
       FROM duel_texts
       WHERE category = ?
         AND attacker_type = ?
         AND defender_type = ?
       ORDER BY RANDOM()
       LIMIT 1`
    ).bind(category, attackerType, defenderType).first();
  }

  if (!row) {
    row = await env.DB.prepare(
      `SELECT text
       FROM duel_texts
       WHERE category = ?
         AND attacker_type IS NULL
         AND defender_type IS NULL
       ORDER BY RANDOM()
       LIMIT 1`
    ).bind(category).first();
  }

  return row ? row.text : "";
}
