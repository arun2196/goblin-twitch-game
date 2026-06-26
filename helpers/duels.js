export async function getAdvantage(env, attackerType, defenderType) {
  if (!attackerType || !defenderType) return 0;

  const rule = await env.DB.prepare(
    `SELECT advantage
     FROM combat_rules
     WHERE attacker_type = ?
       AND defender_type = ?
     LIMIT 1`
  )
    .bind(attackerType, defenderType)
    .first();

  return rule ? Number(rule.advantage || 0) : 0;
}