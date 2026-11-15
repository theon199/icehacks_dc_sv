import { memo, useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { GlassIconButton, GlassMenu, useGlassMenu, type GlassMenuItem } from '@/ui';

import type { FeedMode } from '../api/schemas';

export const FEED_MODES: readonly { value: FeedMode; label: string }[] = [
  { value: 'following', label: 'Following' },
  { value: 'popular', label: 'Popular' },
  { value: 'new', label: 'New' },
];

/**
 * The header's filter circle: opens a glass menu to choose the feed (Following, Popular, New),
 * with the current one checked.
 */
export const FeedModeButton = memo(function FeedModeButton({
  mode,
  onChange,
}: {
  mode: FeedMode;
  onChange: (mode: FeedMode) => void;
}) {
  const menu = useGlassMenu();
  const { show } = menu;
  const open = useCallback(() => {
    haptics.selection();
    show();
  }, [show]);
  const items = useMemo<GlassMenuItem[]>(
    () =>
      FEED_MODES.map((option) => ({
        key: option.value,
        label: option.label,
        selected: option.value === mode,
        testID: `feed-mode-${option.value}`,
        onPress: () => onChange(option.value),
      })),
    [mode, onChange],
  );
  const label = FEED_MODES.find((option) => option.value === mode)?.label ?? '';
  return (
    <>
      <View ref={menu.triggerRef} collapsable={false}>
        <GlassIconButton
          icon="line.3.horizontal.decrease"
          accessibilityLabel={`Feed: ${label}`}
          accessibilityHint="Choose between Following, Popular and New"
          onPress={open}
          testID="feed-mode"
        />
      </View>
      <GlassMenu
        controller={menu}
        items={items}
        dismissLabel="Close feed menu"
        testID="feed-mode-menu"
      />
    </>
  );
});
