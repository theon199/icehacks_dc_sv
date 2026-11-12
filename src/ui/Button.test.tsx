import { screen, userEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { renderWithTheme } from '@/test/render';

import { Button } from './Button';

describe('Button', () => {
  it('calls onPress and plays a light haptic', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button label="Save recipe" onPress={onPress} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Save recipe' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });

  it('does not fire or vibrate when haptics are turned off for it', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button label="Skip" onPress={onPress} haptic={false} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Skip' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('is disabled and ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button label="Continue" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeDisabled();
    await userEvent.setup().press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports busy and blocks presses while loading', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button label="Sign in" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    await userEvent.setup().press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders in dark mode for every variant', async () => {
    await renderWithTheme(
      <>
        <Button label="Primary" onPress={jest.fn()} />
        <Button label="Secondary" variant="secondary" onPress={jest.fn()} />
        <Button label="Ghost" variant="ghost" onPress={jest.fn()} />
        <Button label="Delete" variant="destructive" onPress={jest.fn()} />
      </>,
      { scheme: 'dark' },
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });
});
