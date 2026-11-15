import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  GlassIconButton,
  HEADER_TITLE_MAX_FONT_SCALE,
  Screen,
  space,
  Text,
  fontFamily,
} from '@/ui';

import { SetupStepView } from '../components/SetupStepView';
import { ViewCheck } from '../components/ViewCheck';
import { selectCanUseAi, useSessionStore } from '../deps';
import {
  nextPosition,
  previousPosition,
  SETUP_STEPS,
  startDestination,
  VIEW_CHECK,
} from '../logic/setupSteps';

export interface CoachSetupScreenProps {
  recipeId: string;
}

/**
 * How to mount the phone for the cooking coach: four illustrated steps, then a live look through
 * the camera, then cooking. Kept awake because people read it while standing at the cabinet.
 */
export function CoachSetupScreen({ recipeId }: CoachSetupScreenProps) {
  useKeepAwake();
  const router = useRouter();
  const canUseAi = useSessionStore((state) => selectCanUseAi(state));
  const [position, setPosition] = useState(0);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const back = () => {
    const previous = previousPosition(position);
    if (previous === null) leave();
    else setPosition(previous);
  };
  const start = () => {
    const href =
      startDestination(canUseAi) === 'coach'
        ? ({ pathname: '/cook/[id]/coach', params: { id: recipeId } } as const)
        : ({ pathname: '/cook/[id]', params: { id: recipeId } } as const);
    router.replace(href);
  };

  if (position === VIEW_CHECK) {
    return (
      <ViewCheck
        onBack={back}
        onStart={start}
        coachUnavailable={startDestination(canUseAi) === 'cook'}
      />
    );
  }

  const step = SETUP_STEPS[position];
  if (!step) return null;
  const last = position === SETUP_STEPS.length - 1;

  return (
    <Screen
      testID="coach-setup"
      footer={
        <Button
          label={last ? 'Check my view' : 'Next'}
          size="lg"
          fullWidth
          onPress={() => setPosition(nextPosition(position))}
          testID="setup-next"
        />
      }
    >
      <View style={styles.header}>
        <GlassIconButton
          icon={position === 0 ? 'xmark' : 'chevron.left'}
          accessibilityLabel={position === 0 ? 'Close setup' : 'Previous step'}
          onPress={back}
          testID="setup-back"
        />
        <Text
          variant="title1"
          numberOfLines={1}
          maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
          style={styles.title}
        >
          Set up your phone
        </Text>
      </View>
      <SetupStepView step={step} index={position} count={SETUP_STEPS.length} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  title: { flex: 1, fontFamily: fontFamily.textBold },
});
