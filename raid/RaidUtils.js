export function normaliseRaidCommand(command) {
  return String(command ?? "")
    .trim()
    .toLowerCase()
    .replace(/^!+/, "");
}

export function safeJsonParse(value, fallback = {}) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function rollDie(sides) {
  const safeSides = Math.max(
    1,
    Number.parseInt(sides, 10) || 1
  );

  return Math.floor(Math.random() * safeSides) + 1;
}

export function rollDice(count, sides) {
  const safeCount = Math.max(
    0,
    Number.parseInt(count, 10) || 0
  );

  const rolls = [];

  for (let i = 0; i < safeCount; i++) {
    rolls.push(rollDie(sides));
  }

  return {
    rolls,
    total: rolls.reduce(
      (sum, roll) => sum + roll,
      0
    ),
  };
}

export function getInputByCommand(
  encounter,
  command
) {
  const cleanCommand =
    normaliseRaidCommand(command);

  return encounter.inputs?.find(
    (input) =>
      normaliseRaidCommand(input.command) ===
      cleanCommand
  ) ?? null;
}

export function validateRaidDefinition(raid) {
  if (!raid || typeof raid !== "object") {
    throw new Error(
      "Raid definition must be an object."
    );
  }

  if (!raid.key) {
    throw new Error(
      "Raid definition is missing a key."
    );
  }

  if (!raid.title) {
    throw new Error(
      `Raid "${raid.key}" is missing a title.`
    );
  }

  if (
    !Array.isArray(raid.encounters) ||
    raid.encounters.length === 0
  ) {
    throw new Error(
      `Raid "${raid.key}" has no encounters.`
    );
  }

  const encounterKeys = new Set();

  for (
    let index = 0;
    index < raid.encounters.length;
    index++
  ) {
    const encounter = raid.encounters[index];

    if (!encounter.key) {
      throw new Error(
        `Encounter ${index + 1} is missing a key.`
      );
    }

    if (encounterKeys.has(encounter.key)) {
      throw new Error(
        `Duplicate encounter key: ${encounter.key}`
      );
    }

    encounterKeys.add(encounter.key);

    const inputCommands = new Set();
    const inputKeys = new Set();

    for (const input of encounter.inputs ?? []) {
      const command =
        normaliseRaidCommand(input.command);

      if (!input.key || !command) {
        throw new Error(
          `Encounter "${encounter.key}" has an invalid input.`
        );
      }

      if (inputKeys.has(input.key)) {
        throw new Error(
          `Duplicate input key "${input.key}" in encounter "${encounter.key}".`
        );
      }

      if (inputCommands.has(command)) {
        throw new Error(
          `Duplicate command "!${command}" in encounter "${encounter.key}".`
        );
      }

      inputKeys.add(input.key);
      inputCommands.add(command);
    }
  }

  return true;
}