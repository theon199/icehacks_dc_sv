import { memo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Avatar, Button, Icon, PressableScale, space, Text } from '@/ui';

import { avatarUrl } from '../api/profileApi';
import type { Person } from '../model/connections';
import { followActionFor, type Relation } from '../model/friendRows';

export interface PersonRowProps {
  person: Person;
  relation: Relation;
  detail: string | null;
  busy: boolean;
  onOpen: (personId: string) => void;
  onFollowChange: (personId: string, follow: boolean) => void;
}

/** One person in the Friends list, with the follow action that fits the relationship. */
export const PersonRow = memo(function PersonRow({
  person,
  relation,
  detail,
  busy,
  onOpen,
  onFollowChange,
}: PersonRowProps) {
  const action = followActionFor(relation, person);

  const press = () => {
    if (!action.confirm) {
      onFollowChange(person.id, action.follow);
      return;
    }
    Alert.alert(action.confirm, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfollow',
        style: 'destructive',
        onPress: () => onFollowChange(person.id, action.follow),
      },
    ]);
  };

  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={[person.displayName, `@${person.handle}`, detail]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint="Opens their profile"
        onPress={() => onOpen(person.id)}
        pressedScale={0.99}
        style={styles.identity}
        testID={`person-${person.id}`}
      >
        <Avatar name={person.displayName} uri={avatarUrl(person.avatarPath)} size={44} />
        <View style={styles.names}>
          <View style={styles.nameLine}>
            <Text variant="bodyStrong" numberOfLines={1} style={styles.shrink}>
              {person.displayName}
            </Text>
            {person.isTeam ? <Icon name="checkmark.seal.fill" size={14} color="primary" /> : null}
          </View>
          <Text variant="footnote" tone="muted" numberOfLines={1}>
            {detail ?? `@${person.handle}`}
          </Text>
        </View>
      </PressableScale>
      <Button
        label={action.label}
        variant={action.variant}
        size="sm"
        loading={busy}
        onPress={press}
        accessibilityHint={
          action.follow ? `Follow ${person.displayName}` : `Unfollow ${person.displayName}`
        }
        testID={`follow-${person.id}`}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingVertical: space.xs,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  names: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  shrink: { flexShrink: 1 },
});
