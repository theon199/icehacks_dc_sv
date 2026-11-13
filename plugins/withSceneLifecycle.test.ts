/**
 * @jest-environment node
 */
import {
  adoptSceneLifecycle,
  SCENE_DELEGATE_SOURCE,
  withSceneManifest,
} from './withSceneLifecycle';

/** The Swift app delegate `expo prebuild` generates for this SDK. */
const GENERATED_APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }
}
`;

describe('adoptSceneLifecycle', () => {
  const adopted = adoptSceneLifecycle(GENERATED_APP_DELEGATE);

  it('exposes the React Native factory to the scene delegate', () => {
    expect(adopted).toContain(
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
    );
  });

  it('leaves window creation and the React Native start to the scene delegate', () => {
    expect(adopted).not.toContain('UIWindow(frame:');
    expect(adopted).not.toContain('startReactNative(');
    expect(adopted).toContain('reactNativeFactory = factory');
    expect(adopted).toContain(
      'return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
    );
  });

  it('keeps the deep-link handling the scene delegate forwards to', () => {
    expect(adopted).toContain('RCTLinkingManager.application(app, open: url, options: options)');
  });

  it('is idempotent', () => {
    expect(adoptSceneLifecycle(adopted)).toBe(adopted);
  });

  it('fails when the app delegate is not an ExpoAppDelegate', () => {
    expect(() =>
      adoptSceneLifecycle(GENERATED_APP_DELEGATE.replace('ExpoAppDelegate {', 'UIResponder {')),
    ).toThrow(/ExpoAppDelegate/);
  });

  it('fails rather than shipping a second window when the template changes shape', () => {
    const reshaped = GENERATED_APP_DELEGATE.replace(
      'window = UIWindow(frame: UIScreen.main.bounds)',
      'window = UIWindow(frame: UIScreen.main.bounds) // changed',
    );
    expect(() => adoptSceneLifecycle(reshaped)).toThrow(/unexpected shape/);
  });
});

describe('withSceneManifest', () => {
  it('declares one application scene backed by SceneDelegate and keeps other keys', () => {
    const plist = withSceneManifest({ CFBundleName: 'Famara' });

    expect(plist.CFBundleName).toBe('Famara');
    expect(plist.UIApplicationSceneManifest).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    });
  });
});

describe('SCENE_DELEGATE_SOURCE', () => {
  it('registers the Objective-C name the manifest refers to and subclasses the Expo delegate', () => {
    expect(SCENE_DELEGATE_SOURCE).toContain('@objc(SceneDelegate)');
    expect(SCENE_DELEGATE_SOURCE).toContain('class SceneDelegate: ExpoAppSceneDelegate');
  });
});
