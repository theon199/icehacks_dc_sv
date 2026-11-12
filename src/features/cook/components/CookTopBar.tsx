import { StyleSheet, View } from 'react-native';

import { IconButton, Text, useTheme } from '@/ui';

export interface CookTopBarProps {
  title: string;
  step: number;
  stepCount: number;
  progress: number;
  listening: boolean;
  hasVideo: boolean;
  videoOpen: boolean;
  onClose: () => void;
  onToggleVoice: () => void;
  onToggleVideo: () => void;
  onOpenIngredients: () => void;
}

/** Close, recipe name, step count and the cook-mode tools, with a progress bar underneath. */
export function CookTopBar({
  title,
  step,
  stepCount,
  progress,
  listening,
  hasVideo,
  videoOpen,
  onClose,
  onToggleVoice,
  onToggleVideo,
  onOpenIngredients,
}: CookTopBarProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <IconButton
          icon="xmark"
          accessibilityLabel="Leave cook mode"
          variant="tinted"
          onPress={onClose}
          testID="cook-close"
        />
        <View style={styles.title}>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="headline" numberOfLines={1}>
            Step {step + 1} of {stepCount}
          </Text>
        </View>
        <IconButton
          icon={listening ? 'mic.fill' : 'mic'}
          accessibilityLabel={listening ? 'Turn off voice control' : 'Turn on voice control'}
          variant={listening ? 'filled' : 'tinted'}
          selected={listening}
          onPress={onToggleVoice}
          testID="cook-voice-toggle"
        />
        {hasVideo ? (
          <IconButton
            icon="play.rectangle"
            accessibilityLabel={videoOpen ? 'Hide video' : 'Show video'}
            variant={videoOpen ? 'filled' : 'tinted'}
            selected={videoOpen}
            onPress={onToggleVideo}
            testID="cook-video-toggle"
          />
        ) : null}
        <IconButton
          icon="list.bullet"
          accessibilityLabel="Ingredients"
          variant="tinted"
          onPress={onOpenIngredients}
          testID="cook-ingredients-open"
        />
      </View>
      <View
        style={[styles.track, { backgroundColor: theme.colors.surfaceSunken }]}
        accessibilityRole="progressbar"
        accessibilityLabel="Recipe progress"
        accessibilityValue={{ min: 0, max: stepCount, now: step + 1 }}
      >
        <View
          style={[
            styles.fill,
            { backgroundColor: theme.colors.primary, width: `${Math.round(progress * 100)}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, gap: 0 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
