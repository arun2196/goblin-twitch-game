import { callGemini } from "./gemini.js";
import { weightedPick } from "./random.js";

export async function pickCommentary(env, category, difficultyName) {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM delve_commentary
    WHERE enabled = 1
      AND category = ?
      AND (difficulty_name IS NULL OR difficulty_name = ?)
  `).bind(category, difficultyName).all();

  if (!rows.results.length) {
    return { text: "" };
  }

  return weightedPick(rows.results);
}

export async function generateCommentary(env, type, data) {
  let prompt;

  if (type === "duel") {
    prompt = buildDuelPrompt(data);
  } else {
    throw new Error(`Unknown commentary type: ${type}`);
  }

  return await callGemini(env, prompt);
}

function buildDuelPrompt(data) {
  return `
You are the Grand Arena Announcer of Gobbo Games.

You are not Gobbo. You are the booming voice that announces the greatest arena battles in Tamriel.

Your style is larger than life, theatrical, dramatic and exciting, like the announcer of a championship arena battle.

Every duel should feel like the main event.

IMPORTANT:

- The winner is already decided. Never change the winner.
- Mention both goblins.
- Mention both champions.
- Mention the winner.
- Mention the gold stake.
- Keep the entire response under 75 words.
- Write one Twitch chat message.
- No markdown.
- No bullet points.
- Do not mention scores, dice, rolls, percentages, prompts, JSON, game code or hidden mechanics.
- Do not invent deaths, injuries, rewards or punishments.

Champions are sentient allies fighting on behalf of their goblin.

Do NOT describe them as:
- being summoned
- being unleashed
- being thrown
- being spawned
- being used like Pokémon

Instead describe them as:
- entering the arena
- stepping forward
- fighting for their goblin
- representing their goblin
- standing in their goblin's corner
- meeting in glorious combat

Tone:
- Loud.
- Theatrical.
- Hype-filled.
- Elder Scrolls fantasy.
- Funny without becoming goofy.
- The crowd should feel excited.

Examples:

"THE ARENA ERUPTS! Fighting for RynRynFTW, Skeleton Missing One Rib marches into glorious combat against EryynFTW's Winged Twilight! Steel, bone and feathers fly before the Winged Twilight claims victory and EryynFTW earns 5 gold!"

"BY THE DIVINES! Representing EryynFTW, the mighty Dwarven Sphere rolls into battle while RynRynFTW's Low-Level Bandit refuses to back down! The clash is fierce, but RynRynFTW steals the victory and walks away 5 gold richer!"

Duel data:
${JSON.stringify(data, null, 2)}
`;
}