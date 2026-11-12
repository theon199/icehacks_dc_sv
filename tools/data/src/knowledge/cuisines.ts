import { tokenize } from '../match/normalize.ts';

export const REGIONS = [
  'north_america',
  'latin_america',
  'caribbean',
  'northern_europe',
  'western_europe',
  'southern_europe',
  'eastern_europe',
  'middle_east',
  'north_africa',
  'sub_saharan_africa',
  'south_asia',
  'central_asia',
  'east_asia',
  'southeast_asia',
  'oceania',
  'global',
] as const;
export type Region = (typeof REGIONS)[number];

export interface CuisineDef {
  id: string;
  label: string;
  region: Region;
  /** Country names, demonyms and spellings that identify this cuisine. */
  names: string[];
}

const c = (id: string, label: string, region: Region, names: string[]): CuisineDef => ({ id, label, region, names: [label, ...names] });

/** Cuisines Famara recognises. Order matters only for documentation. */
export const CUISINES: readonly CuisineDef[] = [
  c('american', 'American', 'north_america', ['united states', 'usa', 'america', 'southern', 'tex mex', 'cajun', 'creole']),
  c('canadian', 'Canadian', 'north_america', ['canada', 'quebecois']),
  c('mexican', 'Mexican', 'latin_america', ['mexico']),
  c('guatemalan', 'Guatemalan', 'latin_america', ['guatemala']),
  c('salvadoran', 'Salvadoran', 'latin_america', ['el salvador']),
  c('honduran', 'Honduran', 'latin_america', ['honduras']),
  c('nicaraguan', 'Nicaraguan', 'latin_america', ['nicaragua']),
  c('costa_rican', 'Costa Rican', 'latin_america', ['costa rica']),
  c('panamanian', 'Panamanian', 'latin_america', ['panama']),
  c('colombian', 'Colombian', 'latin_america', ['colombia']),
  c('venezuelan', 'Venezuelan', 'latin_america', ['venezuela', 'venezulan']),
  c('ecuadorian', 'Ecuadorian', 'latin_america', ['ecuador', 'ecuadorean']),
  c('peruvian', 'Peruvian', 'latin_america', ['peru']),
  c('bolivian', 'Bolivian', 'latin_america', ['bolivia']),
  c('chilean', 'Chilean', 'latin_america', []),
  c('argentinian', 'Argentinian', 'latin_america', ['argentina', 'argentine']),
  c('uruguayan', 'Uruguayan', 'latin_america', ['uruguay']),
  c('paraguayan', 'Paraguayan', 'latin_america', ['paraguay']),
  c('brazilian', 'Brazilian', 'latin_america', ['brazil', 'bahia']),
  c('guyanese', 'Guyanese', 'latin_america', ['guyana']),
  c('surinamese', 'Surinamese', 'latin_america', ['suriname', 'surinamer']),
  c('jamaican', 'Jamaican', 'caribbean', ['jamaica']),
  c('cuban', 'Cuban', 'caribbean', ['cuba']),
  c('puerto_rican', 'Puerto Rican', 'caribbean', ['puerto rico']),
  c('dominican', 'Dominican', 'caribbean', ['dominican republic', 'dominica']),
  c('haitian', 'Haitian', 'caribbean', ['haiti']),
  c('trinidadian', 'Trinidadian', 'caribbean', ['trinidad', 'tobago', 'trinidad and tobago']),
  c('barbadian', 'Barbadian', 'caribbean', ['barbados', 'bajan']),
  c('bahamian', 'Bahamian', 'caribbean', ['bahamas']),
  c('antiguan', 'Antiguan', 'caribbean', ['antigua', 'barbudan', 'wadadli']),
  c('caymanian', 'Caymanian', 'caribbean', ['cayman', 'cayman islands']),
  c('aruban', 'Aruban', 'caribbean', ['aruba', 'curacao', 'curacaoan']),
  c('grenadian', 'Grenadian', 'caribbean', ['grenada']),
  c('saint_lucian', 'Saint Lucian', 'caribbean', ['saint lucia', 'st lucia']),
  c('caribbean', 'Caribbean', 'caribbean', ['west indian']),
  c('latin_american', 'Latin American', 'latin_america', ['latin', 'south american']),
  c('british', 'British', 'northern_europe', ['united kingdom', 'uk', 'england', 'english', 'scottish', 'scotland', 'welsh', 'wales', 'cornish']),
  c('irish', 'Irish', 'northern_europe', ['ireland']),
  c('norwegian', 'Norwegian', 'northern_europe', ['norway']),
  c('swedish', 'Swedish', 'northern_europe', ['sweden']),
  c('danish', 'Danish', 'northern_europe', ['denmark']),
  c('finnish', 'Finnish', 'northern_europe', ['finland']),
  c('icelandic', 'Icelandic', 'northern_europe', ['iceland', 'icelander']),
  c('dutch', 'Dutch', 'western_europe', ['netherlands', 'holland', 'zeeuwse']),
  c('belgian', 'Belgian', 'western_europe', ['belgium', 'flemish', 'liege', 'liegeoise']),
  c('french', 'French', 'western_europe', ['france', 'provencal']),
  c('german', 'German', 'western_europe', ['germany', 'bavarian']),
  c('austrian', 'Austrian', 'western_europe', ['austria', 'tirolean', 'tyrolean']),
  c('swiss', 'Swiss', 'western_europe', ['switzerland']),
  c('luxembourgish', 'Luxembourgish', 'western_europe', ['luxembourg', 'luxembourger']),
  c('italian', 'Italian', 'southern_europe', ['italy', 'sicilian', 'tuscan', 'neapolitan']),
  c('spanish', 'Spanish', 'southern_europe', ['spain', 'catalan', 'andalusian', 'andorran', 'andorra']),
  c('portuguese', 'Portuguese', 'southern_europe', ['portugal']),
  c('greek', 'Greek', 'southern_europe', ['greece']),
  c('cypriot', 'Cypriot', 'southern_europe', ['cyprus']),
  c('maltese', 'Maltese', 'southern_europe', ['malta']),
  c('croatian', 'Croatian', 'southern_europe', ['croatia', 'dalmatian']),
  c('albanian', 'Albanian', 'southern_europe', ['albania']),
  c('bosnian', 'Bosnian', 'southern_europe', ['bosnia', 'herzegovinian']),
  c('serbian', 'Serbian', 'southern_europe', ['serbia']),
  c('montenegrin', 'Montenegrin', 'southern_europe', ['montenegro']),
  c('macedonian', 'Macedonian', 'southern_europe', ['north macedonia', 'macedonia']),
  c('slovenian', 'Slovenian', 'southern_europe', ['slovenia', 'slovene']),
  c('polish', 'Polish', 'eastern_europe', ['poland']),
  c('russian', 'Russian', 'eastern_europe', ['russia']),
  c('ukrainian', 'Ukrainian', 'eastern_europe', ['ukraine']),
  c('belarusian', 'Belarusian', 'eastern_europe', ['belarus']),
  c('slovak', 'Slovak', 'eastern_europe', ['slovakia', 'slovakian']),
  c('czech', 'Czech', 'eastern_europe', ['czechia', 'czech republic']),
  c('hungarian', 'Hungarian', 'eastern_europe', ['hungary']),
  c('romanian', 'Romanian', 'eastern_europe', ['romania']),
  c('moldovan', 'Moldovan', 'eastern_europe', ['moldova']),
  c('bulgarian', 'Bulgarian', 'eastern_europe', ['bulgaria']),
  c('lithuanian', 'Lithuanian', 'eastern_europe', ['lithuania']),
  c('latvian', 'Latvian', 'eastern_europe', ['latvia']),
  c('estonian', 'Estonian', 'eastern_europe', ['estonia']),
  c('georgian', 'Georgian', 'eastern_europe', ['georgia']),
  c('armenian', 'Armenian', 'middle_east', ['armenia']),
  c('azerbaijani', 'Azerbaijani', 'middle_east', ['azerbaijan']),
  c('turkish', 'Turkish', 'middle_east', ['turkiye', 'ottoman']),
  c('syrian', 'Syrian', 'middle_east', ['syria']),
  c('lebanese', 'Lebanese', 'middle_east', ['lebanon']),
  c('palestinian', 'Palestinian', 'middle_east', ['palestine']),
  c('israeli', 'Israeli', 'middle_east', ['israel']),
  c('jordanian', 'Jordanian', 'middle_east', ['jordan']),
  c('iraqi', 'Iraqi', 'middle_east', ['iraq']),
  c('iranian', 'Iranian', 'middle_east', ['iran', 'persian']),
  c('saudi', 'Saudi', 'middle_east', ['saudi arabian', 'saudi arabia', 'arabian']),
  c('emirati', 'Emirati', 'middle_east', ['uae', 'united arab emirates']),
  c('yemeni', 'Yemeni', 'middle_east', ['yemen']),
  c('omani', 'Omani', 'middle_east', ['oman']),
  c('kuwaiti', 'Kuwaiti', 'middle_east', ['kuwait']),
  c('qatari', 'Qatari', 'middle_east', ['qatar']),
  c('bahraini', 'Bahraini', 'middle_east', ['bahrain']),
  c('middle_eastern', 'Middle Eastern', 'middle_east', ['levantine', 'arab']),
  c('egyptian', 'Egyptian', 'north_africa', ['egypt']),
  c('moroccan', 'Moroccan', 'north_africa', ['morocco']),
  c('tunisian', 'Tunisian', 'north_africa', ['tunisia']),
  c('algerian', 'Algerian', 'north_africa', ['algeria']),
  c('libyan', 'Libyan', 'north_africa', ['libya']),
  c('sudanese', 'Sudanese', 'north_africa', ['sudan']),
  c('kenyan', 'Kenyan', 'sub_saharan_africa', ['kenya']),
  c('ethiopian', 'Ethiopian', 'sub_saharan_africa', ['ethiopia', 'eritrean', 'eritrea']),
  c('nigerian', 'Nigerian', 'sub_saharan_africa', ['nigeria']),
  c('ghanaian', 'Ghanaian', 'sub_saharan_africa', ['ghana']),
  c('senegalese', 'Senegalese', 'sub_saharan_africa', ['senegal']),
  c('south_african', 'South African', 'sub_saharan_africa', ['south africa']),
  c('botswanan', 'Botswanan', 'sub_saharan_africa', ['botswana', 'motswana']),
  c('tanzanian', 'Tanzanian', 'sub_saharan_africa', ['tanzania']),
  c('ugandan', 'Ugandan', 'sub_saharan_africa', ['uganda']),
  c('cameroonian', 'Cameroonian', 'sub_saharan_africa', ['cameroon']),
  c('zimbabwean', 'Zimbabwean', 'sub_saharan_africa', ['zimbabwe']),
  c('somali', 'Somali', 'sub_saharan_africa', ['somalia']),
  c('west_african', 'West African', 'sub_saharan_africa', ['ivorian', 'beninese', 'togolese', 'malian', 'guinean']),
  c('indian', 'Indian', 'south_asia', ['india', 'bengali', 'punjabi', 'goan', 'kerala']),
  c('pakistani', 'Pakistani', 'south_asia', ['pakistan']),
  c('bangladeshi', 'Bangladeshi', 'south_asia', ['bangladesh']),
  c('sri_lankan', 'Sri Lankan', 'south_asia', ['sri lanka']),
  c('nepalese', 'Nepalese', 'south_asia', ['nepal', 'nepali']),
  c('afghan', 'Afghan', 'south_asia', ['afghanistan']),
  c('kazakh', 'Kazakh', 'central_asia', ['kazakhstan', 'kazakhstani']),
  c('uzbek', 'Uzbek', 'central_asia', ['uzbekistan', 'uzbekistani']),
  c('turkmen', 'Turkmen', 'central_asia', ['turkmenistan']),
  c('mongolian', 'Mongolian', 'east_asia', ['mongolia']),
  c('chinese', 'Chinese', 'east_asia', ['china', 'cantonese', 'sichuan', 'szechuan', 'hunan', 'hong kong', 'hong konger']),
  c('taiwanese', 'Taiwanese', 'east_asia', ['taiwan']),
  c('japanese', 'Japanese', 'east_asia', ['japan']),
  c('korean', 'Korean', 'east_asia', ['korea', 'south korean', 'north korean']),
  c('thai', 'Thai', 'southeast_asia', ['thailand']),
  c('vietnamese', 'Vietnamese', 'southeast_asia', ['vietnam']),
  c('cambodian', 'Cambodian', 'southeast_asia', ['cambodia', 'khmer']),
  c('lao', 'Lao', 'southeast_asia', ['laos', 'laotian']),
  c('burmese', 'Burmese', 'southeast_asia', ['myanmar', 'burma']),
  c('malaysian', 'Malaysian', 'southeast_asia', ['malaysia', 'malay']),
  c('singaporean', 'Singaporean', 'southeast_asia', ['singapore']),
  c('indonesian', 'Indonesian', 'southeast_asia', ['indonesia', 'balinese']),
  c('filipino', 'Filipino', 'southeast_asia', ['philippines', 'philippine']),
  c('australian', 'Australian', 'oceania', ['australia', 'aussie']),
  c('new_zealand', 'New Zealand', 'oceania', ['new zealander']),
  c('pacific_islands', 'Pacific Islands', 'oceania', ['fijian', 'fiji', 'samoan', 'tongan', 'hawaiian']),
  c('international', 'International', 'global', []),
];

