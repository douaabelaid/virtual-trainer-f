import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { WorkoutSession } from '../storage/workoutHistory';
import { FormError, FormErrorType } from '../exercise/exerciseDetector';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkoutReviewProps {
  session: WorkoutSession;
  onClose?: () => void;
}

// ── Landmark indices (MediaPipe) ──────────────────────────────────────────────

const L = {
  NOSE: 0,
  LEFT_SHOULDER: 11,  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,     RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,     RIGHT_WRIST: 16,
  LEFT_HIP: 23,       RIGHT_HIP: 24,
  LEFT_KNEE: 25,      RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,     RIGHT_ANKLE: 28,
} as const;

// Skeleton bones for the static stick figure
const BONES: [number, number][] = [
  [L.LEFT_SHOULDER,  L.RIGHT_SHOULDER],
  [L.LEFT_SHOULDER,  L.LEFT_ELBOW],
  [L.LEFT_ELBOW,     L.LEFT_WRIST],
  [L.RIGHT_SHOULDER, L.RIGHT_ELBOW],
  [L.RIGHT_ELBOW,    L.RIGHT_WRIST],
  [L.LEFT_SHOULDER,  L.LEFT_HIP],
  [L.RIGHT_SHOULDER, L.RIGHT_HIP],
  [L.LEFT_HIP,       L.RIGHT_HIP],
  [L.LEFT_HIP,       L.LEFT_KNEE],
  [L.LEFT_KNEE,      L.LEFT_ANKLE],
  [L.RIGHT_HIP,      L.RIGHT_KNEE],
  [L.RIGHT_KNEE,     L.RIGHT_ANKLE],
];

// Which landmark index represents each FormErrorType
const ERROR_JOINTS: Record<FormErrorType, number[]> = {
  KNEE_VALGUS: [L.LEFT_KNEE,      L.RIGHT_KNEE],
  BAD_BACK:    [L.LEFT_HIP,       L.RIGHT_HIP,
                L.LEFT_SHOULDER,  L.RIGHT_SHOULDER],
};

// Normalized positions for a generic standing skeleton (x,y in 0–1)
// These represent a T-pose / neutral stance for the review screen
const STATIC_POSE: Record<number, { x: number; y: number }> = {
  [L.NOSE]:            { x: 0.50, y: 0.10 },
  [L.LEFT_SHOULDER]:   { x: 0.38, y: 0.28 },
  [L.RIGHT_SHOULDER]:  { x: 0.62, y: 0.28 },
  [L.LEFT_ELBOW]:      { x: 0.28, y: 0.44 },
  [L.RIGHT_ELBOW]:     { x: 0.72, y: 0.44 },
  [L.LEFT_WRIST]:      { x: 0.20, y: 0.60 },
  [L.RIGHT_WRIST]:     { x: 0.80, y: 0.60 },
  [L.LEFT_HIP]:        { x: 0.42, y: 0.54 },
  [L.RIGHT_HIP]:       { x: 0.58, y: 0.54 },
  [L.LEFT_KNEE]:       { x: 0.42, y: 0.72 },
  [L.RIGHT_KNEE]:      { x: 0.58, y: 0.72 },
  [L.LEFT_ANKLE]:      { x: 0.42, y: 0.90 },
  [L.RIGHT_ANKLE]:     { x: 0.58, y: 0.90 },
};

// Playback advances one error event per second
const PLAYBACK_INTERVAL_MS = 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

