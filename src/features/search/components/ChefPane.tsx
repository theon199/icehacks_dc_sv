import { StyleSheet, View } from 'react-native';

import { ChefChat } from '../deps';

/**
 * The Chef segment. The chat brings its own AI gate, so people who may not use AI yet see why and,
 * when old enough, how to turn it on, without leaving the Search tab.
 */
export function ChefPane() {
  return (
    <View style={styles.flex} testID="chef-pane">
      <ChefChat />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
