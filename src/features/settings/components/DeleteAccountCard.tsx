import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text, TextField, space, toast } from '@/ui';

import { AccountError, DELETE_CONFIRMATION_PHRASE, deleteAccount } from '../account/accountApi';

/** Whether the typed text confirms deletion. Case and surrounding spaces do not matter. */
export function confirmsDeletion(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_CONFIRMATION_PHRASE;
}

/**
 * Account deletion behind a typed confirmation. On success the account and everything stored with
 * it are gone, and the app signs out back to the welcome screen.
 */
export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!confirmsDeletion(typed) || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      toast.show({ message: 'Your account has been deleted.', tone: 'success' });
    } catch (cause) {
      setError(
        cause instanceof AccountError ? cause.message : 'Could not delete your account. Try again.',
      );
      setDeleting(false);
    }
  };

  if (!open) {
    return (
      <Button
        testID="account-delete-start"
        label="Delete account"
        variant="ghost"
        icon="trash"
        onPress={() => setOpen(true)}
        style={styles.start}
      />
    );
  }

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
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        disabled={deleting}
        error={error}
      />
      <View style={styles.actions}>
        <Button
          testID="account-delete-confirm"
          label="Delete forever"
          variant="destructive"
          fullWidth
          loading={deleting}
          disabled={!confirmsDeletion(typed)}
          onPress={() => void confirm()}
        />
        <Button
          label="Keep my account"
          variant="ghost"
          fullWidth
          disabled={deleting}
          onPress={() => {
            setOpen(false);
            setTyped('');
            setError(null);
          }}
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
