import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { View } from 'react-native';

import type { DeckMode } from '@/domain';
import { ProfileButton } from '@/features/shell';
import { haptics } from '@/lib/haptics';
import {
  GlassIconButton,
  GlassMenu,
  TabHeader,
  useGlassMenu,
  type GlassBadge,
  type GlassMenuItem,
} from '@/ui';

import { DeckModePill } from './DeckModePill';
import { useUnreadCount } from '../deps';
import type { ModeOption } from '../modes';

export interface DiscoverHeaderProps {
  modes: readonly ModeOption[];
  mode: DeckMode;
  onModeChange: (mode: DeckMode) => void;
  canUndo: boolean;
  onUndo: () => void;
}

/** Counts above this read as "9+" on the options button. */
const MAX_BADGE = 9;

/**
 * The Discover tab header: one row with the title, the lime mode pill, the deck options circle and
 * the profile circle. The options circle opens a glass menu with preferences, the inbox (its
 * unread count rides on the circle) and, while the last swipe can still be taken back, undo.
 */
export const DiscoverHeader = memo(function DiscoverHeader({
  modes,
  mode,
  onModeChange,
  canUndo,
  onUndo,
}: DiscoverHeaderProps) {
  const router = useRouter();
  const unread = useUnreadCount();
  const menu = useGlassMenu();
  const { show } = menu;

  const open = useCallback(() => {
    haptics.selection();
    show();
  }, [show]);

  const items = useMemo<GlassMenuItem[]>(() => {
    const list: GlassMenuItem[] = [
      {
        key: 'preferences',
        label: 'Preferences',
        icon: 'slider.horizontal.3',
        accessibilityHint: 'Cuisines, time, diet and allergies',
        testID: 'discover-option-preferences',
        onPress: () => router.push('/preferences'),
      },
      {
        key: 'notifications',
        label: unread > 0 ? `Notifications · ${unread} new` : 'Notifications',
        icon: unread > 0 ? 'bell.badge' : 'bell',
        testID: 'discover-option-notifications',
        onPress: () => router.push('/notifications'),
      },
    ];
    if (canUndo) {
      list.push({
        key: 'undo',
        label: 'Undo last swipe',
        icon: 'arrow.uturn.backward',
        testID: 'discover-option-undo',
        onPress: onUndo,
      });
    }
    return list;
  }, [canUndo, onUndo, router, unread]);

  const badge: GlassBadge | undefined =
    unread > 0
      ? {
          label: unread > MAX_BADGE ? `${MAX_BADGE}+` : String(unread),
          accessibilityLabel: `${unread} unread ${unread === 1 ? 'notification' : 'notifications'}`,
        }
      : undefined;

  return (
    <>
      <TabHeader
        title="Discover"
        testID="discover-header"
        leading={<DeckModePill modes={modes} value={mode} onChange={onModeChange} />}
        trailing={
          <>
            <View ref={menu.triggerRef} collapsable={false}>
              <GlassIconButton
                icon="slider.horizontal.3"
                accessibilityLabel="Deck options"
                accessibilityHint="Preferences, notifications and undo"
                onPress={open}
                testID="discover-options"
                {...(badge === undefined ? {} : { badge })}
              />
            </View>
            <ProfileButton testID="discover-profile" />
          </>
        }
      />
      <GlassMenu
        controller={menu}
        items={items}
        dismissLabel="Close deck options"
        testID="discover-options-menu"
      />
    </>
  );
});
