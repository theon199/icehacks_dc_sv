import { useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { selectThreadList, useChefStore } from '@/stores';
import { GlassIconButton, useTheme } from '@/ui';

import { AiGate } from '../components/AiGate';
import { AskHeader } from '../components/AskHeader';
import { ChefWelcome } from '../components/ChefWelcome';
import { Composer, type ComposerHandle } from '../components/Composer';
import { ConversationFooter } from '../components/ConversationFooter';
import { MessageList } from '../components/MessageList';
import { ThreadDrawer } from '../components/ThreadDrawer';
import { selectCanUseAi, useSessionStore } from '../deps';
import { useChefSession } from '../hooks/chefSession';
import { useChefConversation } from '../hooks/useChefConversation';
import { awaitsReply } from '../logic/conversation';

export interface ChefScreenProps {
  /** Opens this thread; otherwise the most recent one. */
  threadId?: string | undefined;
  /** The header's back circle. Defaults to going back one screen. */
  onBack?: () => void;
  /** Spoken name of the back circle. */
  backLabel?: string;
  /** Takes the middle of the header in place of the title, e.g. the Search | Chef switch. */
  switcher?: ReactNode;
}

const PURPOSE =
  "Chef suggests dishes from Famara's recipes that fit your diet and goals, adapts recipes and answers cooking questions.";

/**
 * Chef, the AI cooking assistant, on the Ask page: used as the `chef` route and embedded in the
 * Search tab. Only people who are 18+ and have turned AI features on get past the gate; everyone
 * else keeps the header and its switch, so they can always get back.
 */
export function ChefScreen({ threadId, onBack, backLabel = 'Back', switcher }: ChefScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const canUse = useSessionStore((state) => selectCanUseAi(state));
  const back = onBack ?? (() => router.back());

  if (canUse) {
    return (
      // A link to another thread starts a fresh view of it.
      <ChefChat
        key={threadId ?? 'latest'}
        initialThreadId={threadId ?? null}
        onBack={back}
        backLabel={backLabel}
        switcher={switcher}
      />
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <AskHeader title="Ask" switcher={switcher} onBack={back} backLabel={backLabel} />
      <AiGate feature="Chef" purpose={PURPOSE}>
        {null}
      </AiGate>
    </View>
  );
}

function initialThread(requested: string | null): string | null {
  const { threads } = useChefStore.getState();
  if (requested) return threads[requested] ? requested : null;
  return selectThreadList(useChefStore.getState())[0]?.id ?? null;
}

interface ChefChatProps {
  initialThreadId: string | null;
  onBack: () => void;
  backLabel: string;
  switcher: ReactNode;
}

function ChefChat({ initialThreadId, onBack, backLabel, switcher }: ChefChatProps) {
  const theme = useTheme();
  const composer = useRef<ComposerHandle>(null);
  const [threadId, setThreadId] = useState<string | null>(() => initialThread(initialThreadId));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const conversation = useChefConversation(threadId, setThreadId);
  const limitedUntil = useChefSession((state) => state.limitedUntil);
  const { messages, sending, busy, limited, problem, followUps, quotaNote, send, retry } =
    conversation;

  const newThread = useCallback(() => {
    setThreadId(null);
    setDrawerOpen(false);
  }, []);
  const selectThread = useCallback((id: string) => {
    setThreadId(id);
    setDrawerOpen(false);
  }, []);
  // Suggestion chips skip the Composer, so they need their own check: while today's allowance is
  // spent the server would only refuse the question, and it would still land in the synced thread.
  const ask = useCallback(
    (question: string) => {
      if (limited) return;
      send({ text: question });
    },
    [limited, send],
  );

  const empty = messages.length === 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="chef-screen"
    >
      <AskHeader
        title="Ask"
        switcher={switcher}
        onBack={onBack}
        backLabel={backLabel}
        trailing={
          <>
            <GlassIconButton
              icon="square.and.pencil"
              accessibilityLabel="New chat"
              disabled={empty && threadId == null}
              onPress={newThread}
              testID="chef-new"
            />
            <GlassIconButton
              icon="clock"
              accessibilityLabel="Your chats"
              onPress={() => setDrawerOpen(true)}
              testID="chef-threads"
            />
          </>
        }
      />
      <View style={styles.flex}>
        {empty ? (
          <ChefWelcome onAsk={ask} onPhoto={() => composer.current?.choosePhoto()} />
        ) : (
          <MessageList
            messages={messages}
            footer={
              <ConversationFooter
                sending={sending}
                problem={problem}
                unanswered={awaitsReply(messages) && !sending}
                blocked={busy}
                limited={limited}
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
      <Composer ref={composer} busy={busy} limitedUntil={limitedUntil} onSend={send} />
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
});
