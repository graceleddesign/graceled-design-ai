import { GENERIC_CHRISTIAN_MOTIFS } from "@/lib/motif-guardrails";

export const SCRIPTURE_SCOPE_VALUES = ["whole_book", "multi_passage", "specific_passage"] as const;
export type ScriptureScope = (typeof SCRIPTURE_SCOPE_VALUES)[number];

export function isScriptureScope(value: unknown): value is ScriptureScope {
  return typeof value === "string" && (SCRIPTURE_SCOPE_VALUES as readonly string[]).includes(value);
}

export type MotifBankEntry = {
  key: string;
  name: string;
  aliases: string[];
  genre:
    | "torah"
    | "history"
    | "wisdom"
    | "major_prophets"
    | "minor_prophets"
    | "gospels"
    | "acts"
    | "pauline_epistles"
    | "general_epistles"
    | "apocalyptic";
  motifs: string[];
  primaryThemes: string[];
  secondaryThemes: string[];
  sceneMotifs: string[];
  markIdeas: string[];
  antiMotifs: string[];
  tone: string[];
  allowedGenericMotifs?: string[];
};

export type TopicalMotifBankEntry = {
  key: string;
  displayName: string;
  keywords: string[];
  motifs: string[];
  markIdeas: string[];
  antiMotifs: string[];
  tone?: string;
  allowedGenericMotifs?: string[];
};

export type MotifBankContext = {
  bookKeys: string[];
  bookNames: string[];
  topicKeys: string[];
  topicNames: string[];
  scriptureScope: ScriptureScope;
  sceneMotifRequested: boolean;
  primaryThemeCandidates: string[];
  secondaryThemeCandidates: string[];
  sceneMotifCandidates: string[];
  motifCandidates: string[];
  markIdeaCandidates: string[];
  antiMotifs: string[];
  allowedGenericMotifs: string[];
  toneHints: string[];
  fallbackMode: "book" | "genre" | "none";
};

const GENERIC_ANTI_MOTIFS = [
  ...GENERIC_CHRISTIAN_MOTIFS,
  "generic dove/flame/sunburst combo",
  "stock church steeple silhouette"
];

const NONE_FALLBACK_MOTIFS = [
  "scroll/letterform texture",
  "map contour lines",
  "stone/ink imprint",
  "architectural grid",
  "wilderness path/road",
  "table/meal setting",
  "boundary marker stones",
  "lantern-lit threshold",
  "woven textile pattern",
  "dust-to-ink transition",
  "desert skyline contour",
  "sealed parchment fold"
];

const NONE_FALLBACK_MARK_IDEAS = [
  "monoline scroll-seal emblem",
  "contour-map medallion",
  "ink-stone imprint icon",
  "architectural grid monogram",
  "wilderness path chevron",
  "table-setting crest"
];

const NONE_FALLBACK_TONE = ["textural", "narrative", "grounded", "symbolic"];

type Genre = MotifBankEntry["genre"];

export const GENRE_FALLBACKS: Record<Genre, { motifs: string[]; markIdeas: string[]; antiMotifs: string[]; tone: string[] }> = {
  torah: {
    motifs: [
      "covenant stones",
      "desert encampment geometry",
      "tabernacle fabric bands",
      "altar smoke columns",
      "pilgrimage road",
      "scroll and seal"
    ],
    markIdeas: ["covenant tablet icon", "tabernacle-frame monogram", "desert-route seal"],
    antiMotifs: ["generic church steeple", "generic stained glass", "stock halo rays"],
    tone: ["ancient", "weighty", "ritual", "covenantal"]
  },
  history: {
    motifs: [
      "city gate silhouette",
      "battle standard fragments",
      "crowned-but-weathered masonry",
      "memorial stone stack",
      "royal court drapery",
      "rebuild blueprint lines"
    ],
    markIdeas: ["gate-arch emblem", "stacked-stones seal", "banner-and-wall crest"],
    antiMotifs: ["generic dove", "generic praying hands", "stock fish icon"],
    tone: ["dramatic", "civic", "restorative", "narrative"]
  },
  wisdom: {
    motifs: [
      "lyre strings",
      "inked proverb scroll",
      "sundial shadow arc",
      "garden lattice",
      "refining crucible",
      "mirror and measure"
    ],
    markIdeas: ["lyre-line symbol", "sundial ring mark", "wisdom-scroll glyph"],
    antiMotifs: ["generic sunburst", "stock church icon", "generic wheat emblem"],
    tone: ["reflective", "poetic", "measured", "intimate"]
  },
  major_prophets: {
    motifs: [
      "watchtower silhouette",
      "potter clay spiral",
      "city ruin contours",
      "measuring reed lines",
      "highway-through-desert",
      "courtroom scales"
    ],
    markIdeas: ["watchtower crest", "clay-spiral medallion", "measuring-line icon"],
    antiMotifs: ["generic church steeple", "stock dove/flame pair", "generic halo rays"],
    tone: ["urgent", "stark", "restorative", "prophetic"]
  },
  minor_prophets: {
    motifs: [
      "plumb line drop",
      "vineyard rows",
      "storm-banner clouds",
      "city wall breach",
      "messenger footsteps",
      "covenant lawsuit tablets"
    ],
    markIdeas: ["plumb-line monogram", "storm-banner badge", "messenger-path icon"],
    antiMotifs: ["generic stained glass", "stock praying hands", "generic fish emblem"],
    tone: ["incisive", "warning", "hopeful", "earthy"]
  },
  gospels: {
    motifs: [
      "roadside milestones",
      "table fellowship setting",
      "water and vessel scenes",
      "vineyard trellis",
      "fishing nets and boats",
      "threshold light/dark"
    ],
    markIdeas: ["vessel-and-wave icon", "table-arc emblem", "trellis monoline mark"],
    antiMotifs: ["generic church steeple", "stock halo glow", "generic dove icon"],
    tone: ["narrative", "inviting", "human", "incarnational"]
  },
  acts: {
    motifs: [
      "city-to-city route map",
      "upper-room drapery",
      "ship and storm timbers",
      "public square columns",
      "opened prison gate",
      "letter courier satchel"
    ],
    markIdeas: ["route-map seal", "open-gate symbol", "wind-and-courier crest"],
    antiMotifs: ["generic church clip-art", "stock raised-hands icon", "generic wheat symbol"],
    tone: ["kinetic", "missionary", "public", "bold"]
  },
  pauline_epistles: {
    motifs: [
      "wax-sealed letter fold",
      "household threshold",
      "chain link and key",
      "race track lanes",
      "architectural cornerstone",
      "adoption/inheritance papers"
    ],
    markIdeas: ["sealed-letter monogram", "cornerstone badge", "chain-break icon"],
    antiMotifs: ["generic dove", "stock sunburst", "generic stained glass"],
    tone: ["pastoral", "formational", "structural", "encouraging"]
  },
  general_epistles: {
    motifs: [
      "pilgrim route lines",
      "anchor and rope",
      "mirror and tongue motifs",
      "hospitality table",
      "elder letter scroll",
      "fire-rescue tongs"
    ],
    markIdeas: ["anchor-scroll mark", "pilgrim-path icon", "elder-seal emblem"],
    antiMotifs: ["generic church steeple", "stock praying-hands icon", "generic fish symbol"],
    tone: ["steadfast", "practical", "communal", "watchful"]
  },
  apocalyptic: {
    motifs: [
      "sealed scroll",
      "trumpet-and-bowl sequence",
      "lampstand arrays",
      "throne rainbow ring",
      "city-cube geometry",
      "cosmic contrast horizons"
    ],
    markIdeas: ["sealed-scroll insignia", "lampstand array mark", "city-cube crest"],
    antiMotifs: ["generic church clip-art", "stock dove icon", "generic wheat emblem"],
    tone: ["visionary", "symbolic", "cosmic", "triumphant"]
  }
};

const ORDINAL_WORD: Record<1 | 2 | 3, string> = {
  1: "first",
  2: "second",
  3: "third"
};

const ORDINAL_SUFFIX: Record<1 | 2 | 3, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd"
};

const ORDINAL_ROMAN: Record<1 | 2 | 3, string> = {
  1: "i",
  2: "ii",
  3: "iii"
};

function uniqueStrings(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(item.trim());
  }
  return result;
}

function ordinalAliases(number: 1 | 2 | 3, base: string, shortForms: string[] = []): string[] {
  const forms = [
    `${number} ${base}`,
    `${ORDINAL_SUFFIX[number]} ${base}`,
    `${ORDINAL_WORD[number]} ${base}`,
    `${ORDINAL_ROMAN[number]} ${base}`
  ];

  for (const short of shortForms) {
    forms.push(`${number} ${short}`);
    forms.push(`${ORDINAL_SUFFIX[number]} ${short}`);
    forms.push(`${ORDINAL_WORD[number]} ${short}`);
    forms.push(`${ORDINAL_ROMAN[number]} ${short}`);
  }

  return uniqueStrings(forms);
}

type MotifBankEntrySeed = Omit<MotifBankEntry, "primaryThemes" | "secondaryThemes" | "sceneMotifs"> &
  Partial<Pick<MotifBankEntry, "primaryThemes" | "secondaryThemes" | "sceneMotifs">>;

