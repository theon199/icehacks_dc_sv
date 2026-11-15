import { screen, userEvent } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { ProfileButton } from './ProfileButton';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('ProfileButton', () => {
  it('opens the profile', async () => {
    await renderWithTheme(<ProfileButton />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Open your profile' }));
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  it('adds a given count to its label and shows no chip without one', async () => {
    const view = await renderWithTheme(
      <ProfileButton badge={{ label: '2', accessibilityLabel: '2 new' }} />,
    );
    expect(screen.getByRole('button', { name: 'Open your profile, 2 new' })).toBeOnTheScreen();
    expect(
      screen.getByTestId('profile-button-badge', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    await view.rerender(<ProfileButton />);
    expect(
      screen.queryByTestId('profile-button-badge', { includeHiddenElements: true }),
    ).not.toBeOnTheScreen();
  });
});
