import * as WebBrowser from 'expo-web-browser';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecipeTutorial } from '@/lib/catalog';
import { ListRow, space } from '@/ui';

import { YouTubePlayer } from './YouTubePlayer';
import { tutorialItems } from '../model/tutorials';

export interface TutorialListProps {
  tutorials: readonly RecipeTutorial[];
}

/** Video walkthroughs play inline; written methods and other videos open in the in-app browser. */
export const TutorialList = memo(function TutorialList({ tutorials }: TutorialListProps) {
  const items = useMemo(() => tutorialItems(tutorials), [tutorials]);
  if (items.length === 0) return null;
  return (
    <View style={styles.container} testID="recipe-tutorials">
      {items.map((item) =>
        item.kind === 'youtube' ? (
          <YouTubePlayer key={item.key} videoId={item.videoId} title={item.title} />
        ) : (
          <ListRow
            key={item.key}
            title={item.title}
            {...(item.publisher ? { subtitle: item.publisher } : {})}
            icon={item.video ? 'play.rectangle' : 'safari'}
            onPress={() => void WebBrowser.openBrowserAsync(item.url)}
            accessibilityHint="Opens in the browser"
          />
        ),
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: space.sm },
});
