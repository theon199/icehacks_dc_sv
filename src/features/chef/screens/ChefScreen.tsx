import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  /**
   * Puts Chef's buttons in the screen's native header instead of drawing its own header, as on the
   * Search tab, whose native header carries the Search | Chef switch.
   */
  nativeHeader?: boolean;
}

const PURPOSE =
  "Chef suggests dishes from Famara's recipes that fit your diet and goals, adapts recipes and answers cooking questions.";

/**
 * Chef, the AI cooking assistant, on the Ask page: used as the `chef` route and embedded in the
 * Search tab. Only people who are 18+ and have turned AI features on get past the gate; everyone
 * else keeps the header, so they can always get back.
 */
export function ChefScreen({
  threadId,
  onBack,
  backLabel = 'Back',
  nativeHeader = false,
}: ChefScreenProps) {
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
        nativeHeader={nativeHeader}
      />
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      {nativeHeader ? null : <AskHeader title="Ask" onBack={back} backLabel={backLabel} />}
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
  nativeHeader: boolean;
}

function ChefChat({ initialThreadId, onBack, backLabel, nativeHeader }: ChefChatProps) {
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

  // The thread and its question box rise with the keyboard on the UI thread, frame for frame with
  // the keyboard's own animation. The box already keeps the bottom safe area clear (the home
  // indicator, and on the Search tab the tab bar too), so only the rest of the keyboard lifts it.
  const insets = useSafeAreaInsets();
  const bottomInset = useSharedValue(insets.bottom);
  useEffect(() => {
    bottomInset.set(insets.bottom);
  }, [bottomInset, insets.bottom]);
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, keyboard.height.get() - bottomInset.get()) }],
  }));

  const empty = messages.length === 0 && !sending;
  const newDisabled = empty && threadId == null;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]} testID="chef-screen">
      {nativeHeader ? (
        // System glass buttons, grouped into one capsule by the native header.
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="square.and.pencil"
            accessibilityLabel="New chat"
            disabled={newDisabled}
            onPress={newThread}
          />
          <Stack.Toolbar.Button
            icon="clock"
            accessibilityLabel="Your chats"
            onPress={() => setDrawerOpen(true)}
          />
        </Stack.Toolbar>
      ) : (
        <AskHeader
          title="Ask"
          onBack={onBack}
          backLabel={backLabel}
          trailing={
            <>
              <GlassIconButton
                icon="square.and.pencil"
                accessibilityLabel="New chat"
                disabled={newDisabled}
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
      )}
      <Animated.View style={[styles.flex, lift]}>
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
      </Animated.View>
      <ThreadDrawer
        visible={drawerOpen}
        activeThreadId={threadId}
        onSelect={selectThread}
        onNewThread={newThread}
        onClose={() => setDrawerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
