import { StyleSheet, View } from 'react-native';

import { Text } from '@/ui';

export interface StepHeaderProps {
  title: string;
  description?: string;
}

/** Question title for one onboarding screen, with an optional line under it. */
export function StepHeader({ title, description }: StepHeaderProps) {
  return (
    <View>
      <Text variant="title1" style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text variant="body" tone="muted" style={styles.lede}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { letterSpacing: -0.4 },
  lede: { marginTop: 6 },
});
