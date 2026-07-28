export const RESERVED_COMMANDS = new Set([
  "chest",
  "delve",
  "challenge",
  "ready",
  "run",
  "gold",
  "inventory",
  "inspect",
  "gift",
  "richlist",
  "queue",
  "smite",
  "askgobbo",
  "roll",
  "nickname",
]);

export function normaliseStoryCommand(command) {
  return String(command ?? "")
    .trim()
    .toLowerCase()
    .replace(/^!+/, "");
}

export function isReservedCommand(command) {
  return RESERVED_COMMANDS.has(
    normaliseStoryCommand(command)
  );
}