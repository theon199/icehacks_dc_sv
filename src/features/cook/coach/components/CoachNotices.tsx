import { Linking, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, radii, space, useTheme, type IconName } from '@/ui';

import type { CoachCameraAccess } from '../hooks/useCoachCamera';
import type { MicStatus } from '../hooks/useCoachMic';

export interface CoachNoticesProps {
  mic: MicStatus;
  camera: CoachCameraAccess;
  onAllowCamera: () => void;
  onRetryMic: () => void;
}

interface NoticeProps {
  icon: IconName;
  message: string;
  actionLabel: string;
  onAction: () => void;
  testID: string;
}

function Notice({ icon, message, actionLabel, onAction, testID }: NoticeProps) {
  const theme = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: theme.colors.warningSoft }]} testID={testID}>
      <Icon name={icon} size={20} color="onWarningSoft" />
      <Text variant="callout" color="onWarningSoft" style={styles.message}>
        {message}
      </Text>
      <Button label={actionLabel} variant="secondary" size="sm" onPress={onAction} />
    </View>
  );
}

const openSettings = () => void Linking.openSettings();

/**
 * What the coach cannot do right now and how to fix it. Without the camera it still answers
 * from words; without the microphone the buttons still work.
 */
export function CoachNotices({ mic, camera, onAllowCamera, onRetryMic }: CoachNoticesProps) {
  return (
    <>
      {mic === 'denied' ? (
        <Notice
          icon="mic.slash"
          message="Microphone or speech recognition is off, so the coach can’t hear you."
          actionLabel="Open Settings"
          onAction={openSettings}
          testID="coach-mic-denied"
        />
      ) : null}
      {mic === 'unavailable' ? (
        <Notice
          icon="mic.slash"
          message="Listening isn’t available right now. Next and Repeat still work."
          actionLabel="Try again"
          onAction={onRetryMic}
          testID="coach-mic-unavailable"
        />
      ) : null}
      {camera === 'blocked' || camera === 'ask' ? (
        <Notice
          icon="eye.slash"
          message="The camera is off. The coach can still answer from what you say."
          actionLabel={camera === 'blocked' ? 'Open Settings' : 'Allow camera'}
          onAction={camera === 'blocked' ? openSettings : onAllowCamera}
          testID={camera === 'blocked' ? 'coach-camera-blocked' : 'coach-camera-ask'}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radii.lg,
  },
  message: { flex: 1, minWidth: 160 },
});
