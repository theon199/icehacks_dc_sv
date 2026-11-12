import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { Button, Text, useTheme } from '@/ui';

import { youtubeEmbedUrl, type TutorialVideo as Video } from '../logic/session';
import { decideVideoLoad } from '../logic/videoNavigation';

export interface TutorialVideoProps {
  video: Video;
}

/**
 * The recipe's tutorial video, playing inline above the step. The embed and the frames inside it
 * load in place; a link the cook taps opens in the system browser, and nothing else navigates away
 * (see `decideVideoLoad`).
 */
export function TutorialVideo({ video }: TutorialVideoProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const openExternally = () => void WebBrowser.openBrowserAsync(video.url).catch(() => undefined);

  if (!video.youtubeId || failed) {
    return (
      <View
        style={[
          styles.fallback,
          { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.lg },
        ]}
      >
        <Text variant="subhead" tone="muted">
          {failed ? "The video didn't load here." : 'This video plays on its own site.'}
        </Text>
        <Button label="Watch video" icon="play.fill" variant="secondary" onPress={openExternally} />
      </View>
    );
  }

  const embed = youtubeEmbedUrl(video.youtubeId);
  const allowNavigation = (request: WebViewNavigation & { isTopFrame?: boolean }) => {
    const decision = decideVideoLoad(request);
    if (decision === 'external') {
      void WebBrowser.openBrowserAsync(request.url).catch(() => undefined);
    }
    return decision === 'allow';
  };

  return (
    <View style={styles.wrapper} testID="cook-tutorial-video">
      <View
        style={[
          styles.frame,
          { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.lg },
        ]}
        accessibilityLabel={video.title ? `Video: ${video.title}` : 'Recipe video'}
      >
        <WebView
          source={{ uri: embed }}
          style={styles.web}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          allowsFullscreenVideo
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['https://*']}
          onShouldStartLoadWithRequest={allowNavigation}
          onLoadEnd={() => setLoading(false)}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
        />
        {loading ? (
          <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
            <ActivityIndicator color={theme.colors.textMuted} />
          </View>
        ) : null}
      </View>
      <View style={styles.caption}>
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.captionText}>
          {[video.title, video.publisher].filter(Boolean).join(' · ') || 'Recipe video'}
        </Text>
        {/* Some videos refuse to play embedded; this always works. */}
        <Button label="Open" variant="ghost" size="sm" onPress={openExternally} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  frame: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: 'transparent' },
  center: { alignItems: 'center', justifyContent: 'center' },
  fallback: { padding: 16, gap: 12, alignItems: 'flex-start' },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  captionText: { flex: 1 },
});
