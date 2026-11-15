import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, PressableScale, Text, photoOverlay, radii, space, useTheme } from '@/ui';

import { PhotoGlassButton, PhotoGlassPanel } from './PhotoGlass';
import type { CookPhotoPicker } from '../hooks/useCookPhotoPicker';
import type { CookPhoto, PhotoSource } from '../services/photo';

export interface DonePhotoAskProps {
  title: string;
  /** First visit: the "Cooked it" moment above the photo ask. */
  celebrating: boolean;
  picker: CookPhotoPicker;
  onPhoto: (photo: CookPhoto) => void;
  onSkip: () => void;
}

const BURST = 64;
const ACTION_HEIGHT = 52;

/**
 * The first beat after the last step, over the frosted dish: a lime check and "Cooked it", then an
 * invitation to photograph the dish, which is optional and can be skipped.
 */
export function DonePhotoAsk({ title, celebrating, picker, onPhoto, onSkip }: DonePhotoAskProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const take = async (source: PhotoSource) => {
    const photo = await picker.pick(source);
    if (photo) onPhoto(photo);
  };

  return (
    <View
      style={[
        styles.body,
        { paddingTop: insets.top + space.sectionLarge, paddingBottom: insets.bottom + space.xl },
      ]}
      testID="cook-done-photo-ask"
    >
      {celebrating ? (
        <View style={styles.celebration}>
          <View style={[styles.burst, { backgroundColor: theme.colors.highlight }]}>
            <Icon name="checkmark" size={30} color="onHighlight" />
          </View>
          <Text
            variant="title1"
            accessibilityRole="header"
            style={[styles.celebrationTitle, { color: photoOverlay.text }]}
          >
            Cooked it
          </Text>
          <Text variant="body" align="center" style={{ color: photoOverlay.textMuted }}>
            {title}
          </Text>
        </View>
      ) : null}

      <PhotoGlassPanel radius={radii.card} style={styles.viewfinder}>
        <Icon name="camera.fill" size={30} color="onImage" />
        <Text variant="title2" align="center" style={{ color: photoOverlay.text }}>
          Take a photo of your dish
        </Text>
        <Text variant="subhead" align="center" style={{ color: photoOverlay.textMuted }}>
          Optional. Handy if you share it with the community.
        </Text>
      </PhotoGlassPanel>

      <View style={styles.spacer} />

      {picker.busy ? (
        <ActivityIndicator color={photoOverlay.text} accessibilityLabel="Preparing photo" />
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Take a photo"
          icon="camera.fill"
          variant="highlight"
          fullWidth
          disabled={picker.busy}
          onPress={() => void take('camera')}
          testID="cook-done-take-photo"
        />
        <PhotoGlassButton
          radius={ACTION_HEIGHT / 2}
          onPress={() => void take('library')}
          accessibilityLabel="Choose from library"
          disabled={picker.busy}
          style={styles.secondary}
          testID="cook-done-choose-photo"
        >
          <Icon name="photo.fill" size={18} color="onImage" />
          <Text variant="headline" style={{ color: photoOverlay.text }} accessible={false}>
            Choose from library
          </Text>
        </PhotoGlassButton>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Skip photo"
          onPress={onSkip}
          style={styles.quiet}
          testID="cook-done-skip-photo"
        >
          <Text variant="headline" style={{ color: photoOverlay.textMuted }} accessible={false}>
            Skip photo
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: space.xl },
  celebration: { alignItems: 'center', gap: space.xs },
  burst: {
    width: BURST,
    height: BURST,
    borderRadius: BURST / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationTitle: { marginTop: space.sm },
  viewfinder: {
    marginTop: space.section,
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.section,
    paddingHorizontal: space.xl,
  },
  spacer: { flex: 1 },
  actions: { gap: 10 },
  secondary: {
    minHeight: ACTION_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
  },
  quiet: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
