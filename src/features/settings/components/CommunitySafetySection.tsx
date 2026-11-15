import { useRouter } from 'expo-router';

import { blockedPeopleHref, reviewQueueHref, useIsModerator } from '../deps';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

/**
 * Community safety: the people this person has blocked, and for moderators the review queue. The
 * queue row appears only once the account's roles say so; the server checks the role again on
 * every review action, so this only decides what is offered.
 */
export function CommunitySafetySection() {
  const router = useRouter();
  const { isModerator } = useIsModerator();

  return (
    <SettingsSection title="Community and safety">
      <SettingsRow
        testID="settings-blocked-people"
        label="Blocked people"
        description="People whose posts and comments you do not see. Unblock them here."
        icon="hand.raised"
        onPress={() => router.push(blockedPeopleHref)}
      />
      {isModerator ? (
        <SettingsRow
          testID="settings-review-queue"
          label="Review queue"
          description="Reports waiting for a moderator"
          icon="checkmark.shield"
          onPress={() => router.push(reviewQueueHref)}
        />
      ) : null}
    </SettingsSection>
  );
}
