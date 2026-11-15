import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  NOT_FOR_ME_LABELS,
  NOT_FOR_ME_REASONS,
  type DeckCard,
  type NotForMeReason,
} from '@/domain';
import { useIngredients } from '@/lib/catalog';
import {
  Button,
  ChoiceChip,
  GlassSheet,
  ListRow,
  Text,
  useSheetSession,
  useSheetSubject,
  type IconName,
} from '@/ui';
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
  const visible = card !== null;
  // The declined card stays on the sheet while it slides away; each opening starts on the reasons.
  const shown = useSheetSubject(card);
  const session = useSheetSession(visible);
  if (!shown) return null;
  return (
    <SheetBody
      key={`${shown.recipe.id}-${session}`}
      visible={visible}
      card={shown}
      onClose={onClose}
      onPick={onPick}
    />
  );
}

function SheetBody({
  visible,
  card,
  onClose,
  onPick,
}: {
  visible: boolean;
  card: DeckCard;
  onClose: () => void;
  onPick: NotForMeSheetProps['onPick'];
}) {
  const [step, setStep] = useState<'reasons' | 'ingredient'>('reasons');
  const [ingredientId, setIngredientId] = useState<string | null>(null);

  if (step === 'reasons') {
    return (
      <GlassSheet
        visible={visible}
        onClose={onClose}
        title="Not for me"
        description={`Tell us why ${card.recipe.title} missed, and we'll show fewer like it.`}
        footer={<Button label="Cancel" variant="ghost" onPress={onClose} />}
        testID="not-for-me-sheet"
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
      </GlassSheet>
    );
  }

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
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
      testID="not-for-me-sheet"
    >
      <IngredientChoices card={card} selected={ingredientId} onSelect={setIngredientId} />
    </GlassSheet>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
