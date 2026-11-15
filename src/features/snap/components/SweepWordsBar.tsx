import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { SNAP_SWEEP_LIMITS } from '@/lib/api/ai';
import { Button, IconButton, space, Text } from '@/ui';

import { InlineInput } from './InlineInput';
import type { DictationStatus } from '../hooks/useSweepDictation';

export interface SweepWordsBarProps {
  /** Times words may still be sent in this pass. */
  wordsLeft: number;
  micStatus: DictationStatus;
  /** Sends typed words; returns whether they went. */
  onSend: (text: string) => boolean;
  onMic: () => void;
  disabled?: boolean;
}

const MIC_NOTES: Partial<Record<DictationStatus, string>> = {
  denied: 'The microphone is off for Famara. Type what it missed, or allow it in Settings.',
  unavailable: "Dictation isn't available on this device right now. Type what it missed instead.",
};

/** "Add something it missed": a field to type into and the ink mic, at the foot of the sheet. */
export function SweepWordsBar({
  wordsLeft,
  micStatus,
  onSend,
  onMic,
  disabled = false,
}: SweepWordsBarProps) {
  const [text, setText] = useState('');
  const spent = wordsLeft === 0;
  const listening = micStatus === 'listening' || micStatus === 'starting';
  const note = spent ? 'You can add more items on the next screen.' : MIC_NOTES[micStatus];
  const send = () => {
    if (onSend(text)) setText('');
  };
  return (
    <View style={styles.wrap}>
      {note ? (
        <View style={styles.note}>
          <Text variant="footnote" tone="muted" testID="sweep-words-note">
            {note}
          </Text>
          {micStatus === 'denied' && !spent ? (
            <Button
              label="Open Settings"
              variant="ghost"
              size="sm"
              onPress={() => void Linking.openSettings()}
              testID="sweep-mic-settings"
            />
          ) : null}
        </View>
      ) : null}
      <View style={styles.row}>
        <InlineInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          accessibilityLabel="Add something it missed"
          placeholder={spent ? 'Add more on the next screen' : 'Add something it missed'}
          returnKeyType="send"
          submitBehavior="submit"
          maxLength={SNAP_SWEEP_LIMITS.textMaxChars}
          editable={!spent && !disabled}
          pill
          testID="sweep-words-input"
        />
        <IconButton
          icon={listening ? 'stop.circle.fill' : 'mic.fill'}
          variant="filled"
          size={52}
          accessibilityLabel={listening ? 'Stop listening' : 'Say what it missed'}
          onPress={onMic}
          disabled={spent || disabled || micStatus === 'unavailable'}
          selected={listening}
          testID="sweep-mic"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  note: { gap: space.xs, alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
