export async function handleSound(env, url) {
  const key = url.searchParams.get("key");

  if (!key) {
    return new Response("Missing sound key", { status: 400 });
  }

  const object = await env.GOBBO_ASSETS.get(key);

  if (!object) {
    return new Response("Sound not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type":
        object.httpMetadata?.contentType || "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}