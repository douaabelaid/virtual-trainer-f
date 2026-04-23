import React from 'react';
import { useWindowDimensions } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { Landmark, POSE_LANDMARKS } from './PoseLandmarker';
import { FormErrorType } from '../utils/exerciseDetector';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewOverlayProps {
  /** The 33 pose landmarks for the frame being reviewed. */
  landmarks: Landmark[];
  /**
   * Set of error types currently active in this frame.
   * Problem joints are highlighted in red; clean joints stay green.
   */
  activeErrors: Set<FormErrorType>;
  /** Minimum visibility to draw a landmark. Defaults to 0.3. */
  minVisibility?: number;
}

// ── Joint → error-type mapping ────────────────────────────────────────────────

/**
 * Maps each landmark index to the FormErrorType that affects it.
 * When that error type is in activeErrors the joint is drawn in red.
 */
const JOINT_ERROR_MAP: Partial<Record<number, FormErrorType>> = {
  // Knee valgus affects knees
  [POSE_LANDMARKS.LEFT_KNEE]:  'KNEE_VALGUS',
  [POSE_LANDMARKS.RIGHT_KNEE]: 'KNEE_VALGUS',
  // Bad back affects hips and shoulders
  [POSE_LANDMARKS.LEFT_HIP]:       'BAD_BACK',
  [POSE_LANDMARKS.RIGHT_HIP]:      'BAD_BACK',
  [POSE_LANDMARKS.LEFT_SHOULDER]:  'BAD_BACK',
  [POSE_LANDMARKS.RIGHT_SHOULDER]: 'BAD_BACK',
};

// ── Skeleton connections (same set as SkeletonOverlay) ────────────────────────

const SKELETON_BONES: [number, number][] = [
  [POSE_LANDMARKS.LEFT_EAR,       POSE_LANDMARKS.LEFT_EYE],
  [POSE_LANDMARKS.LEFT_EYE,       POSE_LANDMARKS.NOSE],
  [POSE_LANDMARKS.NOSE,           POSE_LANDMARKS.RIGHT_EYE],
  [POSE_LANDMARKS.RIGHT_EYE,      POSE_LANDMARKS.RIGHT_EAR],
  [POSE_LANDMARKS.LEFT_SHOULDER,  POSE_LANDMARKS.RIGHT_SHOULDER],
  [POSE_LANDMARKS.LEFT_SHOULDER,  POSE_LANDMARKS.LEFT_ELBOW],
  [POSE_LANDMARKS.LEFT_ELBOW,     POSE_LANDMARKS.LEFT_WRIST],
  [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_ELBOW],
  [POSE_LANDMARKS.RIGHT_ELBOW,    POSE_LANDMARKS.RIGHT_WRIST],
  [POSE_LANDMARKS.LEFT_SHOULDER,  POSE_LANDMARKS.LEFT_HIP],
  [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_HIP],
  [POSE_LANDMARKS.LEFT_HIP,       POSE_LANDMARKS.RIGHT_HIP],
  [POSE_LANDMARKS.LEFT_HIP,       POSE_LANDMARKS.LEFT_KNEE],
  [POSE_LANDMARKS.LEFT_KNEE,      POSE_LANDMARKS.LEFT_ANKLE],
  [POSE_LANDMARKS.LEFT_ANKLE,     POSE_LANDMARKS.LEFT_HEEL],
  [POSE_LANDMARKS.LEFT_HEEL,      POSE_LANDMARKS.LEFT_FOOT_INDEX],
  [POSE_LANDMARKS.RIGHT_HIP,      POSE_LANDMARKS.RIGHT_KNEE],
  [POSE_LANDMARKS.RIGHT_KNEE,     POSE_LANDMARKS.RIGHT_ANKLE],
  [POSE_LANDMARKS.RIGHT_ANKLE,    POSE_LANDMARKS.RIGHT_HEEL],
  [POSE_LANDMARKS.RIGHT_HEEL,     POSE_LANDMARKS.RIGHT_FOOT_INDEX],
];

// All joints we render as circles
const ALL_JOINTS = Object.keys(JOINT_ERROR_MAP).map(Number).concat([
  POSE_LANDMARKS.NOSE,
  POSE_LANDMARKS.LEFT_ELBOW,  POSE_LANDMARKS.RIGHT_ELBOW,
  POSE_LANDMARKS.LEFT_WRIST,  POSE_LANDMARKS.RIGHT_WRIST,
  POSE_LANDMARKS.LEFT_ANKLE,  POSE_LANDMARKS.RIGHT_ANKLE,
]);

// Colours
const COLOR_CLEAN   = '#00FF88'; // green — no error
const COLOR_PROBLEM = '#FF2222'; // red   — problem joint
const COLOR_BONE    = '#FFFFFF'; // white bones for review mode

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * ReviewOverlay
 *
 * Draws the full skeleton over a review frame and highlights problem joints
 * in red based on which FormErrorTypes are active in that frame.
 *
 * Designed to sit on top of a static background (e.g. a screenshot or
 * a frozen video frame) during post-set playback.
 */
export default function ReviewOverlay({
  landmarks,
  activeErrors,
  minVisibility = 0.3,
}: ReviewOverlayProps) {
  const { width, height } = useWindowDimensions();

  if (!landmarks || landmarks.length < 33) return null;

  /** Convert normalized (0–1) landmark to absolute screen coordinates. */
  function toPixel(lm: Landmark) {
    return { px: lm.x * width, py: lm.y * height };
  }

  /**
   * Determine the colour for a joint.
   * Red if any of its associated errors are currently active; green otherwise.
   */
  function jointColor(idx: number): string {
    const errorType = JOINT_ERROR_MAP[idx];
    if (errorType && activeErrors.has(errorType)) return COLOR_PROBLEM;
    return COLOR_CLEAN;
  }

  /**
   * A bone is drawn in red if BOTH endpoints are problem joints.
   * Otherwise it is drawn in the neutral white colour.
   */
  function boneColor(idxA: number, idxB: number): string {
    if (
      jointColor(idxA) === COLOR_PROBLEM &&
      jointColor(idxB) === COLOR_PROBLEM
    ) {
      return COLOR_PROBLEM;
    }
    return COLOR_BONE;
  }

  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0 }}
      pointerEvents="none"
    >
      {/* ── Bones ─────────────────────────────────────────────────────── */}
      {SKELETON_BONES.map(([idxA, idxB], i) => {
        const lmA = landmarks[idxA];
        const lmB = landmarks[idxB];
        if (
          lmA.visibility < minVisibility ||
          lmB.visibility < minVisibility
        ) return null;

        const { px: x1, py: y1 } = toPixel(lmA);
        const { px: x2, py: y2 } = toPixel(lmB);

        return (
          <Line
            key={`bone-${i}`}
            x1={x1} y1={y1}
            x2={x2} y2={y2}
            stroke={boneColor(idxA, idxB)}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.85}
          />
        );
      })}

      {/* ── Joints ────────────────────────────────────────────────────── */}
      {ALL_JOINTS.map((idx) => {
        const lm = landmarks[idx];
        if (!lm || lm.visibility < minVisibility) return null;

        const { px, py } = toPixel(lm);
        const color = jointColor(idx);
        // Problem joints are drawn slightly larger so they stand out
        const radius = color === COLOR_PROBLEM ? 9 : 6;

        return (
          <Circle
            key={`joint-${idx}`}
            cx={px}
            cy={py}
            r={radius}
            fill={color}
            // White outline makes joints visible on any background
            stroke="#FFFFFF"
            strokeWidth={1.5}
          />
        );
      })}
    </Svg>
  );
}
