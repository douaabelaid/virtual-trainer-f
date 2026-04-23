import { FormError, FormErrorType, FormErrorSeverity } from './exerciseDetector';

// ── Coaching message maps ─────────────────────────────────────────────────────

/**
 * Primary coaching cue for each error type.
 * Shown regardless of severity — tells the user WHAT to fix.
 */
const MESSAGES: Record<FormErrorType, string> = {
  KNEE_VALGUS: 'Keep your knees pushed outward',
  BAD_BACK:    'Keep your back straight',
};

/**
 * Optional severity prefix prepended to the message.
 * Keeps 'warning' messages calm and 'error' messages more urgent.
 */
const SEVERITY_PREFIX: Record<FormErrorSeverity, string> = {
  warning: 'Watch out: ',
  error:   'Fix now: ',
};

// ── Types ─────────────────────────────────────────────────────────────────────

/** A coaching message ready to display in the UI. */
export interface CoachingMessage {
  /** The full human-readable coaching cue (e.g. "Fix now: Keep your back straight"). */
  message: string;
  /** Mirrors the original error severity so the UI can colour-code the text. */
  severity: FormErrorSeverity;
  /** Which error type produced this message, for filtering/deduplication. */
  type: FormErrorType;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Map a single FormError to a coaching message.
 *
 * @param error - One entry from SquatState.errors
 * @returns A CoachingMessage ready to render in the UI
 */
export function mapErrorToMessage(error: FormError): CoachingMessage {
  const cue     = MESSAGES[error.type];
  const prefix  = SEVERITY_PREFIX[error.severity];

  return {
    message:  prefix + cue,
    severity: error.severity,
    type:     error.type,
  };
}

/**
 * Map an entire errors array (from SquatState.errors) to coaching messages.
 * Returns an empty array when there are no errors (form is good).
 *
 * @param errors - The errors array from one SquatState update
 * @returns Coaching messages in the same order as the input errors
 */
export function mapErrorsToMessages(errors: FormError[]): CoachingMessage[] {
  return errors.map(mapErrorToMessage);
}

/**
 * Return a single highest-priority message from an errors array.
 * 'error' severity takes precedence over 'warning'.
 * Returns null when the errors array is empty (perfect form).
 *
 * Useful when you only have room to show one coaching cue at a time.
 *
 * @param errors - The errors array from one SquatState update
 * @returns The most critical CoachingMessage, or null if no errors
 */
export function getTopMessage(errors: FormError[]): CoachingMessage | null {
  if (errors.length === 0) return null;

  // Prefer 'error' severity over 'warning'
  const critical = errors.find((e) => e.severity === 'error');
  const top = critical ?? errors[0];

  return mapErrorToMessage(top);
}
