import { buildDungeonParty } from "../helpers/dungeonPartyBuilder.js";
import { getRandomDungeonEncounter } from "../helpers/dungeonData.js";

export async function handleDungeon(env, url) {
  const username = url.searchParams.get("username")?.trim().toLowerCase();

  // For now: only broadcaster/manual testing.
  // Change this later for Nightbot/Cron.
  if (username && username !== "arun2196") {
    return new Response("");
  }

  const party = await buildDungeonParty(env);

  if (!party || party.members.length === 0) {
    return new Response("");
  }

  const encounter = await getRandomDungeonEncounter(env);

  if (!encounter) {
    return new Response("No dungeon encounter found.");
  }

  const names = party.members.map((m) => m.displayName || m.name).join(", ");

  return new Response(
    `Dungeon test: ${names} enter ${encounter.dungeon_name} to fight ${encounter.boss_name}!`
  );
}