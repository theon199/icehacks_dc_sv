import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RecipeDetail } from '@/lib/catalog';
import { Button, gutter, Text, useTheme } from '@/ui';

import { CookStepView } from './CookStepView';
import { CookTopBar } from './CookTopBar';
import { IngredientDrawer } from './IngredientDrawer';
import { StepTimerCard } from './StepTimerCard';
import { TimerTray } from './TimerTray';
import { TutorialVideo } from './TutorialVideo';
import { VoiceBanner } from './VoiceBanner';
import { useCookControls } from '../hooks/useCookControls';
import { useStepPosition } from '../hooks/useStepPosition';
import { pickTutorialVideo, stepProgress } from '../logic/session';
import { stepTimerId } from '../logic/timers';

const KEEP_AWAKE_TAG = 'famara-cook-mode';

export interface CookSessionProps {
  recipe: RecipeDetail;
}

/** Full-screen, step-by-step cooking for one recipe with at least one step. */
export function CookSession({ recipe }: CookSessionProps) {
  useKeepAwake(KEEP_AWAKE_TAG);
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const steps = recipe.steps;
  const { step, goTo, clear } = useStepPosition(recipe.id, steps.length);
  const current = steps[step];
  const video = useMemo(() => pickTutorialVideo(recipe.tutorials), [recipe.tutorials]);
  const [videoOpen, setVideoOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<number>>(() => new Set());
  const { timers, voice, heard, replayKey, next, back, startStepTimer } = useCookControls(
    recipe,
    step,
    goTo,
  );

  const toggleChecked = useCallback((position: number) => {
    setChecked((previous) => {
      const updated = new Set(previous);
      if (!updated.delete(position)) updated.add(position);
      return updated;
    });
  }, []);

  const leave = useCallback(() => {
    const active = timers.timers.some((timer) => timer.status !== 'done');
    if (!active) return router.back();
    Alert.alert('Leave cook mode?', 'Your timers will stop.', [
      { text: 'Keep cooking', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => router.back() },
    ]);
  }, [router, timers.timers]);

  const finish = useCallback(() => {
    clear();
    voice.stop();
    router.replace({ pathname: '/cook/[id]/done', params: { id: recipe.id } });
  }, [clear, recipe.id, router, voice]);

  const swipe = useMemo(
    () =>
      Gesture.Race(
        // Swiping the page right reveals the previous step, left the next one.
        Gesture.Fling().direction(Directions.RIGHT).runOnJS(true).onEnd(back),
        Gesture.Fling().direction(Directions.LEFT).runOnJS(true).onEnd(next),
      ),
    [back, next],
  );

  if (!current) return null;
  const last = step === steps.length - 1;
  const stepTimer = timers.byId[stepTimerId(step)];

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.colors.background, paddingTop: insets.top + 8 },
      ]}
      testID="cook-mode"
    >
      <View style={styles.top}>
        <CookTopBar
          title={recipe.title}
          step={step}
          stepCount={steps.length}
          progress={stepProgress(step, steps.length)}
          listening={voice.listening}
          hasVideo={video !== null}
          videoOpen={videoOpen}
          onClose={leave}
          onToggleVoice={voice.listening ? voice.stop : () => void voice.start()}
          onToggleVideo={() => setVideoOpen((open) => !open)}
          onOpenIngredients={() => setDrawerOpen(true)}
        />
        <VoiceBanner status={voice.status} heard={heard} onDismiss={voice.stop} />
        <TimerTray
          timers={timers.timers}
          now={timers.now}
          currentStep={step}
          onOpenStep={goTo}
          onDismiss={timers.remove}
        />
      </View>
      <GestureDetector gesture={swipe}>
        <View style={styles.body} collapsable={false}>
          <CookStepView
            step={current}
            index={step}
            replayKey={replayKey}
            header={video && videoOpen ? <TutorialVideo video={video} /> : null}
          >
            {current.timerSeconds ? (
              <StepTimerCard
                seconds={current.timerSeconds}
                timer={stepTimer}
                now={timers.now}
                onStart={() => startStepTimer(step)}
                onPause={timers.pause}
                onResume={timers.resume}
                onAddMinute={(id) => timers.extend(id, 60_000)}
                onRemove={timers.remove}
              />
            ) : null}
            {timers.permission === 'denied' && timers.timers.length > 0 ? (
              <Text variant="footnote" tone="muted">
                Notifications are off, so timers can only alert you while Famara is open.
              </Text>
            ) : null}
          </CookStepView>
        </View>
      </GestureDetector>
      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          label="Back"
          icon="chevron.left"
          variant="secondary"
          size="lg"
          disabled={step === 0}
          onPress={back}
          style={styles.control}
          testID="cook-back"
        />
        <Button
          label={last ? 'Finish' : 'Next'}
          icon={last ? 'checkmark' : 'chevron.right'}
          size="lg"
          onPress={last ? finish : next}
          style={styles.control}
          testID={last ? 'cook-finish' : 'cook-next'}
        />
      </View>
      <IngredientDrawer
        visible={drawerOpen}
        ingredients={recipe.ingredients}
        checked={checked}
        onToggle={toggleChecked}
        onClose={() => setDrawerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { paddingHorizontal: gutter, gap: 10 },
  body: { flex: 1, paddingHorizontal: gutter },
  controls: { flexDirection: 'row', gap: 12, paddingHorizontal: gutter, paddingTop: 12 },
  control: { flex: 1 },
});
