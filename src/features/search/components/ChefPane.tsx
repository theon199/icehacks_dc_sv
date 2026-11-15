import { StyleSheet, View } from 'react-native';

import { ChefChat } from '../deps';

/**
 * The Chef side of the Ask page. It puts no search field in the native header, so the tab bar
 * stays whole with the question box above it, and Chef's buttons go into the native header. The
 * chat brings its own AI gate, so people who may not use AI yet see why and, when old enough, how
 * to turn it on, without leaving the Search tab.
 */
export function ChefPane() {
  return (
    <View style={styles.flex} testID="chef-pane">
      <ChefChat nativeHeader />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