const MOTIF_BANK_ENTRY_SEEDS: MotifBankEntrySeed[] = [
  {
    key: "genesis",
    name: "Genesis",
    aliases: ["gen", "ge", "genesis"],
    genre: "torah",
    motifs: [
      "garden gate and river forks",
      "tree-of-life branchwork",
      "dust-to-breath swirl",
      "ark ribs and floodline",
      "rainbow covenant arc",
      "ladder between earth and sky"
    ],
    markIdeas: ["river-fork seal", "rainbow-arc covenant mark", "ladder-line monogram"],
    antiMotifs: ["generic dove", "stock church icon", "generic stained glass"],
    tone: ["origins", "expansive", "mythic", "covenantal"]
  },
  {
    key: "exodus",
    name: "Exodus",
    aliases: ["exo", "ex", "exod", "exodus"],
    genre: "torah",
    motifs: [
      "reed-sea walls parted",
      "doorpost blood stroke",
      "pillar of cloud and fire",
      "manna scatter on ground",
      "tabernacle curtain bands",
      "stone tablets and mountain smoke"
    ],
    markIdeas: ["parted-sea emblem", "tablet-and-mountain crest", "pillar-path icon"],
    antiMotifs: ["generic fish icon", "stock halo rays", "generic church steeple"],
    tone: ["liberating", "processional", "dramatic", "formative"]
  },
  {
    key: "leviticus",
    name: "Leviticus",
    aliases: ["lev", "le", "leviticus"],
    genre: "torah",
    motifs: [
      "altar coals and tongs",
      "priestly breastpiece gems",
      "incense cloud column",
      "cleansing water basin",
      "sacred calendar wheel",
      "veil and threshold markers"
    ],
    markIdeas: ["breastpiece-grid icon", "altar-coal medallion", "veil-threshold seal"],
    antiMotifs: ["generic dove", "stock church clip-art", "generic sunburst"],
    tone: ["ritual", "structured", "solemn", "holy"]
  },
  {
    key: "numbers",
    name: "Numbers",
    aliases: ["num", "nu", "numbers"],
    genre: "torah",
    motifs: [
      "encampment grid from above",
      "bronze serpent on pole",
      "cloud-cover movement trail",
      "quail pattern in the camp",
      "boundary-marker standards",
      "well spring in wilderness"
    ],
    markIdeas: ["camp-grid insignia", "serpent-pole icon", "wilderness-well badge"],
    antiMotifs: ["generic church steeple", "stock praying hands", "generic stained glass"],
    tone: ["journeying", "disciplined", "testing", "communal"]
  },
  {
    key: "deuteronomy",
    name: "Deuteronomy",
    aliases: ["deut", "deu", "dt", "deuteronomy"],
    genre: "torah",
    motifs: [
      "renewed covenant tablets",
      "listening-ear calligraphy",
      "border stones at river edge",
      "blessing and curse mountain pair",
      "public reading platform",
      "memory-knot cord"
    ],
    markIdeas: ["double-tablet crest", "mountain-pair seal", "reading-stand monogram"],
    antiMotifs: ["generic fish icon", "stock halo rays", "generic church clip-art"],
    tone: ["didactic", "urgent", "remembering", "covenantal"]
  },

  {
    key: "joshua",
    name: "Joshua",
    aliases: ["josh", "jos", "joshua"],
    genre: "history",
    motifs: [
      "river crossing memorial stones",
      "scarlet cord at city wall",
      "trumpet rings and rampart dust",
      "land allotment map lots",
      "commander sword silhouette",
      "sun-over-battlefield stillness"
    ],
    markIdeas: ["memorial-stone stack mark", "scarlet-cord gate icon", "allotment-map seal"],
    antiMotifs: ["generic dove", "stock church icon", "generic stained glass"],
    tone: ["courageous", "territorial", "decisive", "covenant-memory"]
  },
  {
    key: "judges",
    name: "Judges",
    aliases: ["judg", "jdg", "judges"],
    genre: "history",
    motifs: [
      "shattered clay jars and torchlight",
      "fleece with dew pattern",
      "tent peg and hammer silhouette",
      "jawbone weapon contour",
      "palm-tree court setting",
      "cyclical spiral of relapse-and-rescue"
    ],
    markIdeas: ["torch-jar emblem", "fleece-and-dew icon", "palm-court badge"],
    antiMotifs: ["generic fish icon", "stock halo rays", "generic church steeple"],
    tone: ["raw", "volatile", "cyclical", "deliverance-driven"]
  },
  {
    key: "ruth",
    name: "Ruth",
    aliases: ["ruth", "ru"],
    genre: "history",
    motifs: [
      "gleaning rows at field edge",
      "corner of garment covering",
      "threshing floor moonlight",
      "city-gate sandal exchange",
      "family lineage branch",
      "shared bread table"
    ],
    markIdeas: ["garment-corner crest", "gleaning-row icon", "gate-sandal seal"],
    antiMotifs: ["generic dove", "stock church icon", "generic halo rays"],
    tone: ["tender", "loyal", "providential", "earthy"]
  },
  {
    key: "1_samuel",
    name: "1 Samuel",
    aliases: [...ordinalAliases(1, "samuel", ["sam", "sa"])],
    genre: "history",
    motifs: [
      "horn of anointing oil",
      "sling and smooth stones",
      "ark chest under canopy",
      "harp strings in royal court",
      "Ebenezer memorial stone",
      "torn robe hem"
    ],
    markIdeas: ["anointing-horn icon", "sling-stone insignia", "ark-canopy crest"],
    antiMotifs: ["generic fish icon", "stock sunburst", "generic church steeple"],
    tone: ["transitional", "royal", "pastoral", "dramatic"]
  },
  {
    key: "2_samuel",
    name: "2 Samuel",
    aliases: [...ordinalAliases(2, "samuel", ["sam", "sa"])],
    genre: "history",
    motifs: [
      "cedar house and city walls",
      "shepherd-staff to scepter",
      "ark procession dance lines",
      "royal lament tears",
      "covenant lamp in Jerusalem",
      "battle courier scroll"
    ],
    markIdeas: ["staff-to-scepter symbol", "cedar-city badge", "lament-lamp seal"],
    antiMotifs: ["generic dove", "stock church icon", "generic stained glass"],
    tone: ["regal", "tragic", "covenantal", "city-centered"]
  },
  {
    key: "1_kings",
    name: "1 Kings",
    aliases: [...ordinalAliases(1, "kings", ["kgs", "ki"])],
    genre: "history",
    motifs: [
      "split kingdom banner tear",
      "temple pillars and bronze sea",
      "ravens carrying bread",
      "jar of oil in drought",
      "fire contest altar stones",
      "chariot wheel tracks"
    ],
    markIdeas: ["split-banner crest", "pillar-and-sea icon", "oil-jar insignia"],
    antiMotifs: ["generic fish icon", "stock praying hands", "generic halo rays"],
    tone: ["political", "prophetic", "architectural", "volatile"]
  },
  {
    key: "2_kings",
    name: "2 Kings",
    aliases: [...ordinalAliases(2, "kings", ["kgs", "ki"])],
    genre: "history",
    motifs: [
      "whirlwind chariot ascent",
      "floating axe head over water",
      "mantle crossing the Jordan",
      "shattered city gate",
      "foreign exile procession",
      "lamp kept for David"
    ],
    markIdeas: ["whirlwind-chariot mark", "floating-axe emblem", "mantle-wave crest"],
    antiMotifs: ["generic church steeple", "stock stained glass", "generic sunburst"],
    tone: ["sobering", "prophetic", "exilic", "kinetic"]
  },
  {
    key: "1_chronicles",
    name: "1 Chronicles",
    aliases: [...ordinalAliases(1, "chronicles", ["chr", "chron"])],
    genre: "history",
    motifs: [
      "genealogy scroll columns",
      "ark procession poles",
      "temple musician cymbals",
      "warrior roster tablets",
      "city of David contours",
      "altar preparation tools"
    ],
    markIdeas: ["genealogy-column icon", "cymbal-and-scroll seal", "ark-procession badge"],
    antiMotifs: ["generic dove", "stock fish icon", "generic halo rays"],
    tone: ["archival", "liturgical", "royal", "ordered"]
  },
  {
    key: "2_chronicles",
    name: "2 Chronicles",
    aliases: [...ordinalAliases(2, "chronicles", ["chr", "chron"])],
    genre: "history",
    motifs: [
      "temple repair chest",
      "bronze altar smoke column",
      "reform decree scroll",
      "Passover route crowds",
      "siege ramps and breach",
      "return-from-exile caravan"
    ],
    markIdeas: ["repair-chest emblem", "reform-scroll icon", "return-caravan crest"],
    antiMotifs: ["generic church clip-art", "stock praying hands", "generic stained glass"],
    tone: ["reforming", "historic", "covenantal", "restorative"]
  },
  {
    key: "ezra",
    name: "Ezra",
    aliases: ["ezra", "ezr"],
    genre: "history",
    motifs: [
      "scribe with open scroll",
      "temple foundation stones",
      "return caravan ledger",
      "mixed-language decree tablets",
      "public confession assembly",
      "altar rebuilt on old footprint"
    ],
    markIdeas: ["scribe-scroll insignia", "foundation-stone badge", "decree-tablet icon"],
    antiMotifs: ["generic dove", "stock fish symbol", "generic halo rays"],
    tone: ["restorative", "text-centered", "communal", "penitential"]
  },
  {
    key: "nehemiah",
    name: "Nehemiah",
    aliases: ["neh", "ne", "nehemiah"],
    genre: "history",
    motifs: [
      "wall blueprint overlays",
      "trowel in one hand, spear in the other",
      "night inspection lantern",
      "repaired city gates",
      "opposition letters and seals",
      "joyful dedication procession"
    ],
    markIdeas: ["trowel-spear monogram", "rebuilt-gate crest", "lantern-survey icon"],
    antiMotifs: ["generic church steeple", "stock sunburst", "generic stained glass"],
    tone: ["practical", "resilient", "civic", "rebuilding"]
  },
  {
    key: "esther",
    name: "Esther",
    aliases: ["esth", "est", "esther"],
    genre: "history",
    motifs: [
      "royal scepter extended",
      "signet ring and decree",
      "banquet table staging",
      "palace curtain folds",
      "hidden identity mask",
      "gallows beam silhouette"
    ],
    markIdeas: ["scepter-ring emblem", "banquet-arch seal", "curtain-fold icon"],
    antiMotifs: ["generic dove", "stock praying hands", "generic halo rays"],
    tone: ["courtly", "tense", "reversal-driven", "strategic"]
  },

  {
    key: "job",
    name: "Job",
    aliases: ["job", "jb"],
    genre: "wisdom",
    motifs: [
      "ash heap and pottery shard",
      "storm vortex from horizon",
      "balance scales in silence",
      "night sky questioning",
      "restored tent stakes",
      "storehouses of snow imagery"
    ],
    markIdeas: ["shard-and-storm emblem", "questioning-scales icon", "restored-tent seal"],
    antiMotifs: ["generic church icon", "stock sunburst", "generic fish symbol"],
    tone: ["lamenting", "cosmic", "honest", "resilient"]
  },
  {
    key: "psalms",
    name: "Psalms",
    aliases: ["ps", "psa", "psalm", "psalms", "pss"],
    genre: "wisdom",
    motifs: [
      "harp strings and resonance lines",
      "refuge tower silhouette",
      "valley-to-table journey",
      "oil cup overflowing",
      "tears collected in bottle",
      "processional banners"
    ],
    markIdeas: ["harp-line insignia", "refuge-tower crest", "overflowing-cup icon"],
    antiMotifs: ["generic dove", "stock church steeple", "generic halo rays"],
    tone: ["worshipful", "lyrical", "honest", "devotional"]
  },
  {
    key: "proverbs",
    name: "Proverbs",
    aliases: ["prov", "pr", "proverbs"],
    genre: "wisdom",
    motifs: [
      "balanced scales and weights",
      "forked path marker",
      "door hinge and threshold",
      "honeycomb and tongue imagery",
      "city wall with wisdom gate",
      "gold ring in snout proverb image"
    ],
    markIdeas: ["balanced-scales mark", "forked-path icon", "wisdom-gate crest"],
    antiMotifs: ["generic stained glass", "stock praying hands", "generic fish symbol"],
    tone: ["practical", "aphoristic", "discerning", "didactic"]
  },
  {
    key: "ecclesiastes",
    name: "Ecclesiastes",
    aliases: ["eccl", "ecc", "qoheleth", "ecclesiastes"],
    genre: "wisdom",
    motifs: [
      "sundial and drifting shadow",
      "vapor/mist over city",
      "season wheel quadrants",
      "broken cord and fallen lamp",
      "dust returning motif",
      "under-the-sun horizon line"
    ],
    markIdeas: ["season-wheel emblem", "sundial arc icon", "mist-horizon seal"],
    antiMotifs: ["generic dove", "stock church icon", "generic halo rays"],
    tone: ["meditative", "melancholic", "philosophical", "observant"]
  },
  {
    key: "song_of_solomon",
    name: "Song of Solomon",
    aliases: ["song of songs", "song of solomon", "song", "sos", "canticles"],
    genre: "wisdom",
    motifs: [
      "garden lattice and blossoms",
      "pomegranate halves",
      "spice mountain contour",
      "seal over heart wax",
      "foxes among vineyard rows",
      "fragrance jars and oil"
    ],
    markIdeas: ["garden-lattice monogram", "heart-seal icon", "vineyard-fox crest"],
    antiMotifs: ["generic church steeple", "stock halo rays", "generic stained glass"],
    tone: ["intimate", "poetic", "lush", "romantic"]
  },

  {
    key: "isaiah",
    name: "Isaiah",
    aliases: ["isa", "is", "isaiah"],
    genre: "major_prophets",
    motifs: [
      "live coal and tongs",
      "highway in the desert",
      "stump with new shoot",
      "watchman on city wall",
      "nations streaming uphill",
      "sword-forging into plowshare"
    ],
    markIdeas: ["coal-and-tongs emblem", "desert-highway icon", "new-shoot crest"],
    antiMotifs: ["generic fish icon", "stock church clip-art", "generic halo rays"],
    tone: ["majestic", "oracular", "hopeful", "expansive"]
  },
  {
    key: "jeremiah",
    name: "Jeremiah",
    aliases: ["jer", "je", "jeremiah"],
    genre: "major_prophets",
    motifs: [
      "potter wheel shaping clay",
      "almond branch awakening",
      "wooden yoke bars",
      "broken jar at valley gate",
      "cistern pit and rope",
      "letter carried to exiles"
    ],
    markIdeas: ["potter-wheel seal", "almond-branch icon", "yoke-and-letter crest"],
    antiMotifs: ["generic dove", "stock stained glass", "generic sunburst"],
    tone: ["lamenting", "warning", "persistent", "tender"]
  },
  {
    key: "lamentations",
    name: "Lamentations",
    aliases: ["lam", "lament", "lamentations"],
    genre: "major_prophets",
    motifs: [
      "ruined city gates",
      "tears and ash traces",
      "lonely widow silhouette",
      "fallen crown in dust",
      "night watch and hunger",
      "faint candle in ruin"
    ],
    markIdeas: ["ruined-gate emblem", "tears-in-ash icon", "fallen-crown seal"],
    antiMotifs: ["generic fish icon", "stock halo rays", "generic church steeple"],
    tone: ["grieving", "somber", "poetic", "sparse"]
  },
  {
    key: "ezekiel",
    name: "Ezekiel",
    aliases: ["ezek", "eze", "ezk", "ezekiel"],
    genre: "major_prophets",
    motifs: [
      "wheel within wheel geometry",
      "valley of dry bones",
      "measuring reed and temple plan",
      "river from temple threshold",
      "watchman trumpet silhouette",
      "new heart stone-to-flesh motif"
    ],
    markIdeas: ["wheel-geometry insignia", "dry-bones pattern icon", "measuring-reed crest"],
    antiMotifs: ["generic dove", "stock church icon", "generic stained glass"],
    tone: ["visionary", "symbol-dense", "severe", "restorative"]
  },
  {
    key: "daniel",
    name: "Daniel",
    aliases: ["dan", "dn", "daniel"],
    genre: "apocalyptic",
    motifs: [
      "lion den stone enclosure",
      "fiery furnace chamber",
      "handwriting on plaster wall",
      "multi-metal statue fragments",
      "night visions of beasts",
      "sealed prophetic scroll"
    ],
    markIdeas: ["lion-den crest", "furnace-and-wall icon", "statue-fragment insignia"],
    antiMotifs: ["generic church steeple", "stock praying hands", "generic halo rays"],
    tone: ["resolute", "courtly", "visionary", "defiant"]
  },

  {
    key: "hosea",
    name: "Hosea",
    aliases: ["hos", "ho", "hosea"],
    genre: "minor_prophets",
    motifs: [
      "bent wedding ring restored",
      "dew on early blossom",
      "door of hope in valley",
      "healed faithless branch",
      "lion roar over hills",
      "sown-and-harvested names"
    ],
    markIdeas: ["restored-ring icon", "dew-blossom emblem", "door-of-hope seal"],
    antiMotifs: ["generic fish symbol", "stock church icon", "generic stained glass"],
    tone: ["heartbroken", "tender", "corrective", "restoring"]
  },
  {
    key: "joel",
    name: "Joel",
    aliases: ["joel", "jl"],
    genre: "minor_prophets",
    motifs: [
      "locust swarm bands",
      "trumpet on Zion ridge",
      "grain and wine vats emptied",
      "pouring out from above",
      "valley of decision contours",
      "sun-moon darkened disc"
    ],
    markIdeas: ["locust-band insignia", "zion-trumpet icon", "valley-contour crest"],
    antiMotifs: ["generic dove", "stock praying hands", "generic church steeple"],
    tone: ["alarm", "apocalyptic", "repentant", "renewing"]
  },
  {
    key: "amos",
    name: "Amos",
    aliases: ["amos", "am"],
    genre: "minor_prophets",
    motifs: [
      "plumb line drop",
      "basket of summer fruit",
      "roaring lion echo lines",
      "justice river current",
      "collapsed winter house",
      "stars over shepherd fields"
    ],
    markIdeas: ["plumb-line mark", "fruit-basket emblem", "justice-river icon"],
    antiMotifs: ["generic fish symbol", "stock church icon", "generic halo rays"],
    tone: ["blunt", "justice-forward", "rural", "prophetic"]
  },
  {
    key: "obadiah",
    name: "Obadiah",
    aliases: ["obad", "ob", "obadiah"],
    genre: "minor_prophets",
    motifs: [
      "cliff fortress dwellings",
      "falling eagle nest",
      "brother-footprints diverging",
      "mountain courtroom imagery",
      "hidden treasures exposed",
      "kingdom-claim banner"
    ],
    markIdeas: ["cliff-fort emblem", "eagle-nest fall icon", "mountain-court crest"],
    antiMotifs: ["generic dove", "stock stained glass", "generic church steeple"],
    tone: ["brief", "sharp", "judicial", "escalating"]
  },
  {
    key: "jonah",
    name: "Jonah",
    aliases: ["jonah", "jon"],
    genre: "minor_prophets",
    motifs: [
      "storm-tossed ship",
      "great fish curve",
      "city of Nineveh walls",
      "cast lots stones",
      "gourd vine shelter",
      "east wind heat shimmer"
    ],
    markIdeas: ["ship-and-wave badge", "fish-curve icon", "vine-shelter crest"],
    antiMotifs: ["generic church clip-art", "stock halo rays", "generic praying hands"],
    tone: ["ironic", "missionary", "merciful", "confrontational"]
  },
  {
    key: "micah",
    name: "Micah",
    aliases: ["mic", "mc", "micah"],
    genre: "minor_prophets",
    motifs: [
      "watchtower over fields",
      "Bethlehem road marker",
      "mountain courtroom",
      "shepherd staff gathering flock",
      "justice-mercy-humility triad stones",
      "swords recast to tools"
    ],
    markIdeas: ["watchtower-road icon", "triad-stone emblem", "staff-gather crest"],
    antiMotifs: ["generic fish symbol", "stock church steeple", "generic halo rays"],
    tone: ["pastoral", "judicial", "hopeful", "ethical"]
  },
  {
    key: "nahum",
    name: "Nahum",
    aliases: ["nah", "na", "nahum"],
    genre: "minor_prophets",
    motifs: [
      "floodgate burst",
      "shattered shield",
      "lion den emptied",
      "chariot race dust",
      "fortress collapse",
      "city smoke columns"
    ],
    markIdeas: ["floodgate emblem", "shattered-shield icon", "empty-den crest"],
    antiMotifs: ["generic dove", "stock stained glass", "generic sunburst"],
    tone: ["severe", "military", "vengeful", "decisive"]
  },
  {
    key: "habakkuk",
    name: "Habakkuk",
    aliases: ["hab", "hb", "habakkuk"],
    genre: "minor_prophets",
    motifs: [
      "watchpost tower silhouette",
      "fig tree without fruit",
      "running vision tablet",
      "storm clouds over hills",
      "deer-feet-on-heights image",
      "silent temple posture"
    ],
    markIdeas: ["watchpost icon", "vision-tablet emblem", "heights-deer crest"],
    antiMotifs: ["generic fish icon", "stock church steeple", "generic halo rays"],
    tone: ["questioning", "resolute", "musical", "reverent"]
  },
  {
    key: "zephaniah",
    name: "Zephaniah",
    aliases: ["zeph", "zep", "zp", "zephaniah"],
    genre: "minor_prophets",
    motifs: [
      "lamps searching dark streets",
      "storm-day horizon",
      "remnant shelter tent",
      "purified lips coal motif",
      "quiet daughter Zion",
      "gathered exiles banner"
    ],
    markIdeas: ["search-lamp insignia", "remnant-shelter icon", "gathered-banner crest"],
    antiMotifs: ["generic dove", "stock praying hands", "generic stained glass"],
    tone: ["warning", "purifying", "tender", "hopeful"]
  },
  {
    key: "haggai",
    name: "Haggai",
    aliases: ["hag", "hg", "haggai"],
    genre: "minor_prophets",
    motifs: [
      "paneled house vs temple stones",
      "foundation line and plumb",
      "bag with holes image",
      "shaken nations motif",
      "signet ring authority",
      "rebuilding scaffolds"
    ],
    markIdeas: ["foundation-line icon", "signet-ring emblem", "scaffold crest"],
    antiMotifs: ["generic fish symbol", "stock church icon", "generic halo rays"],
    tone: ["practical", "urgent", "constructive", "covenantal"]
  },
  {
    key: "zechariah",
    name: "Zechariah",
    aliases: ["zech", "zec", "zc", "zechariah"],
    genre: "minor_prophets",
    motifs: [
      "lampstand flanked by olive trees",
      "flying scroll",
      "measuring line over city",
      "horse patrol among myrtles",
      "crown of branches",
      "fountain opened motif"
    ],
    markIdeas: ["lampstand-olive seal", "flying-scroll icon", "measuring-line crest"],
    antiMotifs: ["generic church clip-art", "stock stained glass", "generic fish symbol"],
    tone: ["visionary", "encouraging", "symbolic", "rebuilding"]
  },
  {
    key: "malachi",
    name: "Malachi",
    aliases: ["mal", "ml", "malachi"],
    genre: "minor_prophets",
    motifs: [
      "refiner's crucible fire",
      "messenger path marker",
      "storehouse windows opened",
      "scroll of remembrance",
      "healing wings sun-disc",
      "father-child reconciliation knot"
    ],
    markIdeas: ["refiner-crucible icon", "messenger-path emblem", "remembrance-scroll crest"],
    antiMotifs: ["generic dove", "stock church steeple", "generic halo rays"],
    tone: ["confronting", "purifying", "transitional", "hopeful"]
  },

  {
    key: "matthew",
    name: "Matthew",
    aliases: ["matt", "mt", "matthew"],
    genre: "gospels",
    motifs: [
      "mountain teaching terraces",
      "genealogy scroll columns",
      "star over house roofline",
      "tax coin in palm",
      "narrow and wide gate",
      "great commission hillside"
    ],
    markIdeas: ["mountain-scroll emblem", "star-house icon", "dual-gate crest"],
    antiMotifs: ["generic fish symbol", "stock church icon", "generic halo rays"],
    tone: ["teaching", "royal", "structured", "mission-oriented"]
  },
  {
    key: "mark",
    name: "Mark",
    aliases: ["mark", "mk", "mrk"],
    genre: "gospels",
    motifs: [
      "torn temple veil seam",
      "storm boat and command gesture",
      "desert path and sandals",
      "servant towel and basin",
      "crowd-ring around healer",
      "empty tomb dawn stone"
    ],
    markIdeas: ["torn-veil insignia", "storm-boat icon", "servant-basin crest"],
    antiMotifs: ["generic dove", "stock sunburst", "generic church steeple"],
    tone: ["urgent", "kinetic", "stark", "action-driven"]
  },
  {
    key: "luke",
    name: "Luke",
    aliases: ["luke", "lk", "luk"],
    genre: "gospels",
    motifs: [
      "manger and swaddling cloth",
      "good Samaritan roadside scene",
      "lost coin with lamp",
      "Emmaus road table bread",
      "physician kit and scroll",
      "prayerful olive grove"
    ],
    markIdeas: ["lamp-and-coin icon", "road-to-table emblem", "manger-arc crest"],
    antiMotifs: ["generic fish symbol", "stock church clip-art", "generic halo rays"],
    tone: ["compassionate", "story-rich", "inclusive", "pastoral"]
  },
  {
    key: "john",
    name: "John",
    aliases: ["john", "jn", "jhn"],
    genre: "gospels",
    motifs: [
      "light crossing into darkness",
      "word made flesh",
      "lamb of God",
      "cross and empty tomb",
      "true vine and branches",
      "bread of life",
      "wedding water jars",
      "well and bucket at noon",
      "pool colonnade and steps",
      "vine and branches trellis",
      "bread loaves on table"
    ],
    primaryThemes: ["light", "word/incarnation", "cross + empty tomb", "lamb", "true vine", "bread of life"],
    secondaryThemes: ["water", "door", "shepherd", "resurrection/life"],
    sceneMotifs: ["Samaritan well encounter", "well and bucket at noon", "wedding water jars", "pool colonnade and steps"],
    markIdeas: ["light-threshold icon", "water-jar emblem", "vine-trellis crest"],
    antiMotifs: ["generic church steeple", "stock praying hands", "generic stained glass"],
    tone: ["contemplative", "symbolic", "incarnational", "luminous"]
  },
  {
    key: "acts",
    name: "Acts",
    aliases: ["acts", "ac"],
    genre: "acts",
    motifs: [
      "upper-room wind-swept drapery",
      "tongues-like-fire shards",
      "open prison gate and chains",
      "Mediterranean shipwreck timbers",
      "city-to-city mission routes",
      "public square speaking platform"
    ],
    markIdeas: ["wind-and-fire emblem", "open-gate icon", "mission-route crest"],
    antiMotifs: ["generic church clip-art", "stock sunburst", "generic stained glass"],
    tone: ["expansive", "missionary", "public", "bold"]
  },

  {
    key: "romans",
    name: "Romans",
    aliases: ["rom", "ro", "romans"],
    genre: "pauline_epistles",
    motifs: [
      "courtroom verdict seal",
      "olive branch grafting",
      "road milestone to Rome",
      "clay vessel in workshop",
      "adoption papers and seal",
      "renewed-mind blueprint"
    ],
    markIdeas: ["verdict-seal emblem", "grafted-olive icon", "adoption-paper crest"],
    antiMotifs: ["generic dove", "stock church steeple", "generic halo rays"],
    tone: ["systematic", "forensic", "pastoral", "assured"]
  },
  {
    key: "1_corinthians",
    name: "1 Corinthians",
    aliases: [...ordinalAliases(1, "corinthians", ["cor", "co"] )],
    genre: "pauline_epistles",
    motifs: [
      "many-member body diagram",
      "cracked mirror reflection",
      "race track lanes",
      "table loaf and cup setting",
      "builder's foundation lines",
      "resurrection seed and sprout"
    ],
    markIdeas: ["body-lattice emblem", "mirror-crack icon", "foundation-line crest"],
    antiMotifs: ["generic fish symbol", "stock stained glass", "generic halo rays"],
    tone: ["corrective", "communal", "practical", "hopeful"]
  },
  {
    key: "2_corinthians",
    name: "2 Corinthians",
    aliases: [...ordinalAliases(2, "corinthians", ["cor", "co"])],
    genre: "pauline_epistles",
    motifs: [
      "treasure in clay jars",
      "thorn branch silhouette",
      "sealed recommendation letter",
      "tent and eternal house contrast",
      "comforting embrace motif",
      "new-covenant letterform tablets"
    ],
    markIdeas: ["clay-jar insignia", "thorn-and-letter icon", "tent-house crest"],
    antiMotifs: ["generic dove", "stock church icon", "generic sunburst"],
    tone: ["vulnerable", "resilient", "apostolic", "comforting"]
  },
  {
    key: "galatians",
    name: "Galatians",
    aliases: ["gal", "ga", "galatians"],
    genre: "pauline_epistles",
    motifs: [
      "adoption papers with wax seal",
      "broken yoke and chain link",
      "inheritance ledger and signature",
      "crossed-out debt record",
      "family table place settings",
      "letter parchment with seal ribbon"
    ],
    markIdeas: ["broken-yoke icon", "adoption-seal emblem", "inheritance-ledger crest"],
    antiMotifs: ["generic dove", "stock church steeple", "generic halo rays"],
    tone: ["freeing", "familial", "urgent", "clarifying"]
  },
  {
    key: "ephesians",
    name: "Ephesians",
    aliases: ["eph", "ep", "ephesians"],
    genre: "pauline_epistles",
    motifs: [
      "armor pieces arranged",
      "one-body woven lattice",
      "cornerstone and fitted stones",
      "mystery scroll with key",
      "household doorway alignment",
      "heavenly-height depth grid"
    ],
    markIdeas: ["armor-shield crest", "cornerstone-lattice icon", "key-scroll emblem"],
    antiMotifs: ["generic fish symbol", "stock stained glass", "generic sunburst"],
    tone: ["lofty", "structural", "unifying", "doxological"]
  },
  {
    key: "philippians",
    name: "Philippians",
    aliases: ["phil", "php", "philippians"],
    genre: "pauline_epistles",
    motifs: [
      "prison chains loosened",
      "citizenship passport seal",
      "joy letter from confinement",
      "partnership rope knots",
      "race finish line",
      "poured-out offering cup"
    ],
    markIdeas: ["joy-letter icon", "passport-seal emblem", "race-line crest"],
    antiMotifs: ["generic dove", "stock church steeple", "generic halo rays"],
    tone: ["joyful", "steady", "partnership-oriented", "courageous"]
  },
  {
    key: "colossians",
    name: "Colossians",
    aliases: ["col", "co", "colossians"],
    genre: "pauline_epistles",
    motifs: [
      "rooted tree over stone base",
      "household instruction tablets",
      "new-self garment exchange",
      "fullness constellation ring",
      "thankful song scroll",
      "peace-rule boundary line"
    ],
    markIdeas: ["rooted-cornerstone icon", "garment-exchange emblem", "fullness-ring crest"],
    antiMotifs: ["generic fish symbol", "stock stained glass", "generic sunburst"],
    tone: ["christ-centered", "stabilizing", "formative", "ordered"]
  },
  {
    key: "1_thessalonians",
    name: "1 Thessalonians",
    aliases: [...ordinalAliases(1, "thessalonians", ["thess", "thes", "th"])],
    genre: "pauline_epistles",
    motifs: [
      "watchful night lantern",
      "trumpet horizon signal",
      "laboring hands and tools",
      "helmet and breastplate of hope",
      "imitating footsteps",
      "encouraging letter courier"
    ],
    markIdeas: ["night-lantern icon", "hope-armor emblem", "trumpet-horizon crest"],
    antiMotifs: ["generic dove", "stock church icon", "generic halo rays"],
    tone: ["encouraging", "watchful", "communal", "steadfast"]
  },
  {
    key: "2_thessalonians",
    name: "2 Thessalonians",
    aliases: [...ordinalAliases(2, "thessalonians", ["thess", "thes", "th"])],
    genre: "pauline_epistles",
    motifs: [
      "authenticating signature line",
      "steadfast pillar in wind",
      "lawlessness warning seals",
      "patient harvest rhythm",
      "discipline workbench",
      "comforting prayer posture"
    ],
    markIdeas: ["signature-seal icon", "steadfast-pillar emblem", "workbench crest"],
    antiMotifs: ["generic fish symbol", "stock church steeple", "generic sunburst"],
    tone: ["corrective", "steady", "watchful", "pastoral"]
  },
  {
    key: "1_timothy",
    name: "1 Timothy",
    aliases: [...ordinalAliases(1, "timothy", ["tim", "ti"])],
    genre: "pauline_epistles",
    motifs: [
      "household-of-God blueprint",
      "teaching scroll stack",
      "good fight shield",
      "example footsteps",
      "elders and hands motif",
      "guarded deposit chest"
    ],
    markIdeas: ["blueprint-house emblem", "shield-and-scroll icon", "deposit-chest crest"],
    antiMotifs: ["generic dove", "stock stained glass", "generic halo rays"],
    tone: ["pastoral", "instructional", "protective", "orderly"]
  },
  {
    key: "2_timothy",
    name: "2 Timothy",
    aliases: [...ordinalAliases(2, "timothy", ["tim", "ti"])],
    genre: "pauline_epistles",
    motifs: [
      "torch relay from mentor to apprentice",
      "soldier-athlete-farmer triad",
      "chain and parchment",
      "winter cloak and scroll bundle",
      "finishing-race lane",
      "fanned gift ember"
    ],
    markIdeas: ["torch-relay icon", "triad-emblem crest", "chain-parchment seal"],
    antiMotifs: ["generic fish symbol", "stock church icon", "generic sunburst"],
    tone: ["valedictory", "resolute", "mentor-like", "faithful"]
  },
  {
    key: "titus",
    name: "Titus",
    aliases: ["titus", "tit"],
    genre: "pauline_epistles",
    motifs: [
      "Crete island route sketch",
      "household-order columns",
      "good-works toolkit",
      "washing basin renewal",
      "healthy teaching scroll",
      "leadership appointment tablet"
    ],
    markIdeas: ["island-route emblem", "column-order icon", "renewal-basin crest"],
    antiMotifs: ["generic dove", "stock stained glass", "generic halo rays"],
    tone: ["pragmatic", "pastoral", "structured", "clarifying"]
  },
  {
    key: "philemon",
    name: "Philemon",
    aliases: ["phlm", "phm", "philemon"],
    genre: "pauline_epistles",
    motifs: [
      "reconciled handshake over letter",
      "broken chain link repaired",
      "house church doorway",
      "appeal with wax seal",
      "brotherhood table setting",
      "debt ledger rewritten"
    ],
    markIdeas: ["reconciled-hand icon", "sealed-appeal emblem", "rewritten-ledger crest"],
    antiMotifs: ["generic fish symbol", "stock church steeple", "generic halo rays"],
    tone: ["personal", "reconciling", "gentle", "ethical"]
  },

  {
    key: "hebrews",
    name: "Hebrews",
    aliases: ["heb", "he", "hebrews"],
    genre: "general_epistles",
    motifs: [
      "tabernacle veil and inner room",
      "anchor within veil",
      "better covenant scroll",
      "priestly shadow and substance",
      "mountain of trembling vs joy",
      "cloud of witnesses track"
    ],
    markIdeas: ["anchor-veil emblem", "covenant-scroll icon", "witness-track crest"],
    antiMotifs: ["generic dove", "stock church icon", "generic stained glass"],
    tone: ["elevated", "theological", "enduring", "assured"]
  },
  {
    key: "james",
    name: "James",
    aliases: ["jas", "jm", "james"],
    genre: "general_epistles",
    motifs: [
      "mirror test motif",
      "bridle and rudder pair",
      "rich and poor seating contrast",
      "fig and olive branch logic",
      "prayer for rain clouds",
      "faith-and-works workshop"
    ],
    markIdeas: ["mirror-rudder icon", "branch-pair emblem", "workshop-crest"],
    antiMotifs: ["generic fish symbol", "stock church steeple", "generic halo rays"],
    tone: ["practical", "ethical", "direct", "communal"]
  },
  {
    key: "1_peter",
    name: "1 Peter",
    aliases: [...ordinalAliases(1, "peter", ["pet", "pe"])],
    genre: "general_epistles",
    motifs: [
      "exile route map pins",
      "living stones fitted together",
      "fiery trial furnace",
      "shepherd-staff and flock path",
      "baptism waters and ark echo",
      "imperishable inheritance seal"
    ],
    markIdeas: ["living-stones icon", "exile-route emblem", "inheritance-seal crest"],
    antiMotifs: ["generic dove", "stock church icon", "generic stained glass"],
    tone: ["steadfast", "diaspora-aware", "hopeful", "resilient"]
  },
  {
    key: "2_peter",
    name: "2 Peter",
    aliases: [...ordinalAliases(2, "peter", ["pet", "pe"])],
    genre: "general_epistles",
    motifs: [
      "lamp in dark place",
      "mountain eyewitness dawn",
      "distorted-scroll warnings",
      "virtue chain links",
      "daybreak star horizon",
      "wind-driven cloud contrast"
    ],
    markIdeas: ["dark-lamp icon", "virtue-chain emblem", "daybreak-star crest"],
    antiMotifs: ["generic fish symbol", "stock halo rays", "generic church steeple"],
    tone: ["warning", "watchful", "clarifying", "steadfast"]
  },
  {
    key: "1_john",
    name: "1 John",
    aliases: [...ordinalAliases(1, "john", ["jn"])],
    genre: "general_epistles",
    motifs: [
      "light and darkness threshold",
      "abiding vine braid",
      "anointing oil drop",
      "test-the-spirits balance",
      "family language circles",
      "bold approach pathway"
    ],
    markIdeas: ["light-threshold icon", "abiding-vine emblem", "balance-and-oil crest"],
    antiMotifs: ["generic church clip-art", "stock stained glass", "generic sunburst"],
    tone: ["pastoral", "assuring", "binary", "relational"]
  },
  {
    key: "2_john",
    name: "2 John",
    aliases: [...ordinalAliases(2, "john", ["jn"])],
    genre: "general_epistles",
    motifs: [
      "walking-in-truth pathway",
      "elder letter seal",
      "household hospitality doorway",
      "boundary against deceivers",
      "love-and-truth braid",
      "short letter fold"
    ],
    markIdeas: ["truth-path icon", "elder-seal emblem", "doorway-boundary crest"],
    antiMotifs: ["generic fish symbol", "stock church steeple", "generic halo rays"],
    tone: ["brief", "protective", "affectionate", "discerning"]
  },
  {
    key: "3_john",
    name: "3 John",
    aliases: [...ordinalAliases(3, "john", ["jn"])],
    genre: "general_epistles",
    motifs: [
      "traveling missionary satchel",
      "hospitality table open seat",
      "faithful witness scroll",
      "conflict in house church",
      "walking in truth footprints",
      "ink and quill closing line"
    ],
    markIdeas: ["open-seat icon", "witness-scroll emblem", "footprints crest"],
    antiMotifs: ["generic dove", "stock stained glass", "generic church clip-art"],
    tone: ["personal", "supportive", "confronting", "pastoral"]
  },
  {
    key: "jude",
    name: "Jude",
    aliases: ["jude", "jud"],
    genre: "general_epistles",
    motifs: [
      "contending shield",
      "rescue-from-fire tongs",
      "hidden reef hazard map",
      "wandering star trails",
      "boundary stones kept",
      "doxology ascent arc"
    ],
    markIdeas: ["contending-shield icon", "rescue-tongs emblem", "reef-map crest"],
    antiMotifs: ["generic fish symbol", "stock church steeple", "generic halo rays"],
    tone: ["urgent", "protective", "combative", "worshipful"]
  },
  {
    key: "revelation",
    name: "Revelation",
    aliases: ["rev", "re", "revelation", "apocalypse"],
    genre: "apocalyptic",
    motifs: [
      "seven lampstands array",
      "sealed scroll and broken seals",
      "trumpets and bowls sequence",
      "throne rainbow ring",
      "new Jerusalem cube geometry",
      "tree-of-life river city"
    ],
    markIdeas: ["lampstand-array icon", "sealed-scroll emblem", "city-cube crest"],
    antiMotifs: ["generic church clip-art", "stock fish icon", "generic stained glass"],
    tone: ["visionary", "symbol-dense", "cosmic", "victorious"]
  }
];

