import { StyleSheet } from 'react-native';

import { Text, space } from '@/ui';

/** A small muted heading over a group of answers, e.g. "Also prefer". */
export function SectionLabel({ children, first = false }: { children: string; first?: boolean }) {
  return (
    <Text
      variant="sectionLabel"
      tone="muted"
      accessibilityRole="header"
      style={[styles.label, first ? styles.first : null]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 22, marginBottom: space.sm, marginLeft: space.xs },
  first: { marginTop: space.xl },
});
