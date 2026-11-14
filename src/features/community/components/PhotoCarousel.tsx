import { useRecyclingState } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { memo, useCallback, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { PressableScale, space, useTheme } from '@/ui';

import type { PostPhoto } from '../api/types';

/** Keep tall and panoramic photos within a sensible frame (4:5 portrait up to 1.91:1). */
export function carouselAspect(photos: readonly PostPhoto[]): number {
  const first = photos[0];
  if (!first) return 1;
  const ratio = first.width / first.height;
  return Math.min(1.91, Math.max(0.8, ratio));
}

const THUMB = 56;

export interface PhotoCarouselProps {
  photos: readonly PostPhoto[];
  /** Describes the dish for VoiceOver, e.g. the post title. */
  label: string;
  priority?: 'low' | 'normal' | 'high';
  /** Horizontal padding of the thumbnail strip, so it lines up with the text around it. */
  inset?: number;
}

interface ThumbProps {
  photo: PostPhoto;
  index: number;
  count: number;
  label: string;
  selected: boolean;
  onSelect: (index: number) => void;
}

const Thumb = memo(function Thumb({ photo, index, count, label, selected, onSelect }: ThumbProps) {
  const theme = useTheme();
  const select = useCallback(() => onSelect(index), [index, onSelect]);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Show photo ${index + 1} of ${count}`}
      accessibilityState={{ selected }}
      pressedScale={0.95}
      onPress={select}
      style={[
        styles.thumb,
        {
          borderRadius: theme.radii.md + 2,
          borderColor: selected ? theme.colors.primary : 'transparent',
        },
        !selected && styles.thumbIdle,
      ]}
    >
      <Image
        accessible={false}
        accessibilityLabel={label}
        source={photo.url ? { uri: photo.url, cacheKey: photo.path } : null}
        placeholder={photo.blurhash ? { blurhash: photo.blurhash } : null}
        placeholderContentFit="cover"
        contentFit="cover"
        recyclingKey={`${photo.path}#thumb`}
        priority="low"
        style={[
          styles.thumbImage,
          { borderRadius: theme.radii.md - 1, backgroundColor: theme.colors.skeleton },
        ]}
      />
    </PressableScale>
  );
});

/**
 * Edge-to-edge post photos with blurhash placeholders. Posts with several photos get a strip of
 * thumbnails underneath; the one on screen is outlined, and tapping another pages to it.
 */
export const PhotoCarousel = memo(function PhotoCarousel({
  photos,
  label,
  priority = 'normal',
  inset = 0,
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
  const showPhoto = useCallback(
    (index: number) => {
      setPage(index);
      scroller.current?.scrollTo({ x: index * width, animated: true });
    },
    [setPage, width],
  );

  if (photos.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <View
        onLayout={onLayout}
        style={[styles.frame, { aspectRatio: aspect, backgroundColor: theme.colors.skeleton }]}
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
      </View>
      {photos.length > 1 ? (
        <View style={[styles.strip, { paddingHorizontal: inset }]}>
          {photos.map((photo, index) => (
            <Thumb
              key={photo.path}
              photo={photo}
              index={index}
              count={photos.length}
              label={label}
              selected={index === page}
              onSelect={showPhoto}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  frame: { width: '100%', overflow: 'hidden' },
  strip: { flexDirection: 'row', gap: 6 },
  thumb: {
    width: THUMB + 6,
    height: THUMB + 6,
    borderWidth: 2,
    padding: 1,
  },
  thumbImage: { width: THUMB, height: THUMB },
  thumbIdle: { opacity: 0.55 },
});