function splitMotifsIntoThemeBuckets(entry: MotifBankEntrySeed): {
  primaryThemes: string[];
  secondaryThemes: string[];
  sceneMotifs: string[];
} {
  const motifs = uniqueStrings(entry.motifs);
  const fallbackPrimary = motifs.slice(0, 3);
  const fallbackSecondary = motifs.slice(3, 5);
  const fallbackScenes = motifs.slice(5);
  return {
    primaryThemes: uniqueStrings(entry.primaryThemes && entry.primaryThemes.length > 0 ? entry.primaryThemes : fallbackPrimary),
    secondaryThemes: uniqueStrings(
      entry.secondaryThemes && entry.secondaryThemes.length > 0 ? entry.secondaryThemes : fallbackSecondary
    ),
    sceneMotifs: uniqueStrings(entry.sceneMotifs && entry.sceneMotifs.length > 0 ? entry.sceneMotifs : fallbackScenes)
  };
}

const MOTIF_BANK_ENTRIES: MotifBankEntry[] = MOTIF_BANK_ENTRY_SEEDS.map((entry) => {
  const buckets = splitMotifsIntoThemeBuckets(entry);
  return {
    ...entry,
    motifs: uniqueStrings(entry.motifs),
    primaryThemes: buckets.primaryThemes,
    secondaryThemes: buckets.secondaryThemes,
    sceneMotifs: buckets.sceneMotifs
  };
});

