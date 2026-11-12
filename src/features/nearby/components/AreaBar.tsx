import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, gutter, minTouchTarget, useTheme } from '@/ui';

import type { NearbyOrigin } from '../model/permission';

export interface AreaBarProps {
  origin: NearbyOrigin;
  onChange: () => void;
}

/** Floating pill over the map saying where the search is centred, with a way to change it. */
export function AreaBar({ origin, onChange }: AreaBarProps) {
  const theme = useTheme();
  const label = origin.source === 'city' && origin.label ? `Near ${origin.label}` : 'Near you';
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <PressableScale
        onPress={onChange}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Change area`}
        testID="nearby-area"
        style={[
          styles.pill,
          {
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: theme.colors.border,
            shadowColor: theme.colors.shadow,
          },
          theme.elevation.low,
        ]}
      >
        <Icon name={origin.source === 'city' ? 'building.2' : 'location.fill'} size={14} />
        <Text variant="subhead" numberOfLines={1} style={styles.label}>
          {label}
        </Text>
        <Text variant="subhead" tone="primary">
          Change
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 12, left: gutter, right: gutter, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: minTouchTarget,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  label: { flexShrink: 1 },
});