export const CUISINE_BY_ID: ReadonlyMap<string, CuisineDef> = new Map(CUISINES.map((def) => [def.id, def]));

const NAME_INDEX = new Map<string, string>();
for (const def of CUISINES) for (const name of def.names) NAME_INDEX.set(tokenize(name).join(' '), def.id);

/** Dish words that point to a cuisine when neither the source nor the title names a country. */
const DISH_HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(enchiladas?|burritos?|tacos?|quesadillas?|fajitas?|tamales?|tamal|salsa|mole|pozole|guacamole|chilaquiles|tostadas?|nachos?|huevos|arroz con|carnitas|elote|picadillo|pico de gallo|horchata|chile relleno)\b/i, 'mexican'],
  [/\b(stir[- ]?fry|stir[- ]?fried|lo mein|chow mein|fried rice|kung pao|sweet and sour|wontons?|dumplings? soup|dim sum|bok choy|egg foo|char siu|mapo)\b/i, 'chinese'],
  [/\b(curry|masala|dal|dhal|tikka|biryani|chana|chaat|korma|vindaloo|paneer|naan|raita|samosas?|pakoras?|chapati|roti|lassi|kheer)\b/i, 'indian'],
  [/\b(pasta|lasagn[ae]|risotto|spaghetti|marinara|manicotti|minestrone|pizza|frittata|bruschetta|gnocchi|carbonara|bolognese|parmigiana|cacciatore|caprese|tiramisu|panna cotta|polenta|ravioli|penne|fettuccine|primavera)\b/i, 'italian'],
  [/\b(sushi|teriyaki|ramen|miso|tempura|katsu|yakitori|udon|soba|onigiri|gyoza|okonomiyaki)\b/i, 'japanese'],
  [/\b(pad thai|tom yum|tom kha|green curry|red curry|massaman|larb|som tam)\b/i, 'thai'],
  [/\b(pho|banh mi|banh xeo|spring rolls?|bun cha)\b/i, 'vietnamese'],
  [/\b(kimchi|bulgogi|bibimbap|japchae|gochujang|tteok)\b/i, 'korean'],
  [/\b(hummus|tabbouleh|tabouli|falafel|shawarma|baba ganoush|fattoush|shakshuka|kofta|kebabs?|pita)\b/i, 'middle_eastern'],
  [/\b(tagine|harira|chermoula)\b/i, 'moroccan'],
  [/\b(gumbo|jambalaya|cornbread|grits|mac and cheese|macaroni and cheese|sloppy joes?|meatloaf|pot roast|cobbler|buffalo|barbecue|bbq|sloppy|casserole|pancakes?|muffins?|chili|chowder|coleslaw|biscuits)\b/i, 'american'],
  [/\b(paella|gazpacho|tapas|churros|patatas bravas|tortilla espanola)\b/i, 'spanish'],
  [/\b(moussaka|souvlaki|tzatziki|spanakopita|gyros?|baklava)\b/i, 'greek'],
  [/\b(ratatouille|quiche|crepes?|cassoulet|bouillabaisse|croque|souffle|gratin|bourguignon|clafoutis|vichyssoise)\b/i, 'french'],
  [/\b(pierogi|pierogies|golabki|kielbasa)\b/i, 'polish'],
  [/\b(goulash|paprikash)\b/i, 'hungarian'],
  [/\b(borscht|blini|stroganoff|pelmeni)\b/i, 'russian'],
  [/\b(jerk|ackee|callaloo|plantain)\b/i, 'jamaican'],
  [/\b(empanadas?|arepas?|chimichurri)\b/i, 'latin_american'],
  [/\b(shepherds? pie|cottage pie|bangers|scones?|trifle|crumble|toad in the hole|yorkshire|fish and chips|bubble and squeak|sticky toffee)\b/i, 'british'],
  [/\b(schnitzel|sauerkraut|spaetzle|strudel|bratwurst)\b/i, 'german'],
  [/\b(adobo|pancit|lumpia|sinigang)\b/i, 'filipino'],
  [/\b(laksa|rendang|nasi|satay|satee|sambal)\b/i, 'malaysian'],
];

