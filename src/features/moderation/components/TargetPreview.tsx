import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Card, Chip, Text, useTheme } from '@/ui';
import { radii, space } from '@/ui/tokens';

import type { QueueItem } from '../model';
import { targetNoun } from '../reasons';
import type { ReviewPhoto } from '../reviewTarget';

export interface TargetPreviewProps {
  item: Pick<QueueItem, 'target_kind' | 'target_id' | 'target' | 'owner_handle'>;
  /** Cut long text in lists; show everything on the review screen. */
  compact?: boolean;
  /** Signed photos to show in full (review screen). Without them only a count is shown. */
  photos?: readonly ReviewPhoto[];
  /** Copy for a target that cannot be found, instead of the default. */
  missingText?: string;
}

function statusChip(status: string | undefined) {
  if (status === 'hidden') return <Chip label="Hidden" tone="accent" icon="eye.slash" />;
  if (status === 'removed') return <Chip label="Removed" tone="accent" icon="trash" />;
  return null;
}

function PhotoGrid({ photos }: { photos: readonly ReviewPhoto[] }) {
  const theme = useTheme();
  return (
    <View style={styles.photos}>
      {photos.map((photo, index) => {
        const label = `Attached photo ${index + 1} of ${photos.length}`;
        const aspectRatio = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;
        return photo.uri ? (
          <Image
            key={photo.path}
            source={{ uri: photo.uri }}
            placeholder={photo.blurhash ? { blurhash: photo.blurhash } : null}
            style={[styles.photo, { aspectRatio, backgroundColor: theme.colors.surfaceSunken }]}
            contentFit="contain"
            transition={150}
            recyclingKey={photo.path}
            accessible
            accessibilityRole="image"
            accessibilityLabel={label}
            testID={`review-photo-${index}`}
          />
        ) : (
          <View
            key={photo.path}
            style={[
              styles.photo,
              styles.missingPhoto,
              { aspectRatio, backgroundColor: theme.colors.surfaceSunken },
            ]}
            accessible
            accessibilityLabel={`${label} could not be loaded`}
          >
            <Text variant="footnote" tone="muted">
              Photo could not be loaded
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** What was reported, as the moderator needs to judge it. */
export function TargetPreview({ item, compact = false, photos, missingText }: TargetPreviewProps) {
  const { target } = item;
  const lines = compact ? 3 : undefined;
  const owner = item.owner_handle ? `@${item.owner_handle}` : null;
  const mediaCount = target?.media?.length ?? 0;

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
          {missingText ?? `This ${targetNoun(item.target_kind)} no longer exists.`}
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
          {!compact && photos && photos.length > 0 ? (
            <PhotoGrid photos={photos} />
          ) : mediaCount > 0 ? (
            <Text variant="footnote" tone="muted">
              {mediaCount} photo{mediaCount === 1 ? '' : 's'} attached
            </Text>
          ) : null}
          {!compact && target.suspended_until ? (
            <Text variant="footnote" tone="danger">
              Author suspended until {new Date(target.suspended_until).toLocaleDateString()}
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
  photos: { gap: space.sm, marginTop: space.xs },
  photo: { width: '100%', maxHeight: 480, borderRadius: radii.sm, overflow: 'hidden' },
  missingPhoto: { alignItems: 'center', justifyContent: 'center' },
});
