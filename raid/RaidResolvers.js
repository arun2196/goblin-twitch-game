import {
  rollDice,
} from "./RaidUtils.js";

function countInputs(entries) {
  const counts = {};

  for (const entry of entries) {
    counts[entry.input_key] =
      (counts[entry.input_key] ?? 0) + 1;
  }

  return counts;
}

function resolveMajorityChoice(
  encounter,
  entries
) {
  const counts = countInputs(entries);

  let winningInput = null;
  let winningCount = -1;

  for (const input of encounter.inputs ?? []) {
    const count = counts[input.key] ?? 0;

    if (count > winningCount) {
      winningInput = input.key;
      winningCount = count;
    } else if (count === winningCount) {
      // Random tie-break.
      if (Math.random() < 0.5) {
        winningInput = input.key;
      }
    }
  }

  const requiredWinningInput =
    encounter.mechanics?.winningInput;

  const success =
    requiredWinningInput
      ? winningInput === requiredWinningInput
      : winningInput !== null;

  return {
    outcome: success ? "success" : "failure",
    result: {
      resolver: "majority-choice",
      participantCount: entries.length,
      counts,
      winningInput,
      requiredWinningInput:
        requiredWinningInput ?? null,
    },
  };
}

function resolveGroupRoll(
  encounter,
  entries
) {
  const participantCount = entries.length;

  const playerSides =
    encounter.mechanics?.playerSides ?? 10;

  const enemySides =
    encounter.mechanics?.enemySides ?? 10;

  const enemyDiceOffset =
    encounter.mechanics?.enemyDiceOffset ?? 0;

  const flatPlayerBonus =
    encounter.mechanics?.flatPlayerBonus ?? 0;

  const playerDiceCount =
    Math.max(1, participantCount);

  const enemyDiceCount =
    Math.max(
      1,
      participantCount + enemyDiceOffset
    );

  const playerRoll = rollDice(
    playerDiceCount,
    playerSides
  );

  const enemyRoll = rollDice(
    enemyDiceCount,
    enemySides
  );

  const playerTotal =
    playerRoll.total + flatPlayerBonus;

  const enemyTotal = enemyRoll.total;

  const success = playerTotal >= enemyTotal;

  return {
    outcome: success ? "success" : "failure",
    result: {
      resolver: "group-roll",
      participantCount,
      playerDiceCount,
      enemyDiceCount,
      playerRolls: playerRoll.rolls,
      enemyRolls: enemyRoll.rolls,
      flatPlayerBonus,
      playerTotal,
      enemyTotal,
    },
  };
}

export function resolveEncounter(
  encounter,
  entries
) {
  switch (encounter.type) {
    case "majority-choice":
      return resolveMajorityChoice(
        encounter,
        entries
      );

    case "group-roll":
      return resolveGroupRoll(
        encounter,
        entries
      );

    default:
      throw new Error(
        `Unknown raid encounter type: ${encounter.type}`
      );
  }
}