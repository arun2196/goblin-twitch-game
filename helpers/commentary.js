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
