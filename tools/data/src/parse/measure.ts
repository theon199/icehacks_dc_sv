/**
 * Parses free-form measures ("1 1/2 cups", "200g", "2 tbs", "½ tsp", "1 x 400g tin", "to taste")
 * into a quantity, a canonical unit and any leftover words.
 */

export const MASS_UNITS = { g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592 } as const;
export const VOLUME_ML = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  fl_oz: 29.5735,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
} as const;
/** Imprecise amounts expressed as fractions of a teaspoon. */
export const TINY_UNITS = { pinch: 0.0625, dash: 0.125 } as const;
export const COUNT_UNITS = [
  'piece',
  'clove',
  'slice',
  'can',
  'jar',
  'packet',
  'bunch',
  'handful',
  'sprig',
  'stick',
  'head',
  'stalk',
  'leaf',
  'sheet',
  'fillet',
  'knob',
  'cube',
  'drop',
  'bottle',
  'bag',
  'box',
  'scoop',
  'inch',
  'block',
  'ear',
  'strip',
  'rasher',
  'wedge',
  'loaf',
  'bulb',
  'sachet',
  'glass',
  'shot',
  'splash',
  'drizzle',
  'sprinkle',
  'floret',
] as const;

export type MassUnit = keyof typeof MASS_UNITS;
export type VolumeUnit = keyof typeof VOLUME_ML;
export type TinyUnit = keyof typeof TINY_UNITS;
export type CountUnit = (typeof COUNT_UNITS)[number];
export type Unit = MassUnit | VolumeUnit | TinyUnit | CountUnit;

export type SizeWord = 'small' | 'medium' | 'large';

