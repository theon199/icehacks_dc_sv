import { act, screen, userEvent } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { Platform, Text as RNText, View } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { hasLiquidGlass, resetLiquidGlassProbe, splitControlStyle } from './glass';
import { GlassButtonGroup } from './GlassButtonGroup';
import { GlassControl } from './GlassControl';
import { GlassIconButton } from './GlassIconButton';
import { GlassMenu, useGlassMenu, type GlassMenuItem } from './GlassMenu';
import { GlassSurface } from './GlassSurface';
import { TAB_HEADER_HEIGHT } from './layout';
import { TabHeader, useTabHeaderHeight } from './TabHeader';

const mockGlass = { api: false, design: false };

jest.mock('expo-glass-effect', () => {
  const { View: MockView } = jest.requireActual<{
    View: ComponentType<Record<string, unknown>>;
  }>('react-native');
  const GlassView = (props: Record<string, unknown>) => <MockView testID="glass-view" {...props} />;
  const GlassContainer = (props: Record<string, unknown>) => (
    <MockView testID="glass-container" {...props} />
  );
  return {
    GlassView,
    GlassContainer,
    isGlassEffectAPIAvailable: () => mockGlass.api,
    isLiquidGlassAvailable: () => mockGlass.design,
  };
});

function withGlass(on: boolean) {
  mockGlass.api = on;
  mockGlass.design = on;
  resetLiquidGlassProbe();
}

afterEach(() => withGlass(false));

describe('hasLiquidGlass', () => {
  it('is true only when both the runtime API and the glass design are present', () => {
    mockGlass.api = true;
    mockGlass.design = false;
    resetLiquidGlassProbe();
    expect(hasLiquidGlass()).toBe(false);
    withGlass(true);
    expect(hasLiquidGlass()).toBe(true);
  });

  it('caches the probe until reset', () => {
    withGlass(true);
    expect(hasLiquidGlass()).toBe(true);
    mockGlass.api = false;
    expect(hasLiquidGlass()).toBe(true);
    resetLiquidGlassProbe();
    expect(hasLiquidGlass()).toBe(false);
  });

  it('is false off iOS', () => {
    withGlass(true);
    const os = Platform.OS;
    Platform.OS = 'android';
    try {
      resetLiquidGlassProbe();
      expect(hasLiquidGlass()).toBe(false);
    } finally {
      Platform.OS = os;
    }
  });
});

describe('splitControlStyle', () => {
  it('moves padding and alignment onto the content and keeps size on the shell', () => {
    const { shell, content } = splitControlStyle([
      { width: 44, height: 44, marginLeft: 4 },
      { paddingHorizontal: 12, alignItems: 'center', gap: 4 },
    ]);
    expect(shell).toEqual({ width: 44, height: 44, marginLeft: 4 });
    expect(content).toEqual({ paddingHorizontal: 12, alignItems: 'center', gap: 4 });
  });
});

describe('GlassSurface', () => {
  it('renders a solid fallback panel without glass', async () => {
    await renderWithTheme(
      <GlassSurface radius="lg" testID="panel">
        <RNText>Inside</RNText>
      </GlassSurface>,
    );
    expect(screen.queryByTestId('glass-view')).not.toBeOnTheScreen();
    expect(screen.getByTestId('panel')).toHaveStyle({
      borderRadius: 20,
      backgroundColor: '#FFFFFF',
    });
  });

  it('renders the material with the frost tint on iOS 26', async () => {
    withGlass(true);
    await renderWithTheme(
      <GlassSurface radius={32}>
        <RNText>Inside</RNText>
      </GlassSurface>,
    );
    const glass = screen.getByTestId('glass-view');
    expect(glass.props.tintColor).toBe('rgba(255, 255, 255, 0.52)');
    expect(glass).toHaveStyle({ borderRadius: 32 });
    expect(screen.getByText('Inside')).toBeOnTheScreen();
  });
});

