import { FormError, FormErrorType, FormErrorSeverity } from './exerciseDetector';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A coaching message ready to display in the UI or speak aloud. */
export interface CoachingMessage {
  /** Human-readable cue, e.g. "Push your knees outward". */
  message: string;
  severity: FormErrorSeverity;
  type: FormErrorType;
}

// ── Coaching cue dictionary ───────────────────────────────────────────────────

/**
 * Maps each error type to a short, actionable coaching sentence.
 * Extend this object to support more exercise errors in the future.
 */
const COACHING_CUES: Record<FormErrorType, string> = {
  KNEE_VALGUS: 'Push your knees outward',
  BAD_BACK:    'Keep your back straight',
};

/**
 * Prefix added before the cue based on severity.
 * Keeps warnings calm and errors more urgent.
 */
const SEVERITY_PREFIX: Record<FormErrorSeverity, string> = {
  warning: 'Watch out — ',
  error:   'Fix now: ',
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Map a single FormError to a CoachingMessage.
 */
export function mapErrorToMessage(error: FormError): CoachingMessage {
  return {
    message:  SEVERITY_PREFIX[error.severity] + COACHING_CUES[error.type],
    severity: error.severity,
    type:     error.type,
  };
}

/**
 * Map an entire errors array to coaching messages.
 * Returns an empty array when there are no errors (good form).
 *
 * @param errors FormError[] from SquatState.errors
 */
export function mapErrorsToMessages(errors: FormError[]): CoachingMessage[] {
  return errors.map(mapErrorToMessage);
}

/**
 * Return a single highest-priority message from the errors array.
 * 'error' severity outranks 'warning'.
 * Returns null when there are no errors — display "Good form!" to the user.
 */
export function getTopMessage(errors: FormError[]): CoachingMessage | null {
  if (errors.length === 0) return null;
  const critical = errors.find((e) => e.severity === 'error');
  return mapErrorToMessage(critical ?? errors[0]);
}
