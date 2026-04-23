import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

// ── TypeScript types ──────────────────────────────────────────────────────────

/**
 * A single pose landmark returned by MediaPipe.
 * x, y, z are normalized coordinates (0.0 – 1.0 relative to the frame).
 * visibility is how confident MediaPipe is that the landmark is visible (0–1).
 */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/**
 * All 33 MediaPipe Pose landmark indices for easy reference.
 * Use these to look up specific body parts from the landmarks array.
 *
 * Example:  landmarks[POSE_LANDMARKS.LEFT_SHOULDER]
 */
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,  LEFT_EYE: 2,         LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5,        RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,        RIGHT_EAR: 8,
  MOUTH_LEFT: 9,      MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,     RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,     RIGHT_WRIST: 16,
  LEFT_PINKY: 17,     RIGHT_PINKY: 18,
  LEFT_INDEX: 19,     RIGHT_INDEX: 20,
  LEFT_THUMB: 21,     RIGHT_THUMB: 22,
  LEFT_HIP: 23,       RIGHT_HIP: 24,
  LEFT_KNEE: 25,      RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,     RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,      RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
} as const;

// Message shapes sent from the WebView to React Native
type WebViewMessage =
  | { type: 'ready' }
  | { type: 'pose'; landmarks: Landmark[] }
  | { type: 'error'; error: string };

export interface PoseLandmarkerProps {
  /** Called every video frame that a pose is detected. */
  onPoseDetected?: (landmarks: Landmark[]) => void;
  /** Called when an error occurs inside the WebView (e.g. WASM load failure). */
  onError?: (message: string) => void;
}

// ── HTML page that runs MediaPipe Pose inside the WebView ─────────────────────
// This is a self-contained HTML document. It:
//   1. Imports MediaPipe tasks-vision from a CDN
//   2. Loads the WASM runtime and lite pose model
//   3. Opens the front camera with getUserMedia
//   4. Runs pose detection on every video frame
//   5. Posts the 33 landmarks back to React Native via postMessage

const POSE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; }
    /* Video and canvas overlap each other, filling the whole screen */
    video, canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
    #status {
      position: absolute; bottom: 12px; left: 12px;
      color: #fff; background: rgba(0,0,0,0.5);
      font: 13px/1.4 sans-serif; padding: 4px 8px; border-radius: 4px; z-index: 10;
    }
  </style>
