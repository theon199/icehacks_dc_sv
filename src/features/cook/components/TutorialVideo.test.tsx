import { screen, userEvent } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { TutorialVideo } from './TutorialVideo';

interface CapturedWebViewProps {
  source?: { uri?: string; html?: string; baseUrl?: string };
  originWhitelist?: string[];
  onShouldStartLoadWithRequest?: (request: {
    url: string;
    isTopFrame?: boolean;
    navigationType?: string;
  }) => boolean;
}

const mockWebView: { props: CapturedWebViewProps | null } = { props: null };

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => undefined) }));
jest.mock('react-native-webview', () => ({
  WebView: (props: CapturedWebViewProps) => {
    mockWebView.props = props;
    return null;
  },
}));

const video = {
  youtubeId: 'abcdefghijk',
  url: 'https://www.youtube.com/watch?v=abcdefghijk',
  title: 'Lentil soup',
  publisher: 'Famara kitchen',
};

async function mountPlayer() {
  mockWebView.props = null;
  await renderWithTheme(<TutorialVideo video={video} />);
  const props = mockWebView.props as CapturedWebViewProps | null;
  if (!props?.onShouldStartLoadWithRequest) throw new Error('player did not mount');
  return { props, decide: props.onShouldStartLoadWithRequest };
}

describe('TutorialVideo', () => {
  it('plays the embed inside a local page with an https base, so YouTube gets a referrer', async () => {
    const { props, decide } = await mountPlayer();
    expect(props.source?.uri).toBeUndefined();
    expect(props.source?.baseUrl).toBe('https://com.famara.app/');
    expect(props.source?.html).toContain(
      'src="https://www.youtube-nocookie.com/embed/abcdefghijk?',
    );
    // The page itself must get past the navigation gate.
    expect(
      decide({ url: 'https://com.famara.app/', isTopFrame: true, navigationType: 'other' }),
    ).toBe(true);
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('offers the video on its own site when there is no YouTube id', async () => {
    mockWebView.props = null;
    await renderWithTheme(<TutorialVideo video={{ ...video, youtubeId: null }} />);
    expect(mockWebView.props).toBeNull();
    expect(screen.getByText('This video plays on its own site.')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Watch video' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(video.url);
  });

  it('refuses a reload of the local page, which would fetch its base url', async () => {
    const { decide } = await mountPlayer();
    expect(
      decide({ url: 'https://com.famara.app/', isTopFrame: true, navigationType: 'reload' }),
    ).toBe(false);
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('lets every load reach its own navigation gate', async () => {
    const { props } = await mountPlayer();
    // A narrower list would make the WebView open rejected urls in the OS before the gate runs.
    expect(props.originWhitelist).toEqual(['*']);
  });

  it('keeps sub-frames in place and never opens anything for them', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL');
    const { decide } = await mountPlayer();

    for (const url of ['about:blank', 'about:srcdoc', 'http://ads.example.org/pixel']) {
      expect(decide({ url, isTopFrame: false, navigationType: 'other' })).toBe(true);
    }
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('opens a tapped main-frame link in the browser and blocks it in the player', async () => {
    const { decide } = await mountPlayer();
    const url = 'https://www.youtube.com/watch?v=abcdefghijk';

    expect(decide({ url, isTopFrame: true, navigationType: 'click' })).toBe(false);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(url);

    expect(decide({ url, isTopFrame: true, navigationType: 'other' })).toBe(false);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1);
  });
});
