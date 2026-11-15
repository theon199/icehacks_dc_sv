import { FlashList } from '@shopify/flash-list';
import * as WebBrowser from 'expo-web-browser';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { describeError, logger } from '@/lib/logger';
import {
  Button,
  fontFamily,
  GlassSheet,
  Icon,
  minTouchTarget,
  PressableScale,
  space,
  Text,
  toast,
  useTheme,
} from '@/ui';

import { REASON_LABEL } from './copy';
import { formatCents, formatCheckedDate, formatPackage } from './format';
import { PILL_HEIGHT } from './metrics';
import type { MissingItem, SourceRow } from './pricing';

export interface SourcesSheetProps {
  visible: boolean;
  onClose: () => void;
  sources: readonly SourceRow[];
  /** Items left out of the estimate, shown under the sources with the reason. */
  excluded: readonly MissingItem[];
  /** Opens a store page; defaults to the in-app browser. */
  openUrl?: (url: string) => unknown;
}

function sourceDetail(row: SourceRow): string {
  const pack = formatPackage(row.packageQty, row.unit);
  const price = formatCents(row.priceCents, { currency: row.currency });
  return `${pack ? `${price} for ${pack}` : price} at ${row.retailer}`;
}

function sourceMeta(row: SourceRow): string {
  const checked = formatCheckedDate(row.fetchedAt);
  const parts = [checked ? `Checked ${checked}` : 'Check date unknown'];
  if (row.estimated) parts.push('estimated price');
  return parts.join(' · ');
}

const SourceRowView = memo(function SourceRowView({
  row,
  onOpen,
}: {
  row: SourceRow;
  onOpen: (url: string) => void;
}) {
  const theme = useTheme();
  const share = formatCents(row.shareCents, { currency: row.currency });
  const body = (
    <>
      <View style={styles.rowText}>
        <Text variant="headline" numberOfLines={2} style={styles.bold}>
          {row.name}
        </Text>
        <Text variant="caption" tone="muted">
          {sourceDetail(row)}
        </Text>
        <Text variant="caption" tone="muted">
          {sourceMeta(row)}
        </Text>
      </View>
      <View style={styles.rowTrail}>
        <Text variant="label" style={styles.bold}>
          {share}
        </Text>
        {row.url ? <Icon name="chevron.right" size={18} color="textMuted" /> : null}
      </View>
    </>
  );
  const rowStyle = [styles.row, { borderBottomColor: theme.colors.border }];
  const label = `${row.name}, ${sourceDetail(row)}, ${sourceMeta(row)}, counts ${share}`;
  if (!row.url) {
    return (
      <View style={rowStyle} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  const url = row.url;
  return (
    <PressableScale
      style={rowStyle}
      pressedScale={1}
      pressedOpacity={0.6}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={`Opens the ${row.retailer} listing`}
      onPress={() => onOpen(url)}
      testID={`grocery-source-${row.ingredientId}`}
    >
      {body}
    </PressableScale>
  );
});

function ExcludedSection({ excluded }: { excluded: readonly MissingItem[] }) {
  if (excluded.length === 0) return null;
  return (
    <View style={styles.excluded}>
      <Text variant="sectionLabel" tone="muted" accessibilityRole="header">
        Not in the estimate
      </Text>
      {excluded.map((item) => (
        <View key={item.key} style={styles.excludedRow}>
          <Text variant="headline" numberOfLines={2}>
            {item.name}
          </Text>
          <Text variant="caption" tone="muted">
            {REASON_LABEL[item.reason]}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Opens a store listing. A browser that cannot open (no browser, link refused) gets a toast, not
 * an unhandled rejection; a synchronous throw from the opener is caught the same way.
 */
export function openListing(url: string, openUrl: (url: string) => unknown): void {
  Promise.resolve()
    .then(() => openUrl(url))
    .catch((error: unknown) => {
      logger.warn('Store listing could not be opened', describeError(error));
      toast.show({ message: "Couldn't open that store page.", tone: 'danger' });
    });
}

/** Where every price in an estimate came from: store, listing link and the day it was checked. */
export function SourcesSheet({
  visible,
  onClose,
  sources,
  excluded,
  openUrl = WebBrowser.openBrowserAsync,
}: SourcesSheetProps) {
  const onOpen = useCallback((url: string) => openListing(url, openUrl), [openUrl]);
  const renderItem = useCallback(
    ({ item }: { item: SourceRow }) => <SourceRowView row={item} onOpen={onOpen} />,
    [onOpen],
  );
  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title="Price sources"
      description="Each item counts the share of the package the food uses. Store prices change, so check before you buy."
      heightRatio={SHEET_HEIGHT}
      scroll={false}
      footer={
        <Button label="Done" variant="secondary" onPress={onClose} fullWidth style={styles.done} />
      }
    >
      <View style={styles.list} testID="grocery-sources-sheet">
        <FlashList
          data={sources as SourceRow[]}
          keyExtractor={(row) => row.ingredientId}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text variant="callout" tone="muted">
              No prices yet.
            </Text>
          }
          ListFooterComponent={<ExcludedSection excluded={excluded} />}
        />
      </View>
    </GlassSheet>
  );
}

/** One row per priced item, so the sheet takes a fixed height instead of hugging its rows. */
const SHEET_HEIGHT = 0.85;

const styles = StyleSheet.create({
  list: { flex: 1, minHeight: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    minHeight: minTouchTarget,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: space.xxs },
  bold: { fontFamily: fontFamily.textBold },
  done: { height: PILL_HEIGHT },
  rowTrail: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  excluded: { paddingTop: space.lg, gap: space.sm },
  excludedRow: { gap: space.xxs },
});
