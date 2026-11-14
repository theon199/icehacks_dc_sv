import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip, Icon, ProgressRing, Text, space, useTheme, type IconName } from '@/ui';
import { LogoMark } from '@/ui/brand';

import { night } from './NightTheme';

export type WelcomeArtKind = 'bowl' | 'fit' | 'plan';

const GAP = space.sm + 2;

/** Wrapper that keeps the drawings out of VoiceOver: the slide text says it all. */
function Decorative({
  children,
  width,
  height,
}: {
  children: ReactNode;
  width: number;
  height: number;
}) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.mosaic, { width, height }]}
    >
      {children}
    </View>
  );
}

/** One rounded tile of the mosaic, on the raised night surface. */
function Tile({ children, flex = 1 }: { children: ReactNode; flex?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.tile,
        {
          flex,
          borderRadius: theme.radii.xl,
          backgroundColor: night.raised,
          borderColor: night.hairline,
        },
      ]}
    >
      {children}
    </View>
  );
}

/** The one lime tile on each slide: a small caption over a bold word. */
function LimeTile({ caption, title, flex = 1 }: { caption: string; title: string; flex?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.tile,
        styles.lime,
        { flex, borderRadius: theme.radii.xl, backgroundColor: theme.colors.highlight },
      ]}
    >
      <Text variant="footnote" color="onHighlight" style={styles.limeCaption}>
        {caption}
      </Text>
      <Text variant="title1" color="onHighlight">
        {title}
      </Text>
    </View>
  );
}

function IconRow({ icons }: { icons: readonly IconName[] }) {
  return (
    <View style={styles.iconRow}>
      {icons.map((icon) => (
        <View key={icon} style={[styles.iconDisc, { backgroundColor: night.control }]}>
          <Icon name={icon} size={22} color="text" />
        </View>
      ))}
    </View>
  );
}

function BowlArt({ width, height }: { width: number; height: number }) {
  return (
    <Decorative width={width} height={height}>
      <View style={styles.column}>
        <Tile flex={1.6}>
          <LogoMark size={Math.min(width * 0.32, height * 0.42)} decorative />
        </Tile>
        <Tile>
          <IconRow icons={['leaf.fill', 'carrot.fill']} />
        </Tile>
      </View>
      <View style={styles.column}>
        <LimeTile caption="Today" title="For you" />
        <Tile flex={1.6}>
          <IconRow icons={['fish.fill', 'drop.fill']} />
        </Tile>
      </View>
    </Decorative>
  );
}

function FitArt({ width, height }: { width: number; height: number }) {
  return (
    <Decorative width={width} height={height}>
      <View style={[styles.column, styles.wide]}>
        <Tile flex={1.5}>
          <ProgressRing progress={0.86} size={72} strokeWidth={8} accessibilityLabel="Fit">
            <Text variant="title2">86</Text>
          </ProgressRing>
        </Tile>
        <Tile>
          <View style={styles.chips}>
            <Chip label="More fiber" icon="leaf.fill" tone="primary" />
            <Chip label="Less salt" icon="heart.fill" tone="primary" />
          </View>
        </Tile>
      </View>
      <View style={styles.column}>
        <Tile>
          <Icon name="checkmark.shield.fill" size={34} color="text" />
        </Tile>
        <LimeTile caption="Made to fit" title="You" flex={1.4} />
      </View>
    </Decorative>
  );
}

function PlanArt({ width, height }: { width: number; height: number }) {
  return (
    <Decorative width={width} height={height}>
      <View style={styles.column}>
        <LimeTile caption="This week" title="Planned" flex={1.2} />
        <Tile>
          <Icon name="cart" size={34} color="text" />
        </Tile>
      </View>
      <View style={styles.column}>
        <Tile>
          <Icon name="calendar" size={34} color="text" />
        </Tile>
        <Tile flex={1.3}>
          <Icon name="frying.pan" size={40} color="text" />
        </Tile>
      </View>
    </Decorative>
  );
}

/** Original brand drawings for the welcome slides: a mosaic of rounded night tiles and icons. */
export function WelcomeArt({
  kind,
  width,
  height,
}: {
  kind: WelcomeArtKind;
  width: number;
  height: number;
}) {
  if (kind === 'bowl') return <BowlArt width={width} height={height} />;
  if (kind === 'fit') return <FitArt width={width} height={height} />;
  return <PlanArt width={width} height={height} />;
}

const styles = StyleSheet.create({
  mosaic: { flexDirection: 'row', gap: GAP },
  column: { flex: 1, gap: GAP },
  wide: { flex: 1.3 },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
  },
  lime: { alignItems: 'flex-start', justifyContent: 'flex-end', padding: space.lg },
  limeCaption: { opacity: 0.75 },
  iconRow: { flexDirection: 'row', gap: space.sm },
  iconDisc: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2, justifyContent: 'center' },
});