export const BIBLE_MOTIF_BANK: Record<string, MotifBankEntry> = Object.fromEntries(
  MOTIF_BANK_ENTRIES.map((entry) => [entry.key, entry])
) as Record<string, MotifBankEntry>;

const TOPICAL_MOTIF_BANK_ENTRIES: TopicalMotifBankEntry[] = [
  {
    key: "advent",
    displayName: "Advent",
    keywords: ["advent", "arrival", "watch", "waiting", "prepare the way", "advent hope", "advent peace"],
    motifs: [
      "advent wreath ring with progressive candle heights",
      "night-watch lantern line",
      "roadway to city gate at dusk",
      "starlit horizon over a ridgeline",
      "violet fabric bands and knotwork",
      "calendar-window countdown grid"
    ],
    markIdeas: ["wreath-ring monoline seal", "watch-lantern glyph", "starlit-path crest"],
    antiMotifs: ["cartoon nativity cutout", "clipart manger silhouette", "generic sunburst rays", "Santa imagery"],
    tone: "expectant, restrained, watchful",
    allowedGenericMotifs: ["star"]
  },
  {
    key: "christmas",
    displayName: "Christmas",
    keywords: ["christmas", "nativity", "incarnation", "emmanuel", "bethlehem", "christmas eve"],
    motifs: [
      "timber-beam stable geometry",
      "swaddling cloth folds",
      "window-candle glow in winter dark",
      "caravan footprints crossing ridge terrain",
      "night sky with single guiding light",
      "woven cloth and wood-grain textures"
    ],
    markIdeas: ["stable-beam monogram", "cloth-fold emblem", "guiding-light medallion"],
    antiMotifs: ["cartoon baby icon", "holiday ornament kitsch", "candy-cane styling", "generic halo clipart"],
    tone: "warm, intimate, reverent",
    allowedGenericMotifs: ["star"]
  },
  {
    key: "epiphany",
    displayName: "Epiphany",
    keywords: ["epiphany", "magi", "wise men", "manifestation", "epiphany sunday", "visit of the magi"],
    motifs: [
      "desert caravan linework",
      "gift caskets with distinct materials",
      "celestial route map",
      "threshold doorway with light spill",
      "crown-bearing travelers in silhouette blocks",
      "night-sky triangulation marks"
    ],
    markIdeas: ["caravan-route insignia", "gift-casket icon set", "light-threshold crest"],
    antiMotifs: ["three-cartoon-kings icon", "sparkle clipart", "generic sunburst halo", "stock church steeple"],
    tone: "revealing, global, processional",
    allowedGenericMotifs: ["star"]
  },
  {
    key: "lent",
    displayName: "Lent",
    keywords: ["lent", "repentance", "ashes", "wilderness", "forty days", "penitence"],
    motifs: [
      "ash-smudged linen texture",
      "wilderness contour path",
      "earthen jar and torn sackcloth weave",
      "bare branch silhouette",
      "stone-and-dust gradient",
      "stripped altar textile bands"
    ],
    markIdeas: ["ash-circle seal", "wilderness-line emblem", "linen-knot icon"],
    antiMotifs: ["cartoon ash cross", "generic dove icon", "sunburst revival graphic", "stock stained glass"],
    tone: "sober, sparse, introspective"
  },
  {
    key: "holy_week",
    displayName: "Holy Week",
    keywords: ["holy week", "palm sunday", "maundy thursday", "good friday", "gethsemane", "passion week"],
    motifs: [
      "palm branch shadows on stone",
      "upper-room table runner and cup set",
      "oil-press grove contour",
      "courtyard firelight and gate lattice",
      "torn curtain fabric edge",
      "pathway from garden to city wall"
    ],
    markIdeas: ["palm-and-path crest", "upper-room table seal", "curtain-rend monogram"],
    antiMotifs: ["cartoon palm frond", "blood-drip clipart", "generic church icon", "over-rendered crown of thorns"],
    tone: "dramatic, contemplative, processional"
  },
  {
    key: "easter",
    displayName: "Easter",
    keywords: ["easter", "easter sunday", "risen", "resurrection sunday", "he is risen"],
    motifs: [
      "garden path at first light",
      "stone-hewn doorway without obstruction",
      "linen cloth folds left behind",
      "dew-lit olive grove",
      "messenger-footsteps from tomb garden",
      "broken-seal stone surface texture"
    ],
    markIdeas: ["garden-threshold emblem", "rolled-stone medallion", "linen-fold icon"],
    antiMotifs: ["cross-and-sunrise cliché", "cartoon empty tomb", "generic dove clipart", "egg-hunt styling"],
    tone: "joyful, luminous, grounded",
    allowedGenericMotifs: ["empty tomb", "stone rolled away"]
  },
  {
    key: "resurrection",
    displayName: "Resurrection",
    keywords: ["resurrection", "risen christ", "new life", "victory over death", "alive again"],
    motifs: [
      "sealed stone displaced from doorway",
      "linen wrap collapsed on stone bench",
      "garden horizon with low-angle light",
      "grave-hewn chamber geometry",
      "footprints moving outward from tomb",
      "seed-to-sprout progression marks"
    ],
    markIdeas: ["displaced-stone icon", "outward-footprint seal", "seed-to-sprout crest"],
    antiMotifs: ["cross + sunrise stock art", "clipart radiant jesus silhouette", "generic halo rays"],
    tone: "triumphant, clear, embodied",
    allowedGenericMotifs: ["empty tomb", "stone rolled away"]
  },
  {
    key: "pentecost",
    displayName: "Pentecost",
    keywords: ["pentecost", "acts 2", "spirit poured out", "tongues", "upper room", "many languages"],
    motifs: [
      "wind-swept drapery lines",
      "multi-language script fragments arranged in rings",
      "upper-room window shutters thrown open",
      "city crowd pathways radiating from one house",
      "air-current contour lines",
      "signal-flare stroke accents (non-cartoon)"
    ],
    markIdeas: ["wind-current monogram", "language-ring seal", "open-window crest"],
    antiMotifs: ["cartoon fire emoji look", "clipart dove", "generic revival flames", "stock church steeple"],
    tone: "kinetic, public, unifying",
    allowedGenericMotifs: ["flame", "wind", "tongues of fire"]
  },
  {
    key: "trinity",
    displayName: "Trinity",
    keywords: ["trinity", "triune", "father son spirit", "three in one", "godhead"],
    motifs: [
      "interlocking-circle knotwork",
      "threefold braid ribbon",
      "triadic orbit lines",
      "three-source light convergence",
      "nested equilateral frames",
      "tri-part wave cadence"
    ],
    markIdeas: ["interlocking-knot emblem", "triadic-orbit mark", "threefold braid seal"],
    antiMotifs: ["triangle-with-eye clipart", "cartoon shamrock", "generic dove/flame combo", "sunburst rays"],
    tone: "mysterious, balanced, theological"
  },
  {
    key: "prayer",
    displayName: "Prayer",
    keywords: ["prayer", "intercession", "supplication", "pray", "prayer night", "house of prayer"],
    motifs: [
      "watch-hour candle and shadow arc",
      "journal-margin petition lines",
      "quiet room doorway at night",
      "prayer-wall note collage",
      "kneeler wood-grain block",
      "rope-knot reminder cord"
    ],
    markIdeas: ["watch-candle icon", "petition-scroll seal", "doorway-at-night crest"],
    antiMotifs: ["praying-hands clipart", "generic raised hands", "stock dove symbol", "church steeple icon"],
    tone: "focused, intimate, persistent"
  },
  {
    key: "fasting",
    displayName: "Fasting",
    keywords: ["fasting", "fast", "hunger", "abstinence", "deny yourself"],
    motifs: [
      "empty place setting with folded napkin",
      "hourglass silhouette",
      "wilderness water jar with measured marks",
      "simple bowl and cloth",
      "weight-balance scale",
      "day-count hash marks"
    ],
    markIdeas: ["empty-table glyph", "hourglass emblem", "measured-jar crest"],
    antiMotifs: ["diet-brand visuals", "body transformation imagery", "generic halo rays", "church clipart"],
    tone: "disciplined, clear, quiet"
  },
  {
    key: "worship",
    displayName: "Worship",
    keywords: ["worship", "adoration", "praise", "doxology", "glory to god"],
    motifs: [
      "choral score fragments",
      "sanctuary beam geometry",
      "processional banner textiles",
      "drum-skin and string vibrations",
      "gathered-circle floor plan",
      "lifted-voice waveform bands"
    ],
    markIdeas: ["choral-stave emblem", "processional-banner icon", "gathered-circle crest"],
    antiMotifs: ["generic raised-hands silhouette", "concert-stage clichés", "stock church steeple"],
    tone: "celebratory, reverent, communal"
  },
  {
    key: "lament",
    displayName: "Lament",
    keywords: ["lament", "grief", "sorrow", "weeping", "how long"],
    motifs: [
      "torn paper seams",
      "rain-washed stone texture",
      "bent reed silhouette",
      "night watchtower horizon",
      "broken pottery shards",
      "ink bleed and erasure marks"
    ],
    markIdeas: ["torn-seam mark", "bent-reed emblem", "watchtower-night seal"],
    antiMotifs: ["forced happy color palette", "generic smiling church icon", "sunburst triumphalism"],
    tone: "honest, weighty, raw"
  },
  {
    key: "suffering",
    displayName: "Suffering",
    keywords: ["suffering", "trial", "perseverance", "hardship", "affliction", "endurance"],
    motifs: [
      "cracked stone strata",
      "rope under tension",
      "storm-battered doorway",
      "bandaged timber texture",
      "furnace glow behind iron grating",
      "worn pathway switchbacks"
    ],
    markIdeas: ["tension-rope icon", "cracked-strata crest", "storm-door emblem"],
    antiMotifs: ["cheap grit overlays", "generic crown glory icon", "clipart dove"],
    tone: "stubborn, sober, resilient"
  },
  {
    key: "hope",
    displayName: "Hope",
    keywords: ["hope", "future", "promise", "restoration", "new dawn", "confident expectation"],
    motifs: [
      "seedling through cracked ground",
      "horizon line with lifting fog",
      "repaired wall seam",
      "bridge span over ravine",
      "lantern on a ridge path",
      "blueprint-to-built transition"
    ],
    markIdeas: ["bridge-span mark", "seedling-through-stone icon", "lantern-ridge seal"],
    antiMotifs: ["generic sunrise burst", "motivational stock typography", "cartoon rainbow"],
    tone: "steady, forward-looking, bright"
  },
  {
    key: "gospel",
    displayName: "Gospel",
    keywords: ["gospel", "good news", "what is the gospel", "kingdom announcement"],
    motifs: [
      "royal proclamation scroll",
      "city herald pathway",
      "open gate and road convergence",
      "table invitation setting",
      "seal broken on public decree",
      "news-banner ribbon forms"
    ],
    markIdeas: ["proclamation-scroll crest", "open-gate emblem", "herald-path icon"],
    antiMotifs: ["generic cross logo", "stock fish symbol", "clipart bible icon", "church building silhouette"],
    tone: "public, clarifying, invitational"
  },
  {
    key: "salvation",
    displayName: "Salvation",
    keywords: ["salvation", "saved", "rescue", "deliverance", "redeemed"],
    motifs: [
      "rescue rope and anchor point",
      "open prison gate",
      "storm shelter threshold",
      "pulled-from-water line marks",
      "ransom document seal",
      "breakwater wall geometry"
    ],
    markIdeas: ["open-gate symbol", "rescue-rope emblem", "breakwater crest"],
    antiMotifs: ["cartoon life-preserver", "generic halo rays", "stock dove icon"],
    tone: "urgent, relieving, strong"
  },
  {
    key: "grace",
    displayName: "Grace",
    keywords: ["grace", "undeserved favor", "gift", "mercy", "gift not earned"],
    motifs: [
      "unwrapped gift cloth",
      "ledger with debt crossed out",
      "open hand receiving contract",
      "river over dry ground",
      "broken chain links",
      "welcome-table seat card"
    ],
    markIdeas: ["crossed-ledger icon", "gift-cloth medallion", "welcome-seat crest"],
    antiMotifs: ["cheap glitter effects", "generic halo burst", "stock praying hands"],
    tone: "generous, freeing, tender"
  },
  {
    key: "justification",
    displayName: "Justification",
    keywords: ["justification", "declared righteous", "imputed righteousness", "courtroom", "verdict"],
    motifs: [
      "courtroom docket stamp",
      "signed acquittal decree",
      "sealed legal parchment",
      "scales balanced and stabilized",
      "cancelled debt ledger",
      "family adoption papers"
    ],
    markIdeas: ["verdict-stamp icon", "balanced-scales crest", "sealed-decree monogram"],
    antiMotifs: ["gavel clipart", "generic church steeple", "sunburst redemption rays"],
    tone: "legal, clear, relieving"
  },
  {
    key: "discipleship",
    displayName: "Discipleship",
    keywords: ["discipleship", "follow jesus", "apprenticeship", "follow me", "formation"],
    motifs: [
      "footsteps on roadside dust",
      "rabbi bench and scroll",
      "mentor-circle seating plan",
      "daily practice checklist lines",
      "rope and yoke pairing",
      "path markers at intervals"
    ],
    markIdeas: ["footstep-path icon", "mentor-circle seal", "practice-checklist crest"],
    antiMotifs: ["generic fish icon", "stock church building", "clipart shepherd/lamb"],
    tone: "formational, practical, steady"
  },
  {
    key: "spiritual_disciplines",
    displayName: "Spiritual Disciplines",
    keywords: ["spiritual disciplines", "rule of life", "practice", "habit", "formation rhythms"],
    motifs: [
      "rule-of-life wheel segments",
      "daily rhythm timetable",
      "journal and margin symbols",
      "quiet-room stool and lamp",
      "breath cadence linework",
      "weekly cycle rings"
    ],
    markIdeas: ["rhythm-wheel icon", "rule-of-life seal", "cadence-line crest"],
    antiMotifs: ["self-help infographic clichés", "generic sunburst", "stock praying hands"],
    tone: "ordered, patient, intentional"
  },
  {
    key: "mission",
    displayName: "Mission",
    keywords: ["mission", "sent people", "city mission", "global mission", "missional"],
    motifs: [
      "route map from center to edges",
      "sent-envelope and stamp texture",
      "city district grid overlay",
      "harbor departure markers",
      "doorway-to-street transition",
      "trail markers branching outward"
    ],
    markIdeas: ["route-map emblem", "sent-stamp icon", "street-threshold crest"],
    antiMotifs: ["airplane clipart", "generic globe-with-cross", "stock church icon"],
    tone: "outward, active, public"
  },
  {
    key: "evangelism",
    displayName: "Evangelism",
    keywords: ["evangelism", "share your faith", "witness", "proclaim", "good news sharing"],
    motifs: [
      "public square speech platform",
      "conversation table across two chairs",
      "invitation card stack",
      "open-mic stand silhouette",
      "door-knock pattern marks",
      "word-seed packets"
    ],
    markIdeas: ["invitation-card icon", "conversation-table seal", "public-square crest"],
    antiMotifs: ["megaphone clipart", "aggressive street-sign graphics", "generic fish icon"],
    tone: "clear, relational, confident"
  },
  {
    key: "ecclesiology",
    displayName: "Ecclesiology",
    keywords: ["ecclesiology", "doctrine of the church", "church identity", "body of christ"],
    motifs: [
      "interlocked-stone structure",
      "household table clusters",
      "many-member one-body diagram",
      "gathering circle floorplan",
      "shared burdens rope weave",
      "cornerstone alignment lines"
    ],
    markIdeas: ["interlocked-stone emblem", "one-body network icon", "cornerstone crest"],
    antiMotifs: ["generic church-building clipart", "denominational logo mimicry", "sunburst halo rays"],
    tone: "communal, doctrinal, durable"
  },
  {
    key: "church",
    displayName: "Church",
    keywords: ["local church", "church family", "congregation", "gathered church", "church membership"],
    motifs: [
      "shared table arrangement",
      "house-to-house map nodes",
      "doorway lit from within",
      "woven threads from many strands",
      "stacked chairs in a circle",
      "community noticeboard layers"
    ],
    markIdeas: ["house-network icon", "woven-strands seal", "circle-table crest"],
    antiMotifs: ["default steeple icon", "stock stained glass clipart", "generic fish badge"],
    tone: "relational, local, gathered"
  },
  {
    key: "community",
    displayName: "Community",
    keywords: ["community", "belonging", "one another", "hospitality", "fellowship"],
    motifs: [
      "long-table place settings",
      "overlapping name cards",
      "shared bench silhouettes",
      "woven basket pattern",
      "doorstep welcome mat texture",
      "neighborhood block map"
    ],
    markIdeas: ["long-table icon", "woven-basket emblem", "neighbor-block crest"],
    antiMotifs: ["group selfie aesthetic", "stock handshake icon", "generic church silhouette"],
    tone: "warm, hospitable, practical"
  },
  {
    key: "unity",
    displayName: "Unity",
    keywords: ["unity", "one body", "reconciliation", "peace with one another", "church unity"],
    motifs: [
      "braided strands becoming one rope",
      "joined arch stones",
      "merged path lines",
      "quilt patchwork composition",
      "bridge joining two banks",
      "circular table with equal spacing"
    ],
    markIdeas: ["braided-rope mark", "joined-arch emblem", "bridge-circle crest"],
    antiMotifs: ["uniformity imagery", "national flag mashups", "generic dove clipart"],
    tone: "reconciled, cohesive, hopeful"
  },
  {
    key: "stewardship",
    displayName: "Stewardship",
    keywords: ["stewardship", "manage", "entrusted", "faithful with resources", "time talent treasure"],
    motifs: [
      "ledger and allocation columns",
      "seed packets sorted by season",
      "tool rack and maintenance marks",
      "storehouse bins with labels",
      "calendar stewardship blocks",
      "keys on a steward ring"
    ],
    markIdeas: ["ledger-grid icon", "storehouse crest", "steward-key emblem"],
    antiMotifs: ["money-sign clipart", "prosperity gospel visuals", "generic halo rays"],
    tone: "responsible, practical, faithful"
  },
  {
    key: "generosity",
    displayName: "Generosity",
    keywords: ["generosity", "giving", "openhanded", "offerings", "share"],
    motifs: [
      "overflowing basket weave",
      "open table with extra place settings",
      "distribution route map",
      "gift parcels stacked for dispatch",
      "storehouse door opened outward",
      "grain sack ties released"
    ],
    markIdeas: ["open-basket icon", "distribution-route seal", "open-door storehouse crest"],
    antiMotifs: ["charity-thermometer graphic", "dollar-sign clipart", "generic church icon"],
    tone: "open, joyful, abundant"
  },
  {
    key: "baptism",
    displayName: "Baptism",
    keywords: ["baptism", "baptize", "buried and raised", "water of baptism", "new believer"],
    motifs: [
      "riverbank entry steps",
      "waterline ripple rings",
      "garment-change fold on shore",
      "descending and ascending path arrows",
      "shoreline stones",
      "immersion basin geometry"
    ],
    markIdeas: ["ripple-ring emblem", "river-step icon", "shoreline-stone crest"],
    antiMotifs: ["cartoon water drop", "generic dove over water", "cross-in-wave clipart"],
    tone: "public, covenantal, celebratory"
  },
  {
    key: "lords_supper",
    displayName: "Lord's Supper",
    keywords: ["lords supper", "lord's supper", "communion", "table", "bread and cup", "eucharist"],
    motifs: [
      "broken loaf texture",
      "shared cup circle arrangement",
      "tablecloth fold lines",
      "grain and vine pairing",
      "upper-room table geometry",
      "serving tray path"
    ],
    markIdeas: ["broken-loaf seal", "cup-circle icon", "tablecloth-fold crest"],
    antiMotifs: ["cartoon chalice icon", "stock communion clipart", "generic sunburst backdrop"],
    tone: "sacramental, communal, solemn"
  },
  {
    key: "wisdom",
    displayName: "Wisdom",
    keywords: ["wisdom", "wise", "understanding", "prudence", "discernment"],
    motifs: [
      "sundial shadow arc",
      "measuring line and plumb reference",
      "craft bench tools",
      "inked proverb margins",
      "city gate decision scene",
      "forking path marker"
    ],
    markIdeas: ["sundial mark", "forking-path icon", "measure-line crest"],
    antiMotifs: ["owl mascot cliché", "generic halo rays", "stock open-bible icon"],
    tone: "measured, practical, reflective"
  },
  {
    key: "proverbs_style",
    displayName: "Proverbs Style",
    keywords: ["proverbs", "proverb", "sayings", "wise sayings", "proverbs style"],
    motifs: [
      "paired-path contrast panels",
      "weight and measure symbols",
      "door hinge and threshold",
      "honeycomb pattern and ant-trail lines",
      "craftsman tools on table",
      "speech scroll ribbons"
    ],
    markIdeas: ["paired-path emblem", "honeycomb-line icon", "threshold-hinge crest"],
    antiMotifs: ["fortune-cookie styling", "generic sunburst wisdom glow", "stock church icon"],
    tone: "sharp, contrast-driven, instructional"
  },
  {
    key: "psalms_theme",
    displayName: "Psalms Theme",
    keywords: ["psalms", "psalm", "songs", "praise and lament", "book of psalms"],
    motifs: [
      "lyre string harmonics",
      "mountain refuge silhouette",
      "river-and-tree meditative scene",
      "night watchtower with dawn edge",
      "tear-and-joy dual texture panel",
      "processional banner and drum traces"
    ],
    markIdeas: ["lyre-wave icon", "refuge-mountain seal", "night-to-dawn crest"],
    antiMotifs: ["musical-note clipart", "generic dove icon", "sunburst worship rays"],
    tone: "poetic, honest, worshipful"
  },
  {
    key: "vision_sunday",
    displayName: "Vision Sunday",
    keywords: ["vision sunday", "future direction", "where we are going", "church vision", "year ahead focus"],
    motifs: [
      "horizon map with destination pins",
      "construction blueprint overlays",
      "milestone markers on a route",
      "city block before-and-after plan",
      "north-star navigation grid",
      "projected skyline linework"
    ],
    markIdeas: ["route-milestone crest", "blueprint monogram", "navigation-grid emblem"],
    antiMotifs: ["corporate startup clichés", "stock target icon", "generic church building clipart"],
    tone: "forward, concrete, strategic"
  },
  {
    key: "values",
    displayName: "Values",
    keywords: ["values", "core values", "church dna", "culture", "foundational values"],
    motifs: [
      "pillar columns with labels",
      "foundation stone courses",
      "woven DNA-like thread bands",
      "constellation points linked by lines",
      "engraved charter plaque",
      "compass rose and anchor ring"
    ],
    markIdeas: ["pillar-stack icon", "charter-plaque crest", "constellation-values seal"],
    antiMotifs: ["corporate icon pack look", "generic church steeple", "clipart heart-hands"],
    tone: "defining, rooted, clear"
  },
  {
    key: "roadmap",
    displayName: "Roadmap",
    keywords: ["roadmap", "next steps", "timeline", "path forward", "milestones", "strategic roadmap"],
    motifs: [
      "timeline bar with milestone nodes",
      "route-switchback topography",
      "construction phases board",
      "bridge from current to future state",
      "calendar-quarter blocks",
      "guidepost arrows at trail forks"
    ],
    markIdeas: ["milestone-line icon", "switchback-route crest", "guidepost emblem"],
    antiMotifs: ["corporate gantt-chart literalism", "generic startup rocket icon", "stock church logo"],
    tone: "sequenced, practical, directional"
  }
];

