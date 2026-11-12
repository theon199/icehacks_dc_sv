import { FlashList } from '@shopify/flash-list';
import * as WebBrowser from 'expo-web-browser';
import { memo, useCallback } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { describeError, logger } from '@/lib/logger';
import {
  Button,
  Icon,
  minTouchTarget,
  PressableScale,
  SheetContent,
  space,
  Text,
  toast,
  useTheme,
} from '@/ui';

import { REASON_LABEL } from './copy';
import { formatCents, formatCheckedDate, formatPackage } from './format';
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
        <Text variant="bodyStrong" numberOfLines={2}>
          {row.name}
        </Text>
        <Text variant="footnote" tone="muted">
          {sourceDetail(row)}
        </Text>
        <Text variant="caption" tone="subtle">
          {sourceMeta(row)}
        </Text>
      </View>
      <View style={styles.rowTrail}>
        <Text variant="subhead">{share}</Text>
        {row.url ? <Icon name="arrow.up.right.square" size={16} color="primary" /> : null}
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
      <Text variant="overline" tone="muted">
        Not in the estimate
      </Text>
      {excluded.map((item) => (
        <View key={item.key} style={styles.excludedRow}>
          <Text variant="body" numberOfLines={2}>
            {item.name}
          </Text>
          <Text variant="footnote" tone="muted">
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SheetContent
        title="Price sources"
        description="Each item counts the share of the package the food uses. Store prices change, so check before you buy."
        scroll={false}
        footer={<Button label="Done" variant="secondary" onPress={onClose} fullWidth />}
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
      </SheetContent>
    </Modal>
  );
}

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
  rowTrail: { alignItems: 'flex-end', gap: space.xs },
  excluded: { paddingTop: space.lg, gap: space.sm },
  excludedRow: { gap: space.xxs },
});
