function parseJson(
  value,
  fallback = {}
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapRaidRun(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,

    inputs_open:
      Boolean(row.inputs_open),

    result:
      parseJson(
        row.result_json,
        {}
      ),
  };
}

function mapRaidEntry(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,

    metadata:
      parseJson(
        row.metadata_json,
        {}
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Raid run reads
|--------------------------------------------------------------------------
*/

export async function getActiveRaidRun(
  env
) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM raid_runs
    WHERE status IN (
      'active',
      'paused'
    )
    ORDER BY id DESC
    LIMIT 1
  `).first();

  return mapRaidRun(row);
}

export async function getRaidRunById(
  env,
  raidRunId
) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM raid_runs
    WHERE id = ?
    LIMIT 1
  `)
    .bind(raidRunId)
    .first();

  return mapRaidRun(row);
}

/*
|--------------------------------------------------------------------------
| Raid creation
|--------------------------------------------------------------------------
*/

export async function createRaidRun(
  env,
  {
    raidKey,
    raidTitle,
    raidVersion = 1,
    startedBy = "admin",
  }
) {
  const result = await env.DB.prepare(`
    INSERT INTO raid_runs (
      raid_key,
      raid_title,
      raid_version,

      status,
      current_encounter_index,
      encounter_status,

      inputs_open,
      attempt_number,
      next_resolve_at,

      outcome,
      result_json,

      started_by,
      started_at,

      encounter_started_at,
      last_resolved_at,

      created_at,
      updated_at
    )
    VALUES (
      ?, ?, ?,

      'active',
      0,
      'waiting',

      0,
      1,
      NULL,

      NULL,
      '{}',

      ?,
      CURRENT_TIMESTAMP,

      NULL,
      NULL,

      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      raidKey,
      raidTitle,
      raidVersion,
      startedBy
    )
    .run();

  return result.meta.last_row_id;
}

/*
|--------------------------------------------------------------------------
| Encounter lifecycle
|--------------------------------------------------------------------------
*/

/**
 * Starts a fresh encounter and immediately opens
 * its first joining window.
 *
 * The engine calculates resolveAt from the encounter's
 * configured joining-window duration.
 */
export async function startEncounterWindow(
  env,
  raidRunId,
  {
    encounterIndex,
    resolveAt,
  }
) {
  const row = await env.DB.prepare(`
    UPDATE raid_runs
    SET
      status = 'active',

      current_encounter_index = ?,
      encounter_status = 'joining',

      inputs_open = 1,
      attempt_number = 1,
      next_resolve_at = ?,

      outcome = NULL,
      result_json = '{}',

      encounter_started_at =
        CURRENT_TIMESTAMP,

      last_resolved_at = NULL,
      paused_at = NULL,

      updated_at =
        CURRENT_TIMESTAMP

    WHERE id = ?
      AND status IN (
        'active',
        'paused'
      )
      AND encounter_status IN (
        'waiting',
        'succeeded'
      )

    RETURNING *
  `)
    .bind(
      encounterIndex,
      resolveAt,
      raidRunId
    )
    .first();

  return mapRaidRun(row);
}

/**
 * Atomically claims one due encounter.
 *
 * Only one cron invocation can change the row from
 * joining to resolving, preventing duplicate results.
 */
export async function claimDueRaidEncounter(
  env
) {
  const row = await env.DB.prepare(`
    UPDATE raid_runs
    SET
      encounter_status = 'resolving',
      inputs_open = 0,
      next_resolve_at = NULL,
      updated_at = CURRENT_TIMESTAMP

    WHERE id = (
      SELECT id
      FROM raid_runs
      WHERE status = 'active'
        AND encounter_status = 'joining'
        AND inputs_open = 1
        AND next_resolve_at IS NOT NULL
        AND datetime(next_resolve_at)
          <= datetime('now')
      ORDER BY next_resolve_at ASC
      LIMIT 1
    )

    RETURNING *
  `).first();

  return mapRaidRun(row);
}

/**
 * Records a failed attempt and opens another
 * joining window.
 *
 * Entries remain attached to the encounter, so all
 * existing participants stay while reinforcements join.
 *
 * Maximum attempts and forced final success are handled
 * by RaidEngine before this function is called.
 */
export async function scheduleEncounterRetry(
  env,
  raidRunId,
  {
    failedAttemptNumber,
    nextResolveAt,
    result = {},
  }
) {
  const row = await env.DB.prepare(`
    UPDATE raid_runs
    SET
      encounter_status = 'joining',
      inputs_open = 1,

      attempt_number =
        attempt_number + 1,

      next_resolve_at = ?,

      outcome = 'failure',
      result_json = ?,

      last_resolved_at =
        CURRENT_TIMESTAMP,

      updated_at =
        CURRENT_TIMESTAMP

    WHERE id = ?
      AND status = 'active'
      AND encounter_status = 'resolving'
      AND attempt_number = ?

    RETURNING *
  `)
    .bind(
      nextResolveAt,
      JSON.stringify(result),
      raidRunId,
      failedAttemptNumber
    )
    .first();

  return mapRaidRun(row);
}

/**
 * Marks the current encounter successful.
 *
 * Story progression does not happen here. The raid
 * remains in stasis until an approved user starts the
 * next encounter.
 */
export async function markEncounterSucceeded(
  env,
  raidRunId,
  {
    resolvedAttemptNumber,
    result = {},
  }
) {
  const row = await env.DB.prepare(`
    UPDATE raid_runs
    SET
      encounter_status = 'succeeded',

      inputs_open = 0,
      next_resolve_at = NULL,

      outcome = 'success',
      result_json = ?,

      last_resolved_at =
        CURRENT_TIMESTAMP,

      updated_at =
        CURRENT_TIMESTAMP

    WHERE id = ?
      AND status = 'active'
      AND encounter_status = 'resolving'
      AND attempt_number = ?

    RETURNING *
  `)
    .bind(
      JSON.stringify(result),
      raidRunId,
      resolvedAttemptNumber
    )
    .first();

  return mapRaidRun(row);
}

/**
 * Marks a claimed encounter as errored.
 *
 * This prevents the cron from attempting the same
 * broken encounter every minute.
 */
export async function markEncounterError(
  env,
  raidRunId,
  {
    result = {},
  } = {}
) {
  const row = await env.DB.prepare(`
    UPDATE raid_runs
    SET
      encounter_status = 'error',
      inputs_open = 0,
      next_resolve_at = NULL,

      outcome = 'error',
      result_json = ?,

      last_resolved_at =
        CURRENT_TIMESTAMP,

      updated_at =
        CURRENT_TIMESTAMP

    WHERE id = ?
      AND encounter_status = 'resolving'

    RETURNING *
  `)
    .bind(
      JSON.stringify(result),
      raidRunId
    )
    .first();

  return mapRaidRun(row);
}

/*
|--------------------------------------------------------------------------
| Pause, resume and completion
|--------------------------------------------------------------------------
*/

export async function pauseRaidRun(
  env,
  raidRunId
) {
  const row = await env.DB.prepare(`
    UPDATE raid_runs
    SET
      status = 'paused',
      paused_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP

    WHERE id = ?
      AND status = 'active'

    RETURNING *
  `)
    .bind(raidRunId)
    .first();

  return mapRaidRun(row);
}

export async function resumeRaidRun(
  env,
  raidRunId
) {
  const row = await env.DB.prepare(`
    UPDATE raid_runs
    SET
      status = 'active',
      paused_at = NULL,
      updated_at = CURRENT_TIMESTAMP

    WHERE id = ?
      AND status = 'paused'

    RETURNING *
  `)
    .bind(raidRunId)
    .first();

  return mapRaidRun(row);
}

export async function completeRaidRun(
  env,
  raidRunId
) {
  const row = await env.DB.prepare(`
    UPDATE raid_runs
    SET
      status = 'completed',

      encounter_status = 'succeeded',
      inputs_open = 0,
      next_resolve_at = NULL,

      completed_at =
        CURRENT_TIMESTAMP,

      updated_at =
        CURRENT_TIMESTAMP

    WHERE id = ?
      AND status IN (
        'active',
        'paused'
      )

    RETURNING *
  `)
    .bind(raidRunId)
    .first();

  return mapRaidRun(row);
}

export async function cancelRaidRun(
  env,
  raidRunId
) {
  const row = await env.DB.prepare(`
    UPDATE raid_runs
    SET
      status = 'cancelled',

      inputs_open = 0,
      next_resolve_at = NULL,

      cancelled_at =
        CURRENT_TIMESTAMP,

      updated_at =
        CURRENT_TIMESTAMP

    WHERE id = ?
      AND status IN (
        'active',
        'paused'
      )

    RETURNING *
  `)
    .bind(raidRunId)
    .first();

  return mapRaidRun(row);
}

/*
|--------------------------------------------------------------------------
| Encounter entries
|--------------------------------------------------------------------------
*/

/**
 * Participants are scoped to:
 *
 * raid_run_id + encounter_index + username
 *
 * They remain joined across all failed attempts.
 */
export async function getRaidEntry(
  env,
  {
    raidRunId,
    encounterIndex,
    username,
  }
) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM raid_entries
    WHERE raid_run_id = ?
      AND encounter_index = ?
      AND username = ?
    LIMIT 1
  `)
    .bind(
      raidRunId,
      encounterIndex,
      username
    )
    .first();

  return mapRaidEntry(row);
}

