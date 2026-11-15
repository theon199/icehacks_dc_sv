import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { GlassSheet } from './GlassSheet';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual<{ default: unknown }>('react-native-reanimated');
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => true };
});

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <GlassSheet visible={open} onClose={() => setOpen(false)} title="Filters" testID="sheet">
      <Text>Body</Text>
    </GlassSheet>
  );
}

describe('GlassSheet with Reduce Motion on', () => {
  it('goes at once, with no slide to wait for', async () => {
    await renderWithTheme(<Harness />);
    expect(screen.getByText('Body')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId('sheet-close'));
    });
    expect(screen.queryByText('Body')).not.toBeOnTheScreen();
  });
});
