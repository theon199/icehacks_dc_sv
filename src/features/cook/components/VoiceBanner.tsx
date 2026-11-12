import { Linking, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, useTheme } from '@/ui';

import type { VoiceStatus } from '../hooks/useVoiceCommands';

export interface VoiceBannerProps {
  status: VoiceStatus;
  /** Last command heard, echoed briefly so the cook knows it registered. */
  heard: string | null;
  onDismiss: () => void;
}

/** One line under the top bar saying what voice control is doing, or why it cannot. */
export function VoiceBanner({ status, heard, onDismiss }: VoiceBannerProps) {
  const theme = useTheme();
  if (status === 'off') return null;

  const blocked = status === 'denied' || status === 'unavailable';
  const message =
    status === 'denied'
      ? 'Voice control needs microphone and speech recognition access.'
      : status === 'unavailable'
        ? "Voice control isn't available on this device right now."
        : heard
          ? `Heard “${heard}”`
          : 'Listening for “next”, “back”, “repeat” or “start timer”.';

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: blocked ? theme.colors.warningSoft : theme.colors.primarySoft,
          borderRadius: theme.radii.md,
        },
      ]}
      accessibilityLiveRegion="polite"
      testID="cook-voice-banner"
    >
      <Icon
        name={blocked ? 'mic.slash' : 'waveform'}
        size={18}
        color={blocked ? 'onWarningSoft' : 'onPrimarySoft'}
      />
      <Text
        variant="footnote"
        color={blocked ? 'onWarningSoft' : 'onPrimarySoft'}
        style={styles.text}
      >
        {message}
      </Text>
      {status === 'denied' ? (
        <Button
          label="Settings"
          variant="ghost"
          size="sm"
          onPress={() => void Linking.openSettings().catch(() => undefined)}
        />
      ) : blocked ? (
        <Button label="OK" variant="ghost" size="sm" onPress={onDismiss} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  text: { flex: 1 },
});
