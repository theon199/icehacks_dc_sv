import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DeckMode } from '@/domain';
import { Header, IconButton, Text } from '@/ui';
import { gutter, space } from '@/ui/tokens';

import { ModeSwitcher } from './ModeSwitcher';
import { NotificationBell } from '../deps';
import type { ModeOption } from '../modes';

export interface DiscoverHeaderProps {
  onProfile: () => void;
  modes: readonly ModeOption[];
  mode: DeckMode;
  onModeChange: (mode: DeckMode) => void;
  /** Today's ranking note from Health, if any. */
  note: string | null;
}

/**
 * Tab title with the notifications and profile controls, then the mode pill and today's note.
 * The pill sits on its own row so the title never truncates on narrow phones next to three
 * controls.
 */
export const DiscoverHeader = memo(function DiscoverHeader({
  onProfile,
  modes,
  mode,
  onModeChange,
  note,
}: DiscoverHeaderProps) {
  return (
    <View style={styles.container}>
      <Header
        size="tab"
        title="Discover"
        trailing={
          <>
            <NotificationBell variant="glass" testID="discover-notifications" />
            <IconButton
              testID="discover-profile"
              icon="person"
              accessibilityLabel="Profile"
              variant="glass"
              onPress={onProfile}
            />
          </>
        }
      />
      <View style={styles.modeRow}>
        <ModeSwitcher modes={modes} value={mode} onChange={onModeChange} />
        {note ? (
          <Text variant="footnote" tone="muted" numberOfLines={2} style={styles.note}>
            {note}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: space.md,
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  note: { flex: 1 },
});
