function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapStoryDefinition(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    settings: parseJson(row.settings_json, {}),
  };
}

function mapScene(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    inputs: parseJson(row.inputs_json, []),
    dialogue: parseJson(row.dialogue_json, {}),
    mechanics: parseJson(row.mechanics_json, {}),
    rewards: parseJson(row.rewards_json, {}),
    branching: parseJson(row.branching_json, {}),
    presentation: parseJson(row.presentation_json, {}),
  };
}

export async function getPublishedStoryByKey(
  env,
  storyKey
) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM story_definitions
    WHERE story_key = ?
      AND status = 'published'
    ORDER BY version DESC
    LIMIT 1
  `)
    .bind(storyKey)
    .first();

  return mapStoryDefinition(row);
}

export async function getStoryScenes(
  env,
  storyDefinitionId
) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM story_scenes
    WHERE story_definition_id = ?
      AND enabled = 1
    ORDER BY scene_order ASC
  `)
    .bind(storyDefinitionId)
    .all();

  return (result.results ?? []).map(mapScene);
}

export async function getStorySceneByOrder(
  env,
  storyDefinitionId,
  sceneOrder
) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM story_scenes
    WHERE story_definition_id = ?
      AND scene_order = ?
      AND enabled = 1
    LIMIT 1
  `)
    .bind(storyDefinitionId, sceneOrder)
    .first();

  return mapScene(row);
}

export async function getActiveStoryRun(env) {
  return await env.DB.prepare(`
    SELECT
      sr.*,
      sd.story_key,
      sd.version AS story_version,
      sd.title AS story_title
    FROM story_runs sr
    INNER JOIN story_definitions sd
      ON sd.id = sr.story_definition_id
    WHERE sr.status IN ('active', 'paused')
    ORDER BY sr.id DESC
    LIMIT 1
  `).first();
}

export async function createStoryRun(
  env,
  storyDefinitionId
) {
  const result = await env.DB.prepare(`
    INSERT INTO story_runs (
      story_definition_id,
      status,
      current_scene_order,
      started_at,
      updated_at
    )
    VALUES (?, 'active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)
    .bind(storyDefinitionId)
    .run();

  return result.meta.last_row_id;
}

export async function getStoryRunById(env, storyRunId) {
  return await env.DB.prepare(`
    SELECT
      sr.*,
      sd.story_key,
      sd.version AS story_version,
      sd.title AS story_title
    FROM story_runs sr
    INNER JOIN story_definitions sd
      ON sd.id = sr.story_definition_id
    WHERE sr.id = ?
    LIMIT 1
  `)
    .bind(storyRunId)
    .first();
}

export async function createSceneRun(
  env,
  {
    storyRunId,
    storySceneId,
    sceneOrder,
    attemptNumber = 1,
  }
) {
  const result = await env.DB.prepare(`
    INSERT INTO story_scene_runs (
      story_run_id,
      story_scene_id,
      scene_order,
      attempt_number,
      status,
      inputs_open,
      started_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'waiting', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)
    .bind(
      storyRunId,
      storySceneId,
      sceneOrder,
      attemptNumber
    )
    .run();

  return result.meta.last_row_id;
}

export async function getCurrentSceneRun(env) {
  const row = await env.DB.prepare(`
    SELECT
      ssr.*,

      sr.story_definition_id,
      sr.status AS story_status,

      ss.scene_key,
      ss.title AS scene_title,
      ss.scene_type,
      ss.narrator_text,
      ss.inputs_json,
      ss.dialogue_json,
      ss.mechanics_json,
      ss.rewards_json,
      ss.branching_json,
      ss.presentation_json

    FROM story_scene_runs ssr

    INNER JOIN story_runs sr
      ON sr.id = ssr.story_run_id

    INNER JOIN story_scenes ss
      ON ss.id = ssr.story_scene_id

    WHERE sr.status IN ('active', 'paused')
      AND ssr.status NOT IN (
        'resolved',
        'skipped',
        'error'
      )

    ORDER BY ssr.id DESC
    LIMIT 1
  `).first();

  return mapScene(row);
}

export async function announceScene(env, sceneRunId) {
  await env.DB.prepare(`
    UPDATE story_scene_runs
    SET
      status = 'announced',
      announced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(sceneRunId)
    .run();
}

export async function openSceneInputs(env, sceneRunId) {
  await env.DB.prepare(`
    UPDATE story_scene_runs
    SET
      status = 'accepting_inputs',
      inputs_open = 1,
      inputs_opened_at = CURRENT_TIMESTAMP,
      inputs_closed_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(sceneRunId)
    .run();
}

export async function closeSceneInputs(env, sceneRunId) {
  await env.DB.prepare(`
    UPDATE story_scene_runs
    SET
      status = 'locked',
      inputs_open = 0,
      inputs_closed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(sceneRunId)
    .run();
}

export async function upsertSceneEntry(
  env,
  {
    storyRunId,
    sceneRunId,
    username,
    displayName,
    inputKey,
    commandUsed,
    metadata = {},
  }
) {
  await env.DB.prepare(`
    INSERT INTO story_scene_entries (
      story_run_id,
      scene_run_id,
      username,
      display_name,
      input_key,
      command_used,
      metadata_json,
      joined_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

    ON CONFLICT(scene_run_id, username)
    DO UPDATE SET
      display_name = excluded.display_name,
      input_key = excluded.input_key,
      command_used = excluded.command_used,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `)
    .bind(
      storyRunId,
      sceneRunId,
      username,
      displayName,
      inputKey,
      commandUsed,
      JSON.stringify(metadata)
    )
    .run();
}

export async function getSceneEntry(
  env,
  sceneRunId,
  username
) {
  return await env.DB.prepare(`
    SELECT *
    FROM story_scene_entries
    WHERE scene_run_id = ?
      AND username = ?
    LIMIT 1
  `)
    .bind(sceneRunId, username)
    .first();
}

export async function getSceneEntries(env, sceneRunId) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM story_scene_entries
    WHERE scene_run_id = ?
    ORDER BY joined_at ASC
  `)
    .bind(sceneRunId)
    .all();

  return result.results ?? [];
}

export async function logStoryEvent(
  env,
  {
    storyRunId,
    sceneRunId = null,
    eventType,
    actor = null,
    data = {},
  }
) {
  await env.DB.prepare(`
    INSERT INTO story_events (
      story_run_id,
      scene_run_id,
      event_type,
      actor,
      data_json
    )
    VALUES (?, ?, ?, ?, ?)
  `)
    .bind(
      storyRunId,
      sceneRunId,
      eventType,
      actor,
      JSON.stringify(data)
    )
    .run();
}

export async function pauseStoryRun(env, storyRunId) {
  await env.DB.prepare(`
    UPDATE story_runs
    SET
      status = 'paused',
      paused_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'active'
  `)
    .bind(storyRunId)
    .run();
}

export async function resumeStoryRun(env, storyRunId) {
  await env.DB.prepare(`
    UPDATE story_runs
    SET
      status = 'active',
      paused_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'paused'
  `)
    .bind(storyRunId)
    .run();
}

export async function cancelStoryRun(env, storyRunId) {
  await env.DB.prepare(`
    UPDATE story_runs
    SET
      status = 'cancelled',
      cancelled_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status IN ('active', 'paused')
  `)
    .bind(storyRunId)
    .run();
}