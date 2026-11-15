import { act, screen } from '@testing-library/react-native';
import type { ImageProps } from 'expo-image';
import { AccessibilityInfo } from 'react-native';

import { renderWithTheme } from '@/test/render';
import { motion } from '@/ui/tokens';

import { SetupStepView } from './SetupStepView';
import { SETUP_STEPS } from '../logic/setupSteps';

const mockImage = jest.fn<null, [ImageProps]>(() => null);
/** The Reduce Motion setting when the app launched (reanimated reads it once) and now. */
const mockMotion = { reduce: false };

jest.mock('expo-image', () => ({ Image: (props: ImageProps) => mockImage(props) }));
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual<{ default: unknown }>('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    useReducedMotion: () => mockMotion.reduce,
  };
});

const firstStep = SETUP_STEPS[0];

function imageProps() {
  const props = mockImage.mock.lastCall?.[0];
  if (!props) throw new Error('the illustration did not render');
  return props;
}

async function renderStep() {
  if (!firstStep) throw new Error('no setup steps');
  const view = await renderWithTheme(
    <SetupStepView step={firstStep} index={0} count={SETUP_STEPS.length} />,
  );
  // Let the current setting, read asynchronously on mount, arrive.
  await act(async () => {});
  expect(screen.getByTestId('setup-step-1')).toBeOnTheScreen();
  return view;
}

/** The subscriptions made for the system's Reduce Motion switch (React Native's Jest mock). */
function reduceMotionSubscriptions() {
  const listener = jest.mocked(AccessibilityInfo.addEventListener);
  return listener.mock.calls.flatMap(([name, handler], i) => {
    // The mock's types follow the last overload only; the event name is any of them at runtime.
    const event: string = name;
    const result = listener.mock.results[i];
    return event === 'reduceMotionChanged' && result?.type === 'return'
      ? [{ handler, subscription: result.value }]
      : [];
  });
}

/** The person flips Reduce Motion in Settings while the step is on screen. */
async function switchReduceMotion(on: boolean) {
  const subscriptions = reduceMotionSubscriptions();
  if (subscriptions.length === 0) throw new Error('nothing listens for Reduce Motion changes');
  mockMotion.reduce = on;
  await act(async () => {
    for (const { handler } of subscriptions) Reflect.apply(handler, undefined, [on]);
  });
}

describe('SetupStepView', () => {
  beforeEach(() => {
    mockMotion.reduce = false;
    jest
      .mocked(AccessibilityInfo.isReduceMotionEnabled)
      .mockImplementation(() => Promise.resolve(mockMotion.reduce));
  });

  it('plays the animated illustration and cross-fades between steps', async () => {
    await renderStep();
    const props = imageProps();
    expect(props.source).toEqual(
      expect.objectContaining({ testUri: expect.stringMatching(/mount-step-1\.webp$/) }),
    );
    expect(props.autoplay).not.toBe(false);
    expect(props.transition).toBe(motion.duration.base);
  });

  it('switches steps at once with Reduce Motion on', async () => {
    mockMotion.reduce = true;
    await renderStep();
    expect(imageProps().transition ?? null).toBeNull();
  });

  it('shows a still frame of the illustration with Reduce Motion on', async () => {
    mockMotion.reduce = true;
    await renderStep();
    expect(imageProps().autoplay).toBe(false);
  });

  it('follows Reduce Motion when it is switched in Settings while the step is on screen', async () => {
    await renderStep();
    expect(imageProps().autoplay).toBe(true);

    await switchReduceMotion(true);
    expect(imageProps().autoplay).toBe(false);
    expect(imageProps().transition ?? null).toBeNull();

    await switchReduceMotion(false);
    expect(imageProps().autoplay).toBe(true);
    expect(imageProps().transition).toBe(motion.duration.base);
  });

  it('stops listening for Reduce Motion changes when the step leaves the screen', async () => {
    const view = await renderStep();
    const subscriptions = reduceMotionSubscriptions();
    expect(subscriptions).toHaveLength(1);
    await view.unmount();
    for (const { subscription } of subscriptions) {
      expect(jest.mocked(subscription).remove).toHaveBeenCalledTimes(1);
    }
  });
});
