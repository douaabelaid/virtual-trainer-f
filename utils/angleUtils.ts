// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A 2-D point in normalized MediaPipe coordinate space (0–1).
 * Pass landmark.x and landmark.y directly — no conversion needed.
 */
export interface Point2D {
  x: number;
  y: number;
}

// ── Core angle function ───────────────────────────────────────────────────────

/**
 * calculateAngle
 *
 * Returns the interior angle (in degrees) at joint B, formed by the rays
 * B→A and B→C.
 *
 * Vector math overview
 * ────────────────────
 * 1. Build two vectors that originate at B:
 *      BA = A − B
 *      BC = C − B
 *
 * 2. Compute the signed angle of each vector with atan2:
 *      θ_BA = atan2(BA.y, BA.x)
 *      θ_BC = atan2(BC.y, BC.x)
 *
 * 3. The angle between them is the absolute difference, converted to degrees.
 *    Clamp to [0, 180] so the result is always the smaller (non-reflex) angle.
 *
 * Why atan2 (not dot-product acos)?
 *   acos becomes numerically unstable near 0° and 180° because floating-point
 *   rounding can push the argument outside [−1, 1], producing NaN.
 *   atan2 is always well-defined for any (y, x) pair.
 *
 * Joint usage examples
 * ────────────────────
 *   Knee  : calculateAngle(hip,      knee,   ankle)
 *   Elbow : calculateAngle(shoulder, elbow,  wrist)
 *   Hip   : calculateAngle(shoulder, hip,    knee)
 *
 * @param a - First endpoint (e.g. hip when measuring knee angle)
 * @param b - The vertex joint whose angle we want (e.g. knee)
 * @param c - Second endpoint (e.g. ankle when measuring knee angle)
 * @returns Angle at B in degrees, always in [0, 180]
 */
export function calculateAngle(a: Point2D, b: Point2D, c: Point2D): number {
  // Step 1: Vectors from B to each neighbouring joint
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };

  // Step 2: Signed angles from the positive x-axis (radians)
  const angleBA = Math.atan2(ba.y, ba.x);
  const angleBC = Math.atan2(bc.y, bc.x);

  // Step 3: Absolute difference → degrees
  let degrees = Math.abs((angleBA - angleBC) * (180 / Math.PI));

  // Clamp: if > 180° we have the reflex angle — use the interior one instead
  if (degrees > 180) degrees = 360 - degrees;

  return degrees;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true when the given angle falls inside [min, max] degrees.
 * Useful for checking joint range-of-motion (e.g. knee must be > 160° to
 * count as "fully extended").
 */
export function isAngleInRange(
  angle: number,
  min: number,
  max: number,
): boolean {
  return angle >= min && angle <= max;
}

/**
 * Maps an angle to a 0–1 rep-completion percentage.
 *
 * Example — squat:
 *   repProgress(kneeAngle, 170, 90)
 *   → 0 % while standing (knee ≈ 170°)
 *   → 100 % at full depth (knee ≈ 90°)
 *
 * @param angle    Current joint angle in degrees
 * @param startDeg Angle representing 0 % completion
 * @param endDeg   Angle representing 100 % completion
 * @returns Value clamped to [0, 1]
 */
export function repProgress(
  angle: number,
  startDeg: number,
  endDeg: number,
): number {
  if (startDeg === endDeg) return 0;
  const raw = (angle - startDeg) / (endDeg - startDeg);
  return Math.min(1, Math.max(0, raw));
}
