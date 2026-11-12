import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';

import {
  NOT_FOR_ME_LABELS,
  NOT_FOR_ME_REASONS,
  type DeckCard,
  type NotForMeReason,
} from '@/domain';
import { useIngredients } from '@/lib/catalog';
import { Button, ChoiceChip, ListRow, SheetContent, Text, useTheme, type IconName } from '@/ui';
import { space } from '@/ui/tokens';

export interface NotForMeSheetProps {
  /** The card being declined; null keeps the sheet closed. */
  card: DeckCard | null;
  onClose: () => void;
  onPick: (card: DeckCard, reason: NotForMeReason, ingredientId?: string) => void;
}

const REASON_ICONS: Readonly<Record<NotForMeReason, IconName>> = {
  too_long: 'clock',
  dislike_ingredient: 'carrot',
  not_my_cuisine: 'globe',
  too_heavy: 'scalemass',
};

/** "Not for me because…": one tap records a reason; the ingredient reason asks which one. */
export function NotForMeSheet({ card, onClose, onPick }: NotForMeSheetProps) {
  const theme = useTheme();
  return (
    <Modal
      visible={card !== null}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.flex, { backgroundColor: theme.colors.surface }]}>
        {card ? (
          <SheetBody key={card.recipe.id} card={card} onClose={onClose} onPick={onPick} />
        ) : null}
      </View>
    </Modal>
  );
}

function SheetBody({
  card,
  onClose,
  onPick,
}: {
  card: DeckCard;
  onClose: () => void;
  onPick: NotForMeSheetProps['onPick'];
}) {
  const [step, setStep] = useState<'reasons' | 'ingredient'>('reasons');
  const [ingredientId, setIngredientId] = useState<string | null>(null);

  if (step === 'reasons') {
    return (
      <SheetContent
        title="Not for me"
        description={`Tell us why ${card.recipe.title} missed, and we'll show fewer like it.`}
        footer={<Button label="Cancel" variant="ghost" onPress={onClose} />}
      >
        <View>
          {NOT_FOR_ME_REASONS.map((reason, index) => (
            <ListRow
              key={reason}
              testID={`not-for-me-${reason}`}
              title={NOT_FOR_ME_LABELS[reason]}
              icon={REASON_ICONS[reason]}
              divider={index < NOT_FOR_ME_REASONS.length - 1}
              onPress={() => {
                if (reason === 'dislike_ingredient') setStep('ingredient');
                else onPick(card, reason);
              }}
            />
          ))}
        </View>
      </SheetContent>
    );
  }

  return (
    <SheetContent
      title="Which ingredient?"
      description="We'll steer away from dishes built around it."
      footer={
        <>
          <Button
            testID="not-for-me-confirm"
            label={ingredientId ? 'Done' : 'Skip'}
            onPress={() =>
              ingredientId
                ? onPick(card, 'dislike_ingredient', ingredientId)
                : onPick(card, 'dislike_ingredient')
            }
          />
          <Button label="Back" variant="ghost" onPress={() => setStep('reasons')} />
        </>
      }
    >
      <IngredientChoices card={card} selected={ingredientId} onSelect={setIngredientId} />
    </SheetContent>
  );
}

function IngredientChoices({
  card,
  selected,
  onSelect,
}: {
  card: DeckCard;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const query = useIngredients(card.recipe.coreIngredientIds);
  // Staples (salt, oil, water) are rarely the problem and would bury the real choices.
  const choices = useMemo(
    () =>
      (query.data ?? [])
        .filter((ingredient) => !ingredient.pantryStaple)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [query.data],
  );

  if (query.isPending && card.recipe.coreIngredientIds.length > 0) {
    return <ActivityIndicator accessibilityLabel="Loading ingredients" />;
  }
  if (choices.length === 0) {
    return (
      <Text variant="callout" tone="muted">
        We couldn’t list this dish’s ingredients. Skip to record the reason anyway.
      </Text>
    );
  }
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {choices.map((ingredient) => (
        <ChoiceChip
          key={ingredient.id}
          testID={`not-for-me-ingredient-${ingredient.id}`}
          label={ingredient.name}
          mode="radio"
          selected={selected === ingredient.id}
          onToggle={(next) => onSelect(next ? ingredient.id : null)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
