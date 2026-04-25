import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { createExerciseDetector, ExerciseState } from '../utils/exerciseDetector';

// ── Fake landmark data ────────────────────────────────────────────────────────

/**
 * A minimal set of { x, y } points for each landmark the detector needs.
 * Coordinates are in MediaPipe's normalized 0–1 space (front-camera mirrored).
 */
interface FakeFrame {
  label: string; // Human-readable description for the log
  leftShoulder:  { x: number; y: number };
  leftHip:       { x: number; y: number };
  leftKnee:      { x: number; y: number };
  leftAnkle:     { x: number; y: number };
  rightShoulder: { x: number; y: number };
  rightHip:      { x: number; y: number };
  rightKnee:     { x: number; y: number };
  rightAnkle:    { x: number; y: number };
}

/**
 * Simulated squat sequence (3 full reps).
 *
 * Standing pose  → knee angle ≈ 170° (above UP_THRESHOLD 160°)
 * Bottom of squat → knee angle ≈ 80°  (below DOWN_THRESHOLD 100°)
 *
 * The hip-ankle-knee geometry is kept consistent so the angle math works
 * correctly — only the knee y-value changes between standing and squatting.
 */
const STANDING: FakeFrame = {
  label:         'Standing (up)',
  leftShoulder:  { x: 0.38, y: 0.25 },
  leftHip:       { x: 0.40, y: 0.52 },
  leftKnee:      { x: 0.40, y: 0.70 }, // straight — angle ≈ 170°
  leftAnkle:     { x: 0.40, y: 0.90 },
  rightShoulder: { x: 0.62, y: 0.25 },
  rightHip:      { x: 0.60, y: 0.52 },
  rightKnee:     { x: 0.60, y: 0.70 },
  rightAnkle:    { x: 0.60, y: 0.90 },
};

const SQUAT_BOTTOM: FakeFrame = {
  label:         'Squat depth (down)',
  leftShoulder:  { x: 0.38, y: 0.35 }, // torso lowers slightly
  leftHip:       { x: 0.40, y: 0.58 },
  leftKnee:      { x: 0.40, y: 0.63 }, // knee bends — angle ≈ 80°
  leftAnkle:     { x: 0.40, y: 0.90 },
  rightShoulder: { x: 0.62, y: 0.35 },
  rightHip:      { x: 0.60, y: 0.58 },
  rightKnee:     { x: 0.60, y: 0.63 },
  rightAnkle:    { x: 0.60, y: 0.90 },
};

const VALGUS_FRAME: FakeFrame = {
  label:         'Squat depth + knee valgus warning',
  leftShoulder:  { x: 0.38, y: 0.35 },
  leftHip:       { x: 0.40, y: 0.58 },
  leftKnee:      { x: 0.36, y: 0.63 }, // knee caved inward past ankle
  leftAnkle:     { x: 0.40, y: 0.90 },
  rightShoulder: { x: 0.62, y: 0.35 },
  rightHip:      { x: 0.60, y: 0.58 },
  rightKnee:     { x: 0.64, y: 0.63 }, // right knee also caved inward
  rightAnkle:    { x: 0.60, y: 0.90 },
};

// 3 clean reps then 1 rep with valgus at the bottom
const SQUAT_SEQUENCE: FakeFrame[] = [
  STANDING, SQUAT_BOTTOM,            // rep 1
  STANDING, SQUAT_BOTTOM,            // rep 2
  STANDING, SQUAT_BOTTOM,            // rep 3
  STANDING, VALGUS_FRAME,            // rep 4 with valgus error at depth
  STANDING,                          // return to standing
];

// ── Log entry type ────────────────────────────────────────────────────────────

