import {
  announceScene,
  cancelStoryRun,
  closeSceneInputs,
  createSceneRun,
  createStoryRun,
  getActiveStoryRun,
  getCurrentSceneRun,
  getPublishedStoryByKey,
  getStorySceneByOrder,
  logStoryEvent,
  openSceneInputs,
  pauseStoryRun,
  resumeStoryRun,
} from "./StoryRepository.js";

import {
  validateSceneInputs,
} from "./StoryValidator.js";

export async function startStory(env, storyKey, actor) {
  const activeRun = await getActiveStoryRun(env);

  if (activeRun) {
    return {
      ok: false,
      message:
        `A story is already active: ${activeRun.story_title}.`,
    };
  }

  const story = await getPublishedStoryByKey(
    env,
    storyKey
  );

  if (!story) {
    return {
      ok: false,
      message:
        `No published story was found for "${storyKey}".`,
    };
  }

  const firstScene = await getStorySceneByOrder(
    env,
    story.id,
    1
  );

  if (!firstScene) {
    return {
      ok: false,
      message:
        "This story has no enabled first scene.",
    };
  }

  validateSceneInputs(firstScene.inputs);

  const storyRunId = await createStoryRun(
    env,
    story.id
  );

  const sceneRunId = await createSceneRun(env, {
    storyRunId,
    storySceneId: firstScene.id,
    sceneOrder: firstScene.scene_order,
    attemptNumber: 1,
  });

  await logStoryEvent(env, {
    storyRunId,
    sceneRunId,
    eventType: "story_started",
    actor,
    data: {
      storyKey: story.story_key,
      version: story.version,
      firstSceneKey: firstScene.scene_key,
    },
  });

  return {
    ok: true,
    storyRunId,
    sceneRunId,
    story,
    scene: firstScene,
  };
}

export async function announceCurrentScene(
  env,
  actor
) {
  const sceneRun = await getCurrentSceneRun(env);

  if (!sceneRun) {
    return {
      ok: false,
      message: "There is no active scene.",
    };
  }

  if (sceneRun.story_status === "paused") {
    return {
      ok: false,
      message: "The story is paused.",
    };
  }

  await announceScene(env, sceneRun.id);

  await logStoryEvent(env, {
    storyRunId: sceneRun.story_run_id,
    sceneRunId: sceneRun.id,
    eventType: "scene_announced",
    actor,
    data: {
      sceneKey: sceneRun.scene_key,
    },
  });

  return {
    ok: true,
    scene: sceneRun,
  };
}

export async function openCurrentSceneInputs(
  env,
  actor
) {
  const sceneRun = await getCurrentSceneRun(env);

  if (!sceneRun) {
    return {
      ok: false,
      message: "There is no active scene.",
    };
  }

  if (sceneRun.story_status === "paused") {
    return {
      ok: false,
      message: "The story is paused.",
    };
  }

  validateSceneInputs(sceneRun.inputs);

  if (sceneRun.inputs.length === 0) {
    return {
      ok: false,
      message:
        "This scene does not accept player inputs.",
    };
  }

  await openSceneInputs(env, sceneRun.id);

  await logStoryEvent(env, {
    storyRunId: sceneRun.story_run_id,
    sceneRunId: sceneRun.id,
    eventType: "scene_inputs_opened",
    actor,
    data: {
      acceptedCommands:
        sceneRun.inputs.map(
          (input) => input.command
        ),
    },
  });

  return {
    ok: true,
    scene: sceneRun,
  };
}

export async function closeCurrentSceneInputs(
  env,
  actor
) {
  const sceneRun = await getCurrentSceneRun(env);

  if (!sceneRun) {
    return {
      ok: false,
      message: "There is no active scene.",
    };
  }

  if (!sceneRun.inputs_open) {
    return {
      ok: false,
      message:
        "Inputs are not currently open.",
    };
  }

  await closeSceneInputs(env, sceneRun.id);

  await logStoryEvent(env, {
    storyRunId: sceneRun.story_run_id,
    sceneRunId: sceneRun.id,
    eventType: "scene_inputs_closed",
    actor,
  });

  return {
    ok: true,
    scene: sceneRun,
  };
}

export async function pauseActiveStory(env, actor) {
  const run = await getActiveStoryRun(env);

  if (!run) {
    return {
      ok: false,
      message: "There is no active story.",
    };
  }

  if (run.status === "paused") {
    return {
      ok: false,
      message: "The story is already paused.",
    };
  }

  await pauseStoryRun(env, run.id);

  await logStoryEvent(env, {
    storyRunId: run.id,
    eventType: "story_paused",
    actor,
  });

  return {
    ok: true,
    run,
  };
}

export async function resumeActiveStory(
  env,
  actor
) {
  const run = await getActiveStoryRun(env);

  if (!run) {
    return {
      ok: false,
      message: "There is no active story.",
    };
  }

  if (run.status !== "paused") {
    return {
      ok: false,
      message: "The story is not paused.",
    };
  }

  await resumeStoryRun(env, run.id);

  await logStoryEvent(env, {
    storyRunId: run.id,
    eventType: "story_resumed",
    actor,
  });

  return {
    ok: true,
    run,
  };
}

export async function cancelActiveStory(
  env,
  actor
) {
  const run = await getActiveStoryRun(env);

  if (!run) {
    return {
      ok: false,
      message: "There is no active story.",
    };
  }

  await cancelStoryRun(env, run.id);

  await logStoryEvent(env, {
    storyRunId: run.id,
    eventType: "story_cancelled",
    actor,
  });

  return {
    ok: true,
    run,
  };
}