export interface Measure {
  quantity: number | null;
  unit: Unit | null;
  /** Grams known directly from the text (mass units, or "400g can"). */
  grams: number | null;
  size: SizeWord | null;
  /** "to taste", "for frying", "garnish" etc. — no amount intended. */
  unquantified: boolean;
  /** Words left after removing the amount and unit. */
  rest: string;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

/** Unit spellings mapped to canonical units. Longest spellings are tried first. */
const UNIT_WORDS: Record<string, Unit> = {
  g: 'g',
  gr: 'g',
  grs: 'g',
  gm: 'g',
  gms: 'g',
  gram: 'g',
  grams: 'g',
  gramme: 'g',
  grammes: 'g',
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  mg: 'mg',
  oz: 'oz',
  ozs: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  ml: 'ml',
  mls: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  cl: 'ml',
  dl: 'ml',
  l: 'l',
  ltr: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  tsp: 'tsp',
  tsps: 'tsp',
  tspn: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  teaspn: 'tsp',
  t: 'tsp',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  tbs: 'tbsp',
  tbls: 'tbsp',
  tblsp: 'tbsp',
  tblspn: 'tbsp',
  tbl: 'tbsp',
  tb: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  dessertspoon: 'tbsp',
  dessertspoons: 'tbsp',
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  mug: 'cup',
  mugs: 'cup',
  'fl oz': 'fl_oz',
  'fl. oz': 'fl_oz',
  'fluid ounce': 'fl_oz',
  'fluid ounces': 'fl_oz',
  floz: 'fl_oz',
  pint: 'pint',
  pints: 'pint',
  pt: 'pint',
  quart: 'quart',
  quarts: 'quart',
  qt: 'quart',
  gallon: 'gallon',
  gallons: 'gallon',
  pinch: 'pinch',
  pinches: 'pinch',
  dash: 'dash',
  dashes: 'dash',
  clove: 'clove',
  cloves: 'clove',
  slice: 'slice',
  slices: 'slice',
  can: 'can',
  cans: 'can',
  tin: 'can',
  tins: 'can',
  jar: 'jar',
  jars: 'jar',
  packet: 'packet',
  packets: 'packet',
  pack: 'packet',
  packs: 'packet',
  package: 'packet',
  packages: 'packet',
  pkg: 'packet',
  pkt: 'packet',
  envelope: 'packet',
  envelopes: 'packet',
  bunch: 'bunch',
  bunches: 'bunch',
  handful: 'handful',
  handfuls: 'handful',
  handfull: 'handful',
  sprig: 'sprig',
  sprigs: 'sprig',
  stick: 'stick',
  sticks: 'stick',
  head: 'head',
  heads: 'head',
  stalk: 'stalk',
  stalks: 'stalk',
  rib: 'stalk',
  ribs: 'stalk',
  leaf: 'leaf',
  leaves: 'leaf',
  sheet: 'sheet',
  sheets: 'sheet',
  fillet: 'fillet',
  fillets: 'fillet',
  filet: 'fillet',
  filets: 'fillet',
  knob: 'knob',
  knobs: 'knob',
  cube: 'cube',
  cubes: 'cube',
  drop: 'drop',
  drops: 'drop',
  bottle: 'bottle',
  bottles: 'bottle',
  bag: 'bag',
  bags: 'bag',
  box: 'box',
  boxes: 'box',
  scoop: 'scoop',
  scoops: 'scoop',
  inch: 'inch',
  inches: 'inch',
  cm: 'inch',
  block: 'block',
  blocks: 'block',
  ear: 'ear',
  ears: 'ear',
  strip: 'strip',
  strips: 'strip',
  rasher: 'rasher',
  rashers: 'rasher',
  wedge: 'wedge',
  wedges: 'wedge',
  loaf: 'loaf',
  loaves: 'loaf',
  bulb: 'bulb',
  bulbs: 'bulb',
  sachet: 'sachet',
  sachets: 'sachet',
  glass: 'glass',
  glasses: 'glass',
  shot: 'shot',
  shots: 'shot',
  splash: 'splash',
  splashes: 'splash',
  drizzle: 'drizzle',
  sprinkle: 'sprinkle',
  sprinkling: 'sprinkle',
  floret: 'floret',
  florets: 'floret',
  piece: 'piece',
  pieces: 'piece',
  pc: 'piece',
  pcs: 'piece',
  item: 'piece',
  items: 'piece',
};

/** Unit spellings that scale the quantity when mapped onto a coarser canonical unit. */
const UNIT_SCALE: Record<string, number> = { cl: 10, dl: 100, cm: 1 / 2.54 };

const UNQUANTIFIED =
  /\b(to taste|as (?:needed|required|desired)|for (?:frying|greasing|garnish|serving|dusting|brushing|deep[- ]frying|the pan|decoration|decorating|topping|dipping|drizzling|rolling)|to (?:serve|garnish|glaze|decorate|fry|grease|top|dust)|garnish|optional|some|a little|few|several|top|dusting|greasing|frying|drizzling|spray|of choice|you like)\b/i;

const SIZE_WORDS: Record<string, SizeWord> = {
  small: 'small',
  medium: 'medium',
  med: 'medium',
  large: 'large',
  big: 'large',
  'extra large': 'large',
  'x-large': 'large',
  jumbo: 'large',
};

function normaliseText(input: string): string {
  let text = input.replace(/\u00a0/g, ' ');
  // "1½" -> "1 1/2"; "½" -> "1/2" (written as decimals to keep later parsing simple)
  text = text.replace(/(\d)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, whole: string | undefined, frac: string) => {
    const value = (whole ? Number(whole) : 0) + (UNICODE_FRACTIONS[frac] ?? 0);
    return ` ${Number(value.toFixed(4))} `;
  });
  text = text.replace(/⁄/g, '/');
  return text.replace(/\s+/g, ' ').trim();
}

const NUMBER = String.raw`(?:\d+\s+(?:and\s+)?\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)`;

export function parseNumber(token: string): number | null {
  const t = token.trim().replace(',', '.');
  const mixed = /^(\d+)\s+(?:and\s+)?(\d+)\/(\d+)$/.exec(t);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  half: 0.5,
  quarter: 0.25,
  dozen: 12,
};

const unitAlternation = Object.keys(UNIT_WORDS)
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*'))
  .join('|');
const UNIT_RE = new RegExp(`^(${unitAlternation})(?![a-z])\\.?`, 'i');

