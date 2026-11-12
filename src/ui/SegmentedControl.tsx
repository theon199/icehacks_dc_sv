import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';

import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { minTouchTarget } from './tokens';

/** Inset between the track and the selected pill. */
const TRACK_INSET = 3;
/**
 * Each segment fills the track's inner height and its hit area extends over the inset, so the
 * touch target is the full track height: the 44 pt minimum.
 */
const SEGMENT_HEIGHT = minTouchTarget - TRACK_INSET * 2;
const segmentSlop = { top: TRACK_INSET, bottom: TRACK_INSET, left: 0, right: 0 };

export interface Segment<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Describes the group for VoiceOver, e.g. "Feed". */
  accessibilityLabel: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Pill-shaped switch between a few mutually exclusive views. */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
  testID,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.pill },
        style,
      ]}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <PressableScale
            key={segment.value}
            accessibilityRole="tab"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected }}
            pressedScale={1}
            hitSlop={segmentSlop}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(segment.value);
            }}
            style={[
              styles.segment,
              { borderRadius: theme.radii.pill },
              selected && {
                backgroundColor: theme.colors.surfaceRaised,
                ...theme.elevation.low,
                shadowColor: theme.colors.shadow,
              },
            ]}
          >
            <Text
              variant="subhead"
              color={selected ? 'text' : 'textMuted'}
              numberOfLines={1}
              accessible={false}
            >
              {segment.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: TRACK_INSET },
  segment: {
    flex: 1,
    minHeight: SEGMENT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
