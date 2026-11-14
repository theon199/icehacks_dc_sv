import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  GlassSurface,
  HEADER_CONTROL_SIZE,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  Text,
  space,
  useTheme,
} from '@/ui';

export interface NearbyHeaderProps {
  title: string;
  /** Where the search is centred, e.g. "Near you" or "Near Lisbon". */
  subtitle: string | null;
  onBack: () => void;
  /** Opens the area search; null hides the control until there is an area to change. */
  onChangeArea: (() => void) | null;
}

/** Bottom edge of the floating header row, for padding content and the map beneath it. */
export function nearbyHeaderBottom(safeTop: number): number {
  return safeTop + HEADER_TOP_OFFSET + HEADER_CONTROL_SIZE;
}

/**
 * The row floating over the map: a glass back circle, a glass pill naming the dish and where the
 * search is centred, and a glass circle to search another area.
 */
export const NearbyHeader = memo(function NearbyHeader({
  title,
  subtitle,
  onBack,
  onChangeArea,
}: NearbyHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.row, { top: insets.top + HEADER_TOP_OFFSET }]}>
      <GlassIconButton
        icon="chevron.left"
        accessibilityLabel="Back"
        onPress={onBack}
        testID="nearby-back"
      />
      <GlassSurface
        radius="pill"
        style={[styles.pill, { borderColor: theme.colors.controlBorder }]}
        testID="nearby-title-pill"
      >
        <Text
          variant="label"
          accessibilityRole="header"
          numberOfLines={1}
          maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="caption"
            tone="muted"
            numberOfLines={1}
            maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
            testID="nearby-subtitle"
          >
            {subtitle}
          </Text>
        ) : null}
      </GlassSurface>
      {onChangeArea ? (
        <GlassIconButton
          icon="location"
          accessibilityLabel={subtitle ? `${subtitle}. Change area` : 'Change area'}
          onPress={onChangeArea}
          testID="nearby-area"
        />
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  pill: {
    flex: 1,
    height: HEADER_CONTROL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderWidth: 1,
  },
  spacer: { width: HEADER_CONTROL_SIZE, height: HEADER_CONTROL_SIZE },
  below: { flex: 1 },
});

/** Pushes full-screen notices below the floating header. */
export function BelowNearbyHeader({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.below, { paddingTop: nearbyHeaderBottom(insets.top) + space.sm }]}>
      {children}
    </View>
  );
}
