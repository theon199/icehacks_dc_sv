/// <reference types="expo/types" />

// Expo's generated expo-env.d.ts is git-ignored; this reference keeps `tsc` working in CI and fresh
// checkouts before the dev server has run.

declare module '*.db' {
  const assetId: number;
  export default assetId;
}
