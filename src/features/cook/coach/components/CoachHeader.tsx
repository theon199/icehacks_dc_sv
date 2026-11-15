import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  TAB_HEADER_GUTTER,
  Text,
  space,
  useTheme,
} from '@/ui';

export interface CoachHeaderProps {
  title: string;
  onClose: () => void;
  /** Whether answers are read aloud. */
  speaking: boolean;
  onToggleSpeaking: () => void;
}

/**
 * Glass close circle, the dish name in the middle, and the spoken-answers toggle, lime while the
 * coach talks. Owns the top safe-area inset.
 */
export function CoachHeader({ title, onClose, speaking, onToggleSpeaking }: CoachHeaderProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  return (
    <View style={[styles.header, { paddingTop: insets.top + HEADER_TOP_OFFSET }]}>
      <GlassIconButton
        icon="xmark"
        accessibilityLabel="Close the coach"
        onPress={onClose}
        testID="coach-close"
      />
      <Text
        variant="label"
        accessibilityRole="header"
        numberOfLines={1}
        maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
        align="center"
        style={styles.title}
      >
        {title}
      </Text>
      <GlassIconButton
        icon="waveform"
        accessibilityLabel="Spoken answers"
        accessibilityHint={speaking ? 'Mutes the coach’s voice.' : 'The coach reads answers aloud.'}
        selected={speaking}
        onPress={onToggleSpeaking}
        iconColor={speaking ? 'onHighlight' : 'text'}
        {...(speaking ? { tint: theme.colors.highlight } : {})}
        testID="coach-speaker"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: TAB_HEADER_GUTTER,
    paddingBottom: space.md,
  },
  title: { flex: 1 },
});