export const TOPICAL_MOTIF_BANK: Record<string, TopicalMotifBankEntry> = Object.fromEntries(
  TOPICAL_MOTIF_BANK_ENTRIES.map((entry) => [entry.key, entry])
) as Record<string, TopicalMotifBankEntry>;

const TOPIC_ORDER = TOPICAL_MOTIF_BANK_ENTRIES.map((entry) => entry.key);
const TOPIC_ORDER_INDEX = new Map(TOPIC_ORDER.map((key, index) => [key, index]));
const SEASONAL_TOPIC_KEYS = new Set<string>([
  "advent",
  "christmas",
  "epiphany",
  "lent",
  "holy_week",
  "easter",
  "resurrection",
  "pentecost"
]);

const BOOK_ORDER = MOTIF_BANK_ENTRIES.map((entry) => entry.key);
const BOOK_ORDER_INDEX = new Map(BOOK_ORDER.map((key, index) => [key, index]));

function normalizeLookupValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\bfirst\b/g, "1")
    .replace(/\bsecond\b/g, "2")
    .replace(/\bthird\b/g, "3")
    .replace(/\b([1-3])(st|nd|rd)\b/g, "$1")
    .replace(/\biii\b/g, "3")
    .replace(/\bii\b/g, "2")
    .replace(/\bi\b/g, "1")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

