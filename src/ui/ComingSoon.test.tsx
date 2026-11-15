import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { ComingSoon } from './ComingSoon';

describe('ComingSoon', () => {
  it('offers no action when the screen has its own way out', async () => {
    await renderWithTheme(<ComingSoon title="Meals for now" />);
    expect(screen.getByText('Meals for now')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull();
  });

  it('gives a full-screen placeholder a way out', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<ComingSoon title="Cooking coach" safeTop onClose={onClose} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
