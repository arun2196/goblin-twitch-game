const DEFAULT_MODEL_ID = "eleven_flash_v2_5";

export async function generateGobboSpeech(env, text, options = {}) {
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    throw new Error("No text provided for Gobbo speech");
  }

  const voiceId = options.voiceId || env.ELEVENLABS_VOICE_ID;
  const modelId = options.modelId || DEFAULT_MODEL_ID;

  if (!env.ELEVENLABS_API_KEY) {
    throw new Error("Missing ELEVENLABS_API_KEY secret.");
  }

  if (!voiceId) {
    throw new Error("Missing ElevenLabs voice ID.");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: modelId,
        voice_settings: {
          stability: options.stability ?? 0.4,
          similarity_boost: options.similarityBoost ?? 0.75,
          style: options.style ?? 0.3,
          use_speaker_boost: options.useSpeakerBoost ?? true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs error ${response.status}: ${errorText}`);
  }

  return await response.arrayBuffer();
}