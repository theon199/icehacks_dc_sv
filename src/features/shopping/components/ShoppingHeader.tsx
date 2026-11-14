import { StyleSheet, View } from 'react-native';

import {
  GlassIconButton,
  GlassMenu,
  HEADER_TITLE_MAX_FONT_SCALE,
  Text,
  fontFamily,
  space,
  useGlassMenu,
} from '@/ui';

import { RANGE_LABELS, RANGE_PRESETS, type RangePreset } from '../planRange';

export interface ShoppingHeaderProps {
  preset: RangePreset;
  onPresetChange: (preset: RangePreset) => void;
  rangeText: string;
  summary: string | null;
  onBack: () => void;
}

/**
 * The top of the list: the glass back circle with the page name beside it and the range picker as
 * a glass circle on the right, the chosen range as the headline, and what the list covers.
 */
export function ShoppingHeader({
  preset,
  onPresetChange,
  rangeText,
  summary,
  onBack,
}: ShoppingHeaderProps) {
  const rangeMenu = useGlassMenu();
  const { triggerRef, show } = rangeMenu;
  return (
    <View style={styles.container}>
      <View style={styles.titles}>
        <View style={styles.row}>
          <GlassIconButton
            icon="chevron.left"
            accessibilityLabel="Back"
            onPress={onBack}
            testID="shopping-back"
          />
          <Text
            variant="title2"
            accessibilityRole="header"
            numberOfLines={2}
            maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
            style={styles.title}
          >
            Shopping list
          </Text>
          <View ref={triggerRef} collapsable={false}>
            <GlassIconButton
              icon="calendar"
              accessibilityLabel={`Days to shop for, ${RANGE_LABELS[preset]}`}
              accessibilityHint="Choose which planned days the list covers"
              onPress={show}
              testID="shopping-range"
            />
          </View>
        </View>
        <Text variant="title1">{RANGE_LABELS[preset]}</Text>
      </View>
      <Text variant="body" tone="muted">
        {summary ? `${rangeText} · ${summary}` : rangeText}
      </Text>
      <Text variant="body" tone="muted">
        Tick things off as you shop, then add what you bought to your pantry.
      </Text>
      <GlassMenu
        controller={rangeMenu}
        dismissLabel="Close days menu"
        testID="shopping-range-menu"
        items={RANGE_PRESETS.map((value) => ({
          key: value,
          label: RANGE_LABELS[value],
          selected: value === preset,
          testID: `shopping-range-${value}`,
          onPress: () => onPresetChange(value),
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md },
  titles: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { flex: 1, fontFamily: fontFamily.textBold },
});
