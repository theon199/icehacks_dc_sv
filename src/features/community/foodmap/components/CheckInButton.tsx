import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text, fontFamily, useTheme } from '@/ui';
import { withAlpha } from '@/ui/color';

export interface CheckInButtonProps {
  placeName: string;
  visits: number;
  busy: boolean;
  onPress: () => void;
  testID?: string;
}

const SIZE = 46;

/**
 * The round check-in control on a spot card: a quiet circle before the first visit, lime after
 * it, with the visit count on its shoulder.
 */
export function CheckInButton({ placeName, visits, busy, onPress, testID }: CheckInButtonProps) {
  const theme = useTheme();
  const done = visits > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        done
          ? `Check in again at ${placeName}, ${visits} ${visits === 1 ? 'check-in' : 'check-ins'} so far`
          : `Check in at ${placeName}`
      }
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.circle,
        {
          backgroundColor: done ? theme.colors.highlight : withAlpha(theme.colors.text, 0.07),
        },
        pressed && styles.pressed,
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      {busy ? (
        <ActivityIndicator color={theme.colors.text} />
      ) : (
        <Icon name="checkmark" size={22} color={done ? 'onHighlight' : 'text'} />
      )}
      {done ? (
        <View
          pointerEvents="none"
          style={[
            styles.count,
            { backgroundColor: theme.colors.primary, borderColor: theme.colors.surface },
          ]}
        >
          <Text
            style={[styles.countText, { color: theme.colors.onPrimary }]}
            maxFontSizeMultiplier={1}
          >
            {visits > 99 ? '99+' : String(visits)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  count: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: fontFamily.textBold,
    fontSize: 11,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
});
