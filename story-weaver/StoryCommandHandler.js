import {
  getCurrentSceneRun,
  getSceneEntry,
  logStoryEvent,
  upsertSceneEntry,
} from "./StoryRepository.js";

import {
  normaliseStoryCommand,
} from "./reservedCommands.js";

function findInputForCommand(inputs, command) {
  return inputs.find(
    (input) =>
      normaliseStoryCommand(input.command) ===
      command
  );
}

export async function handleStoryCommand({
  env,
  command,
  username,
  displayName,
}) {
  const normalisedCommand =
    normaliseStoryCommand(command);

  if (!normalisedCommand) {
    return {
      handled: false,
    };
  }

  const sceneRun = await getCurrentSceneRun(env);

  if (!sceneRun) {
    return {
      handled: false,
    };
  }

  const input = findInputForCommand(
    sceneRun.inputs,
    normalisedCommand
  );

  if (!input) {
    return {
      handled: false,
    };
  }

  if (sceneRun.story_status === "paused") {
    return {
      handled: true,
      ok: false,
      message:
        "The story is currently paused.",
    };
  }

  if (
    sceneRun.status !== "accepting_inputs" ||
    !sceneRun.inputs_open
  ) {
    return {
      handled: true,
      ok: false,
      message:
        "That encounter is not accepting entries right now.",
    };
  }

  const cleanUsername = String(username ?? "")
    .trim()
    .toLowerCase();

  if (!cleanUsername) {
    return {
      handled: true,
      ok: false,
      message:
        "I could not identify the player.",
    };
  }

  const existingEntry = await getSceneEntry(
    env,
    sceneRun.id,
    cleanUsername
  );

  await upsertSceneEntry(env, {
    storyRunId: sceneRun.story_run_id,
    sceneRunId: sceneRun.id,
    username: cleanUsername,
    displayName:
      displayName || cleanUsername,
    inputKey: input.key,
    commandUsed: normalisedCommand,
    metadata: {},
  });

  const changedChoice =
    existingEntry &&
    existingEntry.input_key !== input.key;

  const repeatedSameInput =
    existingEntry &&
    existingEntry.input_key === input.key;

  await logStoryEvent(env, {
    storyRunId: sceneRun.story_run_id,
    sceneRunId: sceneRun.id,
    eventType: changedChoice
      ? "scene_input_changed"
      : repeatedSameInput
        ? "scene_input_repeated"
        : "scene_input_submitted",
    actor: cleanUsername,
    data: {
      inputKey: input.key,
      command: normalisedCommand,
      previousInputKey:
        existingEntry?.input_key ?? null,
    },
  });

  if (changedChoice) {
    return {
      handled: true,
      ok: true,
      changed: true,
      message:
        `${displayName || cleanUsername} changed their choice to ${input.label ?? input.key}.`,
    };
  }

  if (repeatedSameInput) {
    return {
      handled: true,
      ok: true,
      repeated: true,
      message:
        `${displayName || cleanUsername} is already entered for ${input.label ?? sceneRun.scene_title}.`,
    };
  }

  return {
    handled: true,
    ok: true,
    message:
      `${displayName || cleanUsername} joined ${input.label ?? sceneRun.scene_title}.`,
  };
}