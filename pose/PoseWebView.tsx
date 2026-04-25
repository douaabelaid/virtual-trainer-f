import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

// ── TypeScript types ──────────────────────────────────────────────────────────

/**
 * A single MediaPipe pose landmark.
 * x, y, z are normalized coordinates in the range [0, 1].
 * visibility is the model's confidence that the joint is visible (0–1).
 */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseWebViewProps {
  /** Fired every frame (~30 fps) with the 33 detected landmarks. */
  onLandmarks: (landmarks: Landmark[]) => void;
  /** Fired if the WebView encounters an unrecoverable error. */
  onError?: (message: string) => void;
}

// ── HTML page loaded inside the WebView ───────────────────────────────────────
// Self-contained: imports MediaPipe from CDN, opens the front camera,
// runs pose detection, and posts landmarks to React Native each frame.

const POSE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; }
    video  { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
    #status {
      position: absolute; bottom: 8px; left: 8px; z-index: 10;
      color: #fff; background: rgba(0,0,0,0.55);
      font: 12px/1.4 sans-serif; padding: 3px 8px; border-radius: 4px;
    }
  </style>
</head>
<body>
  <video id="video" autoplay playsinline muted></video>
  <div id="status">Loading…</div>

  <script type="module">
    // Step 1: Import MediaPipe tasks-vision from jsDelivr CDN
    import {
      PoseLandmarker,
      FilesetResolver,
    } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

    const status = document.getElementById("status");
    const video  = document.getElementById("video");

    // Helper: post a message to the React Native layer
    function postRN(data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }

    async function init() {
      try {
        // Step 2: Load the WASM runtime
        status.textContent = "Loading WASM…";
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        // Step 3: Download the lite pose model (~3 MB)
        status.textContent = "Loading model…";
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO", // Optimised for continuous frames
          numPoses: 1,
        });

        // Step 4: Open the front-facing camera via getUserMedia
        status.textContent = "Starting camera…";
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        video.srcObject = stream;
        await new Promise((res) => { video.onloadedmetadata = res; });
        await video.play();

        status.textContent = "Detecting…";
        postRN({ type: "ready" });

        // Step 5: Run detection on every animation frame
        let lastTs = -1;
        function detect() {
          const now = performance.now();
          if (now !== lastTs) {
            lastTs = now;
            const result = poseLandmarker.detectForVideo(video, now);
            if (result.landmarks && result.landmarks.length > 0) {
              // Post all 33 landmarks to React Native
              // Each landmark: { x, y, z, visibility } — all 0–1
              postRN({ type: "landmarks", landmarks: result.landmarks[0] });
            }
          }
          requestAnimationFrame(detect);
        }
        detect();

      } catch (err) {
        status.textContent = "Error: " + err.message;
        postRN({ type: "error", message: err.message });
      }
    }

    init();
  </script>
</body>
</html>`;

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * PoseWebView
 *
 * Runs MediaPipe Pose inside a full-screen WebView.
 * Fires onLandmarks(landmarks) every frame a pose is detected.
 *
 * Data flow:
 *   getUserMedia → MediaPipe → postMessage → onMessage → onLandmarks
 */
export default function PoseWebView({ onLandmarks, onError }: PoseWebViewProps) {
  // Show a loading overlay until the model posts { type: 'ready' }
  const [ready, setReady] = useState(false);

  // Parse every message the WebView sends to React Native
  function handleMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.type === 'ready') {
        setReady(true);
      } else if (msg.type === 'landmarks') {
        // Forward the 33 landmarks to the parent component
        onLandmarks(msg.landmarks as Landmark[]);
      } else if (msg.type === 'error') {
        onError?.(msg.message);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  return (
    <View style={styles.container}>
      <WebView
        style={styles.webview}
        // Force the webview to use a secure context so getUserMedia works
        // (navigator.mediaDevices.getUserMedia requires `https://` or `localhost`)
        source={{ html: POSE_HTML, baseUrl: 'https://localhost' }}
        // Allow JavaScript (required for MediaPipe)
        javaScriptEnabled
        originWhitelist={['*']}
        // Allow video to play inline without fullscreen on iOS
        allowsInlineMediaPlayback
        // Allow autoplay without a user tap
        mediaPlaybackRequiresUserAction={false}
        // Android: auto-grant the camera permission inside the WebView
        onPermissionRequest={(req: any) => req.grant(req.resources)}
        // Hardware compositing improves WebGL / canvas performance on Android
        androidLayerType="hardware"
        // Receive messages from the HTML page
        onMessage={handleMessage}
      />

      {/* Loading overlay — visible until the model finishes downloading */}
      {!ready && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#00FF88" />
          <Text style={styles.overlayText}>Loading MediaPipe Pose…</Text>
          <Text style={styles.overlaySubtext}>~5 MB first-time download</Text>
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
  // Covers the WebView while the WASM + model download
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 14,
  },
  overlaySubtext: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
});
