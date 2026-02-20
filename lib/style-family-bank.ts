export type StyleFamilyKey =
  | "modern_geometric_blocks"
  | "abstract_organic_papercut"
  | "editorial_grid_minimal"
  | "typographic_only_statement"
  | "monoline_icon_system"
  | "symbol_collage"
  | "halftone_print_poster"
  | "risograph_duotone"
  | "blueprint_diagram"
  | "map_wayfinding"
  | "architecture_structural_forms"
  | "textile_woven_pattern"
  | "topographic_contour_lines"
  | "light_gradient_stage"
  | "painterly_atmosphere"
  | "photographic_graphic_overlay"
  | "macro_texture_minimal"
  | "engraved_heritage"
  | "manuscript_marginalia"
  | "emblem_seal_system"
  | "playful_neon_pool"
  | "comic_storyboard"
  | "bubbly_3d_clay"
  | "sticker_pack_pop"
  | "paper_cut_collage_playful";

export type StyleFamilyDefinition = {
  name: string;
  description: string;
  backgroundRules: string[];
  lockupRules: string[];
  allowedMedia: string[];
  forbids: string[];
  bestFor: string[];
  markFriendly: boolean;
};

export const STYLE_FAMILY_KEYS: StyleFamilyKey[] = [
  "modern_geometric_blocks",
  "abstract_organic_papercut",
  "editorial_grid_minimal",
  "typographic_only_statement",
  "monoline_icon_system",
  "symbol_collage",
  "halftone_print_poster",
  "risograph_duotone",
  "blueprint_diagram",
  "map_wayfinding",
  "architecture_structural_forms",
  "textile_woven_pattern",
  "topographic_contour_lines",
  "light_gradient_stage",
  "painterly_atmosphere",
  "photographic_graphic_overlay",
  "macro_texture_minimal",
  "engraved_heritage",
  "manuscript_marginalia",
  "emblem_seal_system",
  "playful_neon_pool",
  "comic_storyboard",
  "bubbly_3d_clay",
  "sticker_pack_pop",
  "paper_cut_collage_playful"
];

