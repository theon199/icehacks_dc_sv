// App shell: the pieces every tab shares. Kept light: no navigator or effect code here.
export { ProfileButton, type ProfileButtonProps } from './ProfileButton';
export {
  isTabBarHidden,
  setTabBarHidden,
  useHideTabBar,
  useTabBarHidden,
} from './tabBarVisibility';