const BOOK_ALIAS_TO_KEY = new Map<string, string>();
const TOPIC_ALIAS_TO_KEY = new Map<string, string>();

for (const entry of MOTIF_BANK_ENTRIES) {
  const aliasSet = uniqueStrings([entry.key, entry.name, ...entry.aliases]);
  for (const alias of aliasSet) {
    const normalizedAlias = normalizeLookupValue(alias);
    if (!normalizedAlias) {
      continue;
    }
    if (!BOOK_ALIAS_TO_KEY.has(normalizedAlias)) {
      BOOK_ALIAS_TO_KEY.set(normalizedAlias, entry.key);
    }
  }
}

for (const entry of TOPICAL_MOTIF_BANK_ENTRIES) {
  const aliasSet = uniqueStrings([entry.key, entry.displayName, ...entry.keywords]);
  for (const alias of aliasSet) {
    const normalizedAlias = normalizeLookupValue(alias);
    if (!normalizedAlias) {
      continue;
    }
    if (!TOPIC_ALIAS_TO_KEY.has(normalizedAlias)) {
      TOPIC_ALIAS_TO_KEY.set(normalizedAlias, entry.key);
    }
  }
}

export function normalizeBookKey(str: string): string {
  const normalized = normalizeLookupValue(str || "");
  return BOOK_ALIAS_TO_KEY.get(normalized) || normalized;
}

