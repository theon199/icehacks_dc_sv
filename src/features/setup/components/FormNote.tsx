import { StyleSheet, View } from 'react-native';

import { Icon, Text, useTheme, type IconName } from '@/ui';

export interface FormNoteProps {
  message: string;
  icon?: IconName;
}

/** Soft informational note inside a question. */
export function FormNote({ message, icon = 'info.circle' }: FormNoteProps) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={message}
      style={[
        styles.box,
        { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.md },
      ]}
    >
      <Icon name={icon} size={18} color="onPrimarySoft" />
      <Text variant="subhead" color="onPrimarySoft" style={styles.text} accessible={false}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  text: { flex: 1 },
});
