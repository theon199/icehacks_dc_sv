import { screen, userEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { renderWithTheme } from '@/test/render';

import { Button, type ButtonProps } from './Button';

const impact = jest.mocked(Haptics.impactAsync);

/** Renders one button, taps it once and reports how many presses and haptics came through. */
async function tapOnce(props: Omit<ButtonProps, 'onPress'>) {
  const presses: number[] = [];
  await renderWithTheme(<Button {...props} onPress={() => presses.push(Date.now())} />);
  const button = screen.getByRole('button', { name: props.label });
  await userEvent.setup().press(button);
  return { button, presses: presses.length, haptics: impact.mock.calls.length };
}

describe('Button', () => {
  it('fires once with a light haptic on tap', async () => {
    const outcome = await tapOnce({ label: 'Save recipe' });
    expect([outcome.presses, outcome.haptics > 0]).toEqual([1, true]);
  });

  it('can opt out of haptics and still fire', async () => {
    const outcome = await tapOnce({ label: 'Skip', haptic: false });
    expect([outcome.presses, outcome.haptics]).toEqual([1, 0]);
  });

  it('ignores taps while disabled', async () => {
    const outcome = await tapOnce({ label: 'Continue', disabled: true });
    expect(outcome.button).toBeDisabled();
    expect(outcome.presses).toBe(0);
  });

  it('announces busy and ignores taps while loading', async () => {
    const outcome = await tapOnce({ label: 'Sign in', loading: true });
    expect(outcome.button).toBeBusy();
    expect(outcome.button).toBeDisabled();
    expect(outcome.presses).toBe(0);
  });

  it('renders every variant on the dark palette', async () => {
    const noop = () => undefined;
    await renderWithTheme(
      <>
        <Button label="Primary" onPress={noop} />
        <Button label="Secondary" variant="secondary" onPress={noop} />
        <Button label="Ghost" variant="ghost" onPress={noop} />
        <Button label="Delete" variant="destructive" onPress={noop} />
      </>,
      { scheme: 'dark' },
    );
    expect(screen.getAllByRole('button').map((node) => node.props.accessibilityLabel)).toEqual([
      'Primary',
      'Secondary',
      'Ghost',
      'Delete',
    ]);
  });
});