interface LogEntry {
  frame: string;
  phase: string;
  reps: number;
  kneeAngle: number;
  errors: string[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TestScreen() {
  const detector = useRef(createExerciseDetector('squat')).current;
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameIdxRef = useRef(0);

  // ── Simulation control ──────────────────────────────────────────────────

  function startTest() {
    if (running) return;

    // Reset everything
    detector.reset();
    frameIdxRef.current = 0;
    setLog([]);
    setRunning(true);

    // Feed one fake frame every 600 ms so the user can read the log in real time
    intervalRef.current = setInterval(() => {
      const idx = frameIdxRef.current;

      if (idx >= SQUAT_SEQUENCE.length) {
        // Sequence finished — stop the interval
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setRunning(false);
        return;
      }

      const frame = SQUAT_SEQUENCE[idx];

      // Feed frame into the exercise detector
      const state: ExerciseState = detector.update({
        leftShoulder:  frame.leftShoulder,
        leftHip:       frame.leftHip,
        leftKnee:      frame.leftKnee,
        leftAnkle:     frame.leftAnkle,
        rightShoulder: frame.rightShoulder,
        rightHip:      frame.rightHip,
        rightKnee:     frame.rightKnee,
        rightAnkle:    frame.rightAnkle,
      });

      // Build a human-readable log entry
      const entry: LogEntry = {
        frame:     `#${idx + 1} — ${frame.label}`,
        phase:     state.phase.toUpperCase(),
        reps:      state.reps,
        kneeAngle: Math.round(state.primaryAngle),
        errors:    state.errors.map((e) => `${e.type} [${e.severity}]`),
      };

      // Append to log (newest at top)
      setLog((prev) => [entry, ...prev]);

      frameIdxRef.current = idx + 1;
    }, 600);
  }

  function resetTest() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    detector.reset();
    frameIdxRef.current = 0;
    setLog([]);
    setRunning(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const lastEntry = log[0]; // most recent frame result

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Squat Detector Test</Text>
      <Text style={styles.subtitle}>
        Simulates {SQUAT_SEQUENCE.length} frames of fake landmark data
      </Text>

      {/* ── Live stats panel ──────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{lastEntry?.reps ?? 0}</Text>
          <Text style={styles.statLabel}>REPS</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={[
            styles.statValue,
            lastEntry?.phase === 'DOWN' && { color: '#FFAA00' },
          ]}>
            {lastEntry?.phase ?? '—'}
          </Text>
          <Text style={styles.statLabel}>PHASE</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statValue}>{lastEntry?.kneeAngle ?? '—'}°</Text>
          <Text style={styles.statLabel}>KNEE</Text>
        </View>
      </View>

      {/* ── Error badge (visible when last frame had errors) ─────────── */}
      {lastEntry?.errors.length > 0 && (
        <View style={styles.errorBadge}>
          {lastEntry.errors.map((e, i) => (
            <Text key={i} style={styles.errorBadgeText}>⚠ {e}</Text>
          ))}
        </View>
      )}

      {/* ── Buttons ───────────────────────────────────────────────────── */}
      <View style={styles.buttons}>
        <Pressable
          style={[styles.button, running && styles.buttonDisabled]}
          onPress={startTest}
          disabled={running}
        >
          <Text style={styles.buttonText}>
            {running ? 'Running…' : '▶ Start Squat Test'}
          </Text>
        </Pressable>

        <Pressable style={styles.resetButton} onPress={resetTest}>
          <Text style={styles.resetButtonText}>↺ Reset</Text>
        </Pressable>
      </View>

      {/* ── Frame-by-frame log ────────────────────────────────────────── */}
      <Text style={styles.logHeader}>Frame Log</Text>
      <ScrollView style={styles.log} contentContainerStyle={{ gap: 6 }}>
        {log.length === 0 && (
          <Text style={styles.logEmpty}>Press "Start Squat Test" to begin.</Text>
        )}
        {log.map((entry, i) => (
          <View
            key={i}
            style={[
              styles.logRow,
              entry.errors.length > 0 && styles.logRowError,
            ]}
          >
            <Text style={styles.logFrame}>{entry.frame}</Text>
            <Text style={styles.logDetail}>
              Phase: <Text style={styles.logHighlight}>{entry.phase}</Text>
              {'   '}Reps: <Text style={styles.logHighlight}>{entry.reps}</Text>
              {'   '}Knee: <Text style={styles.logHighlight}>{entry.kneeAngle}°</Text>
            </Text>
            {entry.errors.map((e, ei) => (
              <Text key={ei} style={styles.logError}>⚠ {e}</Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    paddingTop: 52,
    paddingHorizontal: 16,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  // ── Stats ────────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statBox: {
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  statValue: {
    color: '#00FF88',
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    color: '#555',
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 2,
  },
  // ── Error badge ──────────────────────────────────────────────────────────
  errorBadge: {
    backgroundColor: 'rgba(255,68,68,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF4444',
    padding: 8,
    marginBottom: 10,
    gap: 4,
  },
  errorBadgeText: {
    color: '#FF4444',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  // ── Buttons ──────────────────────────────────────────────────────────────
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  button: {
    flex: 1,
    backgroundColor: '#00FF88',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#1a4d38',
  },
  buttonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 15,
  },
  resetButton: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  resetButtonText: {
    color: '#aaa',
    fontSize: 15,
  },
  // ── Log ──────────────────────────────────────────────────────────────────
  logHeader: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 6,
  },
  log: {
    flex: 1,
  },
  logEmpty: {
    color: '#444',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
  },
  logRow: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#00FF88',
  },
  logRowError: {
    borderLeftColor: '#FF4444',
    backgroundColor: '#1e1212',
  },
  logFrame: {
    color: '#888',
    fontSize: 11,
    marginBottom: 3,
  },
  logDetail: {
    color: '#aaa',
    fontSize: 13,
  },
  logHighlight: {
    color: '#fff',
    fontWeight: '600',
  },
  logError: {
    color: '#FF6666',
    fontSize: 12,
    marginTop: 3,
  },
});
