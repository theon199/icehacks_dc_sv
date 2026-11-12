/**
 * Curated search aliases: other everyday names for the *same* ingredient, so a search in one
 * dialect finds recipes written in another ("aubergine" finds eggplant dishes).
 *
 * Only true equivalents belong here. Matching synonyms are deliberately not indexed wholesale:
 * many are varieties ("penne" under pasta), compound phrases ("chicken or vegetable broth") or
 * name other foods ("beef tomatoes"), and indexing them would make searches return recipes that
 * do not contain what was asked for.
 *
 * A one-word alias is indexed as is. A multi-word alias contributes only its words that are foods
 * on their own (see {@link ALIAS_DESCRIPTORS} and `aliasIndexWords`): "coriander leaves" indexes
 * "coriander" but not "leaves", and "half and half" indexes nothing.
 */
export const SEARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  chickpea: ['chick peas', 'garbanzo', 'garbanzo beans', 'chana'],
  chickpea_flour: ['gram flour', 'besan'],
  eggplant: ['aubergine', 'brinjal'],
  zucchini: ['courgette'],
  cilantro: ['coriander leaves'],
  scallion: ['spring onion', 'scallion'],
  bell_pepper: ['capsicum', 'sweet pepper'],
  red_pepper: ['red capsicum', 'bell pepper'],
  green_pepper: ['green capsicum', 'bell pepper'],
  rocket: ['rocket', 'arugula'],
  shrimp: ['prawn', 'prawns'],
  dried_shrimp: ['dried prawns'],
  ground_beef: ['minced beef', 'beef mince'],
  lean_ground_beef: ['minced beef', 'beef mince', 'ground beef'],
  ground_pork: ['minced pork', 'pork mince'],
  ground_lamb: ['minced lamb', 'lamb mince'],
  ground_chicken: ['minced chicken', 'chicken mince'],
  ground_turkey: ['minced turkey', 'turkey mince'],
  ground_meat: ['mince', 'minced meat'],
  heavy_cream: ['double cream', 'whipping cream'],
  light_cream: ['single cream', 'half and half'],
  yogurt: ['yoghurt'],
  greek_yogurt: ['greek yoghurt', 'yogurt', 'yoghurt'],
  cornstarch: ['cornflour', 'corn starch'],
  flour: ['plain flour', 'flour'],
  self_raising_flour: ['self rising flour'],
  powdered_sugar: ['icing sugar', 'confectioners sugar'],
  sugar: ['caster sugar', 'granulated sugar'],
  molasses: ['treacle'],
  baking_soda: ['bicarbonate of soda', 'bicarbonate'],
  beetroot: ['beet', 'beets'],
  swede: ['swede', 'rutabaga'],
  swiss_chard: ['chard', 'silverbeet'],
  okra: ['ladies fingers', 'bhindi'],
  snow_pea: ['mangetout'],
  broad_bean: ['fava beans', 'fava'],
  white_bean: ['cannellini', 'navy beans', 'haricot beans', 'haricot'],
  chili_pepper: ['chilli', 'chile'],
  green_chili: ['green chilli', 'green chile'],
  chili_powder: ['chilli powder'],
  red_pepper_flakes: ['chilli flakes', 'chili flakes'],
  chili_sauce: ['chilli sauce'],
  sardine: ['pilchards'],
  egg_pasta: ['pasta'],
  fresh_pasta: ['pasta'],
  gnocchi: ['pasta'],
  spaghetti: ['pasta'],
  macaroni: ['pasta'],
  whole_wheat_pasta: ['pasta'],
  lasagna_sheets: ['lasagne', 'pasta'],
  short_grain_rice: ['rice'],
  arborio_rice: ['rice'],
  basmati_rice: ['rice'],
  jasmine_rice: ['rice'],
  brown_rice: ['rice'],
  pork_sausage: ['sausage'],
};

/**
 * Words that describe, qualify or merely spell out part of a food inside an alias phrase but do
 * not name that food on their own. They are never indexed from an alias: "french" in "french
 * beans" would otherwise make a search for "french" return every recipe with green beans.
 *
 * Some are foods elsewhere ("corn", "peas", "celery") but do not name the aliased ingredient by
 * themselves ("corn starch", "chick peas", "celery root"), so a search for them must not find it.
 */
export const ALIAS_DESCRIPTORS: ReadonlySet<string> = new Set([
  // Varieties, cuts and preparations.
  'french', 'string', 'navy', 'plain', 'self', 'rising', 'raising', 'double', 'single', 'whipping',
  'caster', 'granulated', 'icing', 'confectioners', 'minced', 'ground', 'dried', 'sweet', 'spring',
  'bell', 'red', 'green', 'half', 'ladies', 'fingers', 'gram', 'chick',
  // Plant parts and forms.
  'leaves', 'leaf', 'root', 'flakes', 'powder', 'sauce',
  // Foods elsewhere that do not name the aliased ingredient on their own in these phrases.
  'corn', 'bean', 'beans', 'curd', 'pea', 'peas', 'celery',
]);
