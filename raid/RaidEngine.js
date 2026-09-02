import season3Finale from "./raids/season-3-finale.json";
import {
  getOrCreatePlayer,
} from "../helpers/players.js";
import {
  cancelRaidRun,
  claimDueRaidEncounter,
  completeRaidRun,
  createRaidRun,
  getActiveRaidRun,
  getRaidEntries,
  getRaidEntry,
  logRaidEvent,
  markEncounterError,
  markEncounterSucceeded,
  pauseRaidRun,
  resumeRaidRun,
  scheduleEncounterRetry,
  startEncounterWindow,
  upsertRaidEntry,
} from "./RaidRepository.js";

/*
|--------------------------------------------------------------------------
| Raid registry
|--------------------------------------------------------------------------
|
| Add each raid JSON import here.
|
*/

const RAID_REGISTRY = new Map([
  [
    season3Finale.key.toLowerCase(),
    season3Finale,
  ],
]);

/*
|--------------------------------------------------------------------------
| Utilities
|--------------------------------------------------------------------------
*/

function normaliseCommand(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^!+/, "");
}

function normaliseUsername(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normaliseAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function getRaidDefinition(raidKey) {
  const cleanKey = String(raidKey ?? "")
    .trim()
    .toLowerCase();

  return RAID_REGISTRY.get(cleanKey) ?? null;
}

function getCurrentEncounter(
  raid,
  raidRun
) {
  return (
    raid.encounters?.[
      Number(
        raidRun.current_encounter_index
      )
    ] ?? null
  );
}

function getInputByCommand(
  encounter,
  command
) {
  const cleanCommand =
    normaliseCommand(command);

  return (
    encounter.inputs?.find(
      (input) =>
        normaliseCommand(input.command) ===
        cleanCommand
    ) ?? null
  );
}

function addMinutes(
  timestamp,
  minutes
) {
  const date = timestamp
    ? new Date(timestamp)
    : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Invalid timestamp: ${timestamp}`
    );
  }

  date.setUTCMinutes(
    date.getUTCMinutes() +
    Number(minutes)
  );

  return date.toISOString();
}

function getJoinWindowMinutes(
  encounter
) {
  const configured =
    Number(
      encounter.timing?.joinMinutes
    );

  if (
    Number.isFinite(configured) &&
    configured >= 0
  ) {
    return configured;
  }

  return 10;
}

function getMaximumAttempts(
  encounter
) {
  const configured =
    Number(
      encounter.timing
        ?.maximumAttempts
    );

  if (
    Number.isInteger(configured) &&
    configured >= 1
  ) {
    return configured;
  }

  return 5;
}

function shouldForceFinalSuccess(
  encounter
) {
  return (
    encounter.timing
      ?.forceSuccessOnFinalAttempt !==
    false
  );
}

function getAttemptNarration(
  encounter,
  attemptNumber,
  outcome
) {
  const attemptNarration =
    encounter.narration
      ?.attempts?.[
        String(attemptNumber)
      ];

  const exactMessage =
    attemptNarration?.[outcome];

  if (
    typeof exactMessage === "string" &&
    exactMessage.trim()
  ) {
    return exactMessage.trim();
  }

  const generalMessage =
    encounter.narration?.[outcome];

  if (
    typeof generalMessage === "string" &&
    generalMessage.trim()
  ) {
    return generalMessage.trim();
  }

  return (
    `Encounter result: ${outcome}.`
  );
}

function buildEncounterOpeningMessage(
  encounter
) {
  const parts = [];

  if (encounter.narration?.intro) {
    parts.push(
      encounter.narration.intro
    );
  }

  const joiningMessage =
    encounter.narration?.join ??
    encounter.narration?.inputsOpen;

  if (joiningMessage) {
    parts.push(joiningMessage);
  }

  return parts
    .filter(Boolean)
    .join(" ");
}

/*
|--------------------------------------------------------------------------
| Raid messaging
|--------------------------------------------------------------------------
|
| This uses the same Twitch chat/messages API setup as the rest
| of your Worker.
|
*/

async function sendRaidMessage(
  env,
  message
) {
  const cleanMessage =
    String(message ?? "").trim();

  if (!cleanMessage) {
    return false;
  }

  /*
   * Keep cron resolution from failing completely if Twitch
   * credentials are missing during development.
   */
  const requiredValues = [
    env.TWITCH_CHAT_TOKEN,
    env.TWITCH_CHAT_CLIENT_ID,
    env.TWITCH_BROADCASTER_ID,
    env.TWITCH_SENDER_ID,
  ];

  if (
    requiredValues.some(
      (value) => !value
    )
  ) {
    console.warn(
      "[Story Weaver] Twitch credentials missing. Message:",
      cleanMessage
    );

    return false;
  }

  const response = await fetch(
    "https://api.twitch.tv/helix/chat/messages",
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${env.TWITCH_CHAT_TOKEN}`,

        "Client-Id":
          env.TWITCH_CHAT_CLIENT_ID,

        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        broadcaster_id:
          env.TWITCH_BROADCASTER_ID,

        sender_id:
          env.TWITCH_SENDER_ID,

        message:
          cleanMessage.slice(0, 490),
      }),
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    console.error(
      "[Story Weaver] Twitch message failed:",
      response.status,
      responseText
    );

    return false;
  }

  console.log(
    "[Story Weaver] Twitch message sent:",
    cleanMessage
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| Approved raid controllers
|--------------------------------------------------------------------------
*/

function getApprovedRaidAdmins(env) {
  return new Set(
    String(env.RAID_ADMINS ?? "")
      .split(",")
      .map(normaliseUsername)
      .filter(Boolean)
  );
}

function isApprovedRaidAdmin(
  env,
  username
) {
  const cleanUsername =
    normaliseUsername(username);

  if (!cleanUsername) {
    return false;
  }

  return getApprovedRaidAdmins(env)
    .has(cleanUsername);
}

const UNAUTHORISED_MESSAGES = [
  "A tiny goblin guard slaps your hand away from the Story Weaver controls.",
  "Story Weaver checks the guest list. You are listed under: absolutely not.",
  "You pull the raid lever. It produces one disappointed honk.",
  "The Story Weaver recognises no authority in you. Bold attempt, though.",
  "A parchment appears: ACCESS DENIED. NICE TRY, GOBBO.",
];

function getUnauthorisedMessage() {
  return UNAUTHORISED_MESSAGES[
    Math.floor(
      Math.random() *
      UNAUTHORISED_MESSAGES.length
    )
  ];
}

/*
|--------------------------------------------------------------------------
| Validation
|--------------------------------------------------------------------------
*/

function validateEncounterNarration(
  encounter
) {
  const maximumAttempts =
    getMaximumAttempts(encounter);

  if (
    shouldForceFinalSuccess(
      encounter
    )
  ) {
    for (
      let attempt = 1;
      attempt < maximumAttempts;
      attempt++
    ) {
      const failure =
        encounter.narration
          ?.attempts?.[
            String(attempt)
          ]?.failure;

      if (
        typeof failure !== "string" ||
        !failure.trim()
      ) {
        throw new Error(
          `Encounter "${encounter.key}" is missing failure narration for attempt ${attempt}.`
        );
      }
    }

    const finalSuccess =
      encounter.narration
        ?.attempts?.[
          String(maximumAttempts)
        ]?.success;

    if (
      typeof finalSuccess !== "string" ||
      !finalSuccess.trim()
    ) {
      throw new Error(
        `Encounter "${encounter.key}" is missing success narration for final attempt ${maximumAttempts}.`
      );
    }
  }
}

function validateRaidDefinition(raid) {
  if (!raid || typeof raid !== "object") {
    throw new Error(
      "Raid definition must be an object."
    );
  }

  if (!raid.key) {
    throw new Error(
      "Raid definition has no key."
    );
  }

  if (!raid.title) {
    throw new Error(
      `Raid "${raid.key}" has no title.`
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

  const encounterKeys =
    new Set();

  for (
    let encounterIndex = 0;
    encounterIndex <
      raid.encounters.length;
    encounterIndex++
  ) {
    const encounter =
      raid.encounters[
        encounterIndex
      ];

    if (!encounter.key) {
      throw new Error(
        `Encounter ${encounterIndex + 1} has no key.`
      );
    }

    if (!encounter.title) {
      throw new Error(
        `Encounter "${encounter.key}" has no title.`
      );
    }

    if (!encounter.type) {
      throw new Error(
        `Encounter "${encounter.key}" has no type.`
      );
    }

    if (
      encounterKeys.has(
        encounter.key
      )
    ) {
      throw new Error(
        `Duplicate encounter key: ${encounter.key}`
      );
    }

    encounterKeys.add(
      encounter.key
    );

    const inputKeys =
      new Set();

    const inputCommands =
      new Set();

    for (
      const input of
        encounter.inputs ?? []
    ) {
      const command =
        normaliseCommand(
          input.command
        );

      if (!input.key) {
        throw new Error(
          `An input in "${encounter.key}" has no key.`
        );
      }

      if (!command) {
        throw new Error(
          `Input "${input.key}" in "${encounter.key}" has no command.`
        );
      }

      if (
        inputKeys.has(input.key)
      ) {
        throw new Error(
          `Duplicate input key "${input.key}" in "${encounter.key}".`
        );
      }

      if (
        inputCommands.has(command)
      ) {
        throw new Error(
          `Duplicate command "!${command}" in "${encounter.key}".`
        );
      }

            inputKeys.add(input.key);
            inputCommands.add(command);
          }

          if (encounter.type === "free-text") {
            const acceptedAnswers =
              encounter.mechanics
                ?.acceptedAnswers;

            if (
              !Array.isArray(acceptedAnswers) ||
              acceptedAnswers.length === 0
            ) {
              throw new Error(
                `Free-text encounter "${encounter.key}" must define mechanics.acceptedAnswers.`
              );
            }

            const normalisedAnswers =
              acceptedAnswers
                .map(normaliseAnswer)
                .filter(Boolean);

            if (normalisedAnswers.length === 0) {
              throw new Error(
                `Free-text encounter "${encounter.key}" has no usable accepted answers.`
              );
            }
          }

          validateEncounterNarration(
            encounter
          );
  }

  return true;
}

/*
|--------------------------------------------------------------------------
| Temporary encounter resolvers
|--------------------------------------------------------------------------
|
| We can move each raid's calculations into its own resolver
| file later. These keep the current test raid functional.
|
*/

function rollDie(sides) {
  const safeSides = Math.max(
    1,
    Number.parseInt(sides, 10) || 1
  );

  return (
    Math.floor(
      Math.random() * safeSides
    ) + 1
  );
}

function rollDice(count, sides) {
  const safeCount = Math.max(
    0,
    Number.parseInt(count, 10) || 0
  );

  const rolls = [];

  for (
    let index = 0;
    index < safeCount;
    index++
  ) {
    rolls.push(
      rollDie(sides)
    );
  }

  return {
    rolls,

    total: rolls.reduce(
      (sum, roll) => sum + roll,
      0
    ),
  };
}

function countEntriesByInput(
  entries
) {
  const counts = {};

  for (const entry of entries) {
    counts[entry.input_key] =
      (
        counts[
          entry.input_key
        ] ?? 0
      ) + 1;
  }

  return counts;
}

function resolveMajorityChoice(
  encounter,
  entries
) {
  const counts =
    countEntriesByInput(entries);

  let highestCount = -1;
  let winningInputs = [];

  for (
    const input of
      encounter.inputs ?? []
  ) {
    const count =
      counts[input.key] ?? 0;

    if (count > highestCount) {
      highestCount = count;
      winningInputs = [
        input.key,
      ];

      continue;
    }

    if (count === highestCount) {
      winningInputs.push(
        input.key
      );
    }
  }

  const winningInput =
    winningInputs.length
      ? winningInputs[
          Math.floor(
            Math.random() *
            winningInputs.length
          )
        ]
      : null;

  const requiredInput =
    encounter.mechanics
      ?.winningInput;

  const success =
    requiredInput
      ? winningInput ===
        requiredInput
      : winningInput !== null;

  return {
    outcome:
      success
        ? "success"
        : "failure",

    result: {
      resolver:
        "majority-choice",

      participantCount:
        entries.length,

      counts,
      winningInput,

      requiredInput:
        requiredInput ?? null,
    },
  };
}

function resolveGroupRoll(
  encounter,
  entries,
  attemptNumber
) {
  const mechanics =
    encounter.mechanics ?? {};

  const participantCount =
    entries.length;

  const playerSides =
    mechanics.playerSides ?? 10;

  const enemySides =
    mechanics.enemySides ?? 10;

  const enemyDiceOffset =
    mechanics.enemyDiceOffset ?? 0;

  const retryPlayerBonus =
    Number(
      mechanics.retryPlayerBonus ?? 0
    );

  const playerDiceCount =
    Math.max(
      1,
      participantCount
    );

  const enemyDiceCount =
    Math.max(
      1,
      participantCount +
        enemyDiceOffset
    );

  const playerRoll =
    rollDice(
      playerDiceCount,
      playerSides
    );

  const enemyRoll =
    rollDice(
      enemyDiceCount,
      enemySides
    );

  const retryBonus =
    Math.max(
      0,
      attemptNumber - 1
    ) * retryPlayerBonus;

  const playerBonus =
    Number(
      mechanics.flatPlayerBonus ?? 0
    ) + retryBonus;

  const enemyBonus =
    Number(
      mechanics.flatEnemyBonus ?? 0
    );

  const playerTotal =
    playerRoll.total +
    playerBonus;

  const enemyTotal =
    enemyRoll.total +
    enemyBonus;

  const success =
    mechanics.tiesWin === false
      ? playerTotal > enemyTotal
      : playerTotal >= enemyTotal;

  return {
    outcome:
      success
        ? "success"
        : "failure",

    result: {
      resolver: "group-roll",
      participantCount,
      attemptNumber,

      playerDiceCount,
      enemyDiceCount,

      playerRolls:
        playerRoll.rolls,

      enemyRolls:
        enemyRoll.rolls,

      playerBonus,
      enemyBonus,
      retryBonus,

      playerTotal,
      enemyTotal,
    },
  };
}

function resolveParticipation(
  encounter,
  entries
) {
  const requiredParticipants =
    Number(
      encounter.mechanics
        ?.requiredParticipants ?? 1
    );

  const success =
    entries.length >=
    requiredParticipants;

  return {
    outcome:
      success
        ? "success"
        : "failure",

    result: {
      resolver:
        "participation",

      participantCount:
        entries.length,

      requiredParticipants,
    },
  };
}

function resolveFreeText(
  encounter,
  entries
) {
  const mechanics =
    encounter.mechanics ?? {};

  const acceptedAnswers =
    new Set(
      (mechanics.acceptedAnswers ?? [])
        .map(normaliseAnswer)
        .filter(Boolean)
    );

  const requiredCorrectAnswers =
    Math.max(
      1,
      Number.parseInt(
        mechanics.requiredCorrectAnswers,
        10
      ) || 1
    );

  const correctEntries =
    entries.filter((entry) => {
      const answer =
        normaliseAnswer(
          entry.metadata?.answer
        );

      return (
        answer &&
        acceptedAnswers.has(answer)
      );
    });

  const success =
    correctEntries.length >=
    requiredCorrectAnswers;

  return {
    outcome:
      success
        ? "success"
        : "failure",

    result: {
      resolver: "free-text",

      participantCount:
        entries.length,

      correctCount:
        correctEntries.length,

      requiredCorrectAnswers,

      correctUsernames:
        correctEntries.map(
          (entry) => entry.username
        ),

      correctDisplayNames:
        correctEntries.map(
          (entry) =>
            entry.display_name ||
            entry.username
        ),
    },
  };
}

function resolveEncounter(
  encounter,
  entries,
  attemptNumber
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
        entries,
        attemptNumber
      );

    case "participation":
      return resolveParticipation(
        encounter,
        entries
      );

    case "free-text":
      return resolveFreeText(
        encounter,
        entries
      );

    default:
      throw new Error(
        `Unsupported encounter type: ${encounter.type}`
      );
  }
}

/*
|--------------------------------------------------------------------------
| Active raid context
|--------------------------------------------------------------------------
*/

async function getActiveRaidContext(
  env
) {
  const raidRun =
    await getActiveRaidRun(env);

  if (!raidRun) {
    return {
      raidRun: null,
      raid: null,
      encounter: null,
    };
  }

  const raid =
    getRaidDefinition(
      raidRun.raid_key
    );

  if (!raid) {
    throw new Error(
      `Raid definition "${raidRun.raid_key}" is missing from RaidEngine.js.`
    );
  }

  const encounter =
    getCurrentEncounter(
      raid,
      raidRun
    );

  return {
    raidRun,
    raid,
    encounter,
  };
}

/*
|--------------------------------------------------------------------------
| Start raid / start next encounter
|--------------------------------------------------------------------------
*/

export async function startRaidEncounter(
  env,
  raidKey,
  actor = "admin"
) {
  let raidRun =
    await getActiveRaidRun(env);

  let raid;
  let encounterIndex;

  /*
   * No active story: create it using the supplied raid key.
   */
  if (!raidRun) {
    raid =
      getRaidDefinition(raidKey);

    if (!raid) {
      return {
        ok: false,
        message:
          `Raid "${raidKey}" was not found.`,
      };
    }

    validateRaidDefinition(raid);

    const raidRunId =
      await createRaidRun(env, {
        raidKey: raid.key,
        raidTitle: raid.title,
        raidVersion:
          raid.version ?? 1,
        startedBy: actor,
      });

    raidRun = {
      id: raidRunId,
      current_encounter_index: 0,
      encounter_status:
        "waiting",
      status: "active",
    };

    encounterIndex = 0;

    await logRaidEvent(env, {
      raidRunId,
      encounterIndex: 0,
      attemptNumber: 1,
      eventType:
        "raid_started",
      actor,
      data: {
        raidKey: raid.key,
        title: raid.title,
        version:
          raid.version ?? 1,
      },
    });
  } else {
    raid =
      getRaidDefinition(
        raidRun.raid_key
      );

    if (!raid) {
      return {
        ok: false,
        message:
          `Raid definition "${raidRun.raid_key}" could not be found.`,
      };
    }

    if (
      raidRun.status === "paused"
    ) {
      return {
        ok: false,
        message:
          "The raid is paused.",
      };
    }

    if (
      raidRun.encounter_status ===
        "joining" ||
      raidRun.encounter_status ===
        "resolving"
    ) {
      return {
        ok: false,
        message:
          `${raidRun.raid_title} is already busy with an encounter.`,
      };
    }

    if (
      raidRun.encounter_status ===
      "error"
    ) {
      return {
        ok: false,
        message:
          "Story Weaver has encountered an error. Cancel or repair the raid before continuing.",
      };
    }

    if (
      raidRun.encounter_status ===
      "succeeded"
    ) {
      encounterIndex =
        Number(
          raidRun
            .current_encounter_index
        ) + 1;
    } else {
      encounterIndex =
        Number(
          raidRun
            .current_encounter_index
        );
    }
  }

  const encounter =
    raid.encounters[
      encounterIndex
    ];

  if (!encounter) {
    await completeRaidRun(
      env,
      raidRun.id
    );

    await logRaidEvent(env, {
      raidRunId: raidRun.id,
      eventType:
        "raid_completed",
      actor,
    });

    const message =
      `${raid.title} has been completed.`;

    await sendRaidMessage(
      env,
      message
    );

    return {
      ok: true,
      completed: true,
      message,
    };
  }

  const joinMinutes =
    getJoinWindowMinutes(
      encounter
    );

  const resolveAt =
    addMinutes(
      new Date(),
      joinMinutes
    );

  const updatedRun =
    await startEncounterWindow(
      env,
      raidRun.id,
      {
        encounterIndex,
        resolveAt,
      }
    );

  if (!updatedRun) {
    return {
      ok: false,
      message:
        "Story Weaver could not start this encounter because its state changed.",
    };
  }

  const message =
    buildEncounterOpeningMessage(
      encounter
    );

  await logRaidEvent(env, {
    raidRunId: raidRun.id,
    encounterIndex,
    attemptNumber: 1,
    eventType:
      "encounter_started",
    actor,
    data: {
      encounterKey:
        encounter.key,

      joinMinutes,
      resolveAt,
    },
  });

  await sendRaidMessage(
    env,
    message
  );

  return {
    ok: true,
    raidRunId: raidRun.id,
    encounterIndex,
    resolveAt,
    message,
  };
}

/*
|--------------------------------------------------------------------------
| Automatic cron resolution
|--------------------------------------------------------------------------
*/

export async function processDueRaidEncounter(
  env
) {
  const claimedRun =
    await claimDueRaidEncounter(
      env
    );

  if (!claimedRun) {
    console.log(
      "[Story Weaver Cron] No raid encounter is due."
    );

    return;
  }

  const raid =
    getRaidDefinition(
      claimedRun.raid_key
    );

  if (!raid) {
    await markEncounterError(
      env,
      claimedRun.id,
      {
        result: {
          reason:
            "missing_raid_definition",
        },
      }
    );

    console.error(
      `[Story Weaver Cron] Missing raid definition: ${claimedRun.raid_key}`
    );

    return;
  }

  const encounter =
    getCurrentEncounter(
      raid,
      claimedRun
    );

  if (!encounter) {
    await markEncounterError(
      env,
      claimedRun.id,
      {
        result: {
          reason:
            "missing_encounter",
        },
      }
    );

    console.error(
      "[Story Weaver Cron] Current encounter does not exist."
    );

    return;
  }

  const attemptNumber =
    Number(
      claimedRun.attempt_number
    );

  try {
    const entries =
      await getRaidEntries(
        env,
        {
          raidRunId:
            claimedRun.id,

          encounterIndex:
            claimedRun
              .current_encounter_index,
        }
      );

    const maximumAttempts =
      getMaximumAttempts(
        encounter
      );

    const forcedSuccess =
      shouldForceFinalSuccess(
        encounter
      ) &&
      attemptNumber >=
        maximumAttempts;

    let resolution;

    if (forcedSuccess) {
      const underlyingResolution =
        resolveEncounter(
          encounter,
          entries,
          attemptNumber
        );

      resolution = {
        outcome: "success",

        result: {
          ...underlyingResolution.result,

          forcedSuccess: true,

          originalOutcome:
            underlyingResolution.outcome,

          attemptNumber,
        },
      };
    } else {
      resolution =
        resolveEncounter(
          encounter,
          entries,
          attemptNumber
        );
    }

    if (
      resolution.outcome ===
      "success"
    ) {
      const updatedRun =
        await markEncounterSucceeded(
          env,
          claimedRun.id,
          {
            resolvedAttemptNumber:
              attemptNumber,

            result:
              resolution.result,
          }
        );

      if (!updatedRun) {
        console.warn(
          "[Story Weaver Cron] Success result was stale and was not saved."
        );

        return;
      }

      const rewardResult =
        await awardRaidEncounterGold(
          env,
          encounter,
          entries,
          resolution
        );

      const message =
        getAttemptNarration(
          encounter,
          attemptNumber,
          "success"
        );

      await logRaidEvent(env, {
        raidRunId:
          claimedRun.id,

        encounterIndex:
          claimedRun
            .current_encounter_index,

        attemptNumber,

        eventType:
          "encounter_succeeded",

        actor:
          "story-weaver-cron",

        data: {
          forcedSuccess,
          result:
            resolution.result,

          dialogueType:
            "success",

          dialogueAttempt:
            attemptNumber,
        },
      });

      await sendRaidMessage(
        env,
        message
      );

      return;
    }

    const joinMinutes =
      getJoinWindowMinutes(
        encounter
      );

    const nextResolveAt =
      addMinutes(
        new Date(),
        joinMinutes
      );

    const updatedRun =
      await scheduleEncounterRetry(
        env,
        claimedRun.id,
        {
          failedAttemptNumber:
            attemptNumber,

          nextResolveAt,

          result:
            resolution.result,
        }
      );

    if (!updatedRun) {
      console.warn(
        "[Story Weaver Cron] Failure result was stale and was not saved."
      );

      return;
    }

    const failureMessage =
      getAttemptNarration(
        encounter,
        attemptNumber,
        "failure"
      );

    const retryMessage =
      encounter.narration
        ?.retry ??
      `Reinforcements have ${joinMinutes} minutes to join before attempt ${attemptNumber + 1}.`;

    const combinedMessage =
      `${failureMessage} ${retryMessage}`
        .trim();

    await logRaidEvent(env, {
      raidRunId:
        claimedRun.id,

      encounterIndex:
        claimedRun
          .current_encounter_index,

      attemptNumber,

      eventType:
        "encounter_failed",

      actor:
        "story-weaver-cron",

      data: {
        result:
          resolution.result,

        nextAttemptNumber:
          attemptNumber + 1,

        nextResolveAt,

        dialogueType:
          "failure",

        dialogueAttempt:
          attemptNumber,
      },
    });

    await sendRaidMessage(
      env,
      combinedMessage
    );
  } catch (error) {
    console.error(
      "[Story Weaver Cron] Resolution failed:",
      error?.stack ||
      error?.message ||
      error
    );

    await markEncounterError(
      env,
      claimedRun.id,
      {
        result: {
          reason:
            "resolution_exception",

          message:
            error?.message ??
            "Unknown resolution error",
        },
      }
    );

    await logRaidEvent(env, {
      raidRunId:
        claimedRun.id,

      encounterIndex:
        claimedRun
          .current_encounter_index,

      attemptNumber,

      eventType:
        "encounter_error",

      actor:
        "story-weaver-cron",

      data: {
        message:
          error?.message ??
          "Unknown resolution error",
      },
    });
  }
}

/*
|--------------------------------------------------------------------------
| Player command handling
|--------------------------------------------------------------------------
*/

export async function handleRaidCommand({
  env,
  command,
  argument = "",
  username,
  displayName,
}) {
  const cleanCommand =
    normaliseCommand(command);

  if (!cleanCommand) {
    return {
      handled: false,
    };
  }

  const context =
    await getActiveRaidContext(
      env
    );

  if (
    !context.raidRun ||
    !context.encounter
  ) {
    return {
      handled: false,
    };
  }

  const input =
    getInputByCommand(
      context.encounter,
      cleanCommand
    );

  if (!input) {
    return {
      handled: false,
    };
  }

  if (
    context.raidRun.status ===
    "paused"
  ) {
    return {
      handled: true,
      ok: false,
      message:
        "The raid is currently paused.",
    };
  }

  if (
    context.raidRun
      .encounter_status !==
      "joining" ||
    !context.raidRun.inputs_open
  ) {
    return {
      handled: true,
      ok: false,
      message:
        "This encounter is not accepting reinforcements right now.",
    };
  }

  const cleanUsername =
    normaliseUsername(username);

  if (!cleanUsername) {
    return {
      handled: true,
      ok: false,
      message:
        "Story Weaver could not identify you.",
    };
  }

    const safeDisplayName =
      String(
        displayName ||
        cleanUsername
      ).trim();

    const isFreeText =
      context.encounter.type ===
      "free-text";

    let submittedAnswer = "";

    if (isFreeText) {
      const rawAnswer =
        String(argument ?? "").trim();

      if (!rawAnswer) {
        return {
          handled: true,
          ok: false,
          message:
            `${safeDisplayName}, use !${cleanCommand} <one-word answer>.`,
        };
      }

      if (/\s/.test(rawAnswer)) {
        return {
          handled: true,
          ok: false,
          message:
            `${safeDisplayName}, answers must be one word.`,
        };
      }

      submittedAnswer =
        normaliseAnswer(rawAnswer);

      if (!submittedAnswer) {
        return {
          handled: true,
          ok: false,
          message:
            `${safeDisplayName}, that answer could not be recorded.`,
        };
      }
    }

    const existing =
    await getRaidEntry(
      env,
      {
        raidRunId:
          context.raidRun.id,

        encounterIndex:
          context.raidRun
            .current_encounter_index,

        username:
          cleanUsername,
      }
    );

  const allowChoiceChanges =
    context.raid.settings
      ?.allowChoiceChanges !==
    false;

  if (
    existing &&
    existing.input_key !==
      input.key &&
    !allowChoiceChanges
  ) {
    return {
      handled: true,
      ok: false,
      message:
        `${safeDisplayName}, your raid choice is already locked.`,
    };
  }

  await upsertRaidEntry(
    env,
    {
      raidRunId:
        context.raidRun.id,

      encounterIndex:
        context.raidRun
          .current_encounter_index,

      joinedAttemptNumber:
        context.raidRun
          .attempt_number,

      username:
        cleanUsername,

      displayName:
        safeDisplayName,

      inputKey:
        input.key,

      commandUsed:
        cleanCommand,

      metadata:
        isFreeText
          ? {
              answer:
                submittedAnswer,
            }
          : {},
    }
  );

  const previousAnswer =
    normaliseAnswer(
      existing?.metadata?.answer
    );

  const changedAnswer =
    isFreeText &&
    existing &&
    previousAnswer !==
      submittedAnswer;

  const repeatedAnswer =
    isFreeText &&
    existing &&
    previousAnswer ===
      submittedAnswer;

  const changedChoice =
    !isFreeText &&
    existing &&
    existing.input_key !==
      input.key;

  const repeatedChoice =
    !isFreeText &&
    existing &&
    existing.input_key ===
      input.key;

  await logRaidEvent(env, {
    raidRunId:
      context.raidRun.id,

    encounterIndex:
      context.raidRun
        .current_encounter_index,

    attemptNumber:
      context.raidRun
        .attempt_number,

    eventType:
      changedAnswer ||
      changedChoice
        ? "entry_changed"
        : repeatedAnswer ||
            repeatedChoice
          ? "entry_repeated"
          : "entry_joined",

    actor:
      cleanUsername,

    data: {
      inputKey:
        input.key,

      command:
        cleanCommand,

      previousInputKey:
        existing?.input_key ??
        null,

      answer:
        isFreeText
          ? submittedAnswer
          : null,

      previousAnswer:
        isFreeText
          ? previousAnswer || null
          : null,
    },
  });

  if (isFreeText) {
    if (changedAnswer) {
      return {
        handled: true,
        ok: true,
        message:
          `${safeDisplayName} changed their answer.`,
      };
    }

    if (repeatedAnswer) {
      return {
        handled: true,
        ok: true,
        message:
          `${safeDisplayName}, your answer is already recorded.`,
      };
    }

    return {
      handled: true,
      ok: true,
      message:
        `${safeDisplayName}'s answer has been recorded.`,
    };
  }

  if (changedChoice) {
    return {
      handled: true,
      ok: true,
      message:
        `${safeDisplayName} changed their choice to ${input.label ?? input.key}.`,
    };
  }

  if (repeatedChoice) {
    return {
      handled: true,
      ok: true,
      message:
        `${safeDisplayName} is already part of this encounter.`,
    };
  }

  return {
    handled: true,
    ok: true,
    message:
      `${safeDisplayName} joined: ${input.label ?? input.key}.`,
  };
}

/*
|--------------------------------------------------------------------------
| Other raid controls
|--------------------------------------------------------------------------
*/

export async function pauseRaid(
  env,
  actor = "admin"
) {
  const raidRun =
    await getActiveRaidRun(env);

  if (!raidRun) {
    return {
      ok: false,
      message:
        "There is no active raid.",
    };
  }

  if (
    raidRun.status === "paused"
  ) {
    return {
      ok: false,
      message:
        "The raid is already paused.",
    };
  }

  await pauseRaidRun(
    env,
    raidRun.id
  );

  await logRaidEvent(env, {
    raidRunId:
      raidRun.id,

    encounterIndex:
      raidRun
        .current_encounter_index,

    attemptNumber:
      raidRun.attempt_number,

    eventType:
      "raid_paused",

    actor,
  });

  return {
    ok: true,
    message:
      "Story Weaver has paused the raid.",
  };
}

export async function resumeRaid(
  env,
  actor = "admin"
) {
  const raidRun =
    await getActiveRaidRun(env);

  if (!raidRun) {
    return {
      ok: false,
      message:
        "There is no active raid.",
    };
  }

  if (
    raidRun.status !== "paused"
  ) {
    return {
      ok: false,
      message:
        "The raid is not paused.",
    };
  }

  await resumeRaidRun(
    env,
    raidRun.id
  );

  await logRaidEvent(env, {
    raidRunId:
      raidRun.id,

    encounterIndex:
      raidRun
        .current_encounter_index,

    attemptNumber:
      raidRun.attempt_number,

    eventType:
      "raid_resumed",

    actor,
  });

  return {
    ok: true,
    message:
      "Story Weaver has resumed the raid.",
  };
}

export async function cancelRaid(
  env,
  actor = "admin"
) {
  const raidRun =
    await getActiveRaidRun(env);

  if (!raidRun) {
    return {
      ok: false,
      message:
        "There is no active raid.",
    };
  }

  await cancelRaidRun(
    env,
    raidRun.id
  );

  await logRaidEvent(env, {
    raidRunId:
      raidRun.id,

    encounterIndex:
      raidRun
        .current_encounter_index,

    attemptNumber:
      raidRun.attempt_number,

    eventType:
      "raid_cancelled",

    actor,
  });

  return {
    ok: true,
    message:
      "Story Weaver has cancelled the raid.",
  };
}

export async function getRaidStatus(
  env
) {
  const context =
    await getActiveRaidContext(
      env
    );

  if (!context.raidRun) {
    return {
      ok: true,
      active: false,
      message:
        "There is no active raid.",
    };
  }

  const entries =
    await getRaidEntries(
      env,
      {
        raidRunId:
          context.raidRun.id,

        encounterIndex:
          context.raidRun
            .current_encounter_index,
      }
    );

  return {
    ok: true,
    active: true,

    raid: {
      key:
        context.raid.key,

      title:
        context.raid.title,

      version:
        context.raid.version ??
        1,
    },

    run:
      context.raidRun,

    encounter:
      context.encounter,

    entryCount:
      entries.length,

    entries,
  };
}

/*
|--------------------------------------------------------------------------
| Admin endpoint
|--------------------------------------------------------------------------
*/

function hasValidRaidSecret(
  request,
  env,
  url
) {
  const secret =
    env.RAID_ADMIN_SECRET;

  if (!secret) {
    return false;
  }

  const authHeader =
    request.headers.get(
      "Authorization"
    );

  if (
    authHeader ===
    `Bearer ${secret}`
  ) {
    return true;
  }

  return (
    url.searchParams.get("key") ===
    secret
  );
}

export async function handleRaidAdmin(
  request,
  env,
  url
) {
  const action =
    url.pathname
      .replace(
        /^\/raid-admin\/?/,
        ""
      )
      .trim()
      .toLowerCase();

  const actor =
    normaliseUsername(
      url.searchParams.get(
        "username"
      ) ??
      url.searchParams.get(
        "actor"
      ) ??
      request.headers.get(
        "X-Raid-Actor"
      )
    );

  if (
    !hasValidRaidSecret(
      request,
      env,
      url
    )
  ) {
    return new Response(
      "A goblin guard has eaten your counterfeit raid key.",
      {
        status: 401,
        headers: {
          "Content-Type":
            "text/plain; charset=utf-8",
        },
      }
    );
  }

  /*
   * Status can remain secret-protected without requiring
   * the caller to be in the controller list.
   */
  if (
    action !== "status" &&
    !isApprovedRaidAdmin(
      env,
      actor
    )
  ) {
    return new Response(
      getUnauthorisedMessage(),
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/plain; charset=utf-8",
          "Cache-Control":
            "no-store",
        },
      }
    );
  }

  let result;

  switch (action) {
    case "start":
      result =
        await startRaidEncounter(
          env,
          url.searchParams.get(
            "raid"
          ),
          actor
        );
      break;

    case "pause":
      result =
        await pauseRaid(
          env,
          actor
        );
      break;

    case "resume":
      result =
        await resumeRaid(
          env,
          actor
        );
      break;

    case "cancel":
      result =
        await cancelRaid(
          env,
          actor
        );
      break;

    case "status":
      result =
        await getRaidStatus(env);
      break;

    default:
      result = {
        ok: false,
        message:
          `Unknown raid admin action: ${action}`,
      };
      break;
  }

  const responseFormat =
    url.searchParams.get(
      "format"
    );

  if (
    responseFormat === "text"
  ) {
    return new Response(
      result.message || "",
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/plain; charset=utf-8",

          "Cache-Control":
            "no-store",
        },
      }
    );
  }

  return Response.json(
    result,
    {
      status:
        result.ok ? 200 : 400,

      headers: {
        "Cache-Control":
          "no-store",
      },
    }
  );
}

