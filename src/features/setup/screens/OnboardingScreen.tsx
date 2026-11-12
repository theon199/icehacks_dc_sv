import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Keyboard, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ageBandFor,
  preferences,
  suggestedFirstName,
  updateDisplayName,
  useSessionStore,
} from '@/features/auth';
import { haptics } from '@/lib/haptics';
import { logger } from '@/lib/logger';
import { Button, IconButton, Screen, Text, gutter, toast, useTheme } from '@/ui';

import { ProgressBar } from '../components/ProgressBar';
import {
  STEP_IDS,
  canContinue,
  draftFrom,
  isOptional,
  skipStep,
  toAnswers,
  type Draft,
  type StepId,
} from '../onboardingModel';
import { StepBody } from '../steps/StepBody';

/** Why Continue is unavailable, for steps where an answer is required. */
const requiredHints: Partial<Record<StepId, string>> = {
  allergens: 'Choose your allergies, or “No food allergies”.',
};

function continueLabel(step: StepId, draft: Draft, last: boolean): string {
  if (last) return 'Finish';
  if (step === 'diet' && draft.diets.length === 0) return 'I eat everything';
  return 'Continue';
}

/** The onboarding questionnaire: one question per screen, with progress, back and skip. */
export function OnboardingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const userId = useSessionStore((s) => s.userId);
  const isTeen = useSessionStore((s) => ageBandFor(s.birthYear) === 'teen');
  const [draft, setDraft] = useState<Draft>(() =>
    draftFrom(preferences.readAnswers(useSessionStore.getState().userId), null),
  );
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const step = STEP_IDS[index] ?? 'name';
  const last = index === STEP_IDS.length - 1;
  const ready = canContinue(step, draft);

  useEffect(() => {
    let mounted = true;
    void suggestedFirstName().then((name) => {
      if (mounted && name)
        setDraft((current) => (current.displayName ? current : { ...current, displayName: name }));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const finish = (answers: Draft) => {
    if (finishing || !userId) return;
    setFinishing(true);
    try {
      preferences.completeOnboarding(userId, toAnswers(answers));
    } catch (error) {
      logger.error('Could not save onboarding answers', { error: String(error) });
      setFinishing(false);
      haptics.error();
      toast.error('We couldn’t save your answers. Please try again.');
      return;
    }
    const name = answers.displayName.trim();
    if (name) {
      updateDisplayName(userId, name).catch((error: unknown) => {
        logger.info('Profile name not saved yet', { error: String(error) });
      });
    }
    haptics.success();
    useSessionStore.getState().completeOnboarding();
  };

  const advance = (from: Draft) => {
    Keyboard.dismiss();
    if (last) {
      finish(from);
      return;
    }
    setIndex((i) => Math.min(i + 1, STEP_IDS.length - 1));
  };

  const next = () => {
    if (!ready) {
      haptics.warning();
      return;
    }
    advance(draft);
  };

  const skip = () => {
    haptics.selection();
    const skipped = skipStep(step, draft);
    setDraft(skipped);
    advance(skipped);
  };

  const back = useCallback(() => {
    if (index === 0) return false;
    Keyboard.dismiss();
    setIndex((i) => Math.max(0, i - 1));
    return true;
  }, [index]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', back);
    return () => subscription.remove();
  }, [back]);

  return (
    <View
      style={[styles.root, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
    >
      <View style={styles.bar}>
        <View style={styles.side}>
          {index > 0 ? (
            <IconButton
              testID="onboarding-back"
              icon="chevron.left"
              accessibilityLabel="Previous question"
              onPress={back}
            />
          ) : null}
        </View>
        <ProgressBar step={index + 1} total={STEP_IDS.length} />
        <View style={[styles.side, styles.trailing]}>
          {isOptional(step) ? (
            <Button
              testID="onboarding-skip"
              label="Skip"
              variant="ghost"
              size="sm"
              haptic={false}
              onPress={skip}
            />
          ) : null}
        </View>
      </View>

      <Screen
        key={step}
        footer={
          <>
            {!ready && requiredHints[step] ? (
              <Text variant="footnote" tone="muted" align="center">
                {requiredHints[step]}
              </Text>
            ) : null}
            <Button
              testID="onboarding-continue"
              label={continueLabel(step, draft, last)}
              size="lg"
              fullWidth
              disabled={!ready}
              loading={finishing}
              onPress={next}
            />
          </>
        }
      >
        <Animated.View entering={FadeIn.duration(theme.motion.duration.base)} style={styles.body}>
          <StepBody step={step} draft={draft} onChange={setDraft} onSubmit={next} isTeen={isTeen} />
        </Animated.View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: gutter / 2,
    minHeight: 52,
  },
  side: { width: 72, flexDirection: 'row' },
  trailing: { justifyContent: 'flex-end' },
  body: { gap: 16 },
});
