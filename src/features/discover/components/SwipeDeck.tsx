import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';

import type { DeckCard } from '@/domain';
import { prefetchRecipe } from '@/lib/catalog';
import { haptics } from '@/lib/haptics';
import { gutter } from '@/ui/tokens';

import { DeckDots } from './DeckDots';
import { SwipeableCard, type CardCommand } from './SwipeableCard';
import { MOUNTED_CARDS, PREFETCH_AHEAD } from '../swipe';

export interface SwipeDeckProps {
  cards: readonly DeckCard[];
  canUndo: boolean;
  onLike: (card: DeckCard) => void;
  onPass: (card: DeckCard) => void;
  onSave: (card: DeckCard) => void;
  /** Opens the "Not for me" reasons for a card. */
  onNotForMe: (card: DeckCard) => void;
  onOpen: (card: DeckCard) => void;
  onUndo: () => void;
}

/**
 * The card stack (top three mounted) with the dots counting the cards lined up. Swiping is the
 * whole interaction on screen; every decision is also an accessibility action on the top card.
 */
export function SwipeDeck({
  cards,
  canUndo,
  onLike,
  onPass,
  onSave,
  onNotForMe,
  onOpen,
  onUndo,
}: SwipeDeckProps) {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width - gutter * 2);
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const exitDirection = useSharedValue(0);
  const queryClient = useQueryClient();

  const top = cards[0] ?? null;
  const topId = top?.recipe.id ?? null;
  const mounted = cards.slice(0, MOUNTED_CARDS);

  // A new top card starts with the stack at rest.
  useEffect(() => {
    progress.set(0);
  }, [topId, progress]);

  // Warm the top recipe's detail screen and the photos of the cards about to be mounted.
  useEffect(() => {
    if (topId) void prefetchRecipe(queryClient, topId).catch(() => undefined);
  }, [topId, queryClient]);
  const upcoming = cards
    .slice(MOUNTED_CARDS, MOUNTED_CARDS + PREFETCH_AHEAD)
    .map((card) => card.recipe.imageUrl)
    .filter((url): url is string => url !== null);
  const upcomingKey = upcoming.join('\n');
  useEffect(() => {
    if (!upcomingKey) return;
    void Image.prefetch(upcomingKey.split('\n'), 'memory-disk').catch(() => false);
  }, [upcomingKey]);

  const onCommand = useCallback(
    (card: DeckCard, command: CardCommand) => {
      switch (command) {
        case 'like':
          onLike(card);
          break;
        case 'pass':
          onPass(card);
          break;
        case 'save':
          onSave(card);
          break;
        case 'notForMe':
          exitDirection.set(0);
          haptics.impact('light');
          onNotForMe(card);
          break;
        case 'open':
          onOpen(card);
          break;
        case 'flip':
          haptics.selection();
          setFlippedId(card.recipe.id);
          break;
        case 'unflip':
          setFlippedId(null);
          break;
      }
    },
    [exitDirection, onLike, onPass, onSave, onNotForMe, onOpen],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0) setWidth(next);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.stack} onLayout={onLayout}>
        {mounted
          .map((card, depth) => (
            <SwipeableCard
              key={card.recipe.id}
              card={card}
              depth={depth}
              width={width}
              progress={progress}
              exitDirection={exitDirection}
              reduceMotion={reduceMotion}
              flipped={depth === 0 && card.recipe.id === flippedId}
              canUndo={canUndo}
              onUndo={onUndo}
              onCommand={onCommand}
            />
          ))
          .reverse()}
      </View>
      <DeckDots remaining={cards.length} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stack: { flex: 1 },
});
