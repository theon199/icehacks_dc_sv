import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiError } from '@/lib/api/errors';

import { EditProfileSheet } from './EditProfileSheet';
import { updateProfile } from '../api/profileApi';
import type { ProfileRow } from '../api/schemas';
import { renderWithQuery, signInForTest, TEST_USER_ID } from '../testing';

jest.mock('../api/profileApi', () => ({ updateProfile: jest.fn() }));
jest.mock('../deps', () => ({
  listCatalogCuisines: jest.fn(() => Promise.resolve(['indian', 'thai', 'west_african'])),
}));

const update = jest.mocked(updateProfile);

const profile: ProfileRow = {
  id: TEST_USER_ID,
  handle: 'ama_cooks',
  display_name: 'Ama Owusu',
  avatar_path: null,
  bio: '',
  cuisines: ['west_african'],
  is_team: false,
};

async function renderSheet() {
  const onClose = jest.fn();
  await renderWithQuery(<EditProfileSheet profile={profile} onClose={onClose} />);
  // Let the cuisine list load before acting, so no query update lands after the test ends.
  await screen.findByTestId('cuisine-thai');
  return onClose;
}

const save = () => fireEvent.press(screen.getByTestId('edit-profile-save'));

beforeEach(() => {
  update.mockReset();
  signInForTest();
});

describe('EditProfileSheet', () => {
  it('shows field errors and does not save an invalid profile', async () => {
    const onClose = await renderSheet();
    await fireEvent.changeText(screen.getByTestId('edit-handle'), 'a b');
    await fireEvent.changeText(screen.getByTestId('edit-display-name'), '   ');
    await save();

    expect(screen.getByText('Use letters, numbers and underscores only.')).toBeOnTheScreen();
    expect(screen.getByText('Add the name you want people to see.')).toBeOnTheScreen();
    expect(update).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as the field is edited', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByTestId('edit-handle'), 'ab');
    await save();
    expect(screen.getByText('Handles are 3 to 24 characters long.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('edit-handle'), 'abc');
    expect(screen.queryByText('Handles are 3 to 24 characters long.')).toBeNull();
  });

  it('saves only what changed, then closes', async () => {
    update.mockResolvedValue({ ...profile, bio: 'Jollof on Sundays' });
    const onClose = await renderSheet();
    await fireEvent.changeText(screen.getByTestId('edit-bio'), '  Jollof on Sundays ');
    await fireEvent.press(await screen.findByTestId('cuisine-thai'));
    await save();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(TEST_USER_ID, {
      bio: 'Jollof on Sundays',
      cuisines: ['west_african', 'thai'],
    });
  });

  it('closes without a request when nothing changed', async () => {
    const onClose = await renderSheet();
    await save();
    expect(onClose).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('cancels straight away when nothing was edited', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const onClose = await renderSheet();
    await fireEvent.press(screen.getByTestId('edit-profile-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('asks before throwing away edits', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onClose = await renderSheet();
    await fireEvent.changeText(screen.getByTestId('edit-bio'), 'Soup season');
    await fireEvent.press(screen.getByTestId('edit-profile-cancel'));

    expect(onClose).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Discard your changes?',
      expect.any(String),
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((button) => button.text === 'Discard')?.onPress?.();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a taken handle next to the handle field', async () => {
    update.mockRejectedValue(
      new ApiError({
        kind: 'validation',
        functionName: 'profiles.update',
        code: 'unique_violation',
        status: 409,
      }),
    );
    const onClose = await renderSheet();
    await fireEvent.changeText(screen.getByTestId('edit-handle'), 'chef_ama');
    await save();

    expect(await screen.findByText('That handle is taken. Try another one.')).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });
});
