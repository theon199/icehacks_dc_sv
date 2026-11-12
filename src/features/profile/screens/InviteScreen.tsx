import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, SheetContent, space, useTheme, type IconName } from '@/ui';

import { useRedeemInvite } from '../hooks/useRedeemInvite';
import { displayInviteCode, redeemFailureCopy } from '../model/invites';

export interface InviteScreenProps {
  code: string;
}

function StateIcon({ name, tone }: { name: IconName; tone: 'primary' | 'danger' | 'success' }) {
  const theme = useTheme();
  const background =
    tone === 'danger'
      ? theme.colors.dangerSoft
      : tone === 'success'
        ? theme.colors.successSoft
        : theme.colors.primarySoft;
  const color =
    tone === 'danger' ? 'danger' : tone === 'success' ? 'onSuccessSoft' : 'onPrimarySoft';
  return (
    <View style={[styles.icon, { backgroundColor: background }]}>
      <Icon name={name} size={30} color={color} />
    </View>
  );
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Sheet opened by a `famara://invite/<code>` link: accept the invite and become friends. */
export function InviteScreen({ code }: InviteScreenProps) {
  const { state, accept } = useRedeemInvite(code);

  switch (state.status) {
    case 'malformed':
      return (
        <SheetContent
          title="This link doesn't work"
          description="The invite link looks incomplete. Ask your friend to share it again, or enter their code on the Friends screen."
          footer={
            <>
              <Button label="Go to Friends" onPress={() => router.replace('/friends')} fullWidth />
              <Button label="Close" variant="ghost" onPress={close} fullWidth />
            </>
          }
        >
          <StateIcon name="link.badge.plus" tone="danger" />
        </SheetContent>
      );

    case 'ready':
    case 'redeeming':
      return (
        <SheetContent
          title="You've been invited"
          description={`A friend invited you to connect on Famara with code ${displayInviteCode(state.code)}. Accept to follow each other and see each other's dishes.`}
          footer={
            <>
              <Button
                label="Accept invite"
                onPress={accept}
                loading={state.status === 'redeeming'}
                fullWidth
                testID="accept-invite"
              />
              <Button label="Not now" variant="ghost" onPress={close} fullWidth />
            </>
          }
        >
          <StateIcon name="person.2.fill" tone="primary" />
        </SheetContent>
      );

    case 'accepted': {
      const handle = state.inviter.inviter_handle;
      const inviterId = state.inviter.inviter_id;
      return (
        <SheetContent
          title="You're now friends"
          description={
            handle
              ? `You and @${handle} follow each other now. Their dishes will show up in your Following feed.`
              : 'You follow each other now. Their dishes will show up in your Following feed.'
          }
          footer={
            <>
              <Button
                label="View their profile"
                onPress={() => router.replace(`/author/${inviterId}`)}
                fullWidth
              />
              <Button label="Done" variant="ghost" onPress={close} fullWidth />
            </>
          }
        >
          <StateIcon name="checkmark.circle.fill" tone="success" />
        </SheetContent>
      );
    }

    case 'failed': {
      const copy = redeemFailureCopy(state.failure, state.serverMessage);
      return (
        <SheetContent
          title={copy.title}
          description={copy.message}
          footer={
            <>
              {copy.retryable ? (
                <Button label="Try again" onPress={accept} fullWidth testID="retry-invite" />
              ) : null}
              <Button
                label="Close"
                variant={copy.retryable ? 'ghost' : 'primary'}
                onPress={close}
                fullWidth
              />
            </>
          }
        >
          <StateIcon
            name={state.failure === 'offline' ? 'wifi.slash' : 'exclamationmark.triangle'}
            tone="danger"
          />
        </SheetContent>
      );
    }
  }
}

const styles = StyleSheet.create({
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
});
