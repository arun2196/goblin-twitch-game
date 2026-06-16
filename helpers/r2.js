export async function uploadAudioToR2(env, audioBuffer, prefix = "gobbo") {
  const key = `${prefix}/${Date.now()}-${crypto.randomUUID()}.mp3`;

  await env.GOBBO_ASSETS.put(key, audioBuffer, {
    httpMetadata: {
      contentType: "audio/mpeg",
    },
  });

  return key;
}