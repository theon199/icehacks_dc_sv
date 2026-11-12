import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, ListRow, space } from '@/ui';

export interface MoreActionsProps {
  onCompare: () => void;
  onNearby: () => void;
  onShare: () => void;
  onReport: () => void;
}

/** Secondary ways to use a recipe, at the end of the screen. */
export const MoreActions = memo(function MoreActions({
  onCompare,
  onNearby,
  onShare,
  onReport,
}: MoreActionsProps) {
  return (
    <View style={styles.container}>
      <Card variant="outlined" padding="none">
        <ListRow
          title="Compare versions"
          subtitle="See the original next to a healthier take"
          icon="arrow.left.arrow.right"
          onPress={onCompare}
          divider
        />
        <ListRow
          title="Find it nearby"
          subtitle="Restaurants that may serve this dish"
          icon="mappin.and.ellipse"
          onPress={onNearby}
          divider
        />
        <ListRow
          title="Share or remix"
          subtitle="Post your take to the community"
          icon="square.and.arrow.up"
          onPress={onShare}
        />
      </Card>
      <ListRow
        title="Report a problem with this recipe"
        icon="flag"
        onPress={onReport}
        accessibilityHint="Opens the report form"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: space.md },
});
