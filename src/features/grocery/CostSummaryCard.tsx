import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PricesNotice } from '@/lib/api/commerce';
import { Button, Card, Skeleton, space, Text } from '@/ui';

import { checkingMessage, missingMessage, noticeMessage, retailersMessage } from './copy';
import { formatCents } from './format';
import type { CostDisplay } from './pricing';

/** Whole-package spend is mentioned once it differs from the estimate by at least this much. */
const WHOLE_PACKAGE_NOTE_CENTS = 100;

export interface CostSummaryCardProps {
  display: CostDisplay;
  /** Some items are staples assumed to be at home. */
  hasStaples: boolean;
  retailers: readonly string[];
  notice: PricesNotice | null;
  lookupFailed: boolean;
  onShowSources: () => void;
  onRetry?: (() => void) | undefined;
  /** Rendered under the figures, e.g. the Walmart button. */
  footer?: ReactNode;
}

function Figures({ display }: { display: CostDisplay }) {
  const total = formatCents(display.totalCents);
  if (display.perServingCents !== null) {
    const perServing = formatCents(display.perServingCents);
    return (
      <View
        style={styles.figures}
        accessible
        accessibilityLabel={`About ${perServing} per serving, ${total} in total`}
        testID="grocery-cost-figures"
      >
        <Text variant="title1">{perServing}</Text>
        <Text variant="callout" tone="muted">
          per serving · {total} total
        </Text>
      </View>
    );
  }
  return (
    <View
      style={styles.figures}
      accessible
      accessibilityLabel={`About ${total} in total`}
      testID="grocery-cost-figures"
    >
      <Text variant="title1">{total}</Text>
      <Text variant="callout" tone="muted">
        estimated total
      </Text>
    </View>
  );
}

/** The cost summary's layout, driven entirely by props. */
export function CostSummaryCard({
  display,
  hasStaples,
  retailers,
  notice,
  lookupFailed,
  onShowSources,
  onRetry,
  footer,
}: CostSummaryCardProps) {
  const checking = checkingMessage(display.checking);
  const missing = missingMessage(display.missing);
  const status = noticeMessage(notice, lookupFailed);
  const from = retailersMessage(retailers);
  const showWhole =
    display.hasEstimate &&
    display.wholePackageCents - display.totalCents >= WHOLE_PACKAGE_NOTE_CENTS;

  let body: ReactNode;
  if (display.nothingToBuy) {
    body = (
      <Text variant="callout" tone="muted">
        Everything here is already in your kitchen, so there is nothing to buy.
      </Text>
    );
  } else if (display.hasEstimate) {
    body = <Figures display={display} />;
  } else if (display.checking.length > 0) {
    body = (
      <View style={styles.figures} accessibilityLabel="Checking prices" accessible>
        <Skeleton width={120} height={34} radius="md" />
        <Skeleton width={180} height={16} />
      </View>
    );
  } else {
    body = (
      <Text variant="callout" tone="muted">
        No store prices are available for these ingredients yet.
      </Text>
    );
  }

  return (
    <Card testID="grocery-cost-summary">
      <View style={styles.stack}>
        <Text variant="overline" tone="muted">
          Estimated cost
        </Text>
        {body}
        {showWhole ? (
          <Text variant="footnote" tone="muted">
            About {formatCents(display.wholePackageCents)} at the register if you buy whole
            packages; leftovers stay for next time.
          </Text>
        ) : null}
        {checking ? (
          <Text variant="footnote" tone="muted">
            {checking}
          </Text>
        ) : null}
        {missing ? (
          <Text variant="footnote" tone="muted" testID="grocery-cost-missing">
            {missing}
          </Text>
        ) : null}
        {hasStaples && !display.nothingToBuy ? (
          <Text variant="footnote" tone="subtle">
            Pantry staples like salt and oil aren&apos;t counted.
          </Text>
        ) : null}
        {status ? (
          <View style={styles.status}>
            <Text variant="footnote" tone="muted" style={styles.flex}>
              {status}
            </Text>
            {lookupFailed && onRetry ? (
              <Button label="Retry" size="sm" variant="ghost" onPress={onRetry} />
            ) : null}
          </View>
        ) : null}
        {display.hasEstimate || display.missing.length > 0 ? (
          <View style={styles.sources}>
            {from ? (
              <Text variant="caption" tone="subtle" style={styles.flex} numberOfLines={2}>
                {from}. Estimates vary by store.
              </Text>
            ) : (
              <View style={styles.flex} />
            )}
            <Button
              label="Sources"
              size="sm"
              variant="ghost"
              icon="info.circle"
              onPress={onShowSources}
              accessibilityHint="Shows where each price came from"
              testID="grocery-sources-button"
            />
          </View>
        ) : null}
        {footer}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  figures: { gap: space.xxs },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sources: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
