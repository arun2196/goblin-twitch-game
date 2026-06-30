import {
  cleanUsername,
  cleanDisplayName,
  getOrCreatePlayer,
} from "../helpers/players.js";

import { weightedPick, randomInt } from "../helpers/random.js";
import { pickCommentary } from "../helpers/commentary.js";
import { applyStoryNames } from "../helpers/aliases.js";

export async function handleDelve(env, url) {
  const username = cleanUsername(url.searchParams.get("user"));
  const displayName = cleanDisplayName(url.searchParams.get("user"));

  if (!username) return new Response("Usage: !delve");

  const player = await getOrCreatePlayer(env, username, displayName);
  const playerDisplayName = player.display_name || displayName || username;

  const [storyPlayer] = await applyStoryNames(env, [
    {
      ...player,
      username,
      displayName: playerDisplayName,
    },
  ]);

  const storyName =
    storyPlayer?.storyName ||
    storyPlayer?.displayName ||
    playerDisplayName;

  const delve = await env.DB.prepare(`
    SELECT *
    FROM delves
    WHERE enabled = 1
    ORDER BY RANDOM()
    LIMIT 1
  `).first();

  if (!delve) {
    return new Response("No delves exist in the database yet.");
  }

  const difficulties = await env.DB.prepare(`
    SELECT *
    FROM delve_difficulties
    ORDER BY id
  `).all();

  if (!difficulties.results.length) {
    return new Response("No delve difficulties exist in the database yet.");
  }

  const difficulty = weightedPick(difficulties.results);

  const didFail = Math.random() * 100 < Number(difficulty.fail_chance || 0);

  const intro = await pickCommentary(env, "intro", difficulty.name);
  const situation = await pickCommentary(env, "situation", difficulty.name);
  const twist = await pickCommentary(env, "twist", difficulty.name);
  const ending = await pickCommentary(
    env,
    didFail ? "fail" : "outcome",
    difficulty.name
  );

  const baseGold = didFail ? -randomInt(5, 20) : randomInt(10, 40);

  const rolledGoldChange = Math.floor(
    baseGold * Number(difficulty.gold_multiplier || 1)
  );

  const currentGold = Number(player.gold || 0);

  const goldChange =
    rolledGoldChange < 0
      ? -Math.min(currentGold, Math.abs(rolledGoldChange))
      : rolledGoldChange;

  const newGold = currentGold + goldChange;

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE players
      SET gold = ?,
          delve_successes = delve_successes + ?,
          delve_failures = delve_failures + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE username = ?
    `).bind(newGold, didFail ? 0 : 1, didFail ? 1 : 0, username),

    env.DB.prepare(`
      INSERT INTO transactions (username, amount, reason)
      VALUES (?, ?, ?)
    `).bind(username, goldChange, didFail ? "delve_fail" : "delve_success"),
  ]);

  const vars = {
    user: storyName,
    displayName: playerDisplayName,
    alias: storyPlayer?.alias || "",
    delve: delve.name || "",
    zone: delve.zone || "",
    boss: delve.boss_name || "",
    difficulty: difficulty.name || "",
    gold: Math.abs(goldChange),
  };

  const render = (text) => {
    return (text || "")
      .replaceAll("{user}", vars.user)
      .replaceAll("{displayName}", vars.displayName)
      .replaceAll("{alias}", vars.alias)
      .replaceAll("{delve}", vars.delve)
      .replaceAll("{zone}", vars.zone)
      .replaceAll("{boss}", vars.boss)
      .replaceAll("{difficulty}", vars.difficulty)
      .replaceAll("{gold}", String(vars.gold));
  };

  const goldLine =
    goldChange >= 0 ? `+${goldChange} gold` : `${goldChange} gold`;

  const introText = render(intro?.text || "{user} ventures into {delve}.");
  const situationText = render(
    situation?.text || "Something suspicious happens."
  );
  const twistText = render(twist?.text || "Nobody understands why.");
  const endingText = render(ending?.text || "{user} escapes somehow.");

  return new Response(
    `🕳️ ${introText} Difficulty: ${vars.difficulty}. ${situationText} ${twistText} ${endingText} ${goldLine}`.slice(
      0,
      490
    )
  );
}