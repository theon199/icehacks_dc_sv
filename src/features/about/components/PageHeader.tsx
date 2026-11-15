import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { GlassIconButton, HEADER_TITLE_MAX_FONT_SCALE, Text, fontFamily, space } from '@/ui';

export interface PageHeaderProps {
  /** Short page name beside the back control. */
  title: string;
  /** The page's headline under the row, when it differs from the short name. */
  heading?: string;
  /** Small print under the headline, e.g. "Updated 1 November 2026". */
  caption?: string;
  /** Called by the back control; defaults to going back. */
  onBack?: () => void;
}

/**
 * The first rows of every informational page: the glass back circle with the short title beside
 * it, then the headline. Every page in the family starts on the same pixels.
 */
export function PageHeader({ title, heading, caption, onBack }: PageHeaderProps) {
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <GlassIconButton
          icon="chevron.left"
          accessibilityLabel="Back"
          onPress={back}
          testID="page-back"
        />
        <Text
          variant="title2"
          numberOfLines={2}
          maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
          style={styles.title}
        >
          {title}
        </Text>
      </View>
      {heading ? <Text variant="title1">{heading}</Text> : null}
      {caption ? (
        <Text variant="footnote" tone="muted">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { flex: 1, fontFamily: fontFamily.textBold },
});
