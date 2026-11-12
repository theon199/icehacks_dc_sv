import { StyleSheet, View } from 'react-native';

import { Text } from '../Text';
import { useTheme } from '../ThemeProvider';
import { LogoMark } from './LogoMark';

export interface WordmarkProps {
  /** Height of the mark; the name scales with it. */
  size?: number;
}

/**
 * Mark plus the "famara" name set in the display face. The name is live text (not outlined) so it
 * stays crisp at every size and is read correctly by VoiceOver.
 */
export function Wordmark({ size = 40 }: WordmarkProps) {
  const theme = useTheme();
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="header"
      accessibilityLabel="Famara"
    >
      <LogoMark size={size} decorative />
      <Text
        accessible={false}
        maxFontSizeMultiplier={1.2}
        style={{
          fontFamily: theme.typography.display.fontFamily,
          fontSize: size * 0.82,
          lineHeight: size,
          letterSpacing: -0.5,
          color: theme.colors.text,
        }}
      >
        famara
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
