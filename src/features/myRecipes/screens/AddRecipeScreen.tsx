import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { RECIPE_IMPORT_LIMITS } from '@/lib/api/ai';
import { logger } from '@/lib/logger';
import {
  GlassIconButton,
  Icon,
  IconButton,
  Screen,
  Text,
  fontFamily,
  minTouchTarget,
  radii,
  space,
  toast,
  useTheme,
} from '@/ui';

import { CameraPermissionError, pickPhoto, type PhotoOrigin } from '../capture/photo';
import { ImportStatus } from '../components/ImportStatus';
import { MethodTile } from '../components/MethodTile';
import { MyRecipesHeader } from '../components/MyRecipesHeader';
import { RecipeTextEntry } from '../components/RecipeTextEntry';
import { AiGate } from '../deps';
import { useRecipeImport, type RecipeImportDeps } from '../hooks/useRecipeImport';
import { REVIEW_RECIPE_HREF } from '../links';
import { firstLink, normalizeLink } from '../logic/link';

export interface AddRecipeScreenProps {
  /** For tests. */
  importDeps?: RecipeImportDeps;
  pick?: (origin: PhotoOrigin) => ReturnType<typeof pickPhoto>;
}

/** Add a recipe: four ways in (link, photo of a card, say it, type it) and a link field. */
export function AddRecipeScreen(props: AddRecipeScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/my-recipes'));
  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <MyRecipesHeader title="Add a recipe" onBack={back} />
      <AiGate
        feature="Adding recipes"
        purpose="Famara reads a recipe from a link, a photo of a card or your own words."
      >
        <AddRecipe {...props} />
      </AiGate>
    </View>
  );
}

type Mode = 'methods' | 'type' | 'say';

function AddRecipe({ importDeps, pick = pickPhoto }: AddRecipeScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('methods');
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const { phase, start, reset, retry, pausedNote } = useRecipeImport({
    onResult: () => router.push(REVIEW_RECIPE_HREF),
    ...(importDeps ? { deps: importDeps } : {}),
  });
  const busy = phase.status === 'working';
  const blocked = busy || pausedNote !== null;

  const submitLink = (value: string = link) => {
    const url = normalizeLink(value);
    if (!url) {
      setLinkError('Paste a full link to a recipe page.');
      return;
    }
    setLinkError(null);
    void start({ source: 'link', url });
  };

  const pasteLink = async () => {
    try {
      const Clipboard = await import('expo-clipboard');
      const text = await Clipboard.getStringAsync();
      const url = firstLink(text);
      if (!url) {
        toast.show({ message: 'There is no link on your clipboard.' });
        return;
      }
      setLink(url);
      submitLink(url);
    } catch (error) {
      logger.warn('Clipboard read failed', { error: String(error) });
      toast.error("Couldn't read the clipboard. Paste the link into the field instead.");
    }
  };

  const takePhoto = async (origin: PhotoOrigin) => {
    try {
      const photo = await pick(origin);
      if (photo) void start({ source: 'photo', photo });
    } catch (error) {
      if (error instanceof CameraPermissionError) toast.error(error.message);
      else {
        logger.warn('Photo pick failed', { error: String(error) });
        toast.error("Couldn't open your photos. Try again.");
      }
    }
  };

  const choosePhoto = () =>
    Alert.alert('Photo of a recipe card', 'Handwritten cards work too.', [
      { text: 'Take a photo', onPress: () => void takePhoto('camera') },
      { text: 'Choose from library', onPress: () => void takePhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const footer =
    mode === 'methods' ? (
      <View style={styles.linkBar}>
        <GlassIconButton
          icon="square.on.square"
          accessibilityLabel="Paste a link from the clipboard"
          onPress={() => void pasteLink()}
          disabled={blocked}
          testID="link-paste"
        />
        <View
          style={[
            styles.field,
            {
              backgroundColor: theme.colors.surface,
              borderColor: linkError ? theme.colors.danger : theme.colors.border,
            },
          ]}
        >
          <Icon name="link" size={18} color="textMuted" />
          <TextInput
            value={link}
            onChangeText={(text) => {
              setLink(text);
              setLinkError(null);
            }}
            placeholder="Paste a recipe link"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Recipe link"
            {...(linkError ? { accessibilityHint: linkError } : {})}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            maxLength={RECIPE_IMPORT_LIMITS.urlMaxChars}
            editable={!blocked}
            onSubmitEditing={() => submitLink()}
            style={[styles.input, { color: theme.colors.text }]}
            testID="link-input"
          />
          {link.trim() !== '' ? (
            <IconButton
              icon="arrow.right"
              accessibilityLabel="Read this link"
              onPress={() => submitLink()}
              disabled={blocked}
              size={36}
              testID="link-submit"
            />
          ) : null}
        </View>
      </View>
    ) : null;

  return (
    <Screen scroll footer={footer}>
      <Text variant="callout" tone="muted">
        Bring in a family recipe or one from a site. Famara checks it against your allergies and
        diet, then matches it to your pantry.
      </Text>
      {pausedNote ? (
        <Text variant="subhead" tone="accent" accessibilityLiveRegion="polite">
          {pausedNote}
        </Text>
      ) : null}
      {linkError ? (
        <Text variant="subhead" tone="danger" accessibilityLiveRegion="polite">
          {linkError}
        </Text>
      ) : null}
      {phase.status !== 'idle' ? (
        <ImportStatus phase={phase} onCancel={reset} onRetry={retry} />
      ) : null}
      {mode === 'methods' ? (
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <MethodTile
              icon="link"
              title="Paste a link"
              caption="Any recipe page"
              onPress={() => void pasteLink()}
              disabled={blocked}
              testID="method-link"
            />
            <MethodTile
              icon="camera"
              title="Photo of a card"
              caption="Handwritten works too"
              onPress={choosePhoto}
              disabled={blocked}
              testID="method-photo"
            />
          </View>
          <View style={styles.gridRow}>
            <MethodTile
              icon="mic"
              title="Say it"
              caption="Talk it through"
              onPress={() => setMode('say')}
              disabled={blocked}
              testID="method-say"
            />
            <MethodTile
              icon="square.and.pencil"
              title="Type it"
              caption="Ingredients, then steps"
              onPress={() => setMode('type')}
              disabled={blocked}
              testID="method-type"
            />
          </View>
        </View>
      ) : (
        <RecipeTextEntry
          mode={mode}
          disabled={blocked}
          onSubmit={(text) => void start({ source: 'text', text })}
          onCancel={() => {
            reset();
            setMode('methods');
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grid: { gap: space.md },
  gridRow: { flexDirection: 'row', gap: space.md },
  linkBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: minTouchTarget + 4,
    paddingLeft: space.md,
    paddingRight: space.xs,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontFamily: fontFamily.text, fontSize: 16, minHeight: minTouchTarget },
});
