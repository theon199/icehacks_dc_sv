import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Thin, fire-and-forget haptics. Calls never throw and are skipped on web or when the user turned
 * haptics off in Settings.
 */
let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function areHapticsEnabled(): boolean {
  return enabled && Platform.OS !== 'web';
}

function run(effect: () => Promise<void>): void {
  if (!areHapticsEnabled()) return;
  effect().catch(() => {
    // Haptics are a nicety; devices without a Taptic Engine simply ignore them.
  });
}

export type ImpactStrength = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';

const impactStyle: Record<ImpactStrength, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
  soft: Haptics.ImpactFeedbackStyle.Soft,
  rigid: Haptics.ImpactFeedbackStyle.Rigid,
};

export const haptics = {
  /** Picking a value: chips, segmented controls, toggles. */
  selection: () => run(() => Haptics.selectionAsync()),
  impact: (strength: ImpactStrength = 'light') => run(() => Haptics.impactAsync(impactStyle[strength])),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
