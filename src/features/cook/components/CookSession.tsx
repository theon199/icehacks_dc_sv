import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Alert, StyleSheet, Vibration, View } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RecipeDetail } from '@/lib/catalog';
import { formatClock } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useSettingsStore } from '@/stores';
import { Button, gutter, toast, useTheme } from '@/ui';

import { CookStepView } from './CookStepView';
import { CookTopBar } from './CookTopBar';
import { IngredientDrawer } from './IngredientDrawer';
import { StepTimerCard } from './StepTimerCard';
import { TimerTray } from './TimerTray';
import { TutorialVideo } from './TutorialVideo';
import { VoiceBanner } from './VoiceBanner';
import { useCookTimers } from '../hooks/useCookTimers';
import { useStepPosition } from '../hooks/useStepPosition';
import { useVoiceCommands } from '../hooks/useVoiceCommands';
import { pickTutorialVideo, stepProgress, stepTimerLabel } from '../logic/session';
import { stepTimerId, type CookTimer } from '../logic/timers';
import type { VoiceCommand } from '../logic/voiceCommands';

const KEEP_AWAKE_TAG = 'famara-cook-mode';
const ALERT_PATTERN = [0, 500, 250, 500];
const COMMAND_WORDS: Record<VoiceCommand['type'], string> = {
  next: 'next',
  back: 'back',
  repeat: 'repeat',
  start_timer: 'start timer',
};

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
  const notificationsEnabled = useSettingsStore((s) => s.settings.notifications.cookTimers);
  const video = useMemo(() => pickTutorialVideo(recipe.tutorials), [recipe.tutorials]);
  const [videoOpen, setVideoOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<number>>(() => new Set());
  const [replayKey, setReplayKey] = useState(0);
  const [heard, setHeard] = useState<string | null>(null);

  const onFinish = useCallback((timer: CookTimer, whileAway: boolean) => {
    // A notification already told them while Famara was in the background.
    if (whileAway) return;
    haptics.warning();
    Vibration.vibrate(ALERT_PATTERN);
    toast.show({ message: `${timer.label} timer is done`, tone: 'success' });
    AccessibilityInfo.announceForAccessibility(`${timer.label} timer is done`);
  }, []);

  const timers = useCookTimers({
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    notificationsEnabled,
    onFinish,
  });
  const startTimer = timers.start;

  // The echo of a heard command fades after a moment.
  useEffect(() => {
    if (!heard) return undefined;
    const timeout = setTimeout(() => setHeard(null), 2500);
    return () => clearTimeout(timeout);
  }, [heard]);

  const next = useCallback(() => {
    haptics.selection();
    goTo(step + 1);
  }, [goTo, step]);
  const back = useCallback(() => {
    haptics.selection();
    goTo(step - 1);
  }, [goTo, step]);

  const startStepTimer = useCallback(
    (index: number) => {
      const seconds = steps[index]?.timerSeconds;
      if (!seconds) return false;
      startTimer({
        id: stepTimerId(index),
        label: stepTimerLabel(index),
        stepIndex: index,
        durationMs: seconds * 1000,
      });
      return true;
    },
    [startTimer, steps],
  );

  const handleCommand = useCallback(
    (command: VoiceCommand) => {
      setHeard(COMMAND_WORDS[command.type]);
      switch (command.type) {
        case 'next':
          return next();
        case 'back':
          return back();
        case 'repeat':
          haptics.selection();
          setReplayKey((key) => key + 1);
          if (current) AccessibilityInfo.announceForAccessibility(current.text);
          return;
        case 'start_timer':
          if (command.seconds !== null) {
            startTimer({
              id: `voice-${Date.now()}`,
              label: formatClock(command.seconds),
              stepIndex: null,
              durationMs: command.seconds * 1000,
            });
          } else if (!startStepTimer(step)) {
            toast.show({ message: 'This step has no timer. Try “set a timer for 5 minutes”.' });
            return;
          }
          haptics.success();
      }
    },
    [back, current, next, startStepTimer, startTimer, step],
  );
  const voice = useVoiceCommands(handleCommand);

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
