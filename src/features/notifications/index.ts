// Public surface of the notifications feature.
export { NotificationBell, type NotificationBellProps } from './components/NotificationBell';
export { PushOptInCard, type PushOptInCardProps } from './components/PushOptInCard';
export { notificationTarget, notificationText } from './describe';
export type { NotificationItem } from './model';
export { NotificationBridge } from './push/NotificationBridge';
export {
  fetchPushCategories,
  savePushCategories,
  type PushCategories,
  type PushCategory,
} from './push/pushCategories';
export { syncPushRegistration, unregisterPushDevice } from './push/pushDevice';
export type { PushMoment } from './push/pushPolicy';
export { invalidateInbox, notificationKeys, useMarkRead, useUnreadCount } from './queries';
export { NotificationsScreen } from './screens/NotificationsScreen';
