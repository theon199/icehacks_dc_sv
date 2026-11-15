import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DeckCard, DeckMode, NotForMeReason } from '@/domain';
import { Icon, Text, useTheme } from '@/ui';
import { gutter, space } from '@/ui/tokens';

import { DeckStatusView } from '../components/DeckStatusView';
import { DiscoverHeader } from '../components/DiscoverHeader';
import { NotForMeSheet } from '../components/NotForMeSheet';
import { SwipeDeck } from '../components/SwipeDeck';
import { availableModes } from '../modes';
import { useDiscoverDeck, type DiscoverDeckOptions } from '../useDiscoverDeck';

export interface DiscoverScreenProps {
  /** Deterministic deck for tests. */
  deckOptions?: DiscoverDeckOptions;
}

/**
 * The Discover tab: a personalised swipe deck of recipes. A fixed layout, never a scroll view: the
 * header takes its row and the deck flexes into whatever is left above the tab bar.
 */
export function DiscoverScreen({ deckOptions }: DiscoverScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [requestedMode, setRequestedMode] = useState<DeckMode>('forYou');
  const deck = useDiscoverDeck(requestedMode, deckOptions);
  const [declining, setDeclining] = useState<DeckCard | null>(null);
  const modes = useMemo(() => availableModes(deck.smallAppetite), [deck.smallAppetite]);

  const openRecipe = useCallback(
    (card: DeckCard) => router.push({ pathname: '/recipe/[id]', params: { id: card.recipe.id } }),
    [router],
  );
  const openPreferences = useCallback(() => router.push('/preferences'), [router]);
  const closeSheet = useCallback(() => setDeclining(null), []);
  const { notForMe } = deck;
  const decline = useCallback(
    (card: DeckCard, reason: NotForMeReason, ingredientId?: string) => {
      setDeclining(null);
      notForMe(card, reason, ingredientId);
    },
    [notForMe],
  );
  const showAll = useCallback(() => setRequestedMode('forYou'), []);
  const canUndo = deck.lastDecision !== null;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <DiscoverHeader
        modes={modes}
        mode={deck.mode}
        onModeChange={setRequestedMode}
        canUndo={canUndo}
        onUndo={deck.undo}
      />
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>
        {deck.dayNote ? (
          <View style={styles.note} testID="discover-day-note">
            <Icon name="heart.text.square" android="monitor_heart" size={16} color="textMuted" />
            <Text variant="footnote" tone="muted" numberOfLines={2} style={styles.flex}>
              {deck.dayNote}
            </Text>
          </View>
        ) : null}
        {deck.status === 'ready' ? (
          <SwipeDeck
            cards={deck.cards}
            canUndo={canUndo}
            onLike={deck.like}
            onPass={deck.pass}
            onSave={deck.save}
            onNotForMe={setDeclining}
            onOpen={openRecipe}
            onUndo={deck.undo}
          />
        ) : (
          <DeckStatusView
            status={deck.status}
            mode={deck.mode}
            wide={deck.wide}
            canUndo={canUndo}
            onEditPreferences={openPreferences}
            onShowAll={showAll}
            onWiden={deck.widen}
            onStartOver={deck.startOver}
            onUndo={deck.undo}
            onRetry={deck.retry}
          />
        )}
      </View>
      <NotForMeSheet card={declining} onClose={closeSheet} onPick={decline} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, paddingHorizontal: gutter },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
});
