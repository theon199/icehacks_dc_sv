import type { ConfigContext, ExpoConfig } from 'expo/config';

import { brandColors } from './src/ui/brandColors';

/**
 * Famara app configuration.
 *
 * Only public values belong here. The EAS project id is read from the environment so the
 * repository stays usable before an EAS project is linked; OTA updates are enabled only when it
 * is present.
 */
const easProjectId = process.env.EAS_PROJECT_ID;

const permissions = {
  camera:
    'Famara uses the camera when you snap your pantry or a dish so it can suggest recipes and estimate nutrition.',
  photos:
    'Famara opens your photo library only when you choose a picture to share, snap, or use as your avatar.',
  location:
    'Famara uses your location while you are using the app to find nearby restaurants that serve a dish.',
  microphone:
    'Famara listens through the microphone only while you dictate a message or say "next" in cook mode.',
  speech:
    'Famara turns your voice into text on this device so you can dictate messages and control cook mode hands-free.',
  healthRead:
    'Famara reads your workouts, sleep and blood glucose, if you allow it, to tailor meal suggestions to your day. This stays on your device unless you choose to sync.',
  healthWrite:
    'Famara does not write medical data. iOS asks for this permission alongside read access; you can leave it off.',
} as const;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Famara',
  slug: 'famara',
  scheme: 'famara',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  backgroundColor: brandColors.oat,
  runtimeVersion: { policy: 'appVersion' },
  ...(easProjectId
    ? {
        updates: { enabled: true, url: `https://u.expo.dev/${easProjectId}` },
        extra: { eas: { projectId: easProjectId } },
      }
    : { updates: { enabled: false } }),
  ios: {
    bundleIdentifier: 'com.famara.app',
    supportsTablet: false,
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSMicrophoneUsageDescription: permissions.microphone,
      NSSpeechRecognitionUsageDescription: permissions.speech,
    },
  },
  android: {
    package: 'com.famara.app',
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: brandColors.basil,
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 168,
        resizeMode: 'contain',
        backgroundColor: brandColors.oat,
        dark: { image: './assets/images/splash-icon.png', backgroundColor: brandColors.night },
      },
    ],
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '18.0' },
      },
    ],
    ['expo-sqlite', { enableFTS: true }],
    'expo-secure-store',
    'expo-font',
    'expo-image',
    'expo-asset',
    'expo-web-browser',
    'expo-localization',
    'expo-sharing',
    'expo-apple-authentication',
    [
      'expo-notifications',
      {
        color: brandColors.basil,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: permissions.camera,
        microphonePermission: permissions.microphone,
        recordAudioAndroid: false,
        barcodeScannerEnabled: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: permissions.photos,
        cameraPermission: permissions.camera,
        microphonePermission: permissions.microphone,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: permissions.location,
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission: permissions.microphone,
        speechRecognitionPermission: permissions.speech,
      },
    ],
    [
      '@kingstinct/react-native-healthkit',
      {
        NSHealthShareUsageDescription: permissions.healthRead,
        NSHealthUpdateUsageDescription: permissions.healthWrite,
        background: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
