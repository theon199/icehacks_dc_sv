import { act, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { SheetContent } from './SheetContent';
import { SHEET_CLOSE_MS } from './sheetMotion';

type BeforeRemove = (event: {
  data: { action: { type: string } };
  preventDefault: () => void;
}) => void;

const mockNavigation = {
  listener: null as BeforeRemove | null,
  canGoBack: jest.fn(() => true),
  goBack: jest.fn(),
  dispatch: jest.fn(),
  addListener: jest.fn((_name: string, listener: BeforeRemove) => {
    mockNavigation.listener = listener;
    return () => undefined;
  }),
};
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  router: { replace: (href: string) => mockReplace(href) },
}));

function removeWith(type: string) {
  const preventDefault = jest.fn();
  mockNavigation.listener?.({ data: { action: { type } }, preventDefault });
  return preventDefault;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockNavigation.listener = null;
  mockNavigation.canGoBack.mockReturnValue(true);
});
afterEach(() => jest.useRealTimers());

async function renderSheet() {
  await renderWithTheme(
    <SheetContent title="Why this fits you" testID="sheet">
      <Text>Body</Text>
    </SheetContent>,
  );
}

describe('SheetContent', () => {
  it('goes back from the glass X', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Close Why this fits you' }));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('holds a back action until the sheet has slid away, then lets it through', async () => {
    await renderSheet();
    let preventDefault: jest.Mock = jest.fn();
    await act(async () => {
      preventDefault = removeWith('GO_BACK');
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(mockNavigation.dispatch).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(SHEET_CLOSE_MS);
    });
    expect(mockNavigation.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    // The released action is not held a second time.
    expect(removeWith('GO_BACK')).not.toHaveBeenCalled();
  });

  it('never holds a replace or a reset', async () => {
    await renderSheet();
    expect(removeWith('REPLACE')).not.toHaveBeenCalled();
    expect(removeWith('RESET')).not.toHaveBeenCalled();
  });

  it('lands on the first tab when opened from a link with nothing beneath', async () => {
    mockNavigation.canGoBack.mockReturnValue(false);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-close'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
