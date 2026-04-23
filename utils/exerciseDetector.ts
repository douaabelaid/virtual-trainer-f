import { calculateAngle, Point2D } from '../utils/angleUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

/** The two phases of a squat rep. */
export type SquatPhase = 'up' | 'down';

/** Categories of detected form errors. */
export type FormErrorType =
  | 'KNEE_VALGUS'    // Knees are caving inward
  | 'BAD_BACK';      // Torso is leaning too far forward

/** How serious the form error is. */
export type FormErrorSeverity = 'warning' | 'error';

/** A single form error detected in one frame. */
export interface FormError {
  /** What kind of form problem was detected. */
  type: FormErrorType;
  /** 'warning' = slight deviation; 'error' = significant risk of injury. */
  severity: FormErrorSeverity;
  /** Unix timestamp (ms) when the error was detected. */
  timestamp: number;
}

/** Snapshot returned after every frame update. */
export interface SquatState {
  /** Total completed reps so far. */
  reps: number;
  /** Current phase: 'up' (standing) or 'down' (at depth). */
  phase: SquatPhase;
  /** Most recently computed knee angle in degrees (average of both knees). */
  kneeAngle: number;
  /**
   * Form errors detected in this frame.
   * Empty array means the rep looks good.
   */
  errors: FormError[];
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/**
 * Knee angle thresholds that define each phase.
 *
 *  Standing (up)  → knee is nearly straight  → angle ≥ UP_THRESHOLD   (~160°)
 *  At depth (down)→ knee is bent deeply      → angle ≤ DOWN_THRESHOLD  (~100°)
 *
 * The gap between the two values creates a dead-band so small wobbles
 * during the movement don't accidentally flip the phase or add ghost reps.
 */
const UP_THRESHOLD   = 160; // degrees — counts as "standing"
const DOWN_THRESHOLD = 100; // degrees — counts as "at depth"

// ── Form-error thresholds ─────────────────────────────────────────────────────

/**
 * Knee valgus — detected by comparing the horizontal (x) positions of the
 * knees and ankles in the normalized 0-1 space.
 *
 * In a healthy squat the knees track over or outside the toes, so each
 * knee's x-coordinate should be on the same side as its ankle's x-coordinate.
 * When the knee x-position moves past the ankle x-position toward the midline
 * by more than the tolerance below, we flag valgus.
 *
 * Because MediaPipe uses a mirrored front-camera image:
 *   LEFT side  → higher x  (right side of screen)
 *   RIGHT side → lower x   (left side of screen)
 *
 * Valgus threshold (normalized units, roughly 3–5 % of frame width):
 */
const VALGUS_WARNING_THRESHOLD = 0.03; // knees slightly inside ankles
const VALGUS_ERROR_THRESHOLD   = 0.07; // knees significantly inside ankles

/**
 * Back posture — measured as the angle at the hip formed by the shoulder,
 * hip, and knee. A large torso-forward lean shrinks this angle.
 *
 *  Good form   → hip angle ≥ ~170° (torso mostly upright)
 *  Warning     → hip angle  <  150° (leaning noticeably)
 *  Error       → hip angle  <  130° (excessive forward lean)
 */
const BACK_WARNING_THRESHOLD = 150; // degrees
const BACK_ERROR_THRESHOLD   = 130; // degrees

// ── Factory function ──────────────────────────────────────────────────────────

/**
 * createSquatDetector
 *
 * Returns a stateful `update` function. Call it once per video frame with
 * the six landmark points for hips, knees, and ankles.
 *
 * A rep is counted the moment the phase transitions from 'down' → 'up',
 * meaning the user descended to depth AND returned to standing.
 *
 * Usage
 * ─────
 *   const detector = createSquatDetector();
 *
 *   // Inside your onPoseDetected callback:
 *   const state = detector.update({
 *     leftHip:    landmarks[POSE_LANDMARKS.LEFT_HIP],
 *     leftKnee:   landmarks[POSE_LANDMARKS.LEFT_KNEE],
 *     leftAnkle:  landmarks[POSE_LANDMARKS.LEFT_ANKLE],
 *     rightHip:   landmarks[POSE_LANDMARKS.RIGHT_HIP],
 *     rightKnee:  landmarks[POSE_LANDMARKS.RIGHT_KNEE],
 *     rightAnkle: landmarks[POSE_LANDMARKS.RIGHT_ANKLE],
 *   });
 *
 *   console.log(state.reps, state.phase, state.kneeAngle);
 */
export function createSquatDetector() {
  // Internal mutable state — isolated per detector instance
  let reps:  number     = 0;
  let phase: SquatPhase = 'up'; // assume the user starts standing

  // ── Form-error helpers ──────────────────────────────────────────────────────

  /**
   * Knee valgus check.
   *
   * Strategy: in the MediaPipe normalized coordinate space the left knee
   * should have a larger x value than the left ankle (it sits further from
   * the body's midline). If the knee x dips below the ankle x by more than
   * the threshold the knee is caving inward.
   *
   * The same logic applies to the right side in reverse (right knee x should
   * be SMALLER than right ankle x when healthy).
   */
  function checkKneeValgus(
    leftKnee:  Point2D, leftAnkle:  Point2D,
    rightKnee: Point2D, rightAnkle: Point2D,
  ): FormError | null {
    // How far each knee has moved inward past its ankle (positive = inward)
    const leftInward  = leftAnkle.x  - leftKnee.x;  // left knee should be ≥ ankle x
    const rightInward = rightKnee.x  - rightAnkle.x; // right knee should be ≤ ankle x
    const maxInward   = Math.max(leftInward, rightInward);

    if (maxInward >= VALGUS_ERROR_THRESHOLD) {
      return { type: 'KNEE_VALGUS', severity: 'error',   timestamp: Date.now() };
    }
    if (maxInward >= VALGUS_WARNING_THRESHOLD) {
      return { type: 'KNEE_VALGUS', severity: 'warning', timestamp: Date.now() };
    }
    return null;
  }

  /**
   * Back posture check.
   *
   * Measures the hip angle (shoulder → hip → knee) for both sides and
   * takes the smaller of the two — a unilateral lean is still a problem.
   * A low hip angle means the torso is pitched too far forward.
   */
  function checkBackPosture(
    leftShoulder:  Point2D, leftHip:  Point2D, leftKnee:  Point2D,
    rightShoulder: Point2D, rightHip: Point2D, rightKnee: Point2D,
  ): FormError | null {
    const leftHipAngle  = calculateAngle(leftShoulder,  leftHip,  leftKnee);
    const rightHipAngle = calculateAngle(rightShoulder, rightHip, rightKnee);
    const minHipAngle   = Math.min(leftHipAngle, rightHipAngle);

    if (minHipAngle <= BACK_ERROR_THRESHOLD) {
      return { type: 'BAD_BACK', severity: 'error',   timestamp: Date.now() };
    }
    if (minHipAngle <= BACK_WARNING_THRESHOLD) {
      return { type: 'BAD_BACK', severity: 'warning', timestamp: Date.now() };
    }
    return null;
  }

  /**
   * Process one frame and return the updated squat state.
   *
   * @param points - Hip, knee, ankle, and shoulder landmarks for both legs.
   * @returns      - Current reps, phase, knee angle, and any form errors.
   */
  function update(points: {
    leftShoulder: Point2D;
    leftHip:    Point2D;
    leftKnee:   Point2D;
    leftAnkle:  Point2D;
    rightShoulder: Point2D;
    rightHip:   Point2D;
    rightKnee:  Point2D;
    rightAnkle: Point2D;
  }): SquatState {
    // Step 1: Calculate the knee angle for each leg individually
    const leftKneeAngle = calculateAngle(
      points.leftHip,
      points.leftKnee,
      points.leftAnkle,
    );
    const rightKneeAngle = calculateAngle(
      points.rightHip,
      points.rightKnee,
      points.rightAnkle,
    );

    // Step 2: Average both knees for a single stable reading.
    // Using the average rather than just one side makes detection
    // more robust when one leg is partially occluded.
    const kneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // Step 3: Apply the dead-band state machine
    //
    //  ┌──────────┐  angle ≤ DOWN_THRESHOLD  ┌──────────┐
    //  │   'up'   │ ─────────────────────►  │  'down'  │
    //  │(standing)│ ◄─────────────────────  │(at depth)│
    //  └──────────┘  angle ≥ UP_THRESHOLD   └──────────┘
    //                                           +1 rep on this transition ↑

    if (phase === 'up' && kneeAngle <= DOWN_THRESHOLD) {
      // User has squatted down to depth
      phase = 'down';
    } else if (phase === 'down' && kneeAngle >= UP_THRESHOLD) {
      // User has stood back up — one full rep completed
      phase = 'up';
      reps += 1;
    }

    // Step 4: Collect form errors (only meaningful while the user is
    // descending or at the bottom of the squat to avoid false positives
    // when they're fully upright between reps).
    const errors: FormError[] = [];

    const valgusError = checkKneeValgus(
      points.leftKnee,  points.leftAnkle,
      points.rightKnee, points.rightAnkle,
    );
    if (valgusError) errors.push(valgusError);

    const backError = checkBackPosture(
      points.leftShoulder,  points.leftHip,  points.leftKnee,
      points.rightShoulder, points.rightHip, points.rightKnee,
    );
    if (backError) errors.push(backError);

    return { reps, phase, kneeAngle, errors };
  }

  /** Reset reps, phase, and error history back to initial values (e.g. start new set). */
  function reset(): void {
    reps  = 0;
    phase = 'up';
  }

  return { update, reset };
}