export function normalizeTopicKey(str: string): string {
  const normalized = normalizeLookupValue(str || "");
  return TOPIC_ALIAS_TO_KEY.get(normalized) || normalized;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasPattern(alias: string, options?: { requireReference?: boolean }): RegExp {
  const trimmed = alias.trim().toLowerCase();
  const escaped = escapeRegex(trimmed)
    .replace(/\\\./g, "\\.?")
    .replace(/\s+/g, "[\\s.,:;()\\-]*");
  if (options?.requireReference) {
    return new RegExp(`(?:^|\\b)${escaped}\\.?\\s*\\d{1,3}(?::\\d{1,3})?`, "i");
  }
  return new RegExp(`(?:^|\\b)${escaped}(?=\\b|\\s|$)`, "i");
}

function compactAliasLength(alias: string): number {
  return alias
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .length;
}

const BOOK_DETECTION_PATTERNS = MOTIF_BANK_ENTRIES.map((entry) => {
  const rawAliases = uniqueStrings([entry.name, ...entry.aliases]);
  return {
    key: entry.key,
    patterns: rawAliases.map((alias) =>
      aliasPattern(alias, {
        requireReference: compactAliasLength(alias) <= 2
      })
    )
  };
});

const TOPIC_DETECTION_PATTERNS = TOPICAL_MOTIF_BANK_ENTRIES.map((entry) => {
  const rawAliases = uniqueStrings([...entry.keywords]);
  return {
    key: entry.key,
    patterns: rawAliases.map((alias) => aliasPattern(alias))
  };
});

export function detectBookKeysFromText(text: string): string[] {
  const source = typeof text === "string" ? text : "";
  if (!source.trim()) {
    return [];
  }

  const matches: Array<{ key: string; index: number }> = [];
  for (const patternEntry of BOOK_DETECTION_PATTERNS) {
    let bestIndex = Number.POSITIVE_INFINITY;
    for (const pattern of patternEntry.patterns) {
      const index = source.search(pattern);
      if (index >= 0 && index < bestIndex) {
        bestIndex = index;
      }
    }
    if (Number.isFinite(bestIndex)) {
      matches.push({ key: patternEntry.key, index: bestIndex });
    }
  }

  matches.sort((a, b) => {
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    return (BOOK_ORDER_INDEX.get(a.key) || 0) - (BOOK_ORDER_INDEX.get(b.key) || 0);
  });

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of matches) {
    if (seen.has(match.key)) {
      continue;
    }
    seen.add(match.key);
    ordered.push(match.key);
  }

  return ordered;
}

const CHAPTER_VERSE_PATTERN = /\b\d{1,3}:\d{1,3}(?:\s*[-\u2013]\s*\d{1,3})?\b/;
const REFERENCE_SEPARATOR_PATTERN = /[;,]/;
const BARE_REFERENCE_SEGMENT_PATTERN =
  /^\s*\d{1,3}(?::\d{1,3}(?:\s*[-\u2013]\s*\d{1,3})?)?(?:\s*[-\u2013]\s*\d{1,3}(?::\d{1,3})?)?\s*$/;
const SCRIPTURE_SCOPE_DEBUG_FLAG = "BIBLE_MOTIF_SCOPE_DEBUG";

function normalizeScopePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBookOnlyReference(value: string): boolean {
  const raw = (value || "").trim();
  if (!raw || /\d/.test(raw)) {
    return false;
  }

  const normalized = normalizeLookupValue(raw);
  if (BOOK_ALIAS_TO_KEY.has(normalized)) {
    return true;
  }

  const normalizedPhrase = normalizeScopePhrase(raw)
    .replace(/^the\s+/, "")
    .replace(/^gospel\s+of\s+/, "")
    .replace(/^book\s+of\s+/, "")
    .trim();
  if (!normalizedPhrase) {
    return false;
  }
  const normalizedAlias = normalizeLookupValue(normalizedPhrase);
  return BOOK_ALIAS_TO_KEY.has(normalizedAlias);
}

function hasChapterVerse(value: string): boolean {
  return CHAPTER_VERSE_PATTERN.test(value || "");
}

