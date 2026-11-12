import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Button, EmptyState, radii, space, useTheme } from '@/ui';

export interface SnapIssueProps {
  photoUri: string;
  title: string;
  message: string;
  tone: 'neutral' | 'danger';
  /** Try the same photo again. */
  onRetry?: (() => void) | undefined;
  /** Back to the camera for another photo. */
  onRetake?: (() => void) | undefined;
  /** Leave without retrying (e.g. the daily limit is reached). */
  onDismiss: () => void;
}

/** Why a snap did not work, over a dimmed copy of the photo, with what can be done next. */
export function SnapIssue({
  photoUri,
  title,
  message,
  tone,
  onRetry,
  onRetake,
  onDismiss,
}: SnapIssueProps) {
  const theme = useTheme();
  return (
    <View style={styles.fill} testID="snap-issue">
      <Image
        source={{ uri: photoUri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessible={false}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]} />
      <View style={[styles.panel, { backgroundColor: theme.colors.surfaceRaised }]}>
        <EmptyState
          tone={tone}
          icon={tone === 'danger' ? 'exclamationmark.triangle' : 'camera.viewfinder'}
          title={title}
          message={message}
          style={styles.state}
        >
          <View style={styles.actions}>
            {onRetake ? (
              <Button label="Retake" icon="camera" onPress={onRetake} testID="snap-retake" />
            ) : null}
            {onRetry ? (
              <Button
                label="Try again"
                variant="secondary"
                icon="arrow.counterclockwise"
                onPress={onRetry}
                testID="snap-retry"
              />
            ) : null}
            {!onRetake && !onRetry ? (
              <Button label="OK" variant="secondary" onPress={onDismiss} testID="snap-dismiss" />
            ) : null}
          </View>
        </EmptyState>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  panel: { margin: space.lg, borderRadius: radii.lg },
  state: { paddingVertical: space.xxl },
  actions: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap', justifyContent: 'center' },
});
