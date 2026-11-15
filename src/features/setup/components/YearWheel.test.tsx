import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { YEAR_ROW_HEIGHT, YearWheel, rowAtOffset, yearsBetween } from './YearWheel';

describe('yearsBetween and rowAtOffset', () => {
  it('lists years newest first', () => {
    expect(yearsBetween(2020, 2023)).toEqual([2023, 2022, 2021, 2020]);
  });

  it('snaps an offset to the nearest row, inside the list', () => {
    expect(rowAtOffset(YEAR_ROW_HEIGHT * 2.4, 10)).toBe(2);
    expect(rowAtOffset(-30, 10)).toBe(0);
    expect(rowAtOffset(YEAR_ROW_HEIGHT * 40, 10)).toBe(9);
  });
});

describe('YearWheel', () => {
  const years = yearsBetween(1990, 2000);

  it('answers nothing until a year is picked, then reads it out', async () => {
    const onChange = jest.fn();
    const view = await renderWithTheme(
      <YearWheel years={years} value={null} onChange={onChange} restingYear={1995} />,
    );
    const wheel = screen.getByRole('adjustable', { name: 'Birth year' });
    expect(wheel).toHaveAccessibilityValue({ text: 'Not chosen' });
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('year-1993'));
    expect(onChange).toHaveBeenCalledWith(1993);

    await view.rerender(
      <YearWheel years={years} value={1993} onChange={onChange} restingYear={1995} />,
    );
    expect(screen.getByRole('adjustable', { name: 'Birth year' })).toHaveAccessibilityValue({
      text: '1993',
    });
  });

  it('steps a year at a time for VoiceOver, starting from the resting year', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <YearWheel years={years} value={null} onChange={onChange} restingYear={1995} />,
    );
    const wheel = screen.getByRole('adjustable', { name: 'Birth year' });
    await fireEvent(wheel, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(1996);
    await fireEvent(wheel, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(1994);
  });
});
