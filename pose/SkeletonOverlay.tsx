import React from 'react';
import { useWindowDimensions } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

// ── TypeScript interfaces ─────────────────────────────────────────────────────

/**
 * A single pose landmark with normalized coordinates.
 * x and y are in the range [0, 1] relative to the video frame.
 * visibility is the model confidence (0–1); lower = less certain.
 */
export interface SkeletonLandmark {
  x: number;
  y: number;
  visibility?: number;
}

export interface SkeletonOverlayProps {
  /** Array of exactly 33 MediaPipe pose landmarks. */
  landmarks: SkeletonLandmark[];
  /** Skip landmarks below this visibility score. Defaults to 0.5. */
  minVisibility?: number;
  /** Joint circle colour. Defaults to '#FF4444'. */
  jointColor?: string;
  /** Bone line colour. Defaults to '#00FF88'. */
  boneColor?: string;
  /** Joint circle radius in px. Defaults to 6. */
  jointRadius?: number;
  /** Bone stroke width in px. Defaults to 2. */
  boneWidth?: number;
}

// ── MediaPipe landmark indices ────────────────────────────────────────────────
// Defined locally so this component has zero logic dependencies.

const L = {
  NOSE: 0,
  LEFT_EYE: 2,        RIGHT_EYE: 5,
  LEFT_EAR: 7,        RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,     RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,     RIGHT_WRIST: 16,
  LEFT_HIP: 23,       RIGHT_HIP: 24,
  LEFT_KNEE: 25,      RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,     RIGHT_ANKLE: 28,
} as const;

// ── Skeleton connections ──────────────────────────────────────────────────────
// Each pair [A, B] draws one bone line between those two landmarks.

const BONES: [number, number][] = [
  // Head
  [L.LEFT_EAR,       L.LEFT_EYE],
  [L.LEFT_EYE,       L.NOSE],
  [L.NOSE,           L.RIGHT_EYE],
  [L.RIGHT_EYE,      L.RIGHT_EAR],

  // Shoulders bar
  [L.LEFT_SHOULDER,  L.RIGHT_SHOULDER],

  // Left arm: shoulder → elbow → wrist
  [L.LEFT_SHOULDER,  L.LEFT_ELBOW],
  [L.LEFT_ELBOW,     L.LEFT_WRIST],

  // Right arm: shoulder → elbow → wrist
  [L.RIGHT_SHOULDER, L.RIGHT_ELBOW],
  [L.RIGHT_ELBOW,    L.RIGHT_WRIST],

  // Spine connections: left shoulder → left hip, right shoulder → right hip
  [L.LEFT_SHOULDER,  L.LEFT_HIP],
  [L.RIGHT_SHOULDER, L.RIGHT_HIP],

  // Hips bar
  [L.LEFT_HIP,       L.RIGHT_HIP],

  // Left leg: hip → knee → ankle
  [L.LEFT_HIP,       L.LEFT_KNEE],
  [L.LEFT_KNEE,      L.LEFT_ANKLE],

  // Right leg: hip → knee → ankle
  [L.RIGHT_HIP,      L.RIGHT_KNEE],
  [L.RIGHT_KNEE,     L.RIGHT_ANKLE],
];

// Key joints rendered as visible circles
const JOINTS: number[] = [
  L.NOSE,
  L.LEFT_SHOULDER,  L.RIGHT_SHOULDER,
  L.LEFT_ELBOW,     L.RIGHT_ELBOW,
  L.LEFT_WRIST,     L.RIGHT_WRIST,
  L.LEFT_HIP,       L.RIGHT_HIP,
  L.LEFT_KNEE,      L.RIGHT_KNEE,
  L.LEFT_ANKLE,     L.RIGHT_ANKLE,
];

// ── Component (pure rendering — no logic) ────────────────────────────────────

/**
 * SkeletonOverlay
 *
 * Draws the pose skeleton as an SVG layer on top of the camera preview.
 * Accepts normalized landmark coordinates (0–1) and scales them to the
 * current screen size automatically via useWindowDimensions.
 *
 * This component is intentionally logic-free — it only renders.
 */
export default function SkeletonOverlay({
  landmarks,
  minVisibility = 0.5,
  jointColor  = '#FF4444',
  boneColor   = '#00FF88',
  jointRadius = 6,
  boneWidth   = 2,
}: SkeletonOverlayProps) {
  // Re-renders automatically on screen rotation or multi-window resize
  const { width, height } = useWindowDimensions();

  // Nothing to draw if the array is missing or incomplete
  if (!landmarks || landmarks.length < 33) return null;

  /**
   * Convert a normalized landmark to absolute pixel coordinates.
   * Multiplies the 0–1 values by the current screen dimensions.
   */
  function px(lm: SkeletonLandmark): { x: number; y: number } {
    return { x: lm.x * width, y: lm.y * height };
  }

  /** Returns true when a landmark is visible enough to draw. */
  function visible(lm: SkeletonLandmark): boolean {
    return (lm.visibility ?? 1) >= minVisibility;
  }

  return (
    // Absolute overlay that fills the screen.
    // pointerEvents="none" lets all touches pass through to layers below.
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0 }}
      pointerEvents="none"
    >
      {/* ── Bone lines ───────────────────────────────────────────────── */}
      {BONES.map(([a, b], i) => {
        const lmA = landmarks[a];
        const lmB = landmarks[b];

        // Skip this bone if either endpoint is not visible enough
        if (!visible(lmA) || !visible(lmB)) return null;

        const posA = px(lmA);
        const posB = px(lmB);

        return (
          <Line
            key={`bone-${i}`}
            x1={posA.x} y1={posA.y}
            x2={posB.x} y2={posB.y}
            stroke={boneColor}
            strokeWidth={boneWidth}
            strokeLinecap="round"
          />
        );
      })}

      {/* ── Joint circles ────────────────────────────────────────────── */}
      {JOINTS.map((idx) => {
        const lm = landmarks[idx];
        if (!visible(lm)) return null;

        const pos = px(lm);

        return (
          <Circle
            key={`joint-${idx}`}
            cx={pos.x}
            cy={pos.y}
            r={jointRadius}
            fill={jointColor}
          />
        );
      })}
    </Svg>
  );
}