function readUnit(text: string): { unit: Unit; scale: number; length: number } | null {
  const match = UNIT_RE.exec(text);
  if (!match?.[1]) return null;
  const raw = match[1].toLowerCase().replace(/\s+/g, ' ');
  // A bare "t"/"c" is only a unit when written as an abbreviation, never as the start of a word.
  if ((raw === 't' || raw === 'c' || raw === 'l') && /^[a-z]{2,}/i.test(text)) return null;
  const unit = UNIT_WORDS[raw] ?? UNIT_WORDS[raw.replace(/\.$/, '')];
  if (!unit) return null;
  // Capital "T" is the conventional tablespoon abbreviation.
  const resolved: Unit = raw === 't' && match[1] === 'T' ? 'tbsp' : unit;
  return { unit: resolved, scale: UNIT_SCALE[raw] ?? 1, length: match[0].length };
}

function massGrams(quantity: number, unit: Unit): number | null {
  return unit in MASS_UNITS ? quantity * MASS_UNITS[unit as MassUnit] : null;
}

/**
 * Reads a leading amount: number (incl. ranges, mixed fractions), optional unit, and
 * package-size patterns like "1 x 400g tin" or "2 (14.5 ounce) cans".
 */
export function parseMeasure(input: string): Measure {
  let text = normaliseText(input);
  const empty: Measure = { quantity: null, unit: null, grams: null, size: null, unquantified: true, rest: text };
  if (!text) return empty;

  let quantity: number | null = null;
  const numberMatch = new RegExp(`^(${NUMBER})(?:\\s*(?:-|–|to|or)\\s*(${NUMBER}))?`, 'i').exec(text);
  if (numberMatch?.[1]) {
    const low = parseNumber(numberMatch[1]);
    const high = numberMatch[2] ? parseNumber(numberMatch[2]) : null;
    quantity = low !== null && high !== null && high > low ? (low + high) / 2 : low;
    text = text.slice(numberMatch[0].length).trim();
  } else {
    const word = /^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|half|quarter|dozen)\b\s*(?:of\s+)?/i.exec(text);
    if (word?.[1]) {
      quantity = WORD_NUMBERS[word[1].toLowerCase()] ?? null;
      text = text.slice(word[0].length).trim();
      const ofA = /^(?:a|an)\s+/i.exec(text);
      if (quantity !== null && quantity < 1 && ofA) text = text.slice(ofA[0].length).trim();
    }
  }

  // "x 400g tin" / "x2"
  const times = /^[x×*]\s*/i.exec(text);
  if (times) text = text.slice(times[0].length).trim();

  // Package size in parentheses or inline: "(14.5 ounce) can", "400g can", "400g/14oz tin".
  let packageGrams: number | null = null;
  const pkg = new RegExp(`^\\(?\\s*(${NUMBER})\\s*-?\\s*(${unitAlternation})\\.?\\s*\\)?\\s*(?:\\/\\s*${NUMBER}\\s*[a-z]+\\s*)?`, 'i').exec(text);
  if (pkg?.[1] && pkg[2]) {
    const size = parseNumber(pkg[1]);
    const unit = readUnit(pkg[2]);
    const after = text.slice(pkg[0].length).trim();
    const container = after ? readUnit(after) : null;
    if (size !== null && unit && container && ['can', 'jar', 'packet', 'bag', 'box', 'bottle', 'sachet', 'block'].includes(container.unit)) {
      const g = massGrams(size, unit.unit) ?? (unit.unit in VOLUME_ML ? size * VOLUME_ML[unit.unit as VolumeUnit] : null);
      if (g !== null) {
        packageGrams = g * unit.scale;
        text = after.slice(container.length).trim();
        const count = quantity ?? 1;
        return finish({ quantity: count, unit: container.unit, grams: packageGrams * count, size: null, unquantified: false, rest: text });
      }
    }
    if (quantity === null && size !== null && unit) {
      // "(8 ounce)" with no container: treat as the amount itself.
      quantity = size * unit.scale;
      text = after;
      const grams = massGrams(quantity, unit.unit);
      return finish({ quantity, unit: unit.unit, grams, size: null, unquantified: false, rest: stripAltMeasure(text) });
    }
  }

  let size: SizeWord | null = null;
  const sizeMatch = /^(extra large|x-large|small|medium|med|large|big|jumbo)\b\.?\s*/i.exec(text);
  if (sizeMatch?.[1]) {
    size = SIZE_WORDS[sizeMatch[1].toLowerCase()] ?? null;
    text = text.slice(sizeMatch[0].length).trim();
  }

  let unit: Unit | null = null;
  const unitMatch = readUnit(text);
  if (unitMatch && (quantity !== null || ['pinch', 'dash', 'handful', 'knob', 'splash', 'drizzle', 'sprinkle', 'bunch', 'sprig'].includes(unitMatch.unit))) {
    unit = unitMatch.unit;
    if (quantity !== null) quantity *= unitMatch.scale;
    text = text.slice(unitMatch.length).trim();
    text = text.replace(/^of\s+/i, '');
    if (quantity === null) quantity = 1;
  }
  if (!size) {
    const lateSize = /^(extra large|x-large|small|medium|med|large|big|jumbo)\b\.?\s*/i.exec(text);
    if (lateSize?.[1]) {
      size = SIZE_WORDS[lateSize[1].toLowerCase()] ?? null;
      text = text.slice(lateSize[0].length).trim();
    }
  }

  text = stripAltMeasure(text);
  const grams = quantity !== null && unit ? massGrams(quantity, unit) : null;
  return finish({ quantity, unit, grams, size, unquantified: false, rest: text });
}

