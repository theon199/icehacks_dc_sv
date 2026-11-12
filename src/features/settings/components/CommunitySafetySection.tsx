import { useRouter } from 'expo-router';

import { ListRow } from '@/ui';

import { blockedPeopleHref, reviewQueueHref, useIsModerator } from '../deps';
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
    <SettingsSection title="Community">
      <ListRow
        testID="settings-blocked-people"
        title="Blocked people"
        subtitle="People whose posts and comments you do not see"
        icon="hand.raised"
        divider={isModerator}
        onPress={() => router.push(blockedPeopleHref)}
      />
      {isModerator ? (
        <ListRow
          testID="settings-review-queue"
          title="Review queue"
          subtitle="Reports waiting for a moderator"
          icon="checkmark.shield"
          onPress={() => router.push(reviewQueueHref)}
        />
      ) : null}
    </SettingsSection>
  );
}
