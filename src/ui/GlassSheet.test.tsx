import { act, fireEvent, renderHook, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { renderWithTheme } from '@/test/render';

import {
  GlassSheet,
  SHEET_DISMISS_FALLBACK_MS,
  useSheetSession,
  useSheetSubject,
} from './GlassSheet';
import { SHEET_CLOSE_MS } from './sheetMotion';

function Harness({
  onClosed = jest.fn(),
  dismissible,
}: {
  onClosed?: () => void;
  dismissible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Pressable accessibilityRole="button" testID="reopen" onPress={() => setOpen(true)} />
      <GlassSheet
        visible={open}
        onClose={() => setOpen(false)}
        onClosed={onClosed}
        title="Price sources"
        description="Where each price came from."
        footer={<Text>Footer action</Text>}
        testID="sheet"
        {...(dismissible === undefined ? {} : { dismissible })}
      >
        <Text>Body</Text>
      </GlassSheet>
    </>
  );
}

const elapse = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

describe('GlassSheet', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows a title row with a glass X, the description, the body and the footer', async () => {
    await renderWithTheme(<Harness />);
    expect(screen.getByRole('header', { name: 'Price sources' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close Price sources' })).toBeOnTheScreen();
    expect(screen.getByText('Where each price came from.')).toBeOnTheScreen();
    expect(screen.getByText('Body')).toBeOnTheScreen();
    expect(screen.getByTestId('sheet-footer')).toHaveTextContent('Footer action');
  });

  it('renders on the night palette too', async () => {
    await renderWithTheme(<Harness />, { scheme: 'dark' });
    expect(screen.getByTestId('sheet')).toBeOnTheScreen();
  });

  it('closes from the X: slides away, then reports closed once the modal is gone', async () => {
    const onClosed = jest.fn();
    await renderWithTheme(<Harness onClosed={onClosed} />);
    await fireEvent.press(screen.getByTestId('sheet-close'));
    expect(screen.getByText('Body')).toBeOnTheScreen();
    await elapse(SHEET_CLOSE_MS);
    expect(screen.queryByText('Body')).not.toBeOnTheScreen();
    expect(onClosed).not.toHaveBeenCalled();
    await elapse(SHEET_DISMISS_FALLBACK_MS);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('closes from a tap on the dim', async () => {
    await renderWithTheme(<Harness />);
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
    await elapse(SHEET_CLOSE_MS);
    expect(screen.queryByText('Body')).not.toBeOnTheScreen();
  });

  it('comes back if reopened while it is still sliding away', async () => {
    const onClosed = jest.fn();
    await renderWithTheme(<Harness onClosed={onClosed} />);
    await fireEvent.press(screen.getByTestId('sheet-close'));
    await elapse(SHEET_CLOSE_MS / 2);
    await fireEvent.press(screen.getByTestId('reopen'));
    await elapse(SHEET_CLOSE_MS + SHEET_DISMISS_FALLBACK_MS);
    expect(screen.getByText('Body')).toBeOnTheScreen();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('offers no way out while it is not dismissible', async () => {
    await renderWithTheme(<Harness dismissible={false} />);
    expect(screen.queryByTestId('sheet-close')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
    await elapse(SHEET_CLOSE_MS);
    expect(screen.getByText('Body')).toBeOnTheScreen();
  });
});

describe('useSheetSubject', () => {
  it('keeps the last subject after the owner clears it, and follows a new one', async () => {
    const { result, rerender } = await renderHook(
      ({ subject }: { subject: string | null }) => useSheetSubject(subject),
      { initialProps: { subject: 'rice' as string | null } },
    );
    expect(result.current).toBe('rice');
    await rerender({ subject: null });
    expect(result.current).toBe('rice');
    await rerender({ subject: 'beans' });
    expect(result.current).toBe('beans');
  });
});

describe('useSheetSession', () => {
  it('counts each opening, and nothing before the first', async () => {
    const { result, rerender } = await renderHook(
      ({ visible }: { visible: boolean }) => useSheetSession(visible),
      { initialProps: { visible: false } },
    );
    expect(result.current).toBe(0);
    await rerender({ visible: true });
    expect(result.current).toBe(1);
    await rerender({ visible: false });
    expect(result.current).toBe(1);
    await rerender({ visible: true });
    expect(result.current).toBe(2);
  });
});
