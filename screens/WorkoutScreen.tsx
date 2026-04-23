import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// ── Pose / Camera ──────────────────────────────────────────────────────────────
import PoseWebView, { Landmark } from '../pose/PoseWebView';
import SkeletonOverlay            from '../pose/SkeletonOverlay';

// ── Exercise logic ─────────────────────────────────────────────────────────────
import { calculateAngle }                        from '../utils/angleUtils';
import { createSquatDetector, SquatState }       from '../exercise/exerciseDetector';
import { getTopMessage }                         from '../exercise/feedbackMapper';

// ── Voice feedback ─────────────────────────────────────────────────────────────
import { speak }                                 from '../utils/voiceFeedback';

// ── MediaPipe landmark indices ─────────────────────────────────────────────────
const IDX = {
  LEFT_SHOULDER: 11,  RIGHT_SHOULDER: 12,
  LEFT_HIP:      23,  RIGHT_HIP:      24,
  LEFT_KNEE:     25,  RIGHT_KNEE:     26,
  LEFT_ANKLE:    27,  RIGHT_ANKLE:    28,
} as const;

// ── Component ──────────────────────────────────────────────────────────────────

export default function WorkoutScreen() {
  // 1. Live landmarks → drives SkeletonOverlay
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);

  // 2. Squat detector state snapshot
  const [squatState, setSquatState] = useState<SquatState>({
    reps: 0, phase: 'up', kneeAngle: 180, errors: [],
  });

  // 3. Knee angle display
  const [kneeAngle, setKneeAngle] = useState(180);

  // Stable detector instance (never re-created)
  const detector = useRef(createSquatDetector()).current;

  // Debounce TTS — only speak when the coaching cue changes
  const lastCueRef = useRef('');

  // ── Per-frame pipeline ────────────────────────────────────────────────────

  const handleLandmarks = useCallback((lms: Landmark[]) => {
    // Step 1: store landmarks for skeleton rendering
    setLandmarks(lms);

    // Step 2: compute left knee angle for the HUD
    const angle = calculateAngle(
      lms[IDX.LEFT_HIP],
      lms[IDX.LEFT_KNEE],
      lms[IDX.LEFT_ANKLE],
    );
    setKneeAngle(angle);

    // Step 3: run squat rep + form detector
    const state = detector.update({
      leftShoulder:  lms[IDX.LEFT_SHOULDER],
      leftHip:       lms[IDX.LEFT_HIP],
      leftKnee:      lms[IDX.LEFT_KNEE],
      leftAnkle:     lms[IDX.LEFT_ANKLE],
      rightShoulder: lms[IDX.RIGHT_SHOULDER],
      rightHip:      lms[IDX.RIGHT_HIP],
      rightKnee:     lms[IDX.RIGHT_KNEE],
      rightAnkle:    lms[IDX.RIGHT_ANKLE],
    });
    setSquatState(state);

    // Step 4: map errors → coaching cue → speak (only on change)
    const msg = getTopMessage(state.errors);
    if (msg && msg.message !== lastCueRef.current) {
      lastCueRef.current = msg.message;
      speak(msg.message);
    } else if (!msg) {
      lastCueRef.current = '';
    }
  }, [detector]);

  const handleError = useCallback((msg: string) => {
    console.warn('[PoseWebView]', msg);
  }, []);

  // ── Derived UI values ─────────────────────────────────────────────────────

  const feedbackMsg = getTopMessage(squatState.errors);
  const feedbackColor =
    feedbackMsg?.severity === 'error'   ? '#FF4444' :
    feedbackMsg?.severity === 'warning' ? '#FFAA00' : '#00FF88';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Layer 1: MediaPipe pose detection inside WebView */}
      <PoseWebView onLandmarks={handleLandmarks} onError={handleError} />

      {/* Layer 2: SVG skeleton drawn over the camera preview */}
      <SkeletonOverlay landmarks={landmarks} />

      {/* Layer 3: HUD — reps, phase, angle, coaching feedback */}
      <View style={styles.hud} pointerEvents="none">
        <Text style={styles.reps}>{squatState.reps}</Text>
        <Text style={styles.repsLabel}>REPS</Text>

        <View style={[
          styles.phaseBadge,
          squatState.phase === 'down' && styles.phaseBadgeDown,
        ]}>
          <Text style={styles.phaseText}>
            {squatState.phase === 'down' ? 'AT DEPTH' : 'STANDING'}
          </Text>
        </View>

        <Text style={styles.angle}>Knee {kneeAngle.toFixed(0)}°</Text>

        <Text style={[styles.feedback, { color: feedbackColor }]}>
          {feedbackMsg ? feedbackMsg.message : '✓ Good form'}
        </Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  hud: {
    position: 'absolute',
    top: 48,
    right: 16,
    alignItems: 'flex-end',
    gap: 6,
  },
  reps: {
    fontSize: 64,
    fontWeight: '800',
    color: '#00FF88',
    lineHeight: 68,
  },
  repsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00FF88',
    letterSpacing: 2,
    marginTop: -6,
  },
  phaseBadge: {
    marginTop: 8,
    backgroundColor: 'rgba(0,255,136,0.15)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#00FF88',
  },
  phaseBadgeDown: {
    backgroundColor: 'rgba(255,170,0,0.15)',
    borderColor: '#FFAA00',
  },
  phaseText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  angle: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 4,
  },
  feedback: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    maxWidth: 180,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
});

