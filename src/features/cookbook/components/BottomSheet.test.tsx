import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { renderWithTheme } from '@/test/render';
import { SHEET_CLOSE_MS, SHEET_DISMISS_FALLBACK_MS } from '@/ui';

import { BottomSheet } from './BottomSheet';

/** A sheet that starts open (or not) with an outside button that hides it. */
function Harness({ startOpen, onClosed }: { startOpen: boolean; onClosed: () => void }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <>
      <Pressable accessibilityRole="button" testID="hide" onPress={() => setOpen(false)} />
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        onClosed={onClosed}
        title="Choices"
      >
        <Text>Body</Text>
      </BottomSheet>
    </>
  );
}

const elapse = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

describe('BottomSheet closing', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // Jest runs as iOS, where the native dismissal event cannot fire, so the fallback timer stands in.
  it('slides away, then waits for the modal to go before reporting the sheet closed, once', async () => {
    const onClosed = jest.fn();
    await renderWithTheme(<Harness startOpen onClosed={onClosed} />);
    expect(screen.getByText('Choices')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('hide'));
    // The exit is still playing.
    expect(screen.getByText('Choices')).toBeOnTheScreen();
    await elapse(SHEET_CLOSE_MS);
    expect(screen.queryByText('Choices')).not.toBeOnTheScreen();
    await elapse(SHEET_DISMISS_FALLBACK_MS - 1);
    expect(onClosed).not.toHaveBeenCalled();
    await elapse(1);
    expect(onClosed).toHaveBeenCalledTimes(1);

    await elapse(SHEET_DISMISS_FALLBACK_MS * 2);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('does not report a close for a sheet that was never shown', async () => {
    const onClosed = jest.fn();
    await renderWithTheme(<Harness startOpen={false} onClosed={onClosed} />);
    await elapse(SHEET_DISMISS_FALLBACK_MS * 2);
    expect(onClosed).not.toHaveBeenCalled();
  });
});