function splitReferenceSegments(value: string): string[] {
  return (value || "")
    .split(REFERENCE_SEPARATOR_PATTERN)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function countReferenceLikeSegments(value: string): number {
  const segments = splitReferenceSegments(value);
  if (segments.length === 0) {
    return 0;
  }

  let count = 0;
  let hasPriorBookSegment = false;
  for (const segment of segments) {
    const hasBook = detectBookKeysFromText(segment).length > 0 || isBookOnlyReference(segment);
    const standaloneRefWithPriorBook = hasPriorBookSegment && BARE_REFERENCE_SEGMENT_PATTERN.test(segment);
    if (hasBook || hasChapterVerse(segment) || standaloneRefWithPriorBook) {
      count += 1;
    }
    if (hasBook) {
      hasPriorBookSegment = true;
    }
  }
  return count;
}

function hasExplicitMultiReference(value: string): boolean {
  if (!REFERENCE_SEPARATOR_PATTERN.test(value || "")) {
    return false;
  }
  return countReferenceLikeSegments(value) >= 2;
}

function looksLikeTightSingleReference(value: string): boolean {
  const raw = (value || "").trim();
  if (!raw || hasExplicitMultiReference(raw) || REFERENCE_SEPARATOR_PATTERN.test(raw)) {
    return false;
  }
  if (hasChapterVerse(raw)) {
    return true;
  }
  const hasBookContext = detectBookKeysFromText(raw).length > 0;
  return hasBookContext && /\d/.test(raw);
}

function hasWholeBookSeriesPattern(value: string): boolean {
  const raw = (value || "").trim();
  if (!raw) {
    return false;
  }
  if (isBookOnlyReference(raw)) {
    return true;
  }
  if (hasChapterVerse(raw) || looksLikeTightSingleReference(raw)) {
    return false;
  }
  return detectBookKeysFromText(raw).length > 0;
}

function shouldDebugScriptureScopeInference(): boolean {
  return process.env.NODE_ENV !== "production" && process.env[SCRIPTURE_SCOPE_DEBUG_FLAG] === "1";
}

function debugScriptureScopeInference(
  input: {
    passageRef: string;
    seriesTitle: string;
    sermonTitle: string;
    subtitle: string;
  },
  scope: ScriptureScope
): void {
  if (!shouldDebugScriptureScopeInference()) {
    return;
  }
  console.debug("[motif-bank] inferScriptureScope", {
    passageRef: input.passageRef,
    seriesTitle: input.seriesTitle,
    sermonTitle: input.sermonTitle,
    subtitle: input.subtitle,
    scriptureScope: scope
  });
}

export function inferScriptureScope(input: {
  passageRef?: string | null;
  seriesTitle?: string | null;
  sermonTitle?: string | null;
  subtitle?: string | null;
}): ScriptureScope {
  const passageRef = (input.passageRef || "").trim();
  const seriesTitle = (input.seriesTitle || "").trim();
  const sermonTitle = (input.sermonTitle || "").trim();
  const subtitle = (input.subtitle || "").trim();
  const debugInput = { passageRef, seriesTitle, sermonTitle, subtitle };
  const aggregate = [passageRef, seriesTitle, sermonTitle, subtitle].filter(Boolean).join(" ");
  const complete = (scope: ScriptureScope): ScriptureScope => {
    debugScriptureScopeInference(debugInput, scope);
    return scope;
  };

  const explicitMultiReference = [passageRef, seriesTitle, sermonTitle, subtitle].some((value) => hasExplicitMultiReference(value));
  if (explicitMultiReference) {
    return complete("multi_passage");
  }

  const hasChapterVerseAnywhere = hasChapterVerse(aggregate);
  const singleSpecificReference = looksLikeTightSingleReference(passageRef);
  if (singleSpecificReference || hasChapterVerseAnywhere) {
    return complete("specific_passage");
  }

  if (!hasChapterVerseAnywhere && (!passageRef || isBookOnlyReference(passageRef) || hasWholeBookSeriesPattern(seriesTitle))) {
    return complete("whole_book");
  }

  if (hasWholeBookSeriesPattern(seriesTitle) || isBookOnlyReference(passageRef)) {
    return complete("whole_book");
  }

  return complete("whole_book");
}

function sortTopicMatches(matches: Array<{ key: string; index: number }>): Array<{ key: string; index: number }> {
  return [...matches].sort((a, b) => {
    const aSeasonal = SEASONAL_TOPIC_KEYS.has(a.key);
    const bSeasonal = SEASONAL_TOPIC_KEYS.has(b.key);
    if (aSeasonal !== bSeasonal) {
      return aSeasonal ? -1 : 1;
    }
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    return (TOPIC_ORDER_INDEX.get(a.key) || 0) - (TOPIC_ORDER_INDEX.get(b.key) || 0);
  });
}

export function detectTopicKeysFromText(text: string): string[] {
  const source = typeof text === "string" ? text : "";
  if (!source.trim()) {
    return [];
  }

  const explicitKeys: string[] = [];
  const explicitPattern = /(?:^|[\s\[#;,(])(?:theme|season)\s*[:=]\s*([^\]\n#;,]+)/gi;
  for (const match of source.matchAll(explicitPattern)) {
    const rawValue = (match[1] || "").trim();
    if (!rawValue) {
      continue;
    }
    const normalized = normalizeTopicKey(rawValue);
    if (!TOPICAL_MOTIF_BANK[normalized] || explicitKeys.includes(normalized)) {
      continue;
    }
    explicitKeys.push(normalized);
    if (explicitKeys.length >= 2) {
      return explicitKeys;
    }
  }

  const keywordMatches: Array<{ key: string; index: number }> = [];
  for (const patternEntry of TOPIC_DETECTION_PATTERNS) {
    let bestIndex = Number.POSITIVE_INFINITY;
    for (const pattern of patternEntry.patterns) {
      const index = source.search(pattern);
      if (index >= 0 && index < bestIndex) {
        bestIndex = index;
      }
    }
    if (Number.isFinite(bestIndex)) {
      keywordMatches.push({ key: patternEntry.key, index: bestIndex });
    }
  }

  const ordered: string[] = [...explicitKeys];
  for (const match of sortTopicMatches(keywordMatches)) {
    if (ordered.includes(match.key)) {
      continue;
    }
    ordered.push(match.key);
    if (ordered.length >= 2) {
      break;
    }
  }

  return ordered;
}

const GENRE_KEYWORD_HINTS: Array<{ genre: Genre; pattern: RegExp }> = [
  { genre: "gospels", pattern: /\b(gospel|jesus|parable|miracle|disciple|sermon\s+on\s+the\s+mount)\b/i },
  { genre: "acts", pattern: /\b(acts|apostles?|pentecost|mission\s+journey|early\s+church)\b/i },
  { genre: "pauline_epistles", pattern: /\b(paul|epistle|letter\s+to\s+the\s+church|gentiles?|adoption|justification)\b/i },
  { genre: "general_epistles", pattern: /\b(scattered\s+church|steadfast|endure|elder|hospitality|faith\s+and\s+works)\b/i },
  { genre: "apocalyptic", pattern: /\b(apocalyptic|revelation|end\s+times|new\s+jerusalem|beast|seven\s+seals)\b/i },
  { genre: "major_prophets", pattern: /\b(prophetic|oracle|watchman|judgment\s+and\s+hope|new\s+covenant)\b/i },
  { genre: "minor_prophets", pattern: /\b(plumb\s+line|day\s+of\s+the\s+lord|locust|remnant|covenant\s+lawsuit)\b/i },
  { genre: "wisdom", pattern: /\b(wisdom|poetry|lament|proverb|song\s+of\s+songs|psalm)\b/i },
  { genre: "history", pattern: /\b(kings?|judges?|chronicles?|return\s+from\s+exile|rebuild)\b/i },
  { genre: "torah", pattern: /\b(torah|law|covenant|tabernacle|wilderness|patriarchs?)\b/i }
];

function detectGenreHints(text: string): Genre[] {
  const source = text.trim();
  if (!source) {
    return [];
  }

  const genres: Genre[] = [];
  for (const hint of GENRE_KEYWORD_HINTS) {
    if (hint.pattern.test(source) && !genres.includes(hint.genre)) {
      genres.push(hint.genre);
    }
  }
  return genres;
}

function withFillers(primary: string[], fillers: string[], min: number, max: number): string[] {
  const merged = [...uniqueStrings(primary)];
  for (const filler of fillers) {
    if (merged.length >= max) {
      break;
    }
    if (!merged.some((item) => item.toLowerCase() === filler.toLowerCase())) {
      merged.push(filler);
    }
  }

  if (merged.length >= min) {
    return merged.slice(0, max);
  }

  return merged.slice(0, max);
}

function withPriority(primary: string[], secondary: string[], max: number): string[] {
  return uniqueStrings([...primary, ...secondary]).slice(0, max);
}

function normalizeThemeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function filteredBySceneMotifs(items: string[], sceneMotifs: string[], allowSceneMotifs: boolean): string[] {
  if (allowSceneMotifs) {
    return items;
  }
  const sceneSet = new Set(sceneMotifs.map((item) => normalizeThemeKey(item)));
  if (sceneSet.size === 0) {
    return items;
  }
  return items.filter((item) => !sceneSet.has(normalizeThemeKey(item)));
}

function sceneTokens(value: string): string[] {
  return normalizeThemeKey(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function notesExplicitlyRequestSceneMotif(designNotes: string | null | undefined, sceneMotifs: string[]): boolean {
  const notes = normalizeThemeKey(designNotes || "");
  if (!notes) {
    return false;
  }
  const hasSceneCue =
    /\b(scene|story|narrative|passage|focus|feature|depict|illustrate|imagery|visualize|moment)\b/i.test(notes);

  for (const sceneMotif of sceneMotifs) {
    const motifPhrase = normalizeThemeKey(sceneMotif);
    if (!motifPhrase) {
      continue;
    }
    if (notes.includes(motifPhrase)) {
      return true;
    }

    const motifTokens = sceneTokens(sceneMotif);
    const hitCount = motifTokens.filter((token) => notes.includes(token)).length;
    if (hasSceneCue && hitCount >= 2) {
      return true;
    }
  }

  return false;
}

function buildBookContext(params: {
  bookKeys: string[];
  scriptureScope: ScriptureScope;
  allowSceneMotifs: boolean;
}): MotifBankContext {
  const entries = params.bookKeys
    .map((key) => BIBLE_MOTIF_BANK[key])
    .filter((entry): entry is MotifBankEntry => Boolean(entry));
  const genres = uniqueStrings(entries.map((entry) => entry.genre));

  const genreFallbackMotifs = genres.flatMap((genre) => GENRE_FALLBACKS[genre as Genre].motifs);
  const genreFallbackMarkIdeas = genres.flatMap((genre) => GENRE_FALLBACKS[genre as Genre].markIdeas);
  const genreFallbackAnti = genres.flatMap((genre) => GENRE_FALLBACKS[genre as Genre].antiMotifs);
  const genreFallbackTone = genres.flatMap((genre) => GENRE_FALLBACKS[genre as Genre].tone);

  const primaryThemeCandidates = uniqueStrings(entries.flatMap((entry) => entry.primaryThemes));
  const secondaryThemeCandidates = uniqueStrings(entries.flatMap((entry) => entry.secondaryThemes));
  const sceneMotifCandidates = uniqueStrings(entries.flatMap((entry) => entry.sceneMotifs));
  const scopedPrimary = filteredBySceneMotifs(primaryThemeCandidates, sceneMotifCandidates, params.allowSceneMotifs);
  const scopedSecondary = filteredBySceneMotifs(secondaryThemeCandidates, sceneMotifCandidates, params.allowSceneMotifs);
  const scopedScene = params.allowSceneMotifs ? sceneMotifCandidates : [];
  const scopedLegacy = filteredBySceneMotifs(
    uniqueStrings(entries.flatMap((entry) => entry.motifs)),
    sceneMotifCandidates,
    params.allowSceneMotifs
  );

  const scopedMotifs =
    params.scriptureScope === "whole_book"
      ? uniqueStrings([...scopedPrimary, ...scopedSecondary, ...scopedScene])
      : params.scriptureScope === "specific_passage"
        ? uniqueStrings([...scopedLegacy, ...scopedPrimary, ...scopedSecondary, ...scopedScene])
        : uniqueStrings([...scopedPrimary, ...scopedSecondary, ...scopedLegacy, ...scopedScene]);

  return {
    bookKeys: entries.map((entry) => entry.key),
    bookNames: entries.map((entry) => entry.name),
    topicKeys: [],
    topicNames: [],
    scriptureScope: params.scriptureScope,
    sceneMotifRequested: params.allowSceneMotifs,
    primaryThemeCandidates: scopedPrimary,
    secondaryThemeCandidates: scopedSecondary,
    sceneMotifCandidates: scopedScene,
    motifCandidates: withFillers(scopedMotifs, [...genreFallbackMotifs, ...NONE_FALLBACK_MOTIFS], 12, 30),
    markIdeaCandidates: withFillers(
      entries.flatMap((entry) => entry.markIdeas),
      [...genreFallbackMarkIdeas, ...NONE_FALLBACK_MARK_IDEAS],
      6,
      15
    ),
    antiMotifs: uniqueStrings([...entries.flatMap((entry) => entry.antiMotifs), ...genreFallbackAnti, ...GENERIC_ANTI_MOTIFS]),
    allowedGenericMotifs: uniqueStrings(entries.flatMap((entry) => entry.allowedGenericMotifs || [])).slice(0, 6),
    toneHints: uniqueStrings([...entries.flatMap((entry) => entry.tone), ...genreFallbackTone]).slice(0, 10),
    fallbackMode: "book"
  };
}

function buildGenreContext(genres: Genre[], scriptureScope: ScriptureScope): MotifBankContext {
  const uniqueGenres = uniqueStrings(genres);
  const motifs = uniqueGenres.flatMap((genre) => GENRE_FALLBACKS[genre as Genre].motifs);
  const markIdeas = uniqueGenres.flatMap((genre) => GENRE_FALLBACKS[genre as Genre].markIdeas);
  const antiMotifs = uniqueGenres.flatMap((genre) => GENRE_FALLBACKS[genre as Genre].antiMotifs);
  const tone = uniqueGenres.flatMap((genre) => GENRE_FALLBACKS[genre as Genre].tone);

  return {
    bookKeys: [],
    bookNames: [],
    topicKeys: [],
    topicNames: [],
    scriptureScope,
    sceneMotifRequested: false,
    primaryThemeCandidates: uniqueStrings(motifs).slice(0, 10),
    secondaryThemeCandidates: [],
    sceneMotifCandidates: [],
    motifCandidates: withFillers(motifs, NONE_FALLBACK_MOTIFS, 12, 30),
    markIdeaCandidates: withFillers(markIdeas, NONE_FALLBACK_MARK_IDEAS, 6, 15),
    antiMotifs: uniqueStrings([...antiMotifs, ...GENERIC_ANTI_MOTIFS]),
    allowedGenericMotifs: [],
    toneHints: uniqueStrings([...tone, ...NONE_FALLBACK_TONE]).slice(0, 10),
    fallbackMode: "genre"
  };
}

function buildNoneContext(scriptureScope: ScriptureScope): MotifBankContext {
  return {
    bookKeys: [],
    bookNames: [],
    topicKeys: [],
    topicNames: [],
    scriptureScope,
    sceneMotifRequested: false,
    primaryThemeCandidates: uniqueStrings(NONE_FALLBACK_MOTIFS).slice(0, 8),
    secondaryThemeCandidates: uniqueStrings(NONE_FALLBACK_MOTIFS).slice(8, 12),
    sceneMotifCandidates: [],
    motifCandidates: withFillers(NONE_FALLBACK_MOTIFS, NONE_FALLBACK_MOTIFS, 12, 30),
    markIdeaCandidates: withFillers(NONE_FALLBACK_MARK_IDEAS, NONE_FALLBACK_MARK_IDEAS, 6, 15),
    antiMotifs: uniqueStrings([...GENERIC_ANTI_MOTIFS]),
    allowedGenericMotifs: [],
    toneHints: [...NONE_FALLBACK_TONE],
    fallbackMode: "none"
  };
}

export function getMotifBankContext(input: {
  title?: string | null;
  subtitle?: string | null;
  scripturePassages?: string | null;
  description?: string | null;
  designNotes?: string | null;
}): MotifBankContext {
  const rawText = [
    input.title || "",
    input.subtitle || "",
    input.scripturePassages || "",
    input.description || "",
    input.designNotes || ""
  ]
    .join("\n")
    .trim();

  const scriptureScope = inferScriptureScope({
    passageRef: input.scripturePassages,
    seriesTitle: input.title,
    sermonTitle: input.description,
    subtitle: input.subtitle
  });
  const bookKeys = detectBookKeysFromText(rawText);
  const topicKeys = detectTopicKeysFromText(rawText);
  const topicEntries = topicKeys
    .map((key) => TOPICAL_MOTIF_BANK[key])
    .filter((entry): entry is TopicalMotifBankEntry => Boolean(entry));
  const bookEntries = bookKeys
    .map((key) => BIBLE_MOTIF_BANK[key])
    .filter((entry): entry is MotifBankEntry => Boolean(entry));
  const sceneMotifPool = uniqueStrings(bookEntries.flatMap((entry) => entry.sceneMotifs));
  const sceneMotifRequested =
    scriptureScope === "whole_book" ? notesExplicitlyRequestSceneMotif(input.designNotes, sceneMotifPool) : true;

  const baseContext =
    bookKeys.length > 0
      ? buildBookContext({
          bookKeys,
          scriptureScope,
          allowSceneMotifs: sceneMotifRequested
        })
      : (() => {
          const genreHints = detectGenreHints(rawText);
          if (genreHints.length > 0) {
            return buildGenreContext(genreHints, scriptureScope);
          }
          return buildNoneContext(scriptureScope);
        })();

  const topicMotifs = topicEntries.flatMap((entry) => entry.motifs);
  const topicMarkIdeas = topicEntries.flatMap((entry) => entry.markIdeas);
  const topicAntiMotifs = topicEntries.flatMap((entry) => entry.antiMotifs);
  const topicAllowedGenericMotifs = topicEntries.flatMap((entry) => entry.allowedGenericMotifs || []);
  const topicToneHints = topicEntries.map((entry) => entry.tone || "").filter(Boolean);

  const preferBookFirst = baseContext.bookKeys.length > 0;
  const motifCandidates = preferBookFirst
    ? withPriority(baseContext.motifCandidates, topicMotifs, 14)
    : topicEntries.length > 0
      ? withPriority(topicMotifs, baseContext.motifCandidates, 14)
      : baseContext.motifCandidates.slice(0, 14);
  const markIdeaCandidates = preferBookFirst
    ? withPriority(baseContext.markIdeaCandidates, topicMarkIdeas, 10)
    : topicEntries.length > 0
      ? withPriority(topicMarkIdeas, baseContext.markIdeaCandidates, 10)
      : baseContext.markIdeaCandidates.slice(0, 10);

  return {
    ...baseContext,
    topicKeys: topicEntries.map((entry) => entry.key),
    topicNames: topicEntries.map((entry) => entry.displayName),
    scriptureScope,
    sceneMotifRequested: baseContext.sceneMotifRequested,
    motifCandidates,
    markIdeaCandidates,
    antiMotifs: uniqueStrings([...baseContext.antiMotifs, ...topicAntiMotifs]).slice(0, 16),
    allowedGenericMotifs: uniqueStrings([...baseContext.allowedGenericMotifs, ...topicAllowedGenericMotifs]).slice(0, 6),
    toneHints: uniqueStrings([...baseContext.toneHints, ...topicToneHints]).slice(0, 10)
  };
}
