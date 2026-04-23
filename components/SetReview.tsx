import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { SessionData, RecordedFrame } from '../utils/sessionRecorder';
import { FormErrorType } from '../utils/exerciseDetector';
import ReviewOverlay from './ReviewOverlay';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SetReviewProps {
  /** The session recorded by sessionRecorder.getSession(). */
  session: SessionData;
  /** Called when the user taps the close / done button. */
  onClose?: () => void;
}

// Playback frame-rate in ms per frame (~30 fps replay)
const FRAME_INTERVAL_MS = 33;

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * SetReview
 *
 * Post-set review screen that replays the recorded pose skeleton frame-by-frame.
 * Problem joints are highlighted in red via ReviewOverlay.
 * A scrubable timeline at the bottom shows where errors occurred.
 *
 * Playback is driven by a setInterval that advances the frame index at ~30 fps.
 * The user can pause/resume at any time, or scrub the timeline to jump to a frame.
 */
export default function SetReview({ session, onClose }: SetReviewProps) {
  const { width } = useWindowDimensions();

  // Index into session.frames for the currently displayed frame
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying]   = useState(false);

  // Interval handle stored in a ref so it can be cleared without stale closures
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalFrames = session.frames.length;

  // ── Playback control ────────────────────────────────────────────────────────

  /** Advance one frame; pause automatically at the end. */
  const stepForward = useCallback(() => {
    setFrameIndex((prev) => {
      if (prev >= totalFrames - 1) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [totalFrames]);

  /** Start the playback interval. */
  const play = useCallback(() => {
    if (intervalRef.current) return; // already playing
    intervalRef.current = setInterval(stepForward, FRAME_INTERVAL_MS);
    setIsPlaying(true);
  }, [stepForward]);

  /** Stop the playback interval. */
  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  /** Toggle between play and pause. */
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      // Restart from beginning if playback reached the end
      if (frameIndex >= totalFrames - 1) setFrameIndex(0);
      play();
    }
  }, [isPlaying, frameIndex, totalFrames, play, pause]);

  // Clean up interval when the component unmounts
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Pause automatically when isPlaying becomes false (end of set)
  useEffect(() => {
    if (!isPlaying) pause();
  }, [isPlaying, pause]);

  // ── Current frame data ──────────────────────────────────────────────────────

  const currentFrame: RecordedFrame = session.frames[frameIndex];

  // Build a Set of active error types for the current frame so ReviewOverlay
  // can decide which joints to colour red in O(1) lookups
  const activeErrors = new Set<FormErrorType>(
    currentFrame.errors.map((e) => e.type),
  );

  // Progress through the set as a 0–1 value (used by the seek bar)
  const progress = totalFrames > 1 ? frameIndex / (totalFrames - 1) : 0;

  // ── Timeline tap handler ────────────────────────────────────────────────────

  /**
   * When the user taps the timeline bar, jump to the nearest frame.
   * We use the tap's x-position relative to the timeline width.
   */
  function handleTimelineTap(tapX: number, timelineWidth: number) {
    pause();
    const ratio     = Math.max(0, Math.min(1, tapX / timelineWidth));
    const targetIdx = Math.round(ratio * (totalFrames - 1));
    setFrameIndex(targetIdx);
  }

  // ── Error marker positions for the timeline ─────────────────────────────────

  /**
   * Each unique error event is shown as a small coloured tick on the timeline.
   * We deduplicate by timestamp to avoid stacking ticks.
   */
  const timelineMarkers = session.errorEvents.map((ev, i) => {
    const ratio = (ev.timestamp - session.startTime) / session.durationMs;
    return {
      key:      `${i}-${ev.type}`,
      xPercent: ratio,
      color:    ev.severity === 'error' ? '#FF2222' : '#FFAA00',
    };
  });

  // ── Elapsed time display ────────────────────────────────────────────────────

  const elapsedMs = currentFrame.timestamp - session.startTime;
  const totalSec  = (session.durationMs / 1000).toFixed(1);
  const nowSec    = (elapsedMs         / 1000).toFixed(1);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Dark background (in a real app this could be a frozen screenshot) */}
      <View style={styles.canvas} />

      {/* ── Skeleton + error highlight overlay ─────────────────────────── */}
      <ReviewOverlay
        landmarks={currentFrame.landmarks}
        activeErrors={activeErrors}
      />

      {/* ── Error badge (shown when the current frame has errors) ─────── */}
      {currentFrame.errors.length > 0 && (
        <View style={styles.errorBadge}>
          {currentFrame.errors.map((e, i) => (
            <Text
              key={i}
              style={[
                styles.errorBadgeText,
                e.severity === 'error' && styles.errorBadgeTextCritical,
              ]}
            >
              {e.type === 'KNEE_VALGUS'
                ? '⚠ Knees caving inward'
                : '⚠ Back leaning too far forward'}
            </Text>
          ))}
        </View>
      )}

      {/* ── Bottom controls ────────────────────────────────────────────── */}
      <View style={styles.controls}>

        {/* Timeline bar */}
        <View
          style={styles.timeline}
          onStartShouldSetResponder={() => true}
          onResponderGrant={(e) =>
            handleTimelineTap(
              e.nativeEvent.locationX,
              width - 32, // timeline width = screen width minus horizontal padding
            )
          }
        >
          {/* Progress fill */}
          <View style={[styles.timelineFill, { width: `${progress * 100}%` }]} />

          {/* Error markers */}
          {timelineMarkers.map((m) => (
            <View
              key={m.key}
              style={[
                styles.timelineMarker,
                { left: `${m.xPercent * 100}%`, backgroundColor: m.color },
              ]}
            />
          ))}
        </View>

        {/* Time counter */}
        <Text style={styles.timeLabel}>
          {nowSec}s / {totalSec}s
        </Text>

        {/* Play / Pause */}
        <Pressable style={styles.playButton} onPress={togglePlayback}>
          <Text style={styles.playButtonText}>
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </Text>
        </Pressable>

        {/* Close */}
        {onClose && (
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Done</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  // Placeholder background — swap for an <Image> or <Video> in production
  canvas: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a2e',
  },
  // Error badge shown top-center when errors are active
  errorBadge: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  errorBadgeText: {
    color: '#FFAA00',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorBadgeTextCritical: {
    color: '#FF4444',
  },
  // Bottom control strip
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 12,
  },
  // Scrubable timeline bar
  timeline: {
    height: 28,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  timelineFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#00FF88',
    opacity: 0.6,
  },
  // Coloured tick for each error event
  timelineMarker: {
    position: 'absolute',
    width: 4,
    top: 0,
    bottom: 0,
    borderRadius: 2,
  },
  timeLabel: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
  },
  playButton: {
    backgroundColor: '#00FF88',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  playButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 16,
  },
  closeButton: {
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#555',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 15,
  },
});
