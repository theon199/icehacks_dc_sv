import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChefChat } from '../deps';

export interface ChefPaneProps {
  /** The Search | Chef switch, in the middle of Chef's header. */
  modeSwitch: ReactNode;
  onBack: () => void;
  backLabel: string;
}

/**
 * The Chef side of the Ask page. The chat brings its own AI gate, so people who may not use AI yet
 * see why and, when old enough, how to turn it on, without leaving the Search tab.
 */
export function ChefPane({ modeSwitch, onBack, backLabel }: ChefPaneProps) {
  return (
    <View style={styles.flex} testID="chef-pane">
      <ChefChat switcher={modeSwitch} onBack={onBack} backLabel={backLabel} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
