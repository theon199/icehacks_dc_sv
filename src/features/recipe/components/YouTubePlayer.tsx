import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Icon, PressableScale, Text, space, useTheme } from '@/ui';

import {
  PLAYER_BASE_URL,
  playerLoad,
  youtubePlayerHtml,
  youtubeThumbnailUrl,
} from '../model/tutorials';

function keepInPlayer(request: { readonly url: string; readonly isTopFrame?: boolean }): boolean {
  const decision = playerLoad(request.url, request.isTopFrame);
  if (decision === 'open-outside') void WebBrowser.openBrowserAsync(request.url);
  return decision === 'allow';
}

export interface YouTubePlayerProps {
  videoId: string;
  title: string;
}

/**
 * A YouTube tutorial. Shows a thumbnail first and only creates the web view when the person taps
 * play, so the recipe screen never pays for a player nobody watches. Playback uses the
 * privacy-enhanced embed inside a small local page, so YouTube sees a referrer for the app; any
 * link out of the player opens in the in-app browser instead.
 */
export const YouTubePlayer = memo(function YouTubePlayer({ videoId, title }: YouTubePlayerProps) {
  const theme = useTheme();
  const [playing, setPlaying] = useState(false);
  const frame = [styles.frame, { borderRadius: theme.radii.md }];

  if (!playing) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Play video: ${title}`}
        onPress={() => setPlaying(true)}
        style={[frame, { backgroundColor: theme.colors.surfaceSunken }]}
        testID={`video-${videoId}`}
      >
        <Image
          source={{ uri: youtubeThumbnailUrl(videoId) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          priority="low"
          recyclingKey={videoId}
        />
        <View style={[styles.play, { backgroundColor: theme.colors.surfaceRaised }]}>
          <Icon name="play.fill" android="play_arrow" size={22} color="primary" />
        </View>
        <View style={[styles.caption, { backgroundColor: theme.colors.surfaceRaised }]}>
          <Text variant="caption" numberOfLines={1}>
            {title}
          </Text>
        </View>
      </PressableScale>
    );
  }

  return (
    <View style={[frame, styles.clip]}>
      <WebView
        source={{ html: youtubePlayerHtml(videoId, title), baseUrl: PLAYER_BASE_URL }}
        style={styles.web}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['https://*', 'about:blank']}
        onShouldStartLoadWithRequest={keepInPlayer}
        setSupportMultipleWindows={false}
        accessibilityLabel={`Video: ${title}`}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  clip: { alignItems: 'stretch' },
  web: { flex: 1, backgroundColor: 'transparent' },
  play: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: 6,
  },
});
