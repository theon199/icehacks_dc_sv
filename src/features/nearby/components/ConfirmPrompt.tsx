import { StyleSheet, View } from 'react-native';

import { GlassSurface, Icon, PressableScale, Text, radii, space, useTheme } from '@/ui';

import { useAnnouncement } from '../hooks/useAnnouncement';
import { useConfirmDish } from '../hooks/useConfirmDish';
import { tallyLabel } from '../model/placeFormat';
import type { PlaceView } from '../model/placeView';

export interface ConfirmPromptProps {
  dishName: string;
  dishKey: string;
  place: PlaceView;
}

/** Answer pills keep a full touch target; their labels stop growing past this text scale. */
const ANSWER_HEIGHT = 44;
const COMPACT_MAX_FONT_SCALE = 1.35;

function AnswerPill({
  hadIt,
  pending,
  onPress,
}: {
  hadIt: boolean;
  pending: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={hadIt ? 'Yes, they had it' : "No, they didn't have it"}
      accessibilityHint="Saves your answer"
      accessibilityState={{ disabled: pending, busy: pending }}
      disabled={pending}
      onPress={onPress}
      style={[
        styles.answer,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        pending && styles.pending,
      ]}
      testID={hadIt ? 'nearby-confirm-yes' : 'nearby-confirm-no'}
    >
      <Text variant="label" accessible={false} maxFontSizeMultiplier={COMPACT_MAX_FONT_SCALE}>
        {hadIt ? 'Yes' : 'No'}
      </Text>
    </PressableScale>
  );
}

/** The answer given today, filled like a chosen pill. The status line beside it says it aloud. */
function ChosenPill({ hadIt }: { hadIt: boolean }) {
  const theme = useTheme();
  const ink = hadIt ? 'onHighlight' : 'onPrimary';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.answer,
        styles.chosen,
        { backgroundColor: hadIt ? theme.colors.highlight : theme.colors.primary },
      ]}
      testID="nearby-confirm-chosen"
    >
      <Icon name="checkmark" size={14} color={ink} />
      <Text variant="label" color={ink} maxFontSizeMultiplier={COMPACT_MAX_FONT_SCALE}>
        {hadIt ? 'Yes' : 'No'}
      </Text>
    </View>
  );
}

/**
 * "Did they have it?" as a compact glass bar: the question and its status on the left, yes and
 * no on the right, or the answer given today once answered.
 */
export function ConfirmPrompt({ dishName, dishKey, place }: ConfirmPromptProps) {
  const { prompt, answer, pending } = useConfirmDish(dishKey, place.id, place.myAnswer);
  const tally = tallyLabel(place.yesCount, place.noCount);
  const thanks =
    prompt?.kind === 'thanks'
      ? prompt.hadIt
        ? `You said they had ${dishName}. That helps others find it.`
        : `You said they didn't have ${dishName}. We'll rank them lower for it.`
      : null;
  // The pills are replaced in place, so VoiceOver would otherwise say nothing after a tap.
  useAnnouncement(
    thanks ? `Thanks for letting us know. ${thanks}` : null,
    `${dishKey}|${place.id}`,
  );
  if (!prompt) return null;

  const question =
    prompt.kind === 'thanks' ? 'Thanks for letting us know' : `Did they have ${dishName}?`;
  const status =
    prompt.kind === 'thanks'
      ? thanks
      : prompt.previous === null
        ? 'Your answer helps others find it. You can answer once a day.'
        : `Last time you said ${prompt.previous ? 'yes' : 'no'}. Has it changed?`;

  return (
    <GlassSurface
      radius="pill"
      fallbackColor="surfaceSunken"
      style={styles.bar}
      testID="nearby-confirm"
    >
      <View style={styles.copy}>
        <Text variant="label" maxFontSizeMultiplier={COMPACT_MAX_FONT_SCALE}>
          {question}
        </Text>
        <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
          {status}
        </Text>
        {tally ? (
          <Text variant="caption" tone="subtle">
            {tally}
          </Text>
        ) : null}
      </View>
      {prompt.kind === 'thanks' ? (
        <ChosenPill hadIt={prompt.hadIt} />
      ) : (
        <>
          <AnswerPill hadIt pending={pending} onPress={() => answer(true)} />
          <AnswerPill hadIt={false} pending={pending} onPress={() => answer(false)} />
        </>
      )}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    paddingRight: space.xs,
    paddingVertical: space.xs,
  },
  copy: { flex: 1, gap: space.xxs },
  answer: {
    minHeight: ANSWER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  chosen: { borderWidth: 0 },
  pending: { opacity: 0.5 },
});
