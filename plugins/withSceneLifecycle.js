// @ts-check
/**
 * Moves the iOS app onto the UIKit scene-based life cycle.
 *
 * Apps built with the iOS 27 SDK fail to launch unless they declare a scene manifest. Expo ships
 * `ExpoAppSceneDelegate`, which creates the window, starts React Native and forwards scene events
 * (deep links, user activities, quick actions, foreground/background) back to the app delegate.
 * This plugin wires it up during prebuild:
 *
 * - the app delegate exposes its React Native factory and no longer creates a window itself;
 * - a `SceneDelegate` subclass is added to the app target;
 * - `Info.plist` declares a single-window scene configuration that uses it.
 *
 * Every step is idempotent. If the generated app delegate no longer has the expected shape, the
 * plugin throws so prebuild fails loudly instead of producing an app that cannot launch.
 *
 * Plain CommonJS because the Expo config loader resolves plugins with Node's `require`.
 */
const path = require('node:path');

const {
  IOSConfig,
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const SCENE_DELEGATE_FILE = 'SceneDelegate.swift';

const SCENE_DELEGATE_SOURCE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const PROVIDER = 'ExpoReactNativeFactoryProvider';

const CLASS_DECLARATION =
  /class AppDelegate: ExpoAppDelegate(, ExpoReactNativeFactoryProvider)? \{/;

/** The window setup the template performs in `didFinishLaunching`; the scene delegate owns it now. */
const WINDOW_SETUP =
  /\n[ \t]*#if os\(iOS\) \|\| os\(tvOS\)\n[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n[ \t]*factory\.startReactNative\(\n[ \t]*withModuleName: "main",\n[ \t]*in: window,\n[ \t]*launchOptions: launchOptions\)\n[ \t]*#endif\n/;

const SCENE_NOTE =
  '\n    // The window is created and React Native is started by `SceneDelegate` under the\n' +
  '    // scene-based life cycle (required by the iOS 27 SDK).\n';

/**
 * Rewrites the generated Swift app delegate for the scene-based life cycle.
 * @param {string} appDelegate
 * @returns {string}
 */
function adoptSceneLifecycle(appDelegate) {
  const declaration = CLASS_DECLARATION.exec(appDelegate);
  if (!declaration) {
    throw new Error(
      'withSceneLifecycle: AppDelegate.swift does not declare `class AppDelegate: ExpoAppDelegate`.',
    );
  }

  let contents = appDelegate;
  if (!declaration[1]) {
    contents = contents.replace(
      CLASS_DECLARATION,
      `class AppDelegate: ExpoAppDelegate, ${PROVIDER} {`,
    );
  }

  if (WINDOW_SETUP.test(contents)) {
    contents = contents.replace(WINDOW_SETUP, SCENE_NOTE);
  } else if (/UIWindow\(frame:/.test(contents) || /startReactNative\(/.test(contents)) {
    throw new Error(
      'withSceneLifecycle: AppDelegate.swift still creates its own window in an unexpected shape; ' +
        'update the plugin so the scene delegate is the only place that starts React Native.',
    );
  }

  return contents;
}

/**
 * Declares a single-window application scene backed by `SceneDelegate`.
 * @param {import('expo/config-plugins').InfoPlist} infoPlist
 * @returns {import('expo/config-plugins').InfoPlist}
 */
function withSceneManifest(infoPlist) {
  return {
    ...infoPlist,
    UIApplicationSceneManifest: {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    },
  };
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withSceneLifecycle = (config) => {
  config = withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle: only a Swift AppDelegate is supported.');
    }
    mod.modResults.contents = adoptSceneLifecycle(mod.modResults.contents);
    return mod;
  });

  config = withInfoPlist(config, (mod) => {
    mod.modResults = withSceneManifest(mod.modResults);
    return mod;
  });

  config = withXcodeProject(config, (mod) => {
    const { platformProjectRoot, projectRoot } = mod.modRequest;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    mod.modResults = IOSConfig.XcodeProjectFile.createBuildSourceFile({
      project: mod.modResults,
      nativeProjectRoot: platformProjectRoot,
      filePath: path.join(projectName, SCENE_DELEGATE_FILE),
      fileContents: SCENE_DELEGATE_SOURCE,
      overwrite: true,
    });
    return mod;
  });

  return config;
};

module.exports = withSceneLifecycle;
module.exports.adoptSceneLifecycle = adoptSceneLifecycle;
module.exports.withSceneManifest = withSceneManifest;
module.exports.SCENE_DELEGATE_SOURCE = SCENE_DELEGATE_SOURCE;
