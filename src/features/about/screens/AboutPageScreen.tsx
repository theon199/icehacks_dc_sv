import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ABOUT_PAGES, type AboutBlock, type AboutSlug } from '@/features/settings';
import {
  Icon,
  PressableScale,
  Text,
  fontFamily,
  minTouchTarget,
  radii,
  space,
  useTheme,
} from '@/ui';

import { InfoCard } from '../components/InfoCard';
import { PageHeader } from '../components/PageHeader';
import { ABOUT_SHORT_TITLES } from '../pages';
import { sectionsOf } from '../sections';

export interface AboutPageScreenProps {
  page: AboutSlug;
}

/**
 * One informational page (how it works, sources, AI use, limitations, privacy, terms): the glass
 * back row, the headline, a lead-in on the canvas and one white card per section.
 */
export function AboutPageScreen({ page }: AboutPageScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const content = ABOUT_PAGES[page];
  const sections = useMemo(() => sectionsOf(content.blocks), [content.blocks]);

  return (
    <ScrollView
      testID={`about-${page}`}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl },
      ]}
    >
      <PageHeader
        title={ABOUT_SHORT_TITLES[page]}
        heading={content.title}
        {...(content.updated ? { caption: content.updated } : {})}
      />
      {sections.map((section, index) =>
        section.heading === null ? (
          <View key={`lead-${index}`} style={styles.lead}>
            {section.blocks.map((block, blockIndex) => (
              <Block key={blockIndex} block={block} />
            ))}
          </View>
        ) : (
          <InfoCard key={`${section.heading}-${index}`} heading={section.heading}>
            {section.blocks.map((block, blockIndex) => (
              <Block key={blockIndex} block={block} />
            ))}
          </InfoCard>
        ),
      )}
    </ScrollView>
  );
}

function Block({ block }: { block: AboutBlock }) {
  const theme = useTheme();
  switch (block.kind) {
    case 'heading':
      return <Text variant="title3">{block.text}</Text>;
    case 'paragraph':
      return <Text variant="body">{block.text}</Text>;
    case 'bullets':
      return (
        <View style={styles.list}>
          {block.items.map((item) => (
            <View key={item} style={styles.bullet} accessible accessibilityLabel={item}>
              <Icon name="arrow.right" size={14} color="textMuted" style={styles.mark} />
              <Text variant="body" style={styles.grow} accessible={false}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      );
    case 'note':
      return (
        <View
          style={[styles.note, { backgroundColor: theme.colors.highlightSoft }]}
          accessible
          accessibilityLabel={block.text}
        >
          <Icon name="info.circle" size={18} color="onHighlightSoft" />
          <Text variant="label" color="onHighlightSoft" style={styles.grow} accessible={false}>
            {block.text}
          </Text>
        </View>
      );
    case 'link':
      return (
        <PressableScale
          accessibilityRole="link"
          accessibilityLabel={block.label}
          accessibilityHint="Opens the website"
          pressedOpacity={0.6}
          pressedScale={1}
          onPress={() => void WebBrowser.openBrowserAsync(block.url)}
          style={styles.link}
        >
          <Text variant="label" style={styles.linkText} accessible={false}>
            {block.label}
          </Text>
          <Icon name="arrow.up.right" size={14} color="text" />
        </PressableScale>
      );
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  lead: { gap: space.md, paddingVertical: space.sm },
  list: { gap: space.sm },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  mark: { marginTop: 5 },
  grow: { flex: 1 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radii.md,
  },
  link: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
  },
  linkText: { fontFamily: fontFamily.textSemiBold, textDecorationLine: 'underline' },
});
