import { screen } from '@testing-library/react-native';
import type { View, ViewProps } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { DishBackdrop } from './DishBackdrop';

// The gradient's own props, on a plain view, so the fade's colours can be read back.
jest.mock('expo-linear-gradient', () => {
  const RN = jest.requireActual<{ View: typeof View }>('react-native');
  return { LinearGradient: (props: ViewProps) => <RN.View {...props} /> };
});

describe('DishBackdrop', () => {
  it('darkens the top of a sharp photo with a fade that ends fully clear, not a hard edge', async () => {
    await renderWithTheme(<DishBackdrop uri="https://example.com/dish.jpg" blurred={false} />);
    const scrim = screen.getByTestId('dish-backdrop-scrim', { includeHiddenElements: true });
    const colors = scrim.props.colors as readonly string[];
    const locations = scrim.props.locations as readonly number[];
    expect(colors.length).toBeGreaterThanOrEqual(3);
    expect(colors[colors.length - 1]).toMatch(/^#[0-9a-f]{6}00$/i);
    expect(locations[0]).toBe(0);
    expect(locations[locations.length - 1]).toBe(1);
  });

  it('draws no top scrim over the frosted photo', async () => {
    await renderWithTheme(<DishBackdrop uri="https://example.com/dish.jpg" blurred />);
    expect(screen.queryByTestId('dish-backdrop-scrim', { includeHiddenElements: true })).toBeNull();
  });
});
