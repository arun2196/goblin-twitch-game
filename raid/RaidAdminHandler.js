import {
  announceEncounter,
  cancelRaid,
  closeEncounterInputs,
  getRaidStatus,
  nextEncounter,
  openEncounterInputs,
  pauseRaid,
  resolveCurrentEncounter,
  resumeRaid,
  retryEncounter,
  startRaid,
} from "./RaidEngine.js";

function isAdminAuthorised(
  request,
  env
) {
  if (!env.RAID_ADMIN_SECRET) {
    return false;
  }

  const auth =
    request.headers.get("Authorization");

  return auth ===
    `Bearer ${env.RAID_ADMIN_SECRET}`;
}

export async function handleRaidAdmin(
  request,
  env,
  url
) {
  if (!isAdminAuthorised(request, env)) {
    return Response.json(
      {
        ok: false,
        message: "Unauthorized.",
      },
      {
        status: 401,
      }
    );
  }

  const action = url.pathname
    .replace("/raid-admin/", "")
    .trim()
    .toLowerCase();

  const actor =
    request.headers.get("X-Raid-Actor") ||
    "admin";

  let result;

  switch (action) {
    case "start":
      result = await startRaid(
        env,
        url.searchParams.get("raid"),
        actor
      );
      break;

    case "announce":
      result = await announceEncounter(
        env,
        actor
      );
      break;

    case "open":
      result = await openEncounterInputs(
        env,
        actor
      );
      break;

    case "close":
      result = await closeEncounterInputs(
        env,
        actor
      );
      break;

    case "resolve":
      result =
        await resolveCurrentEncounter(
          env,
          actor
        );
      break;

    case "next":
      result = await nextEncounter(
        env,
        actor
      );
      break;

    case "retry":
      result = await retryEncounter(
        env,
        actor
      );
      break;

    case "pause":
      result = await pauseRaid(
        env,
        actor
      );
      break;

    case "resume":
      result = await resumeRaid(
        env,
        actor
      );
      break;

    case "cancel":
      result = await cancelRaid(
        env,
        actor
      );
      break;

    case "status":
      result = await getRaidStatus(env);
      break;

    default:
      return Response.json(
        {
          ok: false,
          message:
            `Unknown raid admin action: ${action}`,
        },
        {
          status: 404,
        }
      );
  }

  return Response.json(
    result,
    {
      status: result.ok ? 200 : 400,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}