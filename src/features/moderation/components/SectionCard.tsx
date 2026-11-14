import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GlassSurface, space } from '@/ui';

export interface SectionCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The card of the moderation pages: Liquid Glass where the system has it, a white card elsewhere.
 * Glass clips to its own radius, so the card has no drop shadow.
 */
export function SectionCard({ children, style, testID }: SectionCardProps) {
  return (
    <GlassSurface radius="card" style={style} {...(testID === undefined ? {} : { testID })}>
      <View style={styles.body}>{children}</View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.xl, padding: space.section },
});
