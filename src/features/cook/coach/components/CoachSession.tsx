import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Alert, BackHandler, ScrollView, StyleSheet, View } from 'react-native';

import type { RecipeDetail } from '@/lib/catalog';
import { gutter, space, useTheme } from '@/ui';

import { CoachFooter } from './CoachFooter';
import { CoachHeader } from './CoachHeader';
import { CoachNotices } from './CoachNotices';
import { CoachStatusCard } from './CoachStatusCard';
import { CoachStepView } from './CoachStepView';
import { CoachTimers } from './CoachTimers';
import { LiveTile } from './LiveTile';
import { useCoachCamera } from '../hooks/useCoachCamera';
import type { CoachQuestionDeps } from '../hooks/useCoachQuestion';
import { useCoachSession } from '../hooks/useCoachSession';

const KEEP_AWAKE_TAG = 'famara-coach';

export interface CoachSessionProps {
  recipe: RecipeDetail;
  /** Replaces the AI client and network check in tests. */
  deps?: CoachQuestionDeps;
}

/** The coach for one recipe with at least one step, laid out to read from across the room. */
export function CoachSession({ recipe, deps }: CoachSessionProps) {
  useKeepAwake(KEEP_AWAKE_TAG);
  const router = useRouter();
  const theme = useTheme();
  const lens = useCoachCamera();
  const coach = useCoachSession({ recipe, camera: lens.camera, ...(deps ? { deps } : {}) });
  const { step, status, timers } = coach;
  const current = recipe.steps[step];
  const ordered = timers.engine.timers;
  const hasActiveTimers = ordered.some((timer) => timer.status !== 'done');

  /** Runs `proceed` straight away, or once the cook agrees to drop their running timers. */
  const confirmStoppingTimers = useCallback(
    (title: string, actionLabel: string, proceed: () => void) => {
      if (!hasActiveTimers) return proceed();
      Alert.alert(title, 'Your timers will stop.', [
        { text: 'Keep cooking', style: 'cancel' },
        { text: actionLabel, style: 'destructive', onPress: proceed },
      ]);
    },
    [hasActiveTimers],
  );

  const { finish: endSession } = coach;
  const leave = useCallback(() => {
    confirmStoppingTimers('Leave the coach?', 'Leave', () => {
      endSession();
      if (router.canGoBack()) router.back();
      else router.replace('/');
    });
  }, [confirmStoppingTimers, endSession, router]);

  const finish = useCallback(() => {
    confirmStoppingTimers('Finish cooking?', 'Finish', () => {
      endSession();
      router.replace({ pathname: '/cook/[id]/done', params: { id: recipe.id } });
    });
  }, [confirmStoppingTimers, endSession, recipe.id, router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => subscription.remove();
  }, [leave]);

  if (!current) return null;

  const onPrimary = {
    stop_alarm: coach.stopAlarm,
    check_again: coach.checkAgain,
    finish,
    next: coach.next,
  }[coach.action];
  const focus =
    status.kind === 'answer' && status.focus && status.photo
      ? { focus: status.focus, photo: status.photo }
      : null;
  const hearing = coach.mic.status === 'listening' || coach.mic.status === 'starting';

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]} testID="coach">
      <CoachHeader
        title={recipe.title}
        onClose={leave}
        speaking={!coach.muted}
        onToggleSpeaking={coach.toggleMuted}
      />
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        <CoachStepView
          index={step}
          count={recipe.steps.length}
          text={current.text}
          tile={
            <LiveTile
              access={lens.access}
              cameraRef={lens.ref}
              onReady={lens.onReady}
              onMountError={lens.onMountError}
              focus={focus}
            />
          }
        />
        <CoachTimers
          timers={ordered}
          stepSeconds={current.timerSeconds}
          notificationsOff={timers.engine.notificationsOff}
          onStartStepTimer={coach.startStepTimer}
        />
        <CoachNotices
          mic={coach.mic.status}
          camera={lens.access}
          onAllowCamera={lens.request}
          onRetryMic={() => void coach.mic.start()}
        />
      </ScrollView>
      <View style={styles.status}>
        <CoachStatusCard status={status} spoken={!coach.muted} hearing={hearing} />
      </View>
      <CoachFooter action={coach.action} onRepeat={coach.repeat} onPrimary={onPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  content: {
    paddingHorizontal: gutter,
    paddingTop: space.xs,
    paddingBottom: space.lg,
    gap: space.lg,
  },
  status: { paddingHorizontal: gutter },
});
