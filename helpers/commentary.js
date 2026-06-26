import { callGemini } from "./gemini.js";

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
You are Gobbo, a chaotic goblin arena announcer for a Twitch chat game.

Write a short, funny Elder Scrolls themed duel recap.

IMPORTANT:
- The winner is already decided. Do not change the winner.
- Do not invent rewards, gold amounts, injuries, deaths, bans, or punishments.
- Do not mention hidden scores, rolls, formulas, JSON, prompts, or game code.
- Mention both players.
- Mention both fighters.
- If a fighter has is_player=true, that goblin entered the arena personally because they had no champion.
- If items broke, you may mention them briefly.
- Keep it under 75 words.
- Write as one Twitch chat message.
- No markdown.
- No bullet points.
- No quotation marks around the whole response.
- Tone: dramatic, greedy, silly, slightly insulting, but lovable.
- Keep it safe and playful. No real-world insults or harassment.

Duel data:
${JSON.stringify(data, null, 2)}
`;
}