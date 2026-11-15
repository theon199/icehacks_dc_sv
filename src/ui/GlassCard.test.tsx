import { screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { Text as RNText } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { resetLiquidGlassProbe } from './glass';
import { GlassCard, glassCardTint } from './GlassCard';
import { themes } from './tokens';

const mockGlass = { on: false };

jest.mock('expo-glass-effect', () => {
  const { View: MockView } = jest.requireActual<{
    View: ComponentType<Record<string, unknown>>;
  }>('react-native');
  const GlassView = (props: Record<string, unknown>) => <MockView testID="glass-view" {...props} />;
  return {
    GlassView,
    isGlassEffectAPIAvailable: () => mockGlass.on,
    isLiquidGlassAvailable: () => mockGlass.on,
  };
});

function withGlass(on: boolean) {
  mockGlass.on = on;
  resetLiquidGlassProbe();
}

afterEach(() => withGlass(false));

describe('glassCardTint', () => {
  it('lifts the white card colour in light mode', () => {
    expect(glassCardTint(themes.light, 'default')).toBe('#FFFFFF9e');
  });

  it('uses the palette frost in dark mode rather than white', () => {
    expect(glassCardTint(themes.dark, 'default')).toBe(themes.dark.colors.glassFrost);
  });

  it('tints the accent card with the highlight in both appearances', () => {
    expect(glassCardTint(themes.light, 'accent')).toBe('#D0F64Abf');
    expect(glassCardTint(themes.dark, 'accent')).toBe('#D0F64Abf');
  });
});

describe('GlassCard', () => {
  it('falls back to a solid card with the card radius, shadow and body spacing', async () => {
    await renderWithTheme(
      <GlassCard testID="card">
        <RNText>Inside</RNText>
      </GlassCard>,
    );
    expect(screen.queryByTestId('glass-view')).not.toBeOnTheScreen();
    const card = screen.getByTestId('card');
    expect(card).toHaveStyle({
      borderRadius: 28,
      backgroundColor: '#FFFFFF',
      overflow: 'visible',
      shadowOpacity: 0.035,
      shadowRadius: 36,
    });
    expect(screen.getByTestId('card-body')).toHaveStyle({ padding: 28, gap: 20 });
  });

  it('falls back to the highlight with the accent shadow for the accent tone', async () => {
    await renderWithTheme(
      <GlassCard tone="accent" testID="card">
        <RNText>Inside</RNText>
      </GlassCard>,
    );
    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: '#D0F64A',
      shadowOpacity: 0.05,
      shadowRadius: 20,
    });
  });

  it('renders the material with the frost tint on iOS 26', async () => {
    withGlass(true);
    await renderWithTheme(
      <GlassCard>
        <RNText>Inside</RNText>
      </GlassCard>,
      { scheme: 'dark' },
    );
    const glass = screen.getByTestId('glass-view');
    expect(glass.props.tintColor).toBe(themes.dark.colors.glassFrost);
    expect(glass).toHaveStyle({ borderRadius: 28 });
    expect(screen.getByText('Inside')).toBeOnTheScreen();
  });
});
