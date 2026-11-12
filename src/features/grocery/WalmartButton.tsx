import { StyleSheet, View } from 'react-native';

import { Button, Text, space, toast } from '@/ui';

import {
  useWalmartCart,
  useWalmartReadyIds,
  useWalmartStatus,
  type WalmartCartDeps,
} from './useWalmart';
import { describeLeftOut, shouldShowWalmart } from './walmart';

export interface WalmartButtonProps {
  /** Ingredient ids that still need buying. */
  idsToBuy: readonly string[];
  /** Display names per ingredient id, for saying what did not make it into the cart. */
  names: Readonly<Record<string, string>>;
  /** Test seam for building and opening the cart. */
  cartDeps?: WalmartCartDeps;
}

/**
 * "Buy at Walmart": renders nothing unless the Walmart integration is configured and at least
 * one item to buy has an in-stock Walmart item. Opens the cart link in the in-app browser.
 */
export function WalmartButton({ idsToBuy, names, cartDeps }: WalmartButtonProps) {
  const status = useWalmartStatus(idsToBuy.length > 0);
  const configured = status.data?.configured === true;
  const ready = useWalmartReadyIds(idsToBuy, configured);
  const cart = useWalmartCart(cartDeps);

  if (!shouldShowWalmart(status.data, idsToBuy, ready.data)) return null;
  const readyIds = ready.data ?? new Set<string>();
  const readyCount = idsToBuy.filter((id) => readyIds.has(id)).length;
  const affiliate = status.data?.configured === true && status.data.affiliate;

  const onPress = () => {
    cart.mutate(
      { idsToBuy, readyIds },
      {
        onSuccess: (outcome) => {
          if (outcome.kind === 'opened') {
            const message = describeLeftOut(outcome.leftOut, names);
            if (message) toast.show({ message });
          } else if (outcome.kind === 'empty') {
            toast.show({
              message: 'None of these items can be added to a Walmart cart right now.',
            });
          } else {
            toast.show({ message: "Walmart shopping isn't available right now." });
          }
        },
        onError: () => {
          toast.show({ message: "Couldn't open the Walmart cart. Try again.", tone: 'danger' });
        },
      },
    );
  };

  return (
    <View style={styles.wrap}>
      <Button
        label="Buy at Walmart"
        icon="cart"
        variant="secondary"
        fullWidth
        loading={cart.isPending}
        onPress={onPress}
        accessibilityHint={`Opens a Walmart cart with ${readyCount} ${readyCount === 1 ? 'item' : 'items'}`}
        testID="grocery-walmart-button"
      />
      {affiliate ? (
        <Text variant="caption" tone="subtle" align="center">
          Famara may earn a commission on Walmart purchases.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
});
