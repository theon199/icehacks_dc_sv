import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Button,
  Chip,
  Icon,
  IconButton,
  PressableScale,
  space,
  Text,
  useTheme,
} from '@/ui';

import type { ProfileRow } from '../api/schemas';
import { cuisineLabel } from '../model/cuisines';

export interface ProfileHeaderProps {
  profile: ProfileRow;
  avatarUri: string | null;
  avatarBusy: boolean;
  onAvatarPress: () => void;
  onEdit: () => void;
  onFriends: () => void;
  onSettings: () => void;
}

const AVATAR_SIZE = 96;

/** Photo, name, handle, bio and favourite cuisines, with the main profile actions. */
export function ProfileHeader({
  profile,
  avatarUri,
  avatarBusy,
  onAvatarPress,
  onEdit,
  onFriends,
  onSettings,
}: ProfileHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
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
              { backgroundColor: theme.colors.primary, borderColor: theme.colors.background },
            ]}
          >
            <Icon name={avatarBusy ? 'hourglass' : 'camera.fill'} size={14} color="onPrimary" />
          </View>
        </PressableScale>
        <IconButton
          icon="gearshape"
          accessibilityLabel="Settings"
          variant="tinted"
          onPress={onSettings}
          testID="profile-settings"
        />
      </View>

      <View style={styles.names}>
        <View style={styles.nameRow}>
          <Text variant="title1" numberOfLines={2} style={styles.shrink}>
            {profile.display_name}
          </Text>
          {profile.is_team ? (
            <Chip label="Famara Team" tone="primary" icon="checkmark.seal.fill" />
          ) : null}
        </View>
        <Text variant="subhead" tone="muted">
          @{profile.handle}
        </Text>
      </View>

      {profile.bio ? <Text variant="callout">{profile.bio}</Text> : null}

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

      <View style={styles.actions}>
        <Button label="Edit profile" icon="pencil" variant="secondary" size="sm" onPress={onEdit} />
        <Button label="Friends" icon="person.2" variant="secondary" size="sm" onPress={onFriends} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  names: { gap: space.xxs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  shrink: { flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  actions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
