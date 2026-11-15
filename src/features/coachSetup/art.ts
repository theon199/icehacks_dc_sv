import type { SetupArt } from './logic/setupSteps';

/**
 * Short looping animations of the 3D cabinet scene, one per step, rendered by `tools/coach-art`
 * as animated WebP at 2x the card size (686 x 680). Shipped as images so the app carries no 3D
 * engine. Frame 0 of each is the step's finished pose, shown alone when Reduce Motion is on.
 * Metro turns each require into an asset id.
 */
const door: number = require('../../../assets/coach/mount-step-1.webp');
const phone: number = require('../../../assets/coach/mount-step-2.webp');
const plate: number = require('../../../assets/coach/mount-step-3.webp');
const view: number = require('../../../assets/coach/mount-step-4.webp');

export const SETUP_ART: Readonly<Record<SetupArt, number>> = { door, phone, plate, view };

/** Width over height of the rendered animations. */
export const SETUP_ART_ASPECT = 686 / 680;
