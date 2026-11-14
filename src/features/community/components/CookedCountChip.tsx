import { StyleSheet } from 'react-native';

import { formatNumber } from '@/lib/format';
import { GlassSurface, Icon, Text, fontFamily, photoOverlay, space } from '@/ui';
import { withAlpha } from '@/ui/color';

const CHIP_EDGE = withAlpha(photoOverlay.text, 0.34);

/**
 * The "N×" cooked count laid over a dish photo: clear glass pinned dark so the white figure stays
 * crisp over a pale dish. A readout only; the photo or tile around it carries the spoken label.
 */
export function CookedCountChip({ count }: { count: number }) {
  return (
    <GlassSurface
      radius="pill"
      scheme="dark"
      glassStyle="clear"
      tint={photoOverlay.chip}
      fallbackColor="scrim"
      style={[styles.chip, { borderColor: CHIP_EDGE }]}
    >
      <Icon name="checkmark.circle" size={18} color="onImage" />
      <Text
        variant="headline"
        color="onImage"
        accessible={false}
        maxFontSizeMultiplier={1.2}
        style={styles.count}
      >
        {`${formatNumber(count, 0)}×`}
      </Text>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: space.xs,
    paddingHorizontal: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  count: { fontFamily: fontFamily.textBold, fontVariant: ['tabular-nums'] },
});
