import { memo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Avatar, Button, Icon, PressableScale, space, Text, useTheme } from '@/ui';

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
  /** Rounds the card's top edge: the first row of its group. */
  first?: boolean;
  /** Rounds the card's bottom edge: the last row of its group. */
  last?: boolean;
}

/** One person in the Friends list, with the follow action that fits the relationship. */
export const PersonRow = memo(function PersonRow({
  person,
  relation,
  detail,
  busy,
  onOpen,
  onFollowChange,
  first = false,
  last = false,
}: PersonRowProps) {
  const theme = useTheme();
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
    // Consecutive rows join into one white card: the group's first and last rows draw its rounded
    // top and bottom, and the rows between share hairlines.
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderTopWidth: first ? 1 : 0,
          borderBottomWidth: last ? 1 : 0,
          borderTopLeftRadius: first ? theme.radii.card : 0,
          borderTopRightRadius: first ? theme.radii.card : 0,
          borderBottomLeftRadius: last ? theme.radii.card : 0,
          borderBottomRightRadius: last ? theme.radii.card : 0,
          paddingTop: first ? 6 : 0,
          paddingBottom: last ? 6 : 0,
        },
      ]}
    >
      <View
        style={[
          styles.row,
          last ? null : { borderBottomWidth: 1, borderBottomColor: theme.colors.primarySoft },
        ]}
      >
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
          <Avatar name={person.displayName} uri={avatarUrl(person.avatarPath)} size={40} />
          <View style={styles.names}>
            <View style={styles.nameLine}>
              <Text variant="label" numberOfLines={1} style={styles.shrink}>
                {person.displayName}
              </Text>
              {person.isTeam ? <Icon name="checkmark.seal.fill" size={14} color="primary" /> : null}
            </View>
            <Text variant="caption" tone="muted" numberOfLines={1}>
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
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderLeftWidth: 1, borderRightWidth: 1, paddingHorizontal: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingVertical: space.sm,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  names: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  shrink: { flexShrink: 1 },
});
