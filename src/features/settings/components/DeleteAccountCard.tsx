import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text, TextField, space, toast } from '@/ui';

import { DELETE_CONFIRMATION_PHRASE, deleteAccount } from '../account/accountApi';
import { useSubmission } from '../account/useSubmission';

/** Whether the typed text confirms deletion. Case and surrounding spaces do not matter. */
export function confirmsDeletion(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_CONFIRMATION_PHRASE;
}

/**
 * Account deletion behind a typed confirmation. On success the account and everything stored with
 * it are gone, and the app signs out back to the welcome screen.
 */
export function DeleteAccountCard() {
  // null while collapsed; otherwise what the person has typed so far.
  const [phrase, setPhrase] = useState<string | null>(null);
  const { status, busy, submit, dismiss } = useSubmission(
    'Could not delete your account. Try again.',
  );

  if (phrase == null) {
    return (
      <Button
        testID="account-delete-start"
        label="Delete account"
        variant="ghost"
        icon="trash"
        onPress={() => setPhrase('')}
        style={styles.start}
      />
    );
  }

  const armed = confirmsDeletion(phrase);

  const erase = async () => {
    if (!armed) return;
    if (await submit(deleteAccount)) {
      toast.show({ message: 'Your account has been deleted.', tone: 'success' });
    }
  };

  const collapse = () => {
    dismiss();
    setPhrase(null);
  };

  return (
    <Card variant="outlined" testID="account-delete-card" style={styles.card}>
      <Text variant="headline" tone="danger">
        Delete your account?
      </Text>
      <Text variant="callout">
        This permanently deletes your profile, preferences, saved recipes, plans, pantry, cook
        history, posts, comments and photos. It cannot be undone. Export your data first if you want
        a copy.
      </Text>
      <TextField
        testID="account-delete-input"
        label={`Type ${DELETE_CONFIRMATION_PHRASE} to confirm`}
        value={phrase}
        onChangeText={setPhrase}
        autoCapitalize="characters"
        autoCorrect={false}
        disabled={busy}
        error={status.problem}
      />
      <View style={styles.actions}>
        <Button
          testID="account-delete-confirm"
          label="Delete forever"
          variant="destructive"
          fullWidth
          loading={busy}
          disabled={!armed}
          onPress={() => void erase()}
        />
        <Button
          label="Keep my account"
          variant="ghost"
          fullWidth
          disabled={busy}
          onPress={collapse}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: 'flex-start' },
  card: { gap: space.md },
  actions: { gap: space.sm },
});