/** Drops a trailing alternative measure such as "/ 6oz" or "(250ml)" right after the amount. */
function stripAltMeasure(text: string): string {
  return text
    .replace(new RegExp(`^\\/\\s*${NUMBER}\\s*(?:${unitAlternation})\\.?\\s*`, 'i'), '')
    .replace(new RegExp(`^\\(\\s*${NUMBER}\\s*(?:${unitAlternation})\\.?\\s*\\)\\s*`, 'i'), '')
    .trim();
}

function finish(measure: Measure): Measure {
  const unquantified = measure.quantity === null && UNQUANTIFIED.test(measure.rest);
  return { ...measure, unquantified: unquantified || (measure.quantity === null && measure.unit === null && measure.rest === '') };
}

/** Converts a measure to grams given ingredient-specific weights (unit -> grams per 1 unit). */
export function measureToGrams(measure: Measure, gramsPerUnit: Readonly<Record<string, number>>): number | null {
  if (measure.grams !== null) return measure.grams;
  if (measure.quantity === null) return null;
  const q = measure.quantity;
  const unit = measure.unit;
  if (unit === null) {
    const key = measure.size ?? 'medium';
    const each = gramsPerUnit[key] ?? gramsPerUnit.piece ?? gramsPerUnit.medium;
    return each !== undefined ? q * each : null;
  }
  if (unit in MASS_UNITS) return q * MASS_UNITS[unit as MassUnit];
  const direct = gramsPerUnit[unit];
  if (direct !== undefined) return q * direct * sizeFactor(measure.size);
  const cup = gramsPerUnit.cup;
  if (unit in VOLUME_ML && cup !== undefined) return (q * VOLUME_ML[unit as VolumeUnit] * cup) / VOLUME_ML.cup;
  if (unit in TINY_UNITS) {
    const tsp = gramsPerUnit.tsp ?? (cup !== undefined ? (cup * VOLUME_ML.tsp) / VOLUME_ML.cup : undefined);
    return tsp !== undefined ? q * TINY_UNITS[unit as TinyUnit] * tsp : null;
  }
  if (unit === 'piece') {
    const each = gramsPerUnit[measure.size ?? 'medium'] ?? gramsPerUnit.medium;
    return each !== undefined ? q * each : null;
  }
  return null;
}

function sizeFactor(size: SizeWord | null): number {
  return size === 'small' ? 0.75 : size === 'large' ? 1.3 : 1;
}
