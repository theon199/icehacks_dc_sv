import { StyleSheet, View } from 'react-native';

import { Icon, Text, radii, space, useTheme, type IconName } from '@/ui';

export interface InlineNoteProps {
  icon: IconName;
  title: string;
  body?: string;
  /** `accent` is the soft lime card with the glyph in a white disc (privacy notes). */
  tone?: 'plain' | 'accent';
}

/** A short note inside a question: a white card, or a soft lime one for reassurance. */
export function InlineNote({ icon, title, body, tone = 'plain' }: InlineNoteProps) {
  const theme = useTheme();
  const accent = tone === 'accent';
  return (
    <View
      accessible
      accessibilityLabel={body ? `${title} ${body}` : title}
      style={[
        styles.note,
        { backgroundColor: accent ? theme.colors.highlightSoft : theme.colors.surface },
      ]}
    >
      <View
        style={accent ? [styles.disc, { backgroundColor: theme.colors.surface }] : styles.glyph}
      >
        <Icon name={icon} size={18} color={accent ? 'onHighlightSoft' : 'success'} />
      </View>
      <View style={styles.copy}>
        <Text variant="label" accessible={false}>
          {title}
        </Text>
        {body ? (
          <Text variant="subhead" tone="muted" style={styles.body} accessible={false}>
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    marginTop: 14,
    paddingVertical: space.md,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
  },
  glyph: { paddingTop: 1 },
  disc: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  body: { marginTop: 2 },
});