function errorLabel(type: FormErrorType): string {
  return type === 'KNEE_VALGUS'
    ? 'Knee valgus — knees caving inward'
    : 'Back posture — torso leaning forward';
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * WorkoutReview
 *
 * Post-set review screen. Shows a timeline of all form errors recorded
 * during the workout, simulates playback by stepping through each error
 * event one by one, and highlights the affected joints on a static skeleton.
 *
 * Note: No video frames are processed here. Playback is purely data-driven,
 * advancing through the session's error array using setInterval.
 */
export default function WorkoutReview({ session, onClose }: WorkoutReviewProps) {
  const { width } = useWindowDimensions();
  // Skeleton canvas size
  const SVG_W = Math.min(width - 32, 320);
  const SVG_H = SVG_W * 1.1;

  // Index of the currently highlighted error event (-1 = none)
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const errors = session.errors;

  // ── Playback control ─────────────────────────────────────────────────────

  function play() {
    if (intervalRef.current || errors.length === 0) return;
    setActiveIdx(0);
    setIsPlaying(true);
    intervalRef.current = setInterval(() => {
      setActiveIdx((prev) => {
        const next = prev + 1;
        if (next >= errors.length) {
          stopPlayback();
          return prev;
        }
        return next;
      });
    }, PLAYBACK_INTERVAL_MS);
  }

  function stopPlayback() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
  }

  function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
    } else {
      setActiveIdx(-1);
      play();
    }
  }

  useEffect(() => () => stopPlayback(), []);

  // ── Active error joints ──────────────────────────────────────────────────

  const activeError: FormError | null =
    activeIdx >= 0 ? errors[activeIdx] : null;

  const highlightedJoints = new Set<number>(
    activeError ? ERROR_JOINTS[activeError.type] : [],
  );

  // ── Skeleton rendering ───────────────────────────────────────────────────

  function toSvg(idx: number) {
    const p = STATIC_POSE[idx];
    return { x: p.x * SVG_W, y: p.y * SVG_H };
  }

  function jointFill(idx: number): string {
    if (highlightedJoints.has(idx)) {
      return activeError?.severity === 'error' ? '#FF2222' : '#FFAA00';
    }
    return '#00FF88';
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.title}>Workout Review</Text>
        <Text style={styles.subtitle}>
          {new Date(session.date).toLocaleDateString()} · {session.reps} reps ·{' '}
          {session.exerciseType}
        </Text>
      </View>

      {/* ── Static skeleton with highlighted joints ─────────────────── */}
      <View style={[styles.skeletonWrapper, { width: SVG_W, height: SVG_H }]}>
        <Svg width={SVG_W} height={SVG_H}>
          {/* Bones */}
          {BONES.map(([a, b], i) => {
            const pA = toSvg(a);
            const pB = toSvg(b);
            return (
              <Line
                key={`bone-${i}`}
                x1={pA.x} y1={pA.y}
                x2={pB.x} y2={pB.y}
                stroke="#444"
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })}
          {/* Joints */}
          {Object.keys(STATIC_POSE).map((idxStr) => {
            const idx = Number(idxStr);
            const pos = toSvg(idx);
            return (
              <Circle
                key={`joint-${idx}`}
                cx={pos.x} cy={pos.y}
                r={idx === L.NOSE ? 10 : 7}
                fill={jointFill(idx)}
              />
            );
          })}
        </Svg>

        {/* Active error label overlaid on skeleton */}
        {activeError && (
          <View style={styles.errorLabel}>
            <Text style={[
              styles.errorLabelText,
              activeError.severity === 'error' && styles.errorLabelTextCritical,
            ]}>
              {errorLabel(activeError.type)}
            </Text>
          </View>
        )}
      </View>

      {/* ── Playback controls ───────────────────────────────────────── */}
      <Pressable
        style={[styles.button, errors.length === 0 && styles.buttonDisabled]}
        onPress={errors.length > 0 ? togglePlayback : undefined}
      >
        <Text style={styles.buttonText}>
          {isPlaying ? '⏸ Pause' : '▶ Replay errors'}
        </Text>
      </Pressable>

      {/* ── Error timeline list ─────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>
        Error Timeline ({errors.length} events)
      </Text>

      <ScrollView style={styles.timeline} contentContainerStyle={{ gap: 8 }}>
        {errors.length === 0 && (
          <Text style={styles.noErrors}>No form errors recorded. Great work!</Text>
        )}
        {errors.map((err, i) => (
          <Pressable
            key={i}
            style={[
              styles.errorRow,
              activeIdx === i && styles.errorRowActive,
              err.severity === 'error' && styles.errorRowCritical,
            ]}
            onPress={() => { stopPlayback(); setActiveIdx(i); }}
          >
            <Text style={styles.errorRowTime}>
              {formatTime(new Date(err.timestamp).toISOString())}
            </Text>
            <Text style={styles.errorRowType}>{errorLabel(err.type)}</Text>
            <Text style={[
              styles.errorRowSeverity,
              err.severity === 'error' && { color: '#FF4444' },
            ]}>
              {err.severity.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── Close button ────────────────────────────────────────────── */}
      {onClose && (
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  skeletonWrapper: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  errorLabel: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    padding: 6,
  },
  errorLabelText: {
    color: '#FFAA00',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorLabelTextCritical: {
    color: '#FF4444',
  },
  button: {
    backgroundColor: '#00FF88',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: '#333',
  },
  buttonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 15,
  },
  sectionTitle: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  timeline: {
    width: '100%',
    flex: 1,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 10,
    gap: 8,
  },
  errorRowActive: {
    borderWidth: 1,
    borderColor: '#FFAA00',
  },
  errorRowCritical: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF4444',
  },
  errorRowTime: {
    color: '#555',
    fontSize: 11,
    width: 50,
  },
  errorRowType: {
    color: '#ccc',
    fontSize: 12,
    flex: 1,
  },
  errorRowSeverity: {
    color: '#FFAA00',
    fontSize: 11,
    fontWeight: '700',
  },
  noErrors: {
    color: '#00FF88',
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
  },
  closeButton: {
    marginTop: 12,
    marginBottom: 32,
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 15,
  },
});
