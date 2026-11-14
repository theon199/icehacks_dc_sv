import { router } from 'expo-router';

import { errorMessageFor } from '@/ui';

import { CommunityStateCard } from './CommunityStateCard';
import type { FeedMode } from '../api/schemas';

const COPY: Record<FeedMode, { title: string; message: string }> = {
  following: {
    title: 'Nothing from your people yet',
    message:
      'Follow cooks you like or invite friends, and their dishes will show up here. Your own posts appear here too.',
  },
  popular: {
    title: 'No popular dishes this fortnight',
    message: 'Be one of the first to share what you cooked. Find something to make in Discover.',
  },
  new: {
    title: 'No posts yet',
    message: 'Cook something from Discover and share how it went.',
  },
};

const goToDiscover = () => router.navigate('/');

/** Empty feed with a way forward: friends for Following, Discover for the rest. */
export function FeedEmpty({ mode }: { mode: FeedMode }) {
  const copy = COPY[mode];
  const discover = { label: 'Go to Discover', onPress: goToDiscover };
  return (
    <CommunityStateCard
      testID="feed-empty"
      title={copy.title}
      message={copy.message}
      actions={
        mode === 'following'
          ? [{ label: 'Find friends', onPress: () => router.push('/friends') }, discover]
          : [discover]
      }
    />
  );
}

/** The feed could not load: what failed, in the danger colour, with a retry. */
export function FeedError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <CommunityStateCard
      testID="feed-error"
      title="The community feed could not be loaded"
      message={errorMessageFor(error)}
      alert
      actions={[{ label: 'Try again', onPress: onRetry }]}
    />
  );
}
