import { ing, type IngredientDef } from './define.ts';

/**
 * Beans, lentils, peas, nuts and seeds.
 * Coconut is tagged `tree_nut`. Current U.S. guidance no longer lists coconut as a tree nut, but
 * Famara keeps it conservative so tree-nut-allergic users decide for themselves.
 */
export const LEGUMES_NUTS: IngredientDef[] = [
  ing('chickpea', 'legume', { syn: ['chickpeas', 'chick peas', 'chick pea', 'garbanzo beans', 'garbanzo bean', 'garbanzos', 'can of chickpeas', 'canned chickpeas', 'channa', 'chana'], fdc: [173800, 'Chickpeas (garbanzo beans, bengal gram), mature seeds, canned, drained solids'] }),
  ing('low_sodium_chickpea', 'legume', { syn: ['low sodium chickpeas', 'no salt added chickpeas'], fdc: [175250, 'Chickpeas (garbanzo beans, bengal gram), mature seeds, canned, solids and liquids, low sodium'] }),
  ing('black_bean', 'legume', { syn: ['black beans', 'black turtle beans', 'fermented black beans', 'black-eyed peas or black beans'], fdc: [175188, 'Beans, black turtle, mature seeds, canned'] }),
  ing('kidney_bean', 'legume', { syn: ['kidney beans', 'red kidney beans', 'red beans', 'kidney beans drained and rinsed'], fdc: [174285, 'Beans, kidney, red, mature seeds, canned, drained solids'] }),
  ing('pinto_bean', 'legume', { syn: ['pinto beans', 'borlotti beans', 'cranberry beans', 'canned beans', 'beans', 'cooked beans'], fdc: [175201, 'Beans, pinto, mature seeds, canned, solids and liquids'] }),
  ing('white_bean', 'legume', { syn: ['white beans', 'cannellini beans', 'cannellini', 'navy beans', 'haricot beans', 'great northern beans', 'dried white beans', 'dried white navy beans', 'cooked white beans', 'butter beans', 'lima beans', 'large lima beans'], fdc: [175204, 'Beans, white, mature seeds, canned'] }),
  ing('black_eyed_pea', 'legume', { syn: ['black eyed peas', 'black-eyed peas', 'blackeyed peas', 'cowpeas'], fdc: [173760, 'Cowpeas, common (blackeyes, crowder, southern), mature seeds, canned, plain'] }),
  ing('baked_beans', 'legume', { syn: ['baked beans', 'beans in tomato sauce'], fdc: [175182, 'Beans, baked, canned, plain or vegetarian'], addedSugar: true }),
  ing('refried_beans', 'legume', { syn: ['refried beans', 'fat free refried beans', 'fat-free refried beans'], variable: true, fdc: [172465, 'Refried beans, canned, fat-free'] }),
  ing('lentil', 'legume', { syn: ['lentils', 'brown lentils', 'green lentils', 'french lentils', 'puy lentils', 'dried lentils', 'dry lentils', 'green red lentils'], aisle: 'grains_pasta', fdc: [172420, 'Lentils, raw'] }),
  ing('red_lentil', 'legume', { syn: ['red lentils', 'masoor dal', 'split red lentils'], aisle: 'grains_pasta', fdc: [174284, 'Lentils, pink or red, raw'] }),
  ing('split_pea', 'legume', { syn: ['split peas', 'yellow split peas', 'green split peas', 'chana dal', 'toor dal', 'toor dal lentils', 'pigeon peas', 'arhar dal'], aisle: 'grains_pasta', fdc: [172428, 'Peas, green, split, mature seeds, raw'] }),
  ing('mung_bean', 'legume', { syn: ['mung beans', 'moong dal', 'precooked mung beans', 'mung bean paste'], aisle: 'grains_pasta', fdc: [174256, 'Mung beans, mature seeds, raw'] }),
  ing('hummus', 'legume', { syn: ['houmous', 'hummus dip'], allergens: ['sesame'], aisle: 'produce', fdc: [174289, 'Hummus, commercial'] }),
  // Peanuts
  ing('peanut', 'nut_seed', { syn: ['peanuts', 'roasted peanut', 'roasted peanuts', 'unsalted peanuts', 'groundnuts', 'dry roasted peanuts'], allergens: ['peanut'], fdc: [173806, 'Peanuts, all types, dry-roasted, without salt'] }),
  ing('peanut_butter', 'nut_seed', { syn: ['smooth peanut butter', 'crunchy peanut butter', 'natural peanut butter'], allergens: ['peanut'], aisle: 'pantry', fdc: [172470, 'Peanut butter, smooth style, without salt'] }),
  ing('reduced_fat_peanut_butter', 'nut_seed', { name: 'reduced-fat peanut butter', syn: ['reduced fat peanut butter'], allergens: ['peanut'], aisle: 'pantry', fdc: [172458, 'Peanut butter, smooth, reduced fat'] }),
  ing('peanut_brittle', 'sweetener', { syn: ['nut brittle'], allergens: ['peanut'], variable: true, aisle: 'baking', fdc: [169586, 'Candies, peanut brittle, prepared-from-recipe'] }),
  // Tree nuts
  ing('almond', 'nut_seed', { syn: ['almonds', 'flaked almonds', 'sliced almonds', 'slivered almonds', 'toasted almonds', 'blanched almonds', 'whole almonds'], allergens: ['tree_nut'], fdc: [170567, 'Nuts, almonds'] }),
  ing('almond_paste', 'nut_seed', { syn: ['marzipan', 'almond paste'], allergens: ['tree_nut'], aisle: 'baking', addedSugar: true, fdc: [170160, 'Nuts, almond paste'] }),
  ing('cashew', 'nut_seed', { syn: ['cashews', 'cashew nuts', 'unsalted cashews'], allergens: ['tree_nut'], fdc: [170162, 'Nuts, cashew nuts, raw'] }),
  ing('walnut', 'nut_seed', { syn: ['walnuts', 'walnut pieces', 'chopped walnuts', 'ground walnuts', 'walnut halves'], allergens: ['tree_nut'], fdc: [170187, 'Nuts, walnuts, english'] }),
  ing('pecan', 'nut_seed', { syn: ['pecans', 'pecan nuts', 'pecan halves', 'unsalted pecans'], allergens: ['tree_nut'], fdc: [170182, 'Nuts, pecans'] }),
  ing('pistachio', 'nut_seed', { syn: ['pistachios', 'pistachio nuts', 'ground pistachios', 'unsalted pistachio', 'pistachio paste'], allergens: ['tree_nut'], fdc: [170184, 'Nuts, pistachio nuts, raw'] }),
  ing('hazelnut', 'nut_seed', { syn: ['hazelnuts', 'hazlenuts', 'shelled hazelnuts', 'filberts'], allergens: ['tree_nut'], fdc: [170581, 'Nuts, hazelnuts or filberts'] }),
  ing('pine_nut', 'nut_seed', { syn: ['pine nuts', 'pinenuts', 'pignoli'], allergens: ['tree_nut'], fdc: [170591, 'Nuts, pine nuts, dried'] }),
  ing('chestnut', 'nut_seed', { syn: ['chestnuts', 'cooked chestnut', 'cooked chestnuts', 'roasted chestnuts'], allergens: ['tree_nut'], fdc: [170190, 'Nuts, chestnuts, european, roasted'] }),
  ing('macadamia', 'nut_seed', { syn: ['macadamia nuts', 'brazil nuts'], allergens: ['tree_nut'], fdc: [170178, 'Nuts, macadamia nuts, raw'] }),
  ing('mixed_nuts', 'nut_seed', { name: 'nuts', syn: ['nuts', 'chopped nuts', 'mixed nuts', 'chopped nuts or seeds'], allergens: ['tree_nut'], variable: true, fdc: [170585, 'Nuts, mixed nuts, dry roasted, with peanuts, without salt added'] }),
  ing('nougatine', 'sweetener', { syn: ['praline', 'nut praline'], allergens: ['tree_nut'], variable: true, aisle: 'baking', fdc: [169586, 'Candies, peanut brittle, prepared-from-recipe'] }),
  // Coconut
  ing('coconut', 'nut_seed', { syn: ['fresh coconut', 'grated coconut', 'coconut meat'], allergens: ['tree_nut'], aisle: 'produce', fdc: [170169, 'Nuts, coconut meat, raw'] }),
  ing('desiccated_coconut', 'nut_seed', { syn: ['desiccated coconut', 'shredded coconut', 'coconut flakes', 'flaked coconut', 'unsweetened coconut', 'dried coconut'], allergens: ['tree_nut'], aisle: 'baking', fdc: [170170, 'Nuts, coconut meat, dried (desiccated), not sweetened'] }),
  ing('coconut_milk', 'nut_seed', { syn: ['coconut milk', 'unsweetened coconut milk', 'canned coconut milk', 'light coconut milk', 'tinned coconut milk'], allergens: ['tree_nut'], aisle: 'canned_jarred', fdc: [170173, 'Nuts, coconut milk, canned (liquid expressed from grated meat and water)'], units: { can: 400 } }),
  ing('coconut_cream', 'nut_seed', { syn: ['coconut cream', 'creamed coconut'], allergens: ['tree_nut'], aisle: 'canned_jarred', fdc: [170580, 'Nuts, coconut cream, raw (liquid expressed from grated meat)'], units: { can: 400 } }),
  // Seeds
  ing('sesame_seed', 'nut_seed', { syn: ['sesame seeds', 'sesame seed', 'toasted sesame seeds', 'black sesame seeds', 'white sesame seeds', 'seeds'], allergens: ['sesame'], aisle: 'spices', fdc: [170150, 'Seeds, sesame seeds, whole, dried'] }),
  ing('tahini', 'nut_seed', { syn: ['tahini paste', 'sesame tahini', 'sesame paste', 'chinese sesame sauce', 'sesame butter'], allergens: ['sesame'], aisle: 'international', fdc: [168604, 'Seeds, sesame butter, tahini, type of kernels unspecified'] }),
  ing('sunflower_seed', 'nut_seed', { syn: ['sunflower seeds', 'sunflower kernels'], fdc: [170562, 'Seeds, sunflower seed kernels, dried'] }),
  ing('sunflower_seed_butter', 'nut_seed', { syn: ['sunflower butter', 'sunflower seed spread'], aisle: 'pantry', fdc: [170155, 'Seeds, sunflower seed butter, without salt'] }),
  ing('pumpkin_seed', 'nut_seed', { syn: ['pumpkin seeds', 'pepitas'], fdc: [170556, 'Seeds, pumpkin and squash seed kernels, dried'] }),
  ing('flaxseed', 'nut_seed', { syn: ['flax seeds', 'linseed', 'ground flaxseed', 'flax eggs', 'flax egg'], fdc: [169414, 'Seeds, flaxseed'] }),
  ing('chia_seed', 'nut_seed', { syn: ['chia seeds', 'chia'], fdc: [170554, 'Seeds, chia seeds, dried'] }),
  ing('poppy_seed', 'spice', { syn: ['poppy seeds', 'ground poppy seeds'], fdc: [171330, 'Spices, poppy seed'] }),
];
