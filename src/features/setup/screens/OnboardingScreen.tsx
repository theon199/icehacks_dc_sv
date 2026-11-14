import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ageBandFor,
  suggestedFirstName,
  updateDisplayName,
  useSessionStore,
} from '@/features/auth';
import { haptics } from '@/lib/haptics';
import { logger } from '@/lib/logger';
import { Button, Text, space, toast, useTheme } from '@/ui';

import { ActionDock } from '../components/ActionDock';
import { OnboardingHeader } from '../components/OnboardingHeader';
import { loadPantryStarters, readSavedAnswers, saveOnboarding } from '../deps';
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
  const [draft, setDraft] = useState<Draft>(() => draftFrom(readSavedAnswers(), null));
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

  const finish = async (answers: Draft) => {
    if (finishing || !userId) return;
    setFinishing(true);
    try {
      const saved = toAnswers(answers);
      const starters = await loadPantryStarters(saved.pantryStaples);
      // Someone else signed in while the catalog was read: these answers are not theirs.
      if (useSessionStore.getState().userId !== userId) return;
      saveOnboarding(saved, starters);
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
      void finish(from);
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
    >
      <OnboardingHeader
        step={index}
        total={STEP_IDS.length}
        onBack={index > 0 ? back : null}
        onSkip={isOptional(step) ? skip : null}
      />
      <ScrollView
        key={step}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(theme.motion.duration.base)} style={styles.column}>
          <StepBody step={step} draft={draft} onChange={setDraft} onSubmit={next} isTeen={isTeen} />
        </Animated.View>
      </ScrollView>
      <ActionDock>
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
          haptic="medium"
          disabled={!ready}
          loading={finishing}
          onPress={next}
          style={styles.cta}
        />
      </ActionDock>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: space.md, paddingHorizontal: space.xl, paddingBottom: space.xl },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  cta: { height: 52 },
});
