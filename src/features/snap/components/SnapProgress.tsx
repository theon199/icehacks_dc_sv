import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { SnapMode } from '@/lib/api/ai';
import { Button, Icon, radii, space, Text, useTheme } from '@/ui';

import type { SnapStage } from '../hooks/useSnapRequest';

export interface SnapProgressProps {
  photoUri: string;
  stage: SnapStage;
  mode: SnapMode;
  onCancel: () => void;
}

/** After this long, reassure the person that a slow answer is still coming. */
const SLOW_AFTER_MS = 15_000;

const STEPS: readonly { stage: SnapStage; label: (mode: SnapMode) => string }[] = [
  { stage: 'preparing', label: () => 'Preparing your photo' },
  {
    stage: 'reading',
    label: (mode) => (mode === 'pantry' ? 'Spotting the food items' : 'Recognising the dish'),
  },
];

/** The photo being read, the steps so far and a way out. */
export function SnapProgress({ photoUri, stage, mode, onCancel }: SnapProgressProps) {
  const theme = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const current = STEPS.findIndex((step) => step.stage === stage);
  return (
    <View style={styles.fill} testID="snap-progress">
      <Image
        source={{ uri: photoUri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessible={false}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]} />
      <View
        style={[styles.panel, { backgroundColor: theme.colors.surfaceRaised }]}
        accessibilityLiveRegion="polite"
      >
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <View key={step.stage} style={styles.step}>
              {done ? (
                <Icon name="checkmark.circle.fill" color="success" size={22} />
              ) : active ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <Icon name="circle" color="textSubtle" size={22} />
              )}
              <Text variant={active ? 'bodyStrong' : 'body'} tone={active ? 'default' : 'muted'}>
                {step.label(mode)}
              </Text>
            </View>
          );
        })}
        {slow ? (
          <Text variant="footnote" tone="muted">
            Still working on it. Busy photos can take a little longer.
          </Text>
        ) : null}
        <Button label="Cancel" variant="secondary" onPress={onCancel} testID="snap-cancel" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  panel: { margin: space.lg, padding: space.xl, borderRadius: radii.lg, gap: space.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
