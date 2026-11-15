/**
 * The Cookbook's sheets (item actions, slot picker) are the shared glass sheet. Kept as a name so
 * their call sites read as Cookbook code; behaviour, timing and `onClosed` all come from `GlassSheet`.
 */
export { GlassSheet as BottomSheet, type GlassSheetProps as BottomSheetProps } from '@/ui';
