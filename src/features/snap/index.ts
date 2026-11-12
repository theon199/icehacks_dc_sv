/**
 * Snap's public surface. Screens are imported by their route files directly so the camera and image
 * modules never load through this barrel.
 */
export { ESTIMATED_MEAL_PREFIX, estimatedMealId } from './deps';
export { snapCameraHref, snapModeParam, type SnapMode } from './links';
