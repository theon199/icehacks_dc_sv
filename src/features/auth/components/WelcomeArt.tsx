import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip, Icon, ProgressRing, Text, useTheme, type IconName } from '@/ui';
import { LogoMark } from '@/ui/brand';

export type WelcomeArtKind = 'bowl' | 'fit' | 'plan';

/** Wrapper that keeps the drawings out of VoiceOver: the slide text says it all. */
function Decorative({ children, size }: { children: ReactNode; size: number }) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width: size, height: size }]}
    >
      {children}
    </View>
  );
}

function Halo({ size }: { size: number }) {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={[theme.colors.highlight, theme.colors.accentSoft, theme.colors.primarySoft]}
      start={{ x: 0.15, y: 0.1 }}
      end={{ x: 0.85, y: 0.95 }}
      style={[StyleSheet.absoluteFill, { borderRadius: size / 2, opacity: 0.9 }]}
    />
  );
}

function Orbit({ icon, x, y, tone }: { icon: IconName; x: number; y: number; tone: 'a' | 'b' }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.orbit,
        {
          left: x,
          top: y,
          backgroundColor: tone === 'a' ? theme.colors.surface : theme.colors.primary,
          ...theme.elevation.medium,
          shadowColor: theme.colors.shadow,
        },
      ]}
    >
      <Icon name={icon} size={22} color={tone === 'a' ? 'primary' : 'onPrimary'} />
    </View>
  );
}

function BowlArt({ size }: { size: number }) {
  return (
    <Decorative size={size}>
      <Halo size={size} />
      <LogoMark size={size * 0.55} decorative />
      <Orbit icon="leaf.fill" x={size * 0.06} y={size * 0.14} tone="b" />
      <Orbit icon="carrot.fill" x={size * 0.74} y={size * 0.08} tone="a" />
      <Orbit icon="fish.fill" x={size * 0.78} y={size * 0.7} tone="b" />
      <Orbit icon="drop.fill" x={size * 0.02} y={size * 0.7} tone="a" />
    </Decorative>
  );
}

function FitArt({ size }: { size: number }) {
  const theme = useTheme();
  return (
    <Decorative size={size}>
      <Halo size={size} />
      <View
        style={[
          styles.card,
          {
            width: size * 0.78,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.lg,
            ...theme.elevation.high,
            shadowColor: theme.colors.shadow,
          },
        ]}
      >
        <View style={styles.cardRow}>
          <ProgressRing progress={0.86} size={64} strokeWidth={7} accessibilityLabel="Fit">
            <Text variant="headline">86</Text>
          </ProgressRing>
          <View style={styles.cardLines}>
            <View style={[styles.line, { backgroundColor: theme.colors.text, width: '85%' }]} />
            <View style={[styles.line, { backgroundColor: theme.colors.border, width: '60%' }]} />
          </View>
        </View>
        <View style={styles.chips}>
          <Chip label="More fiber" icon="leaf.fill" tone="primary" />
          <Chip label="Less salt" icon="heart.fill" tone="primary" />
          <Chip label="Nut-free" icon="checkmark" tone="accent" />
        </View>
      </View>
    </Decorative>
  );
}

function Tile({ icon, offset, tone }: { icon: IconName; offset: number; tone: 0 | 1 | 2 }) {
  const theme = useTheme();
  const backgrounds = [theme.colors.primarySoft, theme.colors.accentSoft, theme.colors.warningSoft];
  const foregrounds = ['onPrimarySoft', 'onAccentSoft', 'onWarningSoft'] as const;
  return (
    <View
      style={[
        styles.tile,
        {
          marginTop: offset,
          backgroundColor: backgrounds[tone],
          borderRadius: theme.radii.lg,
          borderColor: theme.colors.surface,
        },
      ]}
    >
      <Icon name={icon} size={34} color={foregrounds[tone]} />
    </View>
  );
}

function PlanArt({ size }: { size: number }) {
  return (
    <Decorative size={size}>
      <Halo size={size} />
      <View style={styles.tiles}>
        <Tile icon="calendar" offset={0} tone={0} />
        <Tile icon="frying.pan" offset={size * 0.16} tone={1} />
        <Tile icon="cart" offset={size * 0.04} tone={2} />
      </View>
    </Decorative>
  );
}

/** Original brand drawings for the welcome slides, built only from shapes, gradients and icons. */
export function WelcomeArt({ kind, size }: { kind: WelcomeArtKind; size: number }) {
  if (kind === 'bowl') return <BowlArt size={size} />;
  if (kind === 'fit') return <FitArt size={size} />;
  return <PlanArt size={size} />;
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
  orbit: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { padding: 16, gap: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardLines: { flex: 1, gap: 8 },
  line: { height: 10, borderRadius: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tiles: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  tile: {
    width: 76,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
});