export async function upsertRaidEntry(
  env,
  {
    raidRunId,
    encounterIndex,
    joinedAttemptNumber,
    username,
    displayName,
    inputKey,
    commandUsed,
    metadata = {},
  }
) {
  const row = await env.DB.prepare(`
    INSERT INTO raid_entries (
      raid_run_id,
      encounter_index,

      username,
      display_name,

      input_key,
      command_used,

      joined_attempt_number,
      metadata_json,

      joined_at,
      updated_at
    )
    VALUES (
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(
      raid_run_id,
      encounter_index,
      username
    )
    DO UPDATE SET
      display_name =
        excluded.display_name,

      input_key =
        excluded.input_key,

      command_used =
        excluded.command_used,

      metadata_json =
        excluded.metadata_json,

      updated_at =
        CURRENT_TIMESTAMP

    RETURNING *
  `)
    .bind(
      raidRunId,
      encounterIndex,

      username,
      displayName,

      inputKey,
      commandUsed,

      joinedAttemptNumber,
      JSON.stringify(metadata)
    )
    .first();

  return mapRaidEntry(row);
}

export async function getRaidEntries(
  env,
  {
    raidRunId,
    encounterIndex,
  }
) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM raid_entries
    WHERE raid_run_id = ?
      AND encounter_index = ?
    ORDER BY joined_at ASC
  `)
    .bind(
      raidRunId,
      encounterIndex
    )
    .all();

  return (result.results ?? []).map(
    mapRaidEntry
  );
}

export async function countRaidEntries(
  env,
  {
    raidRunId,
    encounterIndex,
  }
) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS entry_count
    FROM raid_entries
    WHERE raid_run_id = ?
      AND encounter_index = ?
  `)
    .bind(
      raidRunId,
      encounterIndex
    )
    .first();

  return Number(
    row?.entry_count ?? 0
  );
}

/*
|--------------------------------------------------------------------------
| Raid logs
|--------------------------------------------------------------------------
*/

/**
 * The engine may include dialogue identifiers in data,
 * for example:
 *
 * {
 *   dialogueType: "failure",
 *   dialogueAttempt: 2
 * }
 *
 * The actual written dialogue remains in the raid JSON.
 */
export async function logRaidEvent(
  env,
  {
    raidRunId,
    encounterIndex = null,
    attemptNumber = null,
    eventType,
    actor = null,
    data = {},
  }
) {
  await env.DB.prepare(`
    INSERT INTO raid_logs (
      raid_run_id,
      encounter_index,
      attempt_number,

      event_type,
      actor,
      data_json,

      created_at
    )
    VALUES (
      ?, ?, ?,
      ?, ?, ?,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      raidRunId,
      encounterIndex,
      attemptNumber,

      eventType,
      actor,
      JSON.stringify(data)
    )
    .run();
}