export const STYLE_FAMILY_BANK: Record<StyleFamilyKey, StyleFamilyDefinition> = {
  modern_geometric_blocks: {
    name: "Modern Geometric Blocks",
    description: "Bold shape-led modernism with clean blocks, overlaps, and disciplined edge control.",
    backgroundRules: [
      "Use 2-5 large geometric planes with asymmetric balance and clear negative-space lanes.",
      "Prefer flat or softly textured vector-like surfaces; avoid noisy gradients.",
      "When title-stage is requested, dedicate one calm block zone with low contrast and no hard edges crossing the safe region."
    ],
    lockupRules: [
      "Bias toward editorial_stack, split_title, framed_type, or offset_kicker archetypes.",
      "Typography should feel contemporary, assertive, and tightly spaced.",
      "Max ornament: minimal rule accents only."
    ],
    allowedMedia: ["vector geometry", "paper grain", "subtle matte texture"],
    forbids: ["no spotlight rays", "no faux 3D bevels", "no busy micro-detail in lockup safe region"],
    bestFor: ["vision series", "leadership themes", "clarity-first messaging"],
    markFriendly: true
  },
  abstract_organic_papercut: {
    name: "Abstract Organic Papercut",
    description: "Layered organic silhouettes with tactile edges and depth-by-overlap.",
    backgroundRules: [
      "Build depth with 4-8 paper-like layers, curved contours, and restrained shadow separation.",
      "Texture should feel fiber/pulp based, not photographic.",
      "When title-stage is requested, hold one layer as a broad quiet field with softened edge transitions."
    ],
    lockupRules: [
      "Bias toward centered_classic, editorial_stack, or stepped_baseline.",
      "Typography mood: warm, human, crafted but clean.",
      "Max ornament: one organic contour echo near lockup."
    ],
    allowedMedia: ["paper cut", "fibrous stock texture", "soft drop-shadow"],
    forbids: ["no clip-art symbols", "no hard neon glows", "no lockup boxed panels"],
    bestFor: ["pastoral themes", "restoration", "grace and growth"],
    markFriendly: false
  },
  editorial_grid_minimal: {
    name: "Editorial Grid Minimal",
    description: "Magazine-grade grid logic with strict spacing, restraint, and hierarchy.",
    backgroundRules: [
      "Use disciplined column/row rhythm with one focal anchor and generous whitespace.",
      "Keep material finish subtle: smooth paper, slight grain, or matte tone shifts.",
      "Title-stage compatibility is high: reserve a clean text lane with low contrast variation."
    ],
    lockupRules: [
      "Bias toward editorial_stack, split_title, vertical_spine, and offset_kicker.",
      "Typography mood: editorial sans/serif mix with precise tracking.",
      "Max ornament: thin rules only."
    ],
    allowedMedia: ["editorial grid", "minimal gradient", "paper stock"],
    forbids: ["no decorative filigree", "no dramatic lens flares", "no dense collage in safe region"],
    bestFor: ["teaching series", "verse-by-verse studies", "formal campaigns"],
    markFriendly: true
  },
  typographic_only_statement: {
    name: "Typographic Only Statement",
    description: "Type-led poster language where form, rhythm, and spacing drive the image.",
    backgroundRules: [
      "Background should be intentionally minimal with tonal fields supporting typography.",
      "Texture must remain subtle and non-directional to avoid visual noise.",
      "For title-stage behavior, treat the full lockup lane as the stage and keep all surrounding texture very low."
    ],
    lockupRules: [
      "Bias toward editorial_stack, split_title, stepped_baseline, and vertical_spine.",
      "Typography mood: strong statement type with controlled contrast and kerning confidence.",
      "Max ornament: none or one rule."
    ],
    allowedMedia: ["solid fields", "ink spread texture", "mono gradient"],
    forbids: ["no symbolic icon clutter", "no fake hand lettering unless explicitly requested", "no decorative swashes"],
    bestFor: ["proclamation themes", "short punchy titles", "identity-forward campaigns"],
    markFriendly: true
  },
  monoline_icon_system: {
    name: "Monoline Icon System",
    description: "Consistent stroke-based iconography integrated with modern layout structure.",
    backgroundRules: [
      "Use sparse monoline motifs on large calm fields; prioritize icon consistency over detail.",
      "Supportive texture should be nearly invisible and never compete with icons.",
      "For title-stage requests, keep icon density near-zero in the lockup lane."
    ],
    lockupRules: [
      "Bias toward monogram_mark, centered_classic, editorial_stack, and banner_strip.",
      "Typography mood: clean, technical, and precise.",
      "Max ornament: one small icon family accent."
    ],
    allowedMedia: ["single-weight line art", "flat color fields", "subtle dot texture"],
    forbids: ["no mixed stroke widths in icons", "no icon literalism overload", "no contour crowding near lockup"],
    bestFor: ["series branding systems", "discipleship tracks", "multi-week sets"],
    markFriendly: true
  },
  symbol_collage: {
    name: "Symbol Collage",
    description: "Curated symbolic fragments arranged with controlled overlap and narrative rhythm.",
    backgroundRules: [
      "Compose 3-7 symbolic elements with clear depth layering and one dominant focal shape.",
      "Blend analog paper/scanned texture lightly to keep collage tactile but readable.",
      "If title-stage is required, pull collage density away from lockup zone and maintain a quiet field."
    ],
    lockupRules: [
      "Bias toward split_title, offset_kicker, or banner_strip with strong hierarchy.",
      "Typography mood: expressive but disciplined.",
      "Max ornament: one repeated motif family, no scatter."
    ],
    allowedMedia: ["paper collage", "scanned cutouts", "ink texture"],
    forbids: ["no random sticker chaos", "no generic cross/dove stock symbols", "no busy micro-detail in safe region"],
    bestFor: ["storytelling arcs", "narrative series", "thematic transitions"],
    markFriendly: false
  },
  halftone_print_poster: {
    name: "Halftone Print Poster",
    description: "Posterized print language with halftone fields, strong contrast, and controlled grit.",
    backgroundRules: [
      "Use bold value grouping and intentional halftone zones, not full-canvas noise.",
      "Keep print grain directional and sparse to preserve hierarchy.",
      "For title-stage compatibility, keep a halftone-light zone reserved with minimal dot density."
    ],
    lockupRules: [
      "Bias toward banner_strip, stepped_baseline, editorial_stack, or split_title.",
      "Typography mood: poster-bold, high impact, clear silhouette.",
      "Max ornament: one print-rule or corner anchor."
    ],
    allowedMedia: ["halftone dots", "screen-print grain", "high-contrast duotone"],
    forbids: ["no photoreal faces as focal point", "no muddy midtone wash", "no fake distressed overlays over lockup"],
    bestFor: ["youth events", "high-energy campaigns", "announcement-driven graphics"],
    markFriendly: false
  },
  risograph_duotone: {
    name: "Risograph Duotone",
    description: "Two-ink risograph feel with offset registration charm and matte analog character.",
    backgroundRules: [
      "Limit palette to two principal inks plus neutrals; preserve print-like misregistration subtly.",
      "Use broad tonal blocks with occasional overprint intersections.",
      "For title-stage behavior, keep one ink-light lane for clean lockup legibility."
    ],
    lockupRules: [
      "Bias toward centered_classic, editorial_stack, and framed_type.",
      "Typography mood: artistic editorial with simple geometric grounding.",
      "Max ornament: tiny registration marks or one rule system."
    ],
    allowedMedia: ["duotone inks", "misregistration texture", "paper grain"],
    forbids: ["no full-spectrum rainbow palettes", "no glossy photo rendering", "no dense pattern under lockup"],
    bestFor: ["seasonal campaigns", "creative workshops", "alt editorial series"],
    markFriendly: false
  },
  blueprint_diagram: {
    name: "Blueprint Diagram",
    description: "Technical drawing language with measured lines, callout logic, and structural clarity.",
    backgroundRules: [
      "Use measured linework, sparse annotation cues, and technical spacing discipline.",
      "Texture medium should resemble drafting paper or lightly worn cyanotype.",
      "Title-stage compatibility is high when diagram density is routed outside safe region."
    ],
    lockupRules: [
      "Bias toward vertical_spine, framed_type, editorial_stack, and monogram_mark.",
      "Typography mood: precise, engineered, and legible.",
      "Max ornament: technical ticks or one diagram marker set."
    ],
    allowedMedia: ["line diagram", "blueprint paper", "technical annotation"],
    forbids: ["no chaotic wire tangles", "no faux sci-fi HUD clutter", "no tight detail in lockup lane"],
    bestFor: ["process series", "doctrine frameworks", "vision architecture themes"],
    markFriendly: true
  },
  map_wayfinding: {
    name: "Map Wayfinding",
    description: "Route, marker, and wayfinding cues that suggest journey without literal cartography overload.",
    backgroundRules: [
      "Use 1-2 route paths, sparse markers, and broad terrain fields with directional intent.",
      "Keep medium texture subdued: map paper grain or top-layer wash.",
      "For title-stage requests, carve out route-free lockup space and lower line contrast there."
    ],
    lockupRules: [
      "Bias toward vertical_spine, offset_kicker, or split_title.",
      "Typography mood: navigational clarity with practical confidence.",
      "Max ornament: one route marker motif family."
    ],
    allowedMedia: ["map linework", "terrain wash", "wayfinding symbols"],
    forbids: ["no literal GPS UI", "no tiny unreadable labels", "no dense route knots under lockup"],
    bestFor: ["journey themes", "discipleship paths", "mission-oriented series"],
    markFriendly: false
  },
  architecture_structural_forms: {
    name: "Architecture Structural Forms",
    description: "Massing, beams, frames, and structural geometry with premium spatial discipline.",
    backgroundRules: [
      "Compose with architectural masses and intersecting planes, emphasizing depth and proportion.",
      "Texture should mimic concrete, vellum, or matte mineral surfaces.",
      "Title-stage compatibility is strong when one structural bay remains calm and uncluttered."
    ],
    lockupRules: [
      "Bias toward framed_type, editorial_stack, and centered_classic.",
      "Typography mood: sturdy, formal, and confident.",
      "Max ornament: linear structural accents only."
    ],
    allowedMedia: ["architectural geometry", "material grain", "soft directional light"],
    forbids: ["no photoreal building facades", "no impossible perspective gimmicks", "no cluttered beam lines in safe region"],
    bestFor: ["vision casting", "church identity", "capital campaigns"],
    markFriendly: false
  },
  textile_woven_pattern: {
    name: "Textile Woven Pattern",
    description: "Thread, weave, and loom-inspired rhythms with tactile warmth and repeat discipline.",
    backgroundRules: [
      "Use coarse-to-fine woven pattern zones with clear scale control.",
      "Limit palette contrast so weave texture supports rather than dominates.",
      "When title-stage is requested, reduce weave density and contrast around lockup lane."
    ],
    lockupRules: [
      "Bias toward centered_classic, stepped_baseline, and banner_strip.",
      "Typography mood: warm, grounded, and human.",
      "Max ornament: one border rhythm or stitched rule."
    ],
    allowedMedia: ["woven texture", "threadline motifs", "natural fiber palette"],
    forbids: ["no plaid overload", "no faux craft clip-art", "no high-frequency weave in safe region"],
    bestFor: ["community themes", "family series", "hospitality emphasis"],
    markFriendly: false
  },
  topographic_contour_lines: {
    name: "Topographic Contour Lines",
    description: "Layered contour maps with elevation rhythm and calm directional flow.",
    backgroundRules: [
      "Use contour fields with clear interval hierarchy and breathing space between clusters.",
      "Texture can include soft paper grain and subtle elevation shading.",
      "For title-stage behavior, maintain a low-line-density basin where lockup lives."
    ],
    lockupRules: [
      "Bias toward vertical_spine, editorial_stack, and split_title.",
      "Typography mood: exploratory, balanced, and clear.",
      "Max ornament: one contour accent halo."
    ],
    allowedMedia: ["contour lines", "terrain shading", "map paper grain"],
    forbids: ["no route-map icon spam", "no tiny label clutter", "no high-contrast contours in safe region"],
    bestFor: ["journey + growth themes", "formation series", "outdoor/service themes"],
    markFriendly: false
  },
  light_gradient_stage: {
    name: "Light Gradient Stage",
    description: "Atmospheric gradients engineered to create intentional text staging zones.",
    backgroundRules: [
      "Build with broad light-to-dark gradients and soft volumetric transitions.",
      "Keep texture minimal and smooth to protect readability.",
      "Title-stage compatibility is primary: reserve a quiet gradient plateau for lockup."
    ],
    lockupRules: [
      "Bias toward editorial_stack, split_title, and offset_kicker.",
      "Typography mood: refined, spacious, and premium.",
      "Max ornament: none."
    ],
    allowedMedia: ["soft gradient fields", "subtle haze", "minimal grain"],
    forbids: ["no spotlight rays", "no lens flare bursts", "no hard vignettes across safe region"],
    bestFor: ["invitation campaigns", "season transitions", "contemplative themes"],
    markFriendly: false
  },
  painterly_atmosphere: {
    name: "Painterly Atmosphere",
    description: "Brush-like tonal fields and atmospheric blending with intentional restraint.",
    backgroundRules: [
      "Use broad painterly strokes and soft blending, avoiding over-rendered detail.",
      "Medium should feel matte and analog, not glossy digital airbrush.",
      "For title-stage requests, feather brush activity away from lockup lane."
    ],
    lockupRules: [
      "Bias toward centered_classic, editorial_stack, and stepped_baseline.",
      "Typography mood: elegant, expressive, and stable.",
      "Max ornament: one gestural accent or subtle rule."
    ],
    allowedMedia: ["gouache wash", "acrylic texture", "dry brush grain"],
    forbids: ["no literal portrait painting", "no chaotic brush clutter near lockup", "no faux watercolor blooms over title"],
    bestFor: ["lament/hope themes", "worship series", "reflective seasons"],
    markFriendly: false
  },
  photographic_graphic_overlay: {
    name: "Photographic Graphic Overlay",
    description: "Photo-led base with disciplined graphic overlays and protected text lanes.",
    backgroundRules: [
      "Use one photographic scene with 1-3 overlay geometries to control hierarchy.",
      "Photo treatment should be tonal and restrained, not hyper-saturated.",
      "For title-stage behavior, keep overlays and focal detail away from lockup safe region."
    ],
    lockupRules: [
      "Bias toward editorial_stack, split_title, and banner_strip.",
      "Typography mood: contemporary editorial with strong contrast.",
      "Max ornament: one geometric overlay echo."
    ],
    allowedMedia: ["photo base", "graphic overlays", "grain overlays"],
    forbids: ["no literal stock worship crowd clichés", "no busy bokeh behind lockup", "no mixed lighting chaos"],
    bestFor: ["event promos", "testimony themes", "city/outreach contexts"],
    markFriendly: false
  },
  macro_texture_minimal: {
    name: "Macro Texture Minimal",
    description: "Close-cropped tactile surfaces with minimal composition and generous negative space.",
    backgroundRules: [
      "Use one macro texture family with calm tonal range and minimal compositional interruption.",
      "Texture should feel tangible but low-frequency in the lockup zone.",
      "Title-stage compatibility is high when one side remains smooth and low contrast."
    ],
    lockupRules: [
      "Bias toward editorial_stack, framed_type, or centered_classic.",
      "Typography mood: understated premium minimalism.",
      "Max ornament: none."
    ],
    allowedMedia: ["stone/paper/fabric macro", "matte gradients", "subtle grain"],
    forbids: ["no noisy high-frequency texture everywhere", "no glossy chrome effects", "no detail spikes in safe region"],
    bestFor: ["minimal campaigns", "prayer/quiet themes", "mature brand look"],
    markFriendly: false
  },
  engraved_heritage: {
    name: "Engraved Heritage",
    description: "Classic engraved linework and letterpress-era discipline with restrained heritage tone.",
    backgroundRules: [
      "Use engraved hatch patterns with controlled density and clear focal hierarchy.",
      "Medium should mimic paper print tactility and one-ink style behavior.",
      "For title-stage requests, reduce hatch density in lockup lane and preserve contrast."
    ],
    lockupRules: [
      "Bias toward seal_arc, centered_classic, monogram_mark, and banner_strip.",
      "Typography mood: classic serif authority with measured spacing.",
      "Max ornament: engraved border or crest accents, kept secondary."
    ],
    allowedMedia: ["engraving hatching", "letterpress texture", "mono/duo ink"],
    forbids: ["no fake vintage outside this family", "no ornate overload", "no low-opacity title treatment"],
    bestFor: ["heritage milestones", "historic themes", "formal celebrations"],
    markFriendly: false
  },
  manuscript_marginalia: {
    name: "Manuscript Marginalia",
    description: "Margin-note and annotation-inspired compositions with scholarly warmth.",
    backgroundRules: [
      "Use parchment-like fields with sparse marginal marks and intentional whitespace.",
      "Integrate annotation motifs as peripheral accents, never central clutter.",
      "For title-stage compatibility, reserve central or upper lane with minimal marks."
    ],
    lockupRules: [
      "Bias toward centered_classic, vertical_spine, and editorial_stack.",
      "Typography mood: literary, intelligent, and calm.",
      "Max ornament: small marginal glyph-like marks only."
    ],
    allowedMedia: ["parchment texture", "ink annotations", "subtle manuscript marks"],
    forbids: ["no illegible fake body text blocks", "no ornate illuminated chaos", "no dense notes in safe region"],
    bestFor: ["study series", "biblical literacy", "historical context themes"],
    markFriendly: false
  },
  emblem_seal_system: {
    name: "Emblem Seal System",
    description: "Structured emblem language with repeatable seal logic and strong identity cohesion.",
    backgroundRules: [
      "Design around one emblem grammar and supporting geometric field, not multiple unrelated symbols.",
      "Medium can include flat ink, stamped texture, or restrained metallic tone simulation.",
      "For title-stage behavior, keep emblem secondary and preserve a clear lockup lane."
    ],
    lockupRules: [
      "Bias toward monogram_mark, seal_arc, centered_classic, and banner_strip.",
      "Typography mood: institutional, intentional, and brand-ready.",
      "Max ornament: one primary emblem and one secondary support element."
    ],
    allowedMedia: ["seal geometry", "ink stamp texture", "clean vector badge forms"],
    forbids: ["no mascot-style illustration", "no random crest parts", "no oversized emblem overpowering title"],
    bestFor: ["series identity systems", "multi-channel campaigns", "church-wide initiatives"],
    markFriendly: true
  },
  playful_neon_pool: {
    name: "Playful Neon Pool",
    description: "Summer-forward playful energy with splash silhouettes, wave arcs, and a calm title stage.",
    backgroundRules: [
      "Use big simple shapes, splash silhouettes, pool-tile grid accents, and wave arcs with controlled motion.",
      "Keep dense detail away from the lockup safe region so the center lane stays calm and readable.",
      "When title-stage is requested, build an integrated stage with gradient or shape framing; do not leave a blank void and do not use spotlight rays."
    ],
    lockupRules: [
      "Bias toward modern editorial lockups such as editorial_stack, framed_type, split_title, or offset_kicker.",
      "Keep typography clean and disciplined with clear hierarchy and spacing.",
      "Avoid faux-vintage treatment and avoid over-ornamented type effects."
    ],
    allowedMedia: ["vector splash silhouettes", "pool-tile grid accents", "soft energetic gradients", "clean shape overlays"],
    forbids: [
      "no generic dove/flame/sunburst/wheat motifs",
      "no camp clipart unless the brief explicitly indicates Kids or VBS",
      "no busy confetti inside the lockup safe region",
      "no neon hues outside allowed palette when in brand mode"
    ],
    bestFor: ["summer", "joy", "celebration", "gratitude", "kids/vbs when indicated"],
    markFriendly: true
  },
  comic_storyboard: {
    name: "Comic Storyboard",
    description: "Hand-drawn ink and wash with storyboard panel structure and editorial narrative pacing.",
    backgroundRules: [
      "Use ink linework, wash fills, and subtle panel borders as compositional structure.",
      "Keep default tone editorial and mature; avoid drifting into children’s-cartoon exaggeration unless requested.",
      "For title-stage mode, integrate a panel or label-style stage cleanly and avoid faint wireframe artifacts."
    ],
    lockupRules: [
      "Bias toward editorial_stack, framed_type, and offset_kicker; avoid emblem_seal behavior unless explicitly requested.",
      "Keep lettering crisp and readable with restrained character.",
      "Do not use comic bubble lettering unless the brief explicitly asks for it."
    ],
    allowedMedia: ["ink linework", "wash fills", "panel borders", "paper grain"],
    forbids: [
      "no heavy grunge distress",
      "no messy scribbles crossing the lockup safe region",
      "no generic motif icon packs"
    ],
    bestFor: ["gratitude", "narrative series", "parables", "story themes", "testimony series"],
    markFriendly: true
  },
  bubbly_3d_clay: {
    name: "Bubbly 3D Clay",
    description: "Rounded chunky 3D clay-like forms with toy-like softness and clear hierarchy.",
    backgroundRules: [
      "Use a few large rounded forms with gentle depth and minimal supporting props.",
      "Keep the scene simple and uncluttered so form language stays readable.",
      "When title-stage is needed, reserve a smooth plateau or gradient area and avoid hard spotlight treatment."
    ],
    lockupRules: [
      "Bias toward centered_classic, split_title, or banner_strip structures.",
      "Avoid engraved and manuscript-style lockup personalities.",
      "Keep type high-contrast and crisp; do not render the typography as 3D unless the brief explicitly requests it."
    ],
    allowedMedia: ["soft 3d clay forms", "matte depth shading", "simple rounded geometry"],
    forbids: [
      "no over-rendered photorealism",
      "no plastic glare or chrome shine",
      "no cluttered prop-heavy scenes",
      "no generic stock Christian icons"
    ],
    bestFor: ["kids ministry series", "family series", "joy/celebration themes", "summer", "welcome campaigns"],
    markFriendly: true
  },
  sticker_pack_pop: {
    name: "Sticker Pack Pop",
    description: "Sticker-sheet decal style with clean outlines, subtle shadows, and strong negative space.",
    backgroundRules: [
      "Use a clean field with only 1-3 sticker motifs and subtle drop shadows.",
      "Preserve strong negative space for the title stage and keep composition intentional.",
      "Keep sticker edges away from lockup bounds and preserve the safe region."
    ],
    lockupRules: [
      "Bias toward editorial_grid_minimal, banner_strip, and stepped_baseline compositions.",
      "Avoid seal_arc unless explicitly requested.",
      "Keep typography clean and allow only a small supporting label or ribbon accent."
    ],
    allowedMedia: ["sticker outlines", "subtle drop shadows", "clean flat fields", "minimal decal texture"],
    forbids: [
      "no cluttered sticker piles",
      "no random icon salad",
      "no generic Christian stock icons unless allowed by motif bank guidance"
    ],
    bestFor: ["youth", "events", "summer", "vision sunday modern tone", "topical series"],
    markFriendly: true
  },
  paper_cut_collage_playful: {
    name: "Paper Cut Collage Playful",
    description: "Tactile cut-paper layering with playful structure, subtle tape accents, and clear hierarchy.",
    backgroundRules: [
      "Use layered paper-cut shapes with organized depth and clear visual hierarchy.",
      "Texture should be subtle and tactile; avoid scrapbook-like chaos.",
      "In title-stage mode, integrate a cut-paper stage or label area directly into the composition."
    ],
    lockupRules: [
      "Bias toward framed_type, editorial_stack, and split_title lockups.",
      "Avoid emblem_seal behavior unless explicitly requested.",
      "Keep typography crisp and contemporary; avoid faux-vintage type treatment."
    ],
    allowedMedia: ["cut-paper layers", "torn edges", "light tape accents", "matte paper texture"],
    forbids: [
      "no messy collage noise",
      "no over-grunge distress",
      "no generic stock motifs"
    ],
    bestFor: ["gratitude/thanksgiving", "community series", "topical series", "summer"],
    markFriendly: true
  }
};

const STYLE_FAMILY_KEY_SET = new Set<string>(STYLE_FAMILY_KEYS);

export function isStyleFamilyKey(value: unknown): value is StyleFamilyKey {
  return typeof value === "string" && STYLE_FAMILY_KEY_SET.has(value);
}
