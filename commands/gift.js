import { cleanUsername, cleanDisplayName, getOrCreatePlayer } from "../helpers/players.js";

export async function handleGift(env, url) {
  const sender = cleanUsername(url.searchParams.get("user"));
  const senderDisplay = cleanDisplayName(url.searchParams.get("user"));

  const target = cleanUsername(url.searchParams.get("target"));
  const targetDisplay = cleanDisplayName(url.searchParams.get("target"));

  const amount = Number(url.searchParams.get("amount"));

  if (!sender || !target || !amount) {
    return new Response("Usage: !gift @goblin <gold>");
  }

  if (sender === target) {
    return new Response("You cannot gift gold to yourself, sneaky goblin.");
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return new Response("Gift amount must be a positive whole number.");
  }

  if (amount < 5) {
    return new Response("Minimum gift is 5 gold. The Goblin Treasury hates tiny paperwork.");
  }

  const giver = await getOrCreatePlayer(env, sender, senderDisplay);

  const receiver = await env.DB.prepare(`
    SELECT *
    FROM players
    WHERE username = ?
  `)
    .bind(target)
    .first();

  if (!receiver) {
    return new Response(
      `${targetDisplay} has not registered in Gobbo Games yet. They need to use a command like !chest, !delve, or !queue before they can receive gifts.`
    );
  }

  if (giver.gold < amount) {
    return new Response(
      `${giver.display_name}, you only have ${giver.gold} gold. You cannot gift ${amount}.`
    );
  }

  const tax = Math.floor(amount * 0.05);
  const receivedAmount = amount - tax;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE players
       SET gold = gold - ?,
           total_gold_gifted = total_gold_gifted + ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(amount, amount, sender),

    env.DB.prepare(
      `UPDATE players
       SET gold = gold + ?,
           total_gold_earned = total_gold_earned + ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`
    ).bind(receivedAmount, receivedAmount, target),

    env.DB.prepare(
      `INSERT INTO transactions (username, amount, reason)
       VALUES (?, ?, ?)`
    ).bind(sender, -amount, "gift_sent"),

    env.DB.prepare(
      `INSERT INTO transactions (username, amount, reason)
       VALUES (?, ?, ?)`
    ).bind(target, receivedAmount, "gift_received"),

    env.DB.prepare(
      `INSERT INTO events (event_type, message)
       VALUES (?, ?)`
    ).bind(
      "gift",
      `${giver.display_name} gifted ${receivedAmount} gold to ${receiver.display_name}. The treasury took ${tax}g.`
    )
  ]);

  return new Response(
    `🎁 ${giver.display_name} gifted ${receivedAmount}g to ${receiver.display_name}. Treasury tax: ${tax}g.`
  );
}
