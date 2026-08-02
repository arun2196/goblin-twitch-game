import suspiciousDoor from "../raids/suspicious-door.json";

const raids = new Map([
  [suspiciousDoor.key, suspiciousDoor],
]);

export function getRaidDefinition(raidKey) {
  const cleanKey = String(raidKey ?? "")
    .trim()
    .toLowerCase();

  return raids.get(cleanKey) ?? null;
}

export function getAllRaidDefinitions() {
  return Array.from(raids.values());
}