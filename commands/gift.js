import { randomInt } from "../helpers/random.js";
import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

import { generateCommentary } from "../helpers/commentary.js";

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
    return new Response(
      "You cannot gift gold to yourself, sneaky goblin."
    );
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return new Response(
      "Gift amount must be a positive whole number."
    );
  }

  if (amount < 5) {
    return new Response(
      "Minimum gift is 5 gold. The Goblin Treasury hates tiny paperwork."
    );
  }

  const giver = await getOrCreatePlayer(
    env,
    sender,
    senderDisplay
  );

  if (giver.gold < amount) {
    return new Response(
      `${giver.display_name}, you only have ${giver.gold} gold. You cannot gift ${amount}.`
    );
  }

  /*
   * Gobbo gifts use a separate handler.
   *
   * cleanUsername() should turn values such as:
   *   Gobbo
   *   @Gobbo
   *
   * into:
   *   gobbo
   */
  if (target === "gobbo") {
    return handleGiftToGobbo(env, giver, amount);
  }

  return handlePlayerGift(
    env,
    giver,
    target,
    targetDisplay,
    amount
  );
}

async function handlePlayerGift(
  env,
  giver,
  target,
  targetDisplay,
  amount
) {
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

  // Final 48-hour event:
  // The Treasury adds a random 10%–50% bonus to every player gift.
  const bonusPercent = randomInt(10, 50);
  const bonusAmount = Math.floor(amount * (bonusPercent / 100));
  const receivedAmount = amount + bonusAmount;

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE players
      SET gold = gold - ?,
          total_gold_gifted = total_gold_gifted + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE username = ?
    `).bind(
      amount,
      amount,
      giver.username
    ),

    env.DB.prepare(`
      UPDATE players
      SET gold = gold + ?,
          total_gold_earned = total_gold_earned + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE username = ?
    `).bind(
      receivedAmount,
      receivedAmount,
      target
    ),

    env.DB.prepare(`
      INSERT INTO transactions (
        username,
        amount,
        reason
      )
      VALUES (?, ?, ?)
    `).bind(
      giver.username,
      -amount,
      "gift_sent"
    ),

    env.DB.prepare(`
      INSERT INTO transactions (
        username,
        amount,
        reason
      )
      VALUES (?, ?, ?)
    `).bind(
      target,
      amount,
      "gift_received"
    ),

    env.DB.prepare(`
      INSERT INTO transactions (
        username,
        amount,
        reason
      )
      VALUES (?, ?, ?)
    `).bind(
      target,
      bonusAmount,
      "gift_treasury_bonus"
    ),

    env.DB.prepare(`
      INSERT INTO events (
        event_type,
        message
      )
      VALUES (?, ?)
    `).bind(
      "gift",
      `${giver.display_name} gifted ${amount} gold to ${receiver.display_name}. The treasury added ${bonusAmount}g (${bonusPercent}%), for a total of ${receivedAmount}g.`
    ),
  ]);

  const giftResponses = [
    `🎁 ${giver.display_name} gifted ${amount}g to ${receiver.display_name}! The Treasury added a ${bonusPercent}% bonus: +${bonusAmount}g. Total received: ${receivedAmount}g!`,

    `💰 ${giver.display_name} sent ${amount}g to ${receiver.display_name}, and the Goblin Treasury matched it with an extra ${bonusAmount}g! ${receivedAmount}g received.`,

    `🍀 Gift boosted! ${giver.display_name} gave ${amount}g to ${receiver.display_name}. Treasury blessing: +${bonusPercent}% (${bonusAmount}g). Final gift: ${receivedAmount}g.`,

    `🏦 The Treasury is feeling generous! ${giver.display_name}'s ${amount}g gift to ${receiver.display_name} grew by ${bonusAmount}g. Total: ${receivedAmount}g.`,

    `✨ ${giver.display_name} gifted ${amount}g to ${receiver.display_name}. Goblin accounting somehow added ${bonusAmount}g instead of stealing it. Total: ${receivedAmount}g!`,
  ];

  return new Response(
    giftResponses[randomInt(0, giftResponses.length - 1)]
  );
}

