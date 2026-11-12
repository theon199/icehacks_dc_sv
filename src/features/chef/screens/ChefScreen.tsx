import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { selectThreadList, useChefStore } from '@/stores';
import { IconButton, Text, gutter, space, useTheme } from '@/ui';

import { AiGate } from '../components/AiGate';
import { ChefWelcome } from '../components/ChefWelcome';
import { Composer } from '../components/Composer';
import { ConversationFooter } from '../components/ConversationFooter';
import { MessageList } from '../components/MessageList';
import { ThreadDrawer } from '../components/ThreadDrawer';
import { useChefConversation } from '../hooks/useChefConversation';
import { awaitsReply, readPhotoMark } from '../logic/conversation';

export interface ChefScreenProps {
  /** Opens this thread; otherwise the most recent one. */
  threadId?: string | undefined;
}

/**
 * Chef, the AI cooking assistant. Used as the `chef` route and embedded in the Search tab. Only
 * people who are 18+ and have turned AI features on get past the gate.
 */
export function ChefScreen({ threadId }: ChefScreenProps) {
  return (
    <AiGate
      feature="Chef"
      purpose="Chef suggests dishes from Famara's recipes that fit your diet and goals, adapts recipes and answers cooking questions."
    >
      {/* A link to another thread starts a fresh view of it. */}
      <ChefChat key={threadId ?? 'latest'} initialThreadId={threadId ?? null} />
    </AiGate>
  );
}

function initialThread(requested: string | null): string | null {
  const { threads } = useChefStore.getState();
  if (requested) return threads[requested] ? requested : null;
  return selectThreadList(useChefStore.getState())[0]?.id ?? null;
}

function ChefChat({ initialThreadId }: { initialThreadId: string | null }) {
  const theme = useTheme();
  const [threadId, setThreadId] = useState<string | null>(() => initialThread(initialThreadId));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const title = useChefStore((state) => (threadId ? state.threads[threadId]?.title : undefined));
  const conversation = useChefConversation(threadId, setThreadId);
  const { messages, sending, busy, problem, followUps, quotaNote, send, retry } = conversation;

  const newThread = useCallback(() => {
    setThreadId(null);
    setDrawerOpen(false);
  }, []);
  const selectThread = useCallback((id: string) => {
    setThreadId(id);
    setDrawerOpen(false);
  }, []);
  const ask = useCallback((question: string) => send({ text: question }), [send]);

  const empty = messages.length === 0 && !sending;
  const heading = title ? readPhotoMark(title).text : 'New chat';

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="chef-screen"
    >
      <View style={styles.toolbar}>
        <IconButton
          testID="chef-threads"
          icon="list.bullet"
          accessibilityLabel="Your chats"
          onPress={() => setDrawerOpen(true)}
        />
        <Text variant="headline" numberOfLines={1} style={styles.title} align="center">
          {heading}
        </Text>
        <IconButton
          icon="square.and.pencil"
          accessibilityLabel="New chat"
          disabled={empty && threadId == null}
          onPress={newThread}
        />
      </View>
      <View style={styles.flex}>
        {empty ? (
          <ChefWelcome onAsk={ask} />
        ) : (
          <MessageList
            messages={messages}
            footer={
              <ConversationFooter
                sending={sending}
                problem={problem}
                unanswered={awaitsReply(messages) && !sending}
                blocked={busy}
                followUps={followUps}
                quotaNote={quotaNote}
                onRetry={retry}
                onDismissProblem={conversation.dismissProblem}
                onFollowUp={ask}
              />
            }
          />
        )}
      </View>
      <Composer busy={busy} onSend={send} />
      <ThreadDrawer
        visible={drawerOpen}
        activeThreadId={threadId}
        onSelect={selectThread}
        onNewThread={newThread}
        onClose={() => setDrawerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter - space.xs,
    paddingVertical: space.xs,
    gap: space.sm,
  },
  title: { flex: 1 },
});
