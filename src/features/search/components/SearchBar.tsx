import { GlassContainer } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  GlassSurface,
  Icon,
  hasLiquidGlass,
  maxFontSizeMultiplier,
  space,
  useTheme,
} from '@/ui';
import { withAlpha } from '@/ui/color';

import type { ReturnTarget } from '../returnTab';

/** Height of the field and of the round controls beside it. */
const BAR_HEIGHT = 52;
/** The fade above the bar, where scrolling content dissolves into the canvas. */
const FADE_HEIGHT = 44;

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Return key on the keyboard: the moment a search counts as "made" for recents. */
  onSubmit: () => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  /** Where the round circle beside the field goes while the field is at rest. */
  returnTarget: ReturnTarget;
  onReturn: () => void;
  /** The Search | Chef switch, floating above the field. */
  accessory: ReactNode;
}

/**
 * Search's bottom bar, where the tab bar would be: the mode switch, then a glass capsule field with
 * a round glass circle beside it. At rest the circle returns to the tab the person came from;
 * while typing it becomes a close circle that ends the search.
 */
export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  focused,
  onFocus,
  onBlur,
  returnTarget,
  onReturn,
  accessory,
}: SearchBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const input = useRef<TextInput>(null);
  const close = () => {
    onChangeText('');
    input.current?.blur();
  };
  return (
    <View
      pointerEvents="box-none"
      style={[styles.bar, { paddingBottom: (focused ? 0 : insets.bottom) + space.sm }]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(theme.colors.background, 0), theme.colors.background]}
        style={styles.fade}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]}
      />
      <Stack>
        {accessory}
        <View style={styles.row}>
          {focused ? null : (
            <GlassIconButton
              icon={returnTarget.icon}
              accessibilityLabel={`Back to ${returnTarget.label}`}
              size={BAR_HEIGHT}
              onPress={onReturn}
              testID="search-return"
            />
          )}
          <GlassSurface
            radius={BAR_HEIGHT / 2}
            tint="transparent"
            interactive={!focused}
            style={[
              styles.field,
              hasLiquidGlass()
                ? null
                : {
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.colors.controlBorder,
                  },
            ]}
          >
            <Pressable
              accessible={false}
              onPress={() => input.current?.focus()}
              style={styles.fieldContent}
            >
              <Icon name="magnifyingglass" android="search" size={19} color="textMuted" />
              <TextInput
                ref={input}
                testID="search-input"
                value={value}
                onChangeText={onChangeText}
                onSubmitEditing={onSubmit}
                onFocus={onFocus}
                onBlur={onBlur}
                placeholder="Search recipes"
                placeholderTextColor={theme.colors.textMuted}
                accessibilityLabel="Search recipes"
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="never"
                enterKeyHint="search"
                selectionColor={theme.colors.primary}
                maxFontSizeMultiplier={maxFontSizeMultiplier}
                style={[styles.input, theme.typography.body, { color: theme.colors.text }]}
              />
              {value.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={space.sm}
                  onPress={() => onChangeText('')}
                  style={styles.inner}
                >
                  <Icon name="xmark.circle.fill" size={20} color="textMuted" />
                </Pressable>
              ) : null}
            </Pressable>
          </GlassSurface>
          {focused ? (
            <GlassIconButton
              icon="xmark"
              accessibilityLabel="Close search"
              size={BAR_HEIGHT}
              onPress={close}
              testID="search-cancel"
            />
          ) : null}
        </View>
      </Stack>
    </View>
  );
}

/**
 * The switch and the field row as one glass group: on Liquid Glass they merge and morph together
 * as controls come and go; the fallback surfaces have nothing to merge, so they stack plainly.
 */
function Stack({ children }: { children: ReactNode }) {
  return hasLiquidGlass() ? (
    <GlassContainer spacing={space.sm} style={styles.stack}>
      {children}
    </GlassContainer>
  ) : (
    <View style={styles.stack}>{children}</View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.md, paddingTop: space.xs },
  stack: { gap: space.sm + 2 },
  fade: { position: 'absolute', left: 0, right: 0, top: -FADE_HEIGHT, height: FADE_HEIGHT },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  field: { flex: 1, minWidth: 0, height: BAR_HEIGHT },
  fieldContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.md + 2,
    paddingRight: space.sm,
  },
  input: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 0, marginLeft: 2 },
  inner: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