async function handleGiftToGobbo(env, giver, amount) {
  /*
   * Gobbo is stored as a normal player so his treasury
   * can be checked through the existing gold systems.
   */
  const gobbo = await getOrCreatePlayer(env, "gobbo", "Gobbo");

  /*
   * Gobbo receives the full amount.
   * There is no treasury tax when gifting the treasury goblin.
   */
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE players
      SET gold = gold - ?,
          total_gold_gifted = total_gold_gifted + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE username = ?
    `).bind(
      amount,
      amount,
      giver.username
    ),

    env.DB.prepare(`
      UPDATE players
      SET gold = gold + ?,
          total_gold_earned = total_gold_earned + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE username = ?
    `).bind(
      amount,
      amount,
      gobbo.username
    ),

    env.DB.prepare(`
      INSERT INTO transactions (
        username,
        amount,
        reason
      )
      VALUES (?, ?, ?)
    `).bind(
      giver.username,
      -amount,
      "gift_to_gobbo"
    ),

    env.DB.prepare(`
      INSERT INTO transactions (
        username,
        amount,
        reason
      )
      VALUES (?, ?, ?)
    `).bind(
      gobbo.username,
      amount,
      "gift_received_by_gobbo"
    ),

    env.DB.prepare(`
      INSERT INTO events (
        event_type,
        message
      )
      VALUES (?, ?)
    `).bind(
      "gift_to_gobbo",
      `${giver.display_name} gifted ${amount} gold directly to Gobbo.`
    ),

    env.DB.prepare(`
      INSERT INTO gobbo_reputation (
        username,
        display_name,
        total_gold_gifted,
        gift_count,
        largest_gift,
        first_gift_at,
        last_gift_at
      )
      VALUES (
        ?,
        ?,
        ?,
        1,
        ?,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(username) DO UPDATE SET
        display_name = excluded.display_name,

        total_gold_gifted =
          gobbo_reputation.total_gold_gifted +
          excluded.total_gold_gifted,

        gift_count =
          gobbo_reputation.gift_count + 1,

        largest_gift = MAX(
          gobbo_reputation.largest_gift,
          excluded.largest_gift
        ),

        last_gift_at = CURRENT_TIMESTAMP
    `).bind(
      giver.username,
      giver.display_name || giver.username,
      amount,
      amount
    ),
  ]);

  const fallbackResponses = [
    `💰 ${giver.display_name} gifted Gobbo ${amount}g. Gobbo says: Ah, my favourite wealthy genius! Your generosity is almost as magnificent as me!`,

    `💰 ${giver.display_name} gifted Gobbo ${amount}g. Gobbo says: Such beauty, such wisdom, such excellent financial decisions!`,

    `💰 ${giver.display_name} gifted Gobbo ${amount}g. Gobbo says: I always said you were the cleverest goblin here. Ignore anyone who claims otherwise!`,

    `💰 ${giver.display_name} gifted Gobbo ${amount}g. Gobbo says: My dear ${giver.display_name}, you make generosity look dangerously attractive!`,

    `💰 ${giver.display_name} gifted Gobbo ${amount}g. Gobbo says: A gift from the kingdom's finest goblin? I shall treasure it for several minutes!`,
  ];

  const fallback =
    fallbackResponses[
      Math.floor(Math.random() * fallbackResponses.length)
    ];

  let commentary = fallback;

  try {
    const generated = await generateCommentary(
      env,
      "gift_to_gobbo",
      {
        giver: {
          username: giver.username,
          displayName: giver.display_name,
        },

        amount,

        gobboGoldAfterGift:
          Number(gobbo.gold || 0) + amount,

        instructions: [
          "Gobbo has just received a gold gift from this viewer.",
          "Thank and sweet-talk the viewer.",
          "Be charming, mischievous, flattering, and slightly greedy.",
          "Address the viewer by display name.",
          "Mention or react to the amount of gold.",
          "Keep the entire response suitable for Twitch chat.",
          "Do not be sexual, threatening, cruel, or genuinely manipulative.",
          "Keep the response under 220 characters.",
          "Return only Gobbo's response, without quotation marks.",
        ],
      }
    );

    if (
      typeof generated === "string" &&
      generated.trim()
    ) {
      const cleaned = generated
        .replace(/^["']|["']$/g, "")
        .trim();

      commentary =
        `💰 ${giver.display_name} gifted Gobbo ${amount}g. ` +
        `Gobbo says: ${cleaned}`;
    }
  } catch (error) {
    console.log(
      "Gobbo gift commentary failed:",
      error?.message || error
    );
  }

  /*
   * Twitch messages have a 500-character limit.
   * Keeping this below 490 leaves a small safety margin.
   */
  return new Response(commentary.slice(0, 490));
}

function getGobboGiftReaction(amount) {
  if (amount <= 10) {
    return {
      tier: "small",
      reaction: `
This is a small but appreciated gift.

Gobbo should:
- Be pleased and thankful.
- Give the viewer a small, cheeky compliment.
- Act like every coin matters.
- Do not overreact.
`,
    };
  }

  if (amount <= 100) {
    return {
      tier: "generous",
      reaction: `
This is a generous gift.

Gobbo should:
- Sound genuinely happy.
- Flatter the viewer warmly.
- Treat them like a clever and respected customer.
- Show noticeable excitement, but remain composed.
`,
    };
  }

  if (amount <= 500) {
    return {
      tier: "large",
      reaction: `
This is a large and impressive gift.

Gobbo should:
- Become visibly excited.
- Flatter the viewer shamelessly.
- Treat them like one of Gobbo's favourite people.
- Sound amazed by their generosity.
- Be dramatic, but not completely overwhelmed.
`,
    };
  }

  if (amount <= 1000) {
    return {
      tier: "massive",
      reaction: `
This is a massive gift.

Gobbo should:
- Be overwhelmed with excitement.
- Treat the viewer like nobility.
- Use grand, dramatic praise.
- Briefly lose his composure because of the gold.
- Act like this gift will be remembered for generations.
`,
    };
  }

  return {
    tier: "legendary",
    reaction: `
This is a legendary, absurdly enormous gift.

Gobbo should:
- React as though a mythical treasure has fallen into his hands.
- Treat the viewer like royalty, a divine patron, or the greatest goblin alive.
- Be dramatically overwhelmed and almost speechless.
- Praise them extravagantly.
- Sound extremely greedy and delighted.
- Do not ask them to gift more.
`,
  };
}