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

/**
 * Close, recipe name and the cook-mode tools as round glass controls, with a progress bar
 * underneath. The step count sits on the step card itself.
 */
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
          variant="glass"
          onPress={onClose}
          testID="cook-close"
        />
        <Text variant="headline" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <IconButton
          icon={listening ? 'mic.fill' : 'mic'}
          accessibilityLabel={listening ? 'Turn off voice control' : 'Turn on voice control'}
          variant={listening ? 'filled' : 'glass'}
          selected={listening}
          onPress={onToggleVoice}
          testID="cook-voice-toggle"
        />
        {hasVideo ? (
          <IconButton
            icon="play.rectangle"
            accessibilityLabel={videoOpen ? 'Hide video' : 'Show video'}
            variant={videoOpen ? 'filled' : 'glass'}
            selected={videoOpen}
            onPress={onToggleVideo}
            testID="cook-video-toggle"
          />
        ) : null}
        <IconButton
          icon="list.bullet"
          accessibilityLabel="Ingredients"
          variant="glass"
          onPress={onOpenIngredients}
          testID="cook-ingredients-open"
        />
      </View>
      <View
        style={[styles.track, { backgroundColor: theme.colors.surface }]}
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
  wrapper: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, paddingHorizontal: 4 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
