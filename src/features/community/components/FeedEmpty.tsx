import { router } from 'expo-router';

import { Button, EmptyState } from '@/ui';

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

/** Empty feed with a way forward: friends for Following, Discover for the rest. */
export function FeedEmpty({ mode }: { mode: FeedMode }) {
  const copy = COPY[mode];
  return (
    <EmptyState
      icon={mode === 'following' ? 'person.2' : 'fork.knife'}
      title={copy.title}
      message={copy.message}
      actionLabel={mode === 'following' ? 'Find friends' : 'Go to Discover'}
      onAction={() => (mode === 'following' ? router.push('/friends') : router.navigate('/'))}
    >
      {mode === 'following' ? (
        <Button label="Go to Discover" variant="ghost" onPress={() => router.navigate('/')} />
      ) : null}
    </EmptyState>
  );
}
