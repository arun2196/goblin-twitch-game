export async function handleRichlist(env) {
  const rows = await env.DB.prepare(
    `SELECT display_name, gold
     FROM players
     ORDER BY gold DESC
     LIMIT 5`
  ).all();

  if (!rows.results.length) {
    return new Response("No goblins have joined the hoard yet.");
  }

  const text = rows.results
    .map((p, index) => `${index + 1}. ${p.display_name}: ${p.gold}g`)
    .join(" | ");

  return new Response(`Goblin Richlist: ${text}`);
}
