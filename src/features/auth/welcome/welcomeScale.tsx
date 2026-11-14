import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * The carousel is drawn in design points on a 282 pt wide frame. Every tile, gap and caption is
 * authored in those points and multiplied by one factor, so the collage keeps its proportions from
 * the smallest phone to the largest.
 */
export const DESIGN = {
  frameWidth: 282,
  stageWidth: 254,
  stageHeight: 330,
  headlineGap: 18,
  headlineInset: 6,
  headlineSize: 31,
  headlineLineHeight: 1.05,
  headlineLines: 2,
} as const;

/** Design points the pager needs vertically: stage, gap, headline and a little air. */
const PAGER_DESIGN_HEIGHT =
  DESIGN.stageHeight +
  DESIGN.headlineGap +
  DESIGN.headlineSize * DESIGN.headlineLineHeight * DESIGN.headlineLines +
  12;

/** Captions never drop under 12 pt, however small the phone. */
const MIN_FONT = 12;

export interface WelcomeScale {
  /** Device points per design point. */
  unit: number;
  /** A design length in device points. */
  px: (design: number) => number;
  /** A design font size in device points, floored at 12 and rounded to half points. */
  font: (design: number) => number;
}

export function createWelcomeScale(width: number, height: number): WelcomeScale {
  const unit = Math.max(0.5, Math.min(width / DESIGN.frameWidth, height / PAGER_DESIGN_HEIGHT));
  return {
    unit,
    px: (design) => design * unit,
    font: (design) => Math.max(MIN_FONT, Math.round(design * unit * 2) / 2),
  };
}

const ScaleContext = createContext<WelcomeScale>(createWelcomeScale(402, 520));

export function WelcomeScaleProvider({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  const scale = useMemo(() => createWelcomeScale(width, height), [width, height]);
  return <ScaleContext.Provider value={scale}>{children}</ScaleContext.Provider>;
}

export function useWelcomeScale(): WelcomeScale {
  return useContext(ScaleContext);
}