async function awardRaidEncounterGold(
  env,
  encounter,
  entries,
  resolution
) {
  const baseGold =
    Math.max(
      0,
      Number.parseInt(
        encounter.rewards?.successGold,
        10
      ) || 0
    );

  const correctAnswerBonus =
    Math.max(
      0,
      Number.parseInt(
        encounter.rewards
          ?.correctAnswerBonus,
        10
      ) || 0
    );

  /*
   * Exposition encounters and other
   * zero-reward encounters stop here.
   */
  if (
    baseGold <= 0 &&
    correctAnswerBonus <= 0
  ) {
    return {
      rewardedPlayers: 0,
      totalGoldAwarded: 0,
      bonusPlayers: 0,
    };
  }

  if (!entries.length) {
    return {
      rewardedPlayers: 0,
      totalGoldAwarded: 0,
      bonusPlayers: 0,
    };
  }

  /*
   * For free-text encounters, this contains
   * everyone whose FINAL submitted answer
   * was correct when the window closed.
   */
  const correctUsernames =
    new Set(
      resolution?.result
        ?.correctUsernames ?? []
    );

  /*
   * Make sure every participant exists
   * in the normal Gobbo Games player table.
   *
   * This also means someone who has only
   * participated through !raid can still
   * receive their reward.
   */
  for (const entry of entries) {
    await getOrCreatePlayer(
      env,
      entry.username,
      entry.display_name ||
        entry.username
    );
  }

  const statements = [];

  let rewardedPlayers = 0;
  let totalGoldAwarded = 0;
  let bonusPlayers = 0;

  for (const entry of entries) {
    /*
     * Each participant gets their own
     * random Treasury bonus between 5% and 20%.
     */
    const treasuryBonusPercent =
      Math.floor(
        Math.random() * 16
      ) + 5;

    const treasuryBonus =
      baseGold > 0
        ? Math.ceil(
            baseGold *
            (
              treasuryBonusPercent /
              100
            )
          )
        : 0;

    let reward =
      baseGold +
      treasuryBonus;

    /*
     * Correct-answer bonus is added AFTER
     * the random percentage bonus.
     *
     * It is not multiplied.
     */
    const gotCorrectAnswer =
      correctAnswerBonus > 0 &&
      correctUsernames.has(
        entry.username
      );

    if (gotCorrectAnswer) {
      reward +=
        correctAnswerBonus;

      bonusPlayers += 1;
    }

    if (reward <= 0) {
      continue;
    }

    rewardedPlayers += 1;
    totalGoldAwarded += reward;

    statements.push(
      env.DB.prepare(`
        UPDATE players
        SET
          gold = gold + ?,
          total_gold_earned =
            total_gold_earned + ?,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE username = ?
      `).bind(
        reward,
        reward,
        entry.username
      )
    );

    statements.push(
      env.DB.prepare(`
        INSERT INTO transactions (
          username,
          amount,
          reason
        )
        VALUES (?, ?, ?)
      `).bind(
        entry.username,
        reward,
        gotCorrectAnswer
          ? "raid_success_answer_bonus"
          : "raid_success"
      )
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(
      statements
    );
  }

  return {
    rewardedPlayers,
    totalGoldAwarded,
    bonusPlayers,
  };
}