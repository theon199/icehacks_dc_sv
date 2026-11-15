/**
 * A stand-in for Expo Router's native header pieces (`Stack.SearchBar`, `Stack.Toolbar`) under
 * Jest, where there is no native navigation bar. The search bar becomes a plain text field with the
 * test ID `search-input` that calls the same callbacks the native one does; toolbar buttons become
 * pressables with their accessibility labels. Use it inside a `jest.mock('expo-router', ...)`
 * factory with `jest.requireActual('@/test/nativeStack').mockStack`.
 */
import { useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

interface TextEvent {
  nativeEvent: { text: string };
}

interface SearchBarHandle {
  setText: (text: string) => void;
  clearText: () => void;
  focus: () => void;
  blur: () => void;
  cancelSearch: () => void;
  toggleCancelButton: (show: boolean) => void;
}

interface MockSearchBarProps {
  ref?: Ref<SearchBarHandle>;
  placeholder?: string;
  onChangeText?: (event: TextEvent) => void;
  onSearchButtonPress?: (event: TextEvent) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

function MockSearchBar({
  ref,
  placeholder,
  onChangeText,
  onSearchButtonPress,
  onFocus,
  onBlur,
}: MockSearchBarProps) {
  const [text, setText] = useState('');
  const noop = () => undefined;
  useImperativeHandle(ref, () => ({
    setText,
    clearText: () => setText(''),
    focus: noop,
    blur: noop,
    cancelSearch: noop,
    toggleCancelButton: noop,
  }));
  return (
    <TextInput
      testID="search-input"
      accessibilityLabel={placeholder}
      placeholder={placeholder}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChangeText?.({ nativeEvent: { text: next } });
      }}
      onSubmitEditing={() => onSearchButtonPress?.({ nativeEvent: { text } })}
      onFocus={() => onFocus?.()}
      onBlur={() => onBlur?.()}
    />
  );
}

function MockToolbar({ children }: { children?: ReactNode }) {
  return <View>{children}</View>;
}

interface MockToolbarButtonProps {
  accessibilityLabel?: string;
  onPress?: () => void;
  disabled?: boolean;
  children?: ReactNode;
}

function MockToolbarButton({
  accessibilityLabel,
  onPress,
  disabled,
  children,
}: MockToolbarButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}

function MockToolbarBadge({ children }: { children?: string }) {
  return <Text>{children}</Text>;
}

export const mockStack = {
  Screen: () => null,
  SearchBar: MockSearchBar,
  Toolbar: Object.assign(MockToolbar, {
    Button: MockToolbarButton,
    Badge: MockToolbarBadge,
    View: MockToolbar,
  }),
};
