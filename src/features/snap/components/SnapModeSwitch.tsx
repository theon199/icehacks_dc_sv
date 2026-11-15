import { StyleSheet, View } from 'react-native';

import type { SnapMode } from '@/lib/api/ai';
import { haptics } from '@/lib/haptics';
import { fontFamily, PressableScale, Text, useTheme } from '@/ui';

import { camera } from './cameraTheme';

const MODES: readonly { value: SnapMode; label: string }[] = [
  { value: 'pantry', label: 'Pantry' },
  { value: 'dish', label: 'Dish' },
];

export interface SnapModeSwitchProps {
  mode: SnapMode;
  onChange: (mode: SnapMode) => void;
}

/** What the next photo is for, ingredients or a plated dish: a dark capsule, the choice in lime. */
export function SnapModeSwitch({ mode, onChange }: SnapModeSwitchProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="What are you photographing?"
      style={[styles.capsule, { borderRadius: theme.radii.pill }]}
      testID="snap-mode"
    >
      {MODES.map(({ value, label }) => {
        const selected = value === mode;
        return (
          <PressableScale
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(value);
            }}
            pressedScale={1}
            pressedOpacity={0.7}
            style={[
              styles.segment,
              {
                borderRadius: theme.radii.pill,
                backgroundColor: selected ? theme.colors.highlight : 'transparent',
              },
            ]}
            testID={`snap-mode-${value}`}
          >
            <Text
              variant="headline"
              maxFontSizeMultiplier={1.3}
              color={selected ? 'onHighlight' : 'onImage'}
              style={selected ? styles.selected : { color: camera.inkMuted }}
            >
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignSelf: 'center',
    padding: 4,
    gap: 2,
    backgroundColor: camera.capsule,
    borderWidth: 0.5,
    borderColor: camera.hairline,
  },
  segment: {
    minWidth: 88,
    height: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { fontFamily: fontFamily.textBold },
});