/** Ingredient and product names that contain a country word without naming the dish's cuisine. */
const MISLEADING =
  /\b(french (?:toast|fries|bread|beans|dressing|onion)|swiss (?:chard|cheese)|english (?:muffins?|mustard|cucumber)|brussels sprouts?|spanish (?:rice|onions?|olives?)|mexican (?:blend|cheese)|italian (?:seasoning|dressing|sausages?|herbs|bread|parsley)|thai (?:basil|chilli|chili)|greek (?:yogh?urt)|danish pastry|turkish delight|chinese (?:five spice|cabbage|broccoli|leaf|leaves)|jerusalem artichokes?|dutch oven|irish cream|canadian bacon|polish (?:sausage|kielbasa))\b/gi;

/** Finds a cuisine named in free text (an area field, a title or a tag list). */
export function cuisineFromText(text: string): string | null {
  const tokens = tokenize(text.replace(MISLEADING, ' '));
  for (let n = Math.min(4, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const hit = NAME_INDEX.get(tokens.slice(i, i + n).join(' '));
      if (hit) return hit;
    }
  }
  return null;
}

export function cuisineFromDish(title: string): string | null {
  for (const [pattern, cuisine] of DISH_HINTS) if (pattern.test(title)) return cuisine;
  return null;
}

export interface CuisineResult {
  cuisine: string;
  region: Region;
}

/** Area first, then a country/demonym in the title, then dish words, then the fallback. */
export function resolveCuisine(area: string | null, title: string, fallback: string): CuisineResult {
  const id = (area ? cuisineFromText(area) : null) ?? cuisineFromText(title) ?? cuisineFromDish(title) ?? fallback;
  const def = CUISINE_BY_ID.get(id) ?? CUISINE_BY_ID.get('international');
  if (!def) throw new Error('international cuisine missing');
  return { cuisine: def.id, region: def.region };
}
