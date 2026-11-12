import { act, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { Composer, limitResetNote } from './Composer';

const NOW = new Date(2026, 10, 12, 15, 0).getTime();

describe('limitResetNote', () => {
  it('names the reset time later today', () => {
    const until = new Date(2026, 10, 12, 18, 30).getTime();
    expect(limitResetNote(until, NOW, 'en-US')).toBe(
      "You've used today's Chef questions. Chef is back at 6:30 PM.",
    );
  });

  it('says tomorrow when the reset falls after midnight', () => {
    const until = new Date(2026, 10, 13, 0, 0).getTime();
    expect(limitResetNote(until, NOW, 'en-US')).toBe(
      "You've used today's Chef questions. Chef is back tomorrow at 12:00 AM.",
    );
  });

  it('stays vague about a reset more than a day away', () => {
    const until = new Date(2026, 10, 15, 9, 0).getTime();
    expect(limitResetNote(until, NOW, 'en-US')).toBe(
      "You've used today's Chef questions. Chef is back once your allowance resets.",
    );
  });
});

describe('Composer', () => {
  it('sends a typed question while Chef is free', async () => {
    const onSend = jest.fn();
    await renderWithTheme(<Composer busy={false} onSend={onSend} />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('chef-input'), 'Dinner ideas?');
    await user.press(screen.getByTestId('chef-send'));

    expect(onSend).toHaveBeenCalledWith({ text: 'Dinner ideas?', photo: null });
    expect(screen.queryByTestId('chef-limit-note')).toBeNull();
  });

  it('keeps the draft but will not send while the daily limit is spent', async () => {
    const onSend = jest.fn();
    const limitedUntil = Date.now() + 2 * 60 * 60 * 1000;
    await renderWithTheme(<Composer busy={false} limitedUntil={limitedUntil} onSend={onSend} />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('chef-input'), 'Dinner ideas?');

    expect(screen.getByTestId('chef-send')).toBeDisabled();
    await user.press(screen.getByTestId('chef-send'));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByTestId('chef-input')).toHaveDisplayValue('Dinner ideas?');
    expect(screen.getByTestId('chef-limit-note')).toHaveTextContent(/Chef is back/);
  });

  it('names the reason on the disabled Send button for VoiceOver', async () => {
    const limitedUntil = Date.now() + 60 * 60 * 1000;
    await renderWithTheme(<Composer busy={false} limitedUntil={limitedUntil} onSend={jest.fn()} />);
    expect(screen.getByLabelText("Send. You've used today's Chef questions")).toBeDisabled();
  });

  describe('across midnight', () => {
    beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 10, 12, 23, 50) }));
    afterEach(() => jest.useRealTimers());

    it('stops saying tomorrow once the date changes', async () => {
      const limitedUntil = new Date(2026, 10, 13, 0, 30).getTime();
      await renderWithTheme(
        <Composer busy={false} limitedUntil={limitedUntil} onSend={jest.fn()} />,
      );
      expect(screen.getByTestId('chef-limit-note')).toHaveTextContent(/back tomorrow at/);

      await act(async () => {
        jest.advanceTimersByTime(11 * 60 * 1000);
      });
      expect(screen.getByTestId('chef-limit-note')).toHaveTextContent(/Chef is back at/);
      expect(screen.getByTestId('chef-limit-note')).not.toHaveTextContent(/tomorrow/);
    });
  });

  describe('limit announcement', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    beforeEach(() => announce.mockClear());

    it('reads the limit note out once when the limit starts', async () => {
      const limitedUntil = Date.now() + 60 * 60 * 1000;
      let update: (next: { busy: boolean; limitedUntil: number | null }) => void = () => undefined;
      function Harness() {
        const [props, setProps] = useState({ busy: false, limitedUntil: null as number | null });
        update = setProps;
        return <Composer {...props} onSend={jest.fn()} />;
      }
      await renderWithTheme(<Harness />);
      expect(announce).not.toHaveBeenCalled();

      await act(async () => update({ busy: false, limitedUntil }));
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(limitResetNote(limitedUntil));

      // Unrelated re-renders while limited stay quiet.
      await act(async () => update({ busy: true, limitedUntil }));
      expect(announce).toHaveBeenCalledTimes(1);
    });

    it('stays quiet while Chef is not limited', async () => {
      await renderWithTheme(<Composer busy={false} onSend={jest.fn()} />);
      expect(announce).not.toHaveBeenCalled();
    });
  });
});
