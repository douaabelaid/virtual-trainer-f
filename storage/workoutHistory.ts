import AsyncStorage from '@react-native-async-storage/async-storage';
import { FormError } from '../exercise/exerciseDetector';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single completed workout set persisted to device storage. */
export interface WorkoutSession {
  /** Unique identifier — ISO timestamp of when the set was saved. */
  id: string;
  /** ISO date string, e.g. "2026-04-15T10:30:00.000Z". */
  date: string;
  /** Exercise performed, e.g. "squat". */
  exerciseType: string;
  /** Total reps completed. */
  reps: number;
  /** All form errors recorded during the set. */
  errors: FormError[];
}

// ── Storage key ───────────────────────────────────────────────────────────────

const STORAGE_KEY = '@virtual_trainer_workouts';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * saveWorkout
 *
 * Append a new workout session to the device's AsyncStorage.
 * Existing sessions are preserved; this always adds to the list.
 *
 * @param session The completed workout session to persist.
 * @throws Will re-throw storage errors — wrap call site in try/catch.
 */
export async function saveWorkout(session: WorkoutSession): Promise<void> {
  // Load the existing list (or start with an empty array)
  const existing = await getWorkouts();
  existing.push(session);

  // Serialize and store safely
  const json = JSON.stringify(existing);
  await AsyncStorage.setItem(STORAGE_KEY, json);
}

/**
 * getWorkouts
 *
 * Retrieve all previously saved workout sessions from device storage.
 * Returns an empty array if nothing has been saved yet.
 *
 * @returns Array of WorkoutSession objects, oldest first.
 */
export async function getWorkouts(): Promise<WorkoutSession[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    // Parse safely — malformed storage returns an empty array
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WorkoutSession[]) : [];
  } catch {
    return [];
  }
}

/**
 * clearWorkouts
 *
 * Remove all saved workout history from the device.
 * Use with caution — this is irreversible.
 */
export async function clearWorkouts(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * buildSession
 *
 * Convenience helper to construct a WorkoutSession from the fields
 * available at the end of a set.
 */
export function buildSession(
  exerciseType: string,
  reps: number,
  errors: FormError[],
): WorkoutSession {
  const now = new Date().toISOString();
  return { id: now, date: now, exerciseType, reps, errors };
}
