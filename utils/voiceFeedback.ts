import * as Speech from 'expo-speech';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpeakOptions {
  /** Playback rate. 1.0 = normal, 0.8 = slower, 1.3 = faster. Defaults to 0.9. */
  rate?: number;
  /** Pitch multiplier. 1.0 = normal. Defaults to 1.0. */
  pitch?: number;
  /** BCP-47 language tag, e.g. 'en-US', 'es-ES'. Defaults to 'en-US'. */
  language?: string;
  /**
   * 'device'      → expo-speech (works offline, no key needed)
   * 'elevenlabs'  → ElevenLabs API (see placeholder below)
   * Defaults to 'device'.
   */
  provider?: 'device' | 'elevenlabs';
}

// ── Device TTS ────────────────────────────────────────────────────────────────

/** Speak using the device's built-in TTS engine via expo-speech. */
async function speakWithDevice(text: string, opts: SpeakOptions): Promise<void> {
  // Stop any currently running speech before starting a new phrase
  const speaking = await Speech.isSpeakingAsync();
  if (speaking) Speech.stop();

  Speech.speak(text, {
    rate:     opts.rate     ?? 0.9,
    pitch:    opts.pitch    ?? 1.0,
    language: opts.language ?? 'en-US',
  });
}

// ── ElevenLabs placeholder ────────────────────────────────────────────────────

/**
 * TODO: Replace this function body with the real ElevenLabs integration.
 *
 * Steps when you're ready:
 * 1. Install:   npx expo install expo-av expo-file-system
 * 2. Add key:   EXPO_PUBLIC_ELEVENLABS_API_KEY=... to your .env file
 * 3. Replace body with:
 *
 *   const KEY     = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
 *   const VOICE   = 'your-voice-id';
 *   const res = await fetch(
 *     `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`,
 *     {
 *       method: 'POST',
 *       headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1' }),
 *     }
 *   );
 *   const blob = await res.blob();
 *   // write blob → temp file, play with expo-av Audio.Sound
 */
async function speakWithElevenLabs(
  text: string,
  opts: SpeakOptions,
): Promise<void> {
  console.warn(
    '[voiceFeedback] ElevenLabs not yet configured — falling back to device TTS.',
  );
  await speakWithDevice(text, opts);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * speak
 *
 * Convert a coaching text string to speech.
 * Routes to device TTS by default; pass `provider: 'elevenlabs'` for the
 * premium voice once the API key is configured.
 *
 * Usage
 * ─────
 *   import { speak } from '../utils/voiceFeedback';
 *
 *   speak('Push your knees outward');
 *   speak('Fix now: Keep your back straight', { rate: 0.85, language: 'en-US' });
 */
export async function speak(
  text: string,
  opts: SpeakOptions = {},
): Promise<void> {
  if (!text.trim()) return;
  if (opts.provider === 'elevenlabs') {
    await speakWithElevenLabs(text, opts);
  } else {
    await speakWithDevice(text, opts);
  }
}

/**
 * stopSpeaking
 *
 * Immediately halt any ongoing speech.
 * Call this when the user pauses or leaves the workout screen.
 */
export function stopSpeaking(): void {
  Speech.stop();
}
