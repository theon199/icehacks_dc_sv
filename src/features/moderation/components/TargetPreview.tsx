import { StyleSheet, View } from 'react-native';

import { Card, Chip, Text } from '@/ui';
import { space } from '@/ui/tokens';

import type { QueueItem } from '../model';
import { targetNoun } from '../reasons';

export interface TargetPreviewProps {
  item: Pick<QueueItem, 'target_kind' | 'target_id' | 'target' | 'owner_handle'>;
  /** Cut long text in lists; show everything on the review screen. */
  compact?: boolean;
}

function statusChip(status: string | undefined) {
  if (status === 'hidden') return <Chip label="Hidden" tone="accent" icon="eye.slash" />;
  if (status === 'removed') return <Chip label="Removed" tone="accent" icon="trash" />;
  return null;
}

/** What was reported, as the moderator needs to judge it. */
export function TargetPreview({ item, compact = false }: TargetPreviewProps) {
  const { target } = item;
  const lines = compact ? 3 : undefined;
  const owner = item.owner_handle ? `@${item.owner_handle}` : null;

  return (
    <Card variant="outlined" padding="md">
      <View style={styles.header}>
        <Text variant="overline" tone="muted">
          {targetNoun(item.target_kind)}
          {owner ? ` · ${owner}` : ''}
        </Text>
        {statusChip(target?.status)}
      </View>
      {target == null ? (
        <Text variant="callout" tone="muted">
          This {targetNoun(item.target_kind)} no longer exists.
        </Text>
      ) : item.target_kind === 'user' ? (
        <View style={styles.body}>
          <Text variant="headline">{target.display_name ?? 'Unknown member'}</Text>
          {target.bio ? (
            <Text variant="callout" numberOfLines={lines}>
              {target.bio}
            </Text>
          ) : null}
          {target.suspended_until ? (
            <Text variant="footnote" tone="danger">
              Suspended until {new Date(target.suspended_until).toLocaleDateString()}
            </Text>
          ) : null}
        </View>
      ) : item.target_kind === 'recipe' ? (
        <Text variant="callout">Catalog recipe {target.recipe_ref ?? item.target_id}</Text>
      ) : (
        <View style={styles.body}>
          {target.title ? <Text variant="headline">{target.title}</Text> : null}
          {target.body ? (
            <Text variant="callout" numberOfLines={lines}>
              {target.body}
            </Text>
          ) : null}
          {target.media && target.media.length > 0 ? (
            <Text variant="footnote" tone="muted">
              {target.media.length} photo{target.media.length === 1 ? '' : 's'} attached
            </Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  body: { gap: space.xs },
});
