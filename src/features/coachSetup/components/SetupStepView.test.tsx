import { screen } from '@testing-library/react-native';
import type { ImageProps } from 'expo-image';

import { renderWithTheme } from '@/test/render';
import { motion } from '@/ui/tokens';

import { SetupStepView } from './SetupStepView';
import { SETUP_STEPS } from '../logic/setupSteps';

const mockImage = jest.fn<null, [ImageProps]>(() => null);
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

async function renderStep() {
  if (!firstStep) throw new Error('no setup steps');
  await renderWithTheme(<SetupStepView step={firstStep} index={0} count={SETUP_STEPS.length} />);
  expect(screen.getByTestId('setup-step-1')).toBeOnTheScreen();
  const props = mockImage.mock.lastCall?.[0];
  if (!props) throw new Error('the illustration did not render');
  return props;
}

describe('SetupStepView', () => {
  beforeEach(() => {
    mockMotion.reduce = false;
  });

  it('plays the animated illustration and cross-fades between steps', async () => {
    const props = await renderStep();
    expect(props.source).toEqual(
      expect.objectContaining({ testUri: expect.stringMatching(/mount-step-1\.webp$/) }),
    );
    expect(props.autoplay).not.toBe(false);
    expect(props.transition).toBe(motion.duration.base);
  });

  it('switches steps at once with Reduce Motion on', async () => {
    mockMotion.reduce = true;
    const props = await renderStep();
    expect(props.transition ?? null).toBeNull();
  });

  it('shows a still frame of the illustration with Reduce Motion on', async () => {
    mockMotion.reduce = true;
    const props = await renderStep();
    expect(props.autoplay).toBe(false);
  });
});
