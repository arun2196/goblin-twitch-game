import {
  getRaidDefinition,
} from "./RaidRegistry.js";

import {
  getActiveRaidRun,
  getCurrentEncounterRun,
  getRaidEntry,
  logRaidEvent,
  upsertRaidEntry,
} from "./RaidRepository.js";

import {
  getInputByCommand,
  normaliseRaidCommand,
} from "./RaidUtils.js";

export async function handleRaidCommand({
  env,
  command,
  username,
  displayName,
}) {
  const cleanCommand =
    normaliseRaidCommand(command);

  if (!cleanCommand) {
    return {
      handled: false,
    };
  }

  const raidRun =
    await getActiveRaidRun(env);

  if (!raidRun) {
    return {
      handled: false,
    };
  }

  const raid = getRaidDefinition(
    raidRun.raid_key
  );

  if (!raid) {
    return {
      handled: false,
    };
  }

  const encounter =
    raid.encounters[
      raidRun.current_encounter_index
    ];

  if (!encounter) {
    return {
      handled: false,
    };
  }

  const input = getInputByCommand(
    encounter,
    cleanCommand
  );

  if (!input) {
    return {
      handled: false,
    };
  }

  if (raidRun.status === "paused") {
    return {
      handled: true,
      ok: false,
      message:
        "The raid is currently paused.",
    };
  }

  const encounterRun =
    await getCurrentEncounterRun(
      env,
      raidRun.id
    );

  if (
    !encounterRun ||
    encounterRun.status !==
      "accepting_inputs" ||
    !encounterRun.inputs_open
  ) {
    return {
      handled: true,
      ok: false,
      message:
        "That raid encounter is not accepting entries right now.",
    };
  }

  const cleanUsername =
    String(username ?? "")
      .trim()
      .toLowerCase();

  if (!cleanUsername) {
    return {
      handled: true,
      ok: false,
      message:
        "Story Weaver could not identify you.",
    };
  }

  const safeDisplayName =
    String(displayName || cleanUsername)
      .trim();

  const existing = await getRaidEntry(
    env,
    encounterRun.id,
    cleanUsername
  );

  const allowChoiceChanges =
    raid.settings?.allowChoiceChanges !== false;

  if (
    existing &&
    existing.input_key !== input.key &&
    !allowChoiceChanges
  ) {
    return {
      handled: true,
      ok: false,
      message:
        `${safeDisplayName}, your choice is already locked.`,
    };
  }

  await upsertRaidEntry(env, {
    raidRunId: raidRun.id,
    encounterRunId: encounterRun.id,
    username: cleanUsername,
    displayName: safeDisplayName,
    inputKey: input.key,
    commandUsed: cleanCommand,
  });

  const changed =
    existing &&
    existing.input_key !== input.key;

  const repeated =
    existing &&
    existing.input_key === input.key;

  await logRaidEvent(env, {
    raidRunId: raidRun.id,
    encounterRunId: encounterRun.id,
    eventType: changed
      ? "entry_changed"
      : repeated
        ? "entry_repeated"
        : "entry_joined",
    actor: cleanUsername,
    data: {
      inputKey: input.key,
      previousInputKey:
        existing?.input_key ?? null,
    },
  });

  if (changed) {
    return {
      handled: true,
      ok: true,
      message:
        `${safeDisplayName} changed their choice to ${input.label}.`,
    };
  }

  if (repeated) {
    return {
      handled: true,
      ok: true,
      message:
        `${safeDisplayName} is already entered.`,
    };
  }

  return {
    handled: true,
    ok: true,
    message:
      `${safeDisplayName} joined: ${input.label}.`,
  };
}