describe('GlassControl', () => {
  it('puts the pressable inside the interactive material on iOS 26', async () => {
    withGlass(true);
    const onPress = jest.fn();
    await renderWithTheme(
      <GlassControl radius={22} onPress={onPress} accessibilityLabel="Filters">
        <View />
      </GlassControl>,
    );
    const glass = screen.getByTestId('glass-view');
    expect(glass.props.isInteractive).toBe(true);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Filters' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('turns the material response off while disabled', async () => {
    withGlass(true);
    const onPress = jest.fn();
    await renderWithTheme(
      <GlassControl radius={22} onPress={onPress} accessibilityLabel="Filters" disabled>
        <View />
      </GlassControl>,
    );
    expect(screen.getByTestId('glass-view').props.isInteractive).toBe(false);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeDisabled();
  });

  it('is a plain labelled button without glass', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <GlassControl radius={22} onPress={onPress} accessibilityLabel="Create">
        <View />
      </GlassControl>,
    );
    expect(screen.queryByTestId('glass-view')).not.toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Create' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('GlassIconButton', () => {
  it('is a 44 pt circle by default', async () => {
    await renderWithTheme(
      <GlassIconButton icon="cart" accessibilityLabel="Shopping list" onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Shopping list' })).toHaveStyle({
      width: 44,
      height: 44,
      borderRadius: 22,
    });
  });

  it('speaks the badge as part of its label and keeps the chip out of the reading order', async () => {
    await renderWithTheme(
      <GlassIconButton
        icon="bell"
        accessibilityLabel="Notifications"
        onPress={jest.fn()}
        badge={{ label: '3', accessibilityLabel: '3 unread' }}
        testID="bell"
      />,
    );
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeOnTheScreen();
    expect(screen.getByTestId('bell-badge', { includeHiddenElements: true })).toHaveProp(
      'accessibilityElementsHidden',
      true,
    );
  });

  it('shows no chip without a badge', async () => {
    await renderWithTheme(
      <GlassIconButton
        icon="bell"
        accessibilityLabel="Notifications"
        onPress={jest.fn()}
        testID="bell"
      />,
    );
    expect(screen.queryByTestId('bell-badge')).not.toBeOnTheScreen();
  });
});

describe('GlassButtonGroup', () => {
  it('gives each action its own 44 pt labelled button in one capsule', async () => {
    withGlass(true);
    const cart = jest.fn();
    const settings = jest.fn();
    await renderWithTheme(
      <GlassButtonGroup
        items={[
          { icon: 'cart', accessibilityLabel: 'Shopping list', onPress: cart },
          { icon: 'gearshape', accessibilityLabel: 'Settings', onPress: settings },
        ]}
      />,
    );
    expect(screen.getAllByTestId('glass-view')).toHaveLength(1);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Settings' }));
    expect(settings).toHaveBeenCalledTimes(1);
    expect(cart).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Shopping list' })).toHaveStyle({
      width: 44,
      height: 44,
    });
  });
});

describe('TabHeader', () => {
  it('pins a 44 pt row under the safe area and groups trailing glass in one container', async () => {
    withGlass(true);
    await renderWithTheme(
      <TabHeader
        title="Cookbook"
        trailing={
          <GlassIconButton icon="person" accessibilityLabel="Profile" onPress={jest.fn()} />
        }
      />,
    );
    expect(screen.getByRole('header', { name: 'Cookbook' })).toBeOnTheScreen();
    expect(screen.getByTestId('tab-header')).toHaveStyle({
      paddingTop: 47 + 4,
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: '#EFEFED',
    });
    expect(screen.getByTestId('tab-header-row')).toHaveStyle({ height: 44 });
    expect(screen.getAllByTestId('glass-container')).toHaveLength(1);
  });

  it('reports its full height for content under a floating header', async () => {
    let height = 0;
    function Probe() {
      height = useTabHeaderHeight();
      return null;
    }
    await renderWithTheme(<Probe />);
    expect(TAB_HEADER_HEIGHT).toBe(60);
    expect(height).toBe(47 + 60);
  });
});

describe('GlassMenu', () => {
  function MenuHarness({ items }: { items: readonly GlassMenuItem[] }) {
    const menu = useGlassMenu();
    return (
      <>
        <View ref={menu.triggerRef} collapsable={false}>
          <RNText accessibilityRole="button" onPress={menu.show}>
            Mode
          </RNText>
        </View>
        <GlassMenu controller={menu} items={items} dismissLabel="Close mode menu" testID="menu" />
      </>
    );
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('opens from its trigger, marks the current choice, and runs the picked item', async () => {
    const pick = jest.fn();
    await renderWithTheme(
      <MenuHarness
        items={[
          { key: 'all', label: 'For you', selected: true, onPress: jest.fn() },
          { key: 'quick', label: 'Quick', selected: false, onPress: pick },
        ]}
      />,
    );
    expect(screen.queryByTestId('menu')).not.toBeOnTheScreen();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'Mode' }));
    expect(screen.getByTestId('menu')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'For you' })).toBeSelected();
    await user.press(screen.getByRole('button', { name: 'Quick' }));
    expect(pick).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(pick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('menu')).not.toBeOnTheScreen();
  });
});
