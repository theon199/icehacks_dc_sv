import { useRecyclingState } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { memo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useTheme } from '@/ui';

import type { PostPhoto } from '../api/types';

/** Keep tall and panoramic photos within a sensible frame (4:5 portrait up to 1.91:1). */
export function carouselAspect(photos: readonly PostPhoto[]): number {
  const first = photos[0];
  if (!first) return 1;
  const ratio = first.width / first.height;
  return Math.min(1.91, Math.max(0.8, ratio));
}

export interface PhotoCarouselProps {
  photos: readonly PostPhoto[];
  /** Describes the dish for VoiceOver, e.g. the post title. */
  label: string;
  priority?: 'low' | 'normal' | 'high';
}

/** Swipeable post photos with blurhash placeholders and a page indicator. */
export const PhotoCarousel = memo(function PhotoCarousel({
  photos,
  label,
  priority = 'normal',
}: PhotoCarouselProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  // Cards are recycled in the feed: a new post starts on its first photo.
  const [page, setPage] = useRecyclingState(0, [photos[0]?.path], () =>
    scroller.current?.scrollTo({ x: 0, animated: false }),
  );
  const aspect = carouselAspect(photos);
  const height = width > 0 ? width / aspect : 0;

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };
  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  if (photos.length === 0) return null;
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.frame,
        {
          aspectRatio: aspect,
          borderRadius: theme.radii.md,
          backgroundColor: theme.colors.skeleton,
        },
      ]}
    >
      {width > 0 ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          accessibilityLabel={
            photos.length > 1 ? `${label}, photo ${page + 1} of ${photos.length}` : label
          }
        >
          {photos.map((photo, index) => (
            <Image
              key={photo.path}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${label}, photo ${index + 1}`}
              source={photo.url ? { uri: photo.url, cacheKey: photo.path } : null}
              placeholder={photo.blurhash ? { blurhash: photo.blurhash } : null}
              placeholderContentFit="cover"
              contentFit="cover"
              recyclingKey={photo.path}
              priority={index === 0 ? priority : 'low'}
              transition={180}
              style={{ width, height }}
            />
          ))}
        </ScrollView>
      ) : null}
      {photos.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {photos.map((photo, index) => (
            <View
              key={photo.path}
              style={[
                styles.dot,
                {
                  backgroundColor: theme.colors.textInverse,
                  opacity: index === page ? 1 : 0.5,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden' },
  dots: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
