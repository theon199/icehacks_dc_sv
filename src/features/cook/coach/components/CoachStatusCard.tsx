import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon, Text, fontFamily, radii, space, useTheme, type IconName, type Palette } from '@/ui';

import { CoachAnswerCard, InkCard, SaidAloud } from './CoachAnswerCard';
import type { CoachStatus } from '../logic/coachStatus';

export interface CoachStatusCardProps {
  status: CoachStatus;
  /** Whether replies are being read aloud. */
  spoken: boolean;
  /** Whether the coach can hear the person at all. */
  hearing: boolean;
}

interface PlainProps {
  icon: IconName;
  title: string;
  body?: string | null;
  tone?: 'surface' | 'soft' | 'warning';
  children?: ReactNode;
  testID: string;
}

const TONES: Readonly<
  Record<NonNullable<PlainProps['tone']>, [keyof Palette, keyof Palette, keyof Palette]>
> = {
  surface: ['surface', 'text', 'highlightSoft'],
  soft: ['highlightSoft', 'onHighlightSoft', 'primary'],
  warning: ['warningSoft', 'onWarningSoft', 'surface'],
};

function PlainCard({ icon, title, body, tone = 'surface', children, testID }: PlainProps) {
  const theme = useTheme();
  const [background, ink, disc] = TONES[tone];
  const discInk: keyof Palette =
    tone === 'soft' ? 'onPrimary' : tone === 'surface' ? 'onHighlightSoft' : 'onWarningSoft';
  return (
    <View
      style={[
        styles.card,
        tone === 'surface' ? [theme.elevation.medium, { shadowColor: theme.colors.shadow }] : null,
        { backgroundColor: theme.colors[background] },
      ]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={[title, body].filter(Boolean).join('. ')}
      testID={testID}
    >
      <View style={styles.row}>
        <View style={[styles.disc, { backgroundColor: theme.colors[disc] }]}>
          <Icon name={icon} size={22} color={discInk} />
        </View>
        <View style={styles.words}>
          <Text variant="title2" color={ink} maxFontSizeMultiplier={1.4} style={styles.bold}>
            {title}
          </Text>
          {body ? (
            <Text variant="callout" color={ink} maxFontSizeMultiplier={1.4}>
              {body}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/** The card at the bottom of the coach: what it heard, what it did, or what it thinks. */
export function CoachStatusCard({ status, spoken, hearing }: CoachStatusCardProps) {
  const theme = useTheme();
  switch (status.kind) {
    case 'ready':
      return (
        <PlainCard
          icon={hearing ? 'mic' : 'mic.slash'}
          title={hearing ? 'Say “Hey Famara”' : 'Use the buttons'}
          body={
            hearing
              ? 'Then ask about the pan, or say “set a 2 minute timer for the rice”.'
              : 'Next and Repeat move through the steps while the coach can’t hear you.'
          }
          testID="coach-status-ready"
        />
      );
    case 'listening':
      return (
        <PlainCard
          icon="waveform"
          title={status.heard ? `“${status.heard}”` : 'Listening…'}
          testID="coach-status-listening"
        />
      );
    case 'thinking':
      return (
        <PlainCard
          icon="eye"
          title="Taking a look…"
          body={`“${status.question}”`}
          testID="coach-status-thinking"
        >
          <ActivityIndicator color={theme.colors.textMuted} style={styles.spinner} />
        </PlainCard>
      );
    case 'timer_set':
      return (
        <PlainCard icon="timer" title={status.message} tone="soft" testID="coach-status-timer-set">
          {spoken ? <SaidAloud color="onHighlightSoft" /> : null}
        </PlainCard>
      );
    case 'timer_done':
      return (
        <InkCard testID="coach-status-timer-done">
          <Text variant="title1" color="onPrimary">
            {status.title}
          </Text>
          <Text variant="callout" color="onPrimary">
            {status.ringing ? `${status.next} Say “stop” to silence the alarm.` : status.next}
          </Text>
          {spoken ? <SaidAloud color="onPrimary" /> : null}
        </InkCard>
      );
    case 'info':
      return <PlainCard icon="info.circle" title={status.message} testID="coach-status-info" />;
    case 'answer':
      return <CoachAnswerCard status={status} spoken={spoken} />;
    case 'offline':
      return (
        <PlainCard
          icon="wifi.slash"
          title="You’re offline"
          body="Questions need a connection. Timers and steps still work."
          tone="warning"
          testID="coach-status-offline"
        />
      );
    case 'quota':
      return (
        <PlainCard
          icon="hourglass"
          title="No questions left today"
          body={status.message}
          tone="warning"
          testID="coach-status-quota"
        />
      );
    case 'error':
      return (
        <PlainCard
          icon="exclamationmark.circle"
          title="Couldn’t answer"
          body={status.message}
          tone="warning"
          testID="coach-status-error"
        />
      );
  }
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.lg + 2, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  disc: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, gap: space.xxs },
  bold: { fontFamily: fontFamily.textBold },
  spinner: { alignSelf: 'flex-start' },
});
