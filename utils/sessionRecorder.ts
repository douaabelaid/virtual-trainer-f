import { Landmark } from '../pose/PoseWebView';
import { FormError, FormErrorType } from './exerciseDetector';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A single captured frame from one video frame during the set.
 * Recorded ~30 times per second while the user is performing reps.
 */
export interface RecordedFrame {
  /** When this frame was captured (ms since epoch). */
  timestamp: number;
  /** All 33 pose landmarks at this moment. */
  landmarks: Landmark[];
  /** Any form errors detected in this frame (empty = clean form). */
  errors: FormError[];
}

/**
 * A lightweight error event used by the timeline.
 * Derived from RecordedFrame for quick lookup without iterating all frames.
 */
export interface ErrorEvent {
  /** When the error occurred (ms since epoch). */
  timestamp: number;
  /** Which error type was detected. */
  type: FormErrorType;
  /** 'warning' or 'error' severity. */
  severity: FormError['severity'];
}

/** Everything recorded in one set, ready for the review screen. */
export interface SessionData {
  /** All captured frames in chronological order. */
  frames: RecordedFrame[];
  /** Flattened list of every error event — convenient for timeline rendering. */
  errorEvents: ErrorEvent[];
  /** Timestamp of the first recorded frame (ms since epoch). */
  startTime: number;
  /** Timestamp of the last recorded frame (ms since epoch). */
  endTime: number;
  /** Total duration of the set in milliseconds. */
  durationMs: number;
}

// ── Factory function ──────────────────────────────────────────────────────────

/**
 * createSessionRecorder
 *
 * Returns a recorder with three methods:
 *   - addFrame(landmarks, errors) — call every pose frame during the set
 *   - getSession()                — call when the set ends to get full data
 *   - reset()                     — clear all frames to start a new set
 *
 * Usage
 * ─────
 *   const recorder = createSessionRecorder();
 *
 *   // While the user is performing reps (inside onPoseDetected):
 *   recorder.addFrame(landmarks, state.errors);
 *
 *   // When the set finishes (e.g. user taps "Stop"):
 *   const session = recorder.getSession();
 *   navigation.navigate('Review', { session });
 */
export function createSessionRecorder() {
  let frames: RecordedFrame[] = [];

  /**
   * Record one video frame.
   * Snapshots the landmarks and any active errors at this moment in time.
   *
   * @param landmarks - The 33 pose landmarks from the current frame.
   * @param errors    - Active form errors from exerciseDetector.update().
   */
  function addFrame(landmarks: Landmark[], errors: FormError[]): void {
    frames.push({
      timestamp: Date.now(),
      // Shallow-copy the arrays so later frames don't mutate this snapshot
      landmarks: landmarks.map((lm) => ({ ...lm })),
      errors:    errors.map((e)  => ({ ...e  })),
    });
  }

  /**
   * Finalise the session and return all recorded data.
   * Returns null if no frames were recorded yet.
   */
  function getSession(): SessionData | null {
    if (frames.length === 0) return null;

    const startTime = frames[0].timestamp;
    const endTime   = frames[frames.length - 1].timestamp;

    // Flatten all error arrays into a single timeline list
    const errorEvents: ErrorEvent[] = [];
    for (const frame of frames) {
      for (const err of frame.errors) {
        errorEvents.push({
          timestamp: frame.timestamp,
          type:      err.type,
          severity:  err.severity,
        });
      }
    }

    return {
      frames,
      errorEvents,
      startTime,
      endTime,
      durationMs: endTime - startTime,
    };
  }

  /** Clear all recorded frames so a new set can begin. */
  function reset(): void {
    frames = [];
  }

  return { addFrame, getSession, reset };
}
