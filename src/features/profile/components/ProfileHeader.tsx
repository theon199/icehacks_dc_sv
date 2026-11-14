import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Chip, Icon, PressableScale, space, Text, fontFamily, useTheme } from '@/ui';

import type { ProfileRow } from '../api/schemas';
import { cuisineLabel } from '../model/cuisines';

export interface ProfileHeaderProps {
  profile: ProfileRow;
  avatarUri: string | null;
  avatarBusy: boolean;
  onAvatarPress: () => void;
  onEdit: () => void;
}

const AVATAR_SIZE = 60;
const EDIT_SIZE = 36;

/**
 * Who this is, on one white card: photo, name and handle with an edit circle, then the bio the
 * cook wrote and their favourite cuisines.
 */
export function ProfileHeader({
  profile,
  avatarUri,
  avatarBusy,
  onAvatarPress,
  onEdit,
}: ProfileHeaderProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.tile,
          ...theme.elevation.low,
          shadowColor: theme.colors.shadow,
        },
      ]}
      testID="profile-identity"
    >
      <View style={styles.row}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Profile photo"
          accessibilityHint="Change or remove your photo"
          accessibilityState={{ busy: avatarBusy }}
          disabled={avatarBusy}
          onPress={onAvatarPress}
          testID="profile-avatar"
        >
          <Avatar name={profile.display_name} uri={avatarUri} size={AVATAR_SIZE} />
          <View
            style={[
              styles.cameraBadge,
              { backgroundColor: theme.colors.primary, borderColor: theme.colors.surface },
            ]}
          >
            <Icon name={avatarBusy ? 'hourglass' : 'camera.fill'} size={11} color="onPrimary" />
          </View>
        </PressableScale>
        <View style={styles.copy}>
          <View style={styles.nameRow}>
            <Text variant="title2" numberOfLines={1} style={styles.name}>
              {profile.display_name}
            </Text>
            {profile.is_team ? (
              <Chip label="Famara Team" tone="primary" icon="checkmark.seal.fill" />
            ) : null}
          </View>
          <Text variant="caption" tone="muted" numberOfLines={2} style={styles.meta}>
            @{profile.handle}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          hitSlop={(44 - EDIT_SIZE) / 2}
          onPress={onEdit}
          style={({ pressed }) => [
            styles.edit,
            { backgroundColor: theme.colors.surfaceSunken },
            pressed && styles.pressed,
          ]}
          testID="profile-edit"
        >
          <Icon name="pencil" size={16} color="text" />
        </Pressable>
      </View>

      {profile.bio ? (
        <Text variant="subhead" tone="muted">
          {profile.bio}
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a bio"
          onPress={onEdit}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text variant="subhead" tone="muted" style={styles.empty}>
            Add a bio
          </Text>
        </Pressable>
      )}

      {profile.cuisines.length > 0 ? (
        <View
          style={styles.chips}
          accessible
          accessibilityLabel={`Favourite cuisines: ${profile.cuisines.map(cuisineLabel).join(', ')}`}
        >
          {profile.cuisines.map((id) => (
            <Chip key={id} label={cuisineLabel(id)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flexShrink: 1, fontFamily: fontFamily.textBold, letterSpacing: -0.3 },
  meta: { fontFamily: fontFamily.textSemiBold },
  edit: {
    width: EDIT_SIZE,
    height: EDIT_SIZE,
    borderRadius: EDIT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { fontFamily: fontFamily.textSemiBold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  pressed: { opacity: 0.7 },
});
