import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Camera, CameraView as ExpoCameraView } from 'expo-camera';

/**
 * CameraView
 *
 * Requests camera permission using Camera.requestCameraPermissionsAsync(),
 * then shows a live front-facing preview.
 *
 * States handled:
 *   1. Loading  — permission request is in-flight
 *   2. Denied   — user refused access
 *   3. Granted  — camera preview is shown
 */
export default function CameraView() {
  // null = still loading, true = granted, false = denied
  const [granted, setGranted] = useState<boolean | null>(null);

  // Ask for permission once when the component mounts
  useEffect(() => {
    async function requestPermission() {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setGranted(status === 'granted');
    }
    requestPermission();
  }, []); // empty deps → runs only on mount

  // ── Loading state ──────────────────────────────────────────────────────────
  if (granted === null) {
    return (
      <View style={styles.centered}>
        {/* Spinner shown while the OS permission dialog is pending */}
        <ActivityIndicator size="large" color="#00FF88" />
        <Text style={styles.message}>Requesting camera access…</Text>
      </View>
    );
  }

  // ── Permission denied ──────────────────────────────────────────────────────
  if (!granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>
          Camera access was denied.{'\n'}
          Please enable it in your device settings.
        </Text>
      </View>
    );
  }

  // ── Permission granted — show front camera preview ─────────────────────────
  return (
    <View style={styles.container}>
      <ExpoCameraView
        style={styles.camera}
        facing="front" // Use the selfie / front-facing camera
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-screen wrapper passed to the camera preview
  container: {
    flex: 1,
  },
  // Camera preview fills its container completely
  camera: {
    flex: 1,
  },
  // Used for loading and denied states — centres content on screen
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#000',
  },
  message: {
    marginTop: 16,
    fontSize: 15,
    textAlign: 'center',
    color: '#ccc',
    lineHeight: 22,
  },
});
