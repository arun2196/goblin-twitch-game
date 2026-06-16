import { GOBBO_VOICE_ENABLED } from "./config.js";
import { generateGobboSpeech } from "./gobboVoice.js";
import { uploadAudioToR2 } from "./r2.js";

export async function createGobboAudio(
  env,
  origin,
  text,
  options = {}
) {
  if (!GOBBO_VOICE_ENABLED) {
    return null;
  }

  const audioBuffer = await generateGobboSpeech(
    env,
    text,
    options
  );

  const key = await uploadAudioToR2(
    env,
    audioBuffer,
    "gobbo-voice"
  );

  return {
    key,
    audioUrl: `${origin}/sound?key=${encodeURIComponent(key)}`,
  };
}