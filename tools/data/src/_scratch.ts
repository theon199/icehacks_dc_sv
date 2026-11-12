import { INGREDIENTS } from './knowledge/index.ts';
import { IngredientMatcher } from './match/matcher.ts';
import { readMedlinePlusRecipes } from './sources/medlineplus.ts';
import { parseMeasure } from './parse/measure.ts';
const m = new IngredientMatcher(INGREDIENTS);
const recipes = await readMedlinePlusRecipes();
const seen = new Set<string>(); const out: string[] = [];
for (const r of recipes) for (const l of r.lines) { const p = parseMeasure(l.text); const name = p.rest.toLowerCase(); if (seen.has(name)) continue; seen.add(name); const res = m.matchLine(name); out.push(`${name.slice(0,60)} => ${res.all.join('+')}`); }
console.log(out.join(' | '));
