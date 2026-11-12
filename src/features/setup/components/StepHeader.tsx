import { StyleSheet, View } from 'react-native';

import { Text } from '@/ui';

export interface StepHeaderProps {
  title: string;
  description?: string;
}

/** Question title for one onboarding screen. */
export function StepHeader({ title, description }: StepHeaderProps) {
  return (
    <View style={styles.stack}>
      <Text variant="title1">{title}</Text>
      {description ? (
        <Text variant="callout" tone="muted">
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 6 },
});
