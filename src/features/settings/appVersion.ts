import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface AppVersion {
  version: string;
  build: string | null;
}

/** Marketing version from the app config and the native build number, when there is one. */
export function readAppVersion(): AppVersion {
  const config = Constants.expoConfig;
  const version = config?.version ?? '0.0.0';
  const native =
    Platform.OS === 'ios'
      ? (Constants.platform?.ios?.buildNumber ?? config?.ios?.buildNumber)
      : Platform.OS === 'android'
        ? (config?.android?.versionCode?.toString() ?? null)
        : null;
  return { version, build: native ?? null };
}

export function formatAppVersion({ version, build }: AppVersion): string {
  return build ? `Version ${version} (${build})` : `Version ${version}`;
}
