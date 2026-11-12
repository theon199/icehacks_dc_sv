import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, space } from '@/ui';

import { ABOUT_PAGES } from '../about/pages';
import type { AboutBlock, AboutSlug } from '../about/types';

export interface AboutPageScreenProps {
  page: AboutSlug;
}

function Block({ block }: { block: AboutBlock }) {
  switch (block.kind) {
    case 'heading':
      return (
        <Text variant="title3" style={styles.heading}>
          {block.text}
        </Text>
      );
    case 'paragraph':
      return <Text variant="body">{block.text}</Text>;
    case 'bullets':
      return (
        <View style={styles.list}>
          {block.items.map((item) => (
            <View key={item} style={styles.bullet} accessible accessibilityLabel={item}>
              <Text variant="body" tone="primary" accessible={false}>
                {'•'}
              </Text>
              <Text variant="body" style={styles.bulletText} accessible={false}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      );
    case 'note':
      return (
        <Card variant="sunken" padding="md">
          <Text variant="callout">{block.text}</Text>
        </Card>
      );
    case 'link':
      return (
        <Button
          variant="ghost"
          size="sm"
          icon="arrow.up.right.square"
          label={block.label}
          accessibilityHint="Opens the website"
          style={styles.link}
          onPress={() => void WebBrowser.openBrowserAsync(block.url)}
        />
      );
  }
}

/** One of the informational pages: how it works, sources, AI use, limitations, privacy, terms. */
export function AboutPageScreen({ page }: AboutPageScreenProps) {
  const content = ABOUT_PAGES[page];
  return (
    <Screen testID={`about-${page}`}>
      <View style={styles.header}>
        <Text variant="title1">{content.title}</Text>
        {content.updated ? (
          <Text variant="footnote" tone="subtle">
            {content.updated}
          </Text>
        ) : null}
      </View>
      {content.blocks.map((block, index) => (
        <Block key={`${block.kind}-${index}`} block={block} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
  heading: { marginTop: space.sm },
  list: { gap: space.sm },
  bullet: { flexDirection: 'row', gap: space.sm },
  bulletText: { flex: 1 },
  link: { alignSelf: 'flex-start' },
});
