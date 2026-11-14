import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import { GlassIconButton, type GlassBadge } from '@/ui';

export interface ProfileButtonProps {
  /** An already formatted count; omit for no chip. Never pass a made-up or zero count. */
  badge?: GlassBadge;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The persistent profile entry: the glass person circle that opens `/profile`. Every tab header
 * ends with it, in the same spot. The optional count chip rides outside the glass, which would
 * otherwise clip it.
 */
export function ProfileButton({ badge, style, testID = 'profile-button' }: ProfileButtonProps) {
  const router = useRouter();
  const open = useCallback(() => {
    haptics.selection();
    router.push('/profile');
  }, [router]);
  return (
    <GlassIconButton
      icon="person"
      accessibilityLabel="Open your profile"
      accessibilityHint="Your cooking profile, badges and friends"
      onPress={open}
      testID={testID}
      {...(badge === undefined ? {} : { badge })}
      {...(style === undefined ? {} : { style })}
    />
  );
}
