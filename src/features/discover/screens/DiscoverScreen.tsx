import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DeckCard, DeckMode, NotForMeReason } from '@/domain';
import { Text, useTheme } from '@/ui';
import { gutter } from '@/ui/tokens';

import { DeckStatusView } from '../components/DeckStatusView';
import { DiscoverHeader } from '../components/DiscoverHeader';
import { ModeSwitcher } from '../components/ModeSwitcher';
import { NotForMeSheet } from '../components/NotForMeSheet';
import { SwipeDeck } from '../components/SwipeDeck';
import { availableModes } from '../modes';
import { useDiscoverDeck, type DiscoverDeckOptions } from '../useDiscoverDeck';

export interface DiscoverScreenProps {
  /** Deterministic deck for tests. */
  deckOptions?: DiscoverDeckOptions;
}

/** The Discover tab: a personalised swipe deck of recipes. */
export function DiscoverScreen({ deckOptions }: DiscoverScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const [requestedMode, setRequestedMode] = useState<DeckMode>('forYou');
  const deck = useDiscoverDeck(requestedMode, deckOptions);
  const [declining, setDeclining] = useState<DeckCard | null>(null);
  const modes = useMemo(() => availableModes(deck.smallAppetite), [deck.smallAppetite]);

  const openRecipe = useCallback(
    (card: DeckCard) => router.push({ pathname: '/recipe/[id]', params: { id: card.recipe.id } }),
    [router],
  );
  const openPreferences = useCallback(() => router.push('/preferences'), [router]);
  const openProfile = useCallback(() => router.push('/profile'), [router]);
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

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
    >
      <DiscoverHeader onProfile={openProfile} />
      <ModeSwitcher modes={modes} value={deck.mode} onChange={setRequestedMode} />
      {deck.dayNote ? (
        <Text variant="footnote" tone="muted" style={styles.note}>
          {deck.dayNote}
        </Text>
      ) : null}
      <View style={styles.flex}>
        {deck.status === 'ready' ? (
          <SwipeDeck
            cards={deck.cards}
            canUndo={deck.lastDecision !== null}
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
            canUndo={deck.lastDecision !== null}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  note: { paddingHorizontal: gutter },
});
