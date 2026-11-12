import { screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { StepTimerCard } from './StepTimerCard';

const noop = () => undefined;

async function renderStart(alertsInBackground: boolean) {
  await renderWithTheme(
    <StepTimerCard
      seconds={300}
      timer={undefined}
      alertsInBackground={alertsInBackground}
      onStart={noop}
      onPause={noop}
      onResume={noop}
      onAddMinute={noop}
      onRemove={noop}
    />,
  );
  return screen.getByTestId('cook-step-timer-start');
}

describe('StepTimerCard', () => {
  it('promises an alert outside Famara when notifications can deliver one', async () => {
    expect((await renderStart(true)).props.accessibilityHint).toBe(
      'Counts down and alerts you when it is done, even if you leave Famara.',
    );
  });

  it('only promises an alert inside Famara when notifications are off', async () => {
    expect((await renderStart(false)).props.accessibilityHint).toBe(
      'Counts down and alerts you when it is done while Famara is open.',
    );
  });
});
