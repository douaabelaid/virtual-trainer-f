import { calculateAngle, Point2D } from '../utils/angleUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

/** The two phases of a squat rep. */
export type SquatPhase = 'up' | 'down';

/** Which form problem was detected. */
export type FormErrorType =
  | 'KNEE_VALGUS'  // Knees collapsing inward
  | 'BAD_BACK';    // Torso leaning too far forward

export type FormErrorSeverity = 'warning' | 'error';

/** A single form error emitted from one frame. */
export interface FormError {
  type: FormErrorType;
  severity: FormErrorSeverity;
  /** Unix ms timestamp when this error was detected. */
  timestamp: number;
}

/** All data returned after processing one frame. */
export interface SquatState {
  reps: number;
  phase: SquatPhase;
  /** Average knee angle this frame in degrees. */
  kneeAngle: number;
  /** Form errors detected this frame — empty array = good form. */
  errors: FormError[];
}

// ── Thresholds ────────────────────────────────────────────────────────────────

// Rep counting — knee angle dead-band prevents ghost reps
const UP_THRESHOLD   = 160; // ≥ this → standing
const DOWN_THRESHOLD = 100; // ≤ this → at depth

// Knee valgus — horizontal x-offset (normalized units) of knee past ankle
// MediaPipe mirrors the front camera, so left side has higher x values
const VALGUS_WARNING = 0.03; // ~3 % of frame width — slight inward collapse
const VALGUS_ERROR   = 0.07; // ~7 % of frame width — significant collapse

// Back posture — hip angle (shoulder → hip → knee); lower = more forward lean
const BACK_WARNING = 150; // degrees — noticeable lean
const BACK_ERROR   = 130; // degrees — unsafe lean

// ── Detector factory ──────────────────────────────────────────────────────────

/**
 * createSquatDetector
 *
 * Returns a stateful detector. Call `update()` once per video frame.
 * A rep is counted when the state transitions down → up.
 *
 * Usage
 * ─────
 *   const detector = createSquatDetector();
 *
 *   // Inside onLandmarks callback:
 *   const state = detector.update({ leftHip, leftKnee, leftAnkle, ... });
 *   console.log(state.reps, state.phase, state.errors);
 */
export function createSquatDetector() {
  let reps:  number     = 0;
  let phase: SquatPhase = 'up'; // assume user starts standing

  // ── Internal form checkers ───────────────────────────────────────────────

  /**
   * Knee valgus detection.
   *
   * In MediaPipe's normalized space (front camera mirrored):
   *   Healthy left knee  → x > left ankle x  (knee outside ankle)
   *   Healthy right knee → x < right ankle x
   *
   * leftInward  = how far left knee has crossed inside its ankle (+ve = valgus)
   * rightInward = same for right side
   */
  function checkKneeValgus(
    leftKnee:  Point2D, leftAnkle:  Point2D,
    rightKnee: Point2D, rightAnkle: Point2D,
  ): FormError | null {
    const leftInward  = leftAnkle.x  - leftKnee.x;
    const rightInward = rightKnee.x  - rightAnkle.x;
    const worst = Math.max(leftInward, rightInward);

    if (worst >= VALGUS_ERROR)   return { type: 'KNEE_VALGUS', severity: 'error',   timestamp: Date.now() };
    if (worst >= VALGUS_WARNING) return { type: 'KNEE_VALGUS', severity: 'warning', timestamp: Date.now() };
    return null;
  }

  /**
   * Back posture detection.
   *
   * Measures the hip angle (shoulder → hip → knee) on both sides.
   * A large forward lean shrinks this angle below safe thresholds.
   * We use the worse side so a unilateral lean is still caught.
   */
  function checkBackPosture(
    leftShoulder:  Point2D, leftHip:  Point2D, leftKnee:  Point2D,
    rightShoulder: Point2D, rightHip: Point2D, rightKnee: Point2D,
  ): FormError | null {
    const leftHipAngle  = calculateAngle(leftShoulder,  leftHip,  leftKnee);
    const rightHipAngle = calculateAngle(rightShoulder, rightHip, rightKnee);
    const worst = Math.min(leftHipAngle, rightHipAngle);

    if (worst <= BACK_ERROR)   return { type: 'BAD_BACK', severity: 'error',   timestamp: Date.now() };
    if (worst <= BACK_WARNING) return { type: 'BAD_BACK', severity: 'warning', timestamp: Date.now() };
    return null;
  }

  // ── Public update ────────────────────────────────────────────────────────

  /**
   * Process one video frame. Provide landmarks for hips, knees, ankles,
   * and shoulders (all as normalized { x, y } points).
   */
  function update(points: {
    leftShoulder:  Point2D;
    leftHip:       Point2D;
    leftKnee:      Point2D;
    leftAnkle:     Point2D;
    rightShoulder: Point2D;
    rightHip:      Point2D;
    rightKnee:     Point2D;
    rightAnkle:    Point2D;
  }): SquatState {
    // 1. Knee angle averaged over both legs for a stable reading
    const leftKneeAngle  = calculateAngle(points.leftHip,  points.leftKnee,  points.leftAnkle);
    const rightKneeAngle = calculateAngle(points.rightHip, points.rightKnee, points.rightAnkle);
    const kneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // 2. State machine — dead-band between DOWN_THRESHOLD and UP_THRESHOLD
    //    prevents wobble at the transition zone from triggering ghost reps
    //
    //    'up' ──(angle ≤ DOWN)──► 'down' ──(angle ≥ UP)──► 'up'  +1 rep
    if (phase === 'up'   && kneeAngle <= DOWN_THRESHOLD) phase = 'down';
    else if (phase === 'down' && kneeAngle >= UP_THRESHOLD) { phase = 'up'; reps++; }

    // 3. Form error checks
    const errors: FormError[] = [];

    const valgus = checkKneeValgus(
      points.leftKnee, points.leftAnkle,
      points.rightKnee, points.rightAnkle,
    );
    if (valgus) errors.push(valgus);

    const back = checkBackPosture(
      points.leftShoulder, points.leftHip, points.leftKnee,
      points.rightShoulder, points.rightHip, points.rightKnee,
    );
    if (back) errors.push(back);

    return { reps, phase, kneeAngle, errors };
  }

  /** Reset everything — call when starting a new set. */
  function reset(): void {
    reps  = 0;
    phase = 'up';
  }

  return { update, reset };
}