</head>
<body>
  <video id="video" autoplay playsinline muted></video>
  <canvas id="canvas"></canvas>
  <div id="status">Loading MediaPipe…</div>

  <script type="module">
    // ── Step 1: Import MediaPipe tasks-vision (ESM build from CDN) ──────────
    import {
      PoseLandmarker,
      FilesetResolver,
      DrawingUtils,
    } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

    const statusEl = document.getElementById("status");
    const video    = document.getElementById("video");
    const canvas   = document.getElementById("canvas");
    const ctx      = canvas.getContext("2d");

    // Helper: send a message back to the React Native layer
    function postRN(data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      } else {
        // Fallback for browser testing outside of React Native
        console.log("[postRN]", data);
      }
    }

    async function init() {
      try {
        // ── Step 2: Load the WASM runtime ──────────────────────────────────
        statusEl.textContent = "Loading WASM runtime…";
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        // ── Step 3: Download and initialise the pose model ─────────────────
        // We use the "lite" model — smallest file size, best for mobile.
        statusEl.textContent = "Loading pose model…";
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU", // Use GPU when available, falls back to CPU
          },
          runningMode: "VIDEO",  // Optimised for continuous video frames
          numPoses: 1,           // Detect at most 1 person per frame
        });

        // ── Step 4: Open the front-facing camera ───────────────────────────
        statusEl.textContent = "Starting camera…";
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",          // Front camera
            width:  { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        video.srcObject = stream;

        // Wait for the video metadata (width/height) to be ready
        await new Promise((resolve) => { video.onloadedmetadata = resolve; });
        await video.play();

        // Match the canvas size to the video size
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;

        const drawingUtils = new DrawingUtils(ctx);

        statusEl.textContent = "Detecting pose…";
        postRN({ type: "ready" }); // Tell React Native the model is live

        // ── Step 5: Per-frame detection loop ───────────────────────────────
        let lastTimestamp = -1;

        function detectFrame() {
          const now = performance.now();

          // Skip duplicate timestamps (MediaPipe requires strictly increasing values)
          if (now !== lastTimestamp) {
            lastTimestamp = now;

            // Run pose detection on the current video frame
            const result = poseLandmarker.detectForVideo(video, now);

            // Clear the canvas, then draw a horizontally mirrored video frame
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1); // Mirror so the user's left/right feel natural
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            if (result.landmarks && result.landmarks.length > 0) {
              const landmarks = result.landmarks[0]; // First (and only) person

              // Draw skeleton connectors and joint dots over the video
              drawingUtils.drawConnectors(
                landmarks,
                PoseLandmarker.POSE_CONNECTIONS,
                { color: "#00FF88", lineWidth: 2 }
              );
              drawingUtils.drawLandmarks(landmarks, {
                color: "#FF4444",
                lineWidth: 1,
                radius: 3,
              });

              // ── Step 6: Send the 33 landmarks to React Native ─────────────
              // Each landmark: { x, y, z, visibility } — all numbers 0–1
              postRN({ type: "pose", landmarks });
            }
          }

          // Schedule the next frame
          requestAnimationFrame(detectFrame);
        }

        detectFrame();

      } catch (err) {
        statusEl.textContent = "Error: " + err.message;
        postRN({ type: "error", error: err.message });
      }
    }

    // Kick everything off
    init();
  </script>
</body>
</html>`;

// ── React Native Component ────────────────────────────────────────────────────

export default function PoseLandmarkerView({
  onPoseDetected,
  onError,
}: PoseLandmarkerProps) {
  const webviewRef = useRef<WebView>(null);

  // Track whether the model has finished loading inside the WebView
  const [isReady, setIsReady] = useState(false);

  // ── Step 7: Receive messages posted from the WebView ─────────────────────
  function handleMessage(event: WebViewMessageEvent) {
    let msg: WebViewMessage;

    try {
      msg = JSON.parse(event.nativeEvent.data) as WebViewMessage;
    } catch {
      return; // Ignore malformed messages
    }

    if (msg.type === 'ready') {
      // Model loaded — hide the loading overlay
      setIsReady(true);
    } else if (msg.type === 'pose') {
      // Forward the 33 landmarks to the parent component
      onPoseDetected?.(msg.landmarks);
    } else if (msg.type === 'error') {
      onError?.(msg.error);
    }
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        style={styles.webview}
        // Provide the HTML string directly — no local server needed
        source={{ html: POSE_HTML }}
        // ── Permissions / media flags ──────────────────────────────────────
        javaScriptEnabled
        originWhitelist={['*']}
        // Allow video to play inline without a fullscreen tap (iOS)
        allowsInlineMediaPlayback
        // Allow autoplay without a user gesture (needed for the camera stream)
        mediaPlaybackRequiresUserAction={false}
        // On Android, automatically grant camera permission inside the WebView
        onPermissionRequest={(request) => request.grant(request.resources)}
        // Hardware compositing improves WebGL/canvas performance on Android
        androidLayerType="hardware"
        // ── Message bridge ────────────────────────────────────────────────
        onMessage={handleMessage}
      />

      {/* Loading overlay — shown while the WASM model is downloading */}
      {!isReady && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.overlayText}>Loading MediaPipe Pose…</Text>
          <Text style={styles.overlaySubtext}>
            Downloading WASM + model (~5 MB)
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
  },
  // Semi-transparent overlay that covers the WebView while the model loads
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 12,
  },
  overlaySubtext: {
    color: '#aaaaaa',
    fontSize: 13,
    marginTop: 4,
  },
});
