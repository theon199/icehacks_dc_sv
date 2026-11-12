import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, IconButton, space, Text, TextField } from '@/ui';

import {
  reshareInvite,
  useOpenInvites,
  useRevokeInvite,
  useShareInvite,
} from '../hooks/useFriends';
import { displayInviteCode, inviteExpiryLabel, normalizeInviteCode } from '../model/invites';

function OpenInvites() {
  const invites = useOpenInvites();
  const revoke = useRevokeInvite();
  const list = invites.data ?? [];
  if (list.length === 0) return null;
  const now = new Date();

  return (
    <View style={styles.openList} testID="open-invites">
      <Text variant="subhead" tone="muted">
        Waiting to be accepted
      </Text>
      {list.map((invite) => (
        <View key={invite.code} style={styles.openRow}>
          <View style={styles.flex}>
            <Text
              variant="bodyStrong"
              accessibilityLabel={`Code ${invite.code.split('').join(' ')}`}
            >
              {displayInviteCode(invite.code)}
            </Text>
            <Text variant="footnote" tone="muted">
              {inviteExpiryLabel(invite.expires_at, now)}
            </Text>
          </View>
          <IconButton
            icon="square.and.arrow.up"
            accessibilityLabel="Share this invite again"
            onPress={() => void reshareInvite(invite.code, invite.expires_at)}
          />
          <IconButton
            icon="xmark.circle"
            accessibilityLabel="Withdraw this invite"
            disabled={revoke.isPending}
            onPress={() =>
              Alert.alert('Withdraw this invite?', 'The link will stop working.', [
                { text: 'Keep', style: 'cancel' },
                {
                  text: 'Withdraw',
                  style: 'destructive',
                  onPress: () => revoke.mutate(invite.code),
                },
              ])
            }
          />
        </View>
      ))}
    </View>
  );
}

function EnterCode() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    const code = normalizeInviteCode(value);
    if (!code) {
      setError('That code does not look right. Invite codes have 10 letters and numbers.');
      return;
    }
    setError(null);
    setValue('');
    router.push(`/invite/${code}`);
  };

  return (
    <View style={styles.enter}>
      <TextField
        label="Got an invite code?"
        value={value}
        onChangeText={(text) => {
          setValue(text);
          if (error) setError(null);
        }}
        error={error}
        placeholder="ABCDE FGH23"
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={open}
        testID="invite-code-input"
      />
      <Button
        label="Use code"
        variant="secondary"
        size="sm"
        disabled={value.trim().length === 0}
        onPress={open}
        style={styles.start}
      />
    </View>
  );
}

/** Create and share invite links, see open invites, or enter a code someone sent. */
export function InviteSection() {
  const share = useShareInvite();
  return (
    <Card style={styles.card} testID="invite-section">
      <View style={styles.intro}>
        <Text variant="title3">Invite a friend</Text>
        <Text variant="callout" tone="muted">
          Send a link. When your friend opens it in Famara, you follow each other straight away.
          Each link works once, for 7 days.
        </Text>
      </View>
      <Button
        label="Share an invite link"
        icon="link"
        onPress={() => share.mutate()}
        loading={share.isPending}
        fullWidth
        testID="share-invite"
      />
      <OpenInvites />
      <EnterCode />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
  intro: { gap: space.xs },
  flex: { flex: 1 },
  openList: { gap: space.xs },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  enter: { gap: space.sm },
  start: { alignSelf: 'flex-start' },
});
