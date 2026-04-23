import * as Speech from 'expo-speech';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpeakOptions {
  /** Speech rate. 1.0 = normal, 0.5 = slower, 1.5 = faster. Defaults to 0.9. */
  rate?: number;
  /** Pitch multiplier. 1.0 = normal. Defaults to 1.0. */
  pitch?: number;
  /**
   * Set to 'elevenlabs' to route audio through the ElevenLabs API instead
   * of the device TTS engine. Requires ELEVENLABS_API_KEY to be configured.
   * Defaults to 'device'.
   */
  provider?: 'device' | 'elevenlabs';
}

// ── Device TTS (expo-speech) ──────────────────────────────────────────────────

/**
 * Speak text using the device's built-in TTS engine via expo-speech.
 * Works offline, no API key required.
 * Automatically stops any currently spoken phrase before starting a new one.
 */
async function speakWithDevice(
  text:  string,
  options: SpeakOptions = {},
): Promise<void> {
  // Stop any phrase that's currently being spoken
  const isSpeaking = await Speech.isSpeakingAsync();
  if (isSpeaking) Speech.stop();

  Speech.speak(text, {
    rate:  options.rate  ?? 0.9,
    pitch: options.pitch ?? 1.0,
  });
}

// ── ElevenLabs TTS (placeholder) ──────────────────────────────────────────────

/**
 * TODO: Replace this placeholder with a real ElevenLabs implementation.
 *
 * Integration steps when you're ready:
 *
 * 1. Install dependencies:
 *      npx expo install expo-av
 *
 * 2. Store your API key securely (never hard-code it):
 *      npx expo install expo-constants
 *      Add EXPO_PUBLIC_ELEVENLABS_API_KEY to your .env file.
 *
 * 3. Replace the body of this function with something like:
 *
 *   const API_KEY  = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
 *   const VOICE_ID = 'your-voice-id-here';
 *
 *   const response = await fetch(
 *     `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
 *     {
 *       method:  'POST',
 *       headers: {
 *         'xi-api-key':    API_KEY,
 *         'Content-Type':  'application/json',
 *       },
 *       body: JSON.stringify({
 *         text,
 *         model_id: 'eleven_monolingual_v1',
 *         voice_settings: { stability: 0.5, similarity_boost: 0.75 },
 *       }),
 *     },
 *   );
 *
 *   const audioBlob = await response.blob();
 *   // Write blob to a temp file, then play with expo-av:
 *   const { sound } = await Audio.Sound.createAsync({ uri: tempFileUri });
 *   await sound.playAsync();
 */
async function speakWithElevenLabs(
  text:    string,
  _options: SpeakOptions = {},
): Promise<void> {
  // Placeholder — falls back to device TTS until you wire in the real API
  console.warn(
    '[ttsService] ElevenLabs provider is not yet configured. ' +
    'Falling back to device TTS. See the TODO in ttsService.ts.',
  );
  await speakWithDevice(text, _options);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * speak
 *
 * Convert a coaching message to speech.
 * Routes to the device TTS engine by default.
 * Pass `provider: 'elevenlabs'` to use the ElevenLabs API once configured.
 *
 * Usage
 * ─────
 *   import { speak } from '../utils/ttsService';
 *
 *   // Inside your onPoseDetected / feedback handler:
 *   speak('Keep your knees pushed outward');
 *
 *   // With options:
 *   speak('Fix now: Keep your back straight', { rate: 0.85, provider: 'device' });
 */
export async function speak(
  text:    string,
  options: SpeakOptions = {},
): Promise<void> {
  if (!text.trim()) return;

  const provider = options.provider ?? 'device';

  if (provider === 'elevenlabs') {
    await speakWithElevenLabs(text, options);
  } else {
    await speakWithDevice(text, options);
  }
}

/**
 * stopSpeaking
 *
 * Immediately stop any speech that is currently playing.
 * Call this when the user pauses the session or navigates away.
 */
export function stopSpeaking(): void {
  Speech.stop();
}
