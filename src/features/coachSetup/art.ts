import type { SetupArt } from './logic/setupSteps';

/**
 * Stills of the 3D cabinet scene, rendered by `tools/coach-art` at 3x the card size (1029 x 1020).
 * Shipped as images so the app carries no 3D engine. Metro turns each require into an asset id.
 */
const door: number = require('../../../assets/coach/mount-step-1.png');
const phone: number = require('../../../assets/coach/mount-step-2.png');
const plate: number = require('../../../assets/coach/mount-step-3.png');
const view: number = require('../../../assets/coach/mount-step-4.png');

export const SETUP_ART: Readonly<Record<SetupArt, number>> = { door, phone, plate, view };

/** Width over height of the rendered stills. */
export const SETUP_ART_ASPECT = 1029 / 1020;
