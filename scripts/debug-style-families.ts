import { getMotifBankContext } from "../lib/bible-motif-bank";
import { detectPlayfulIntent, getDirectionTemplateCatalog, planDirectionSet } from "../lib/direction-planner";
import {
  STYLE_FAMILY_BANK,
  type StyleBucketKey,
  type StyleFamilyKey,
  type StyleMediumKey,
  type StyleToneKey
} from "../lib/style-family-bank";

const TITLE_STAGE_FAMILY_KEYS = new Set<StyleFamilyKey>([
  "light_gradient_stage",
  "editorial_grid_minimal",
  "modern_geometric_blocks",
  "abstract_organic_papercut",
  "macro_texture_minimal",
  "playful_neon_pool",
  "comic_storyboard",
  "bubbly_3d_clay",
  "sticker_pack_pop",
  "paper_cut_collage_playful"
]);

const PLAYFUL_STYLE_FAMILIES = new Set<StyleFamilyKey>([
  "playful_neon_pool",
  "comic_storyboard",
  "bubbly_3d_clay",
  "sticker_pack_pop",
  "paper_cut_collage_playful"
]);

const SAMPLES = [
  {
    id: "john-no-notes",
    title: "John",
    subtitle: "Believe and Live",
    passage: "John 20:31",
    description: "A gospel-centered walkthrough of Jesus' signs, words, and identity.",
    designNotes: "",
    brandMode: "fresh" as const,
    seriesMarkRequested: false
  },
  {
    id: "galatians-no-notes",
    title: "Galatians",
    subtitle: "Free in Christ",
    passage: "Galatians 5:1",
    description: "Paul on freedom, identity, and fruit of the Spirit.",
    designNotes: "",
    brandMode: "fresh" as const,
    seriesMarkRequested: false
  },
  {
    id: "vision-sunday-no-notes",
    title: "Vision Sunday",
    subtitle: "Built Together",
    passage: "Habakkuk 2:2",
    description: "Direction, mission, and church-wide alignment.",
    designNotes: "",
    brandMode: "brand" as const,
    seriesMarkRequested: true
  },
  {
    id: "galatians",
    title: "Galatians",
    subtitle: "Free in Christ",
    passage: "Galatians 5:1",
    description: "Paul on freedom, identity, and fruit of the Spirit.",
    designNotes: "clean and modern",
    brandMode: "fresh" as const,
    seriesMarkRequested: false
  },
  {
    id: "advent",
    title: "Advent",
    subtitle: "The Coming Light",
    passage: "Isaiah 9:2",
    description: "A hopeful season of waiting and expectation.",
    designNotes: "seasonal warmth but not kitsch",
    brandMode: "fresh" as const,
    seriesMarkRequested: false
  },
  {
    id: "vision-sunday",
    title: "Vision Sunday",
    subtitle: "Built Together",
    passage: "Habakkuk 2:2",
    description: "Direction, mission, and church-wide alignment.",
    designNotes: "include a reusable series mark",
    brandMode: "brand" as const,
    seriesMarkRequested: true
  },
  {
    id: "prayer",
    title: "Prayer",
    subtitle: "Draw Near",
    passage: "Psalm 145:18",
    description: "A contemplative call to personal and corporate prayer.",
    designNotes: "quiet and textural",
    brandMode: "fresh" as const,
    seriesMarkRequested: false
  },
  {
    id: "what-is-the-gospel",
    title: "What is the Gospel?",
    subtitle: "Good News for All",
    passage: "1 Corinthians 15:1-4",
    description: "A clear walkthrough of the message of Christ.",
    designNotes: "clear teaching emphasis with optional icon system",
    brandMode: "brand" as const,
    seriesMarkRequested: true
  },
  {
    id: "summer-daze",
    title: "Summer Daze",
    subtitle: "Finding God in the Fun",
    passage: "Psalm 16:11",
    description: "A joyful summer series about delight, play, and gratitude.",
    designNotes: "fun seasonal energy with clean readability",
    brandMode: "fresh" as const,
    seriesMarkRequested: false
  },
  {
    id: "vbs-stellar",
    title: "VBS: Stellar",
    subtitle: "Shine Bright",
    passage: "Matthew 5:16",
    description: "Kids VBS week with playful wonder and high energy.",
    designNotes: "kids, camp, playful, modern",
    brandMode: "fresh" as const,
    seriesMarkRequested: true
  },
  {
    id: "kids-camp",
    title: "Kids Camp",
    subtitle: "Wild Joy",
    passage: "Psalm 126:3",
    description: "Camp week for children with games, worship, and community.",
    designNotes: "fun, family-friendly, bright and simple",
    brandMode: "fresh" as const,
    seriesMarkRequested: true
  },
  {
    id: "gratitude",
    title: "Gratitude",
    subtitle: "A Thankful Heart",
    passage: "1 Thessalonians 5:18",
    description: "A series around thanksgiving, joy, and celebration.",
    designNotes: "playful-but-organized energy",
    brandMode: "brand" as const,
    seriesMarkRequested: false
  },
  {
    id: "joy",
    title: "Joy",
    subtitle: "Fullness of Life",
    passage: "John 15:11",
    description: "Celebration and delight rooted in Christ.",
    designNotes: "fun and vibrant without clutter",
    brandMode: "fresh" as const,
    seriesMarkRequested: false
  },
  {
    id: "family-sunday",
    title: "Family Sunday",
    subtitle: "Growing Together",
    passage: "Colossians 3:14",
    description: "A family-focused celebration service.",
    designNotes: "welcoming, energetic, modern",
    brandMode: "brand" as const,
    seriesMarkRequested: true
  },
  {
    id: "good-friday",
    title: "Good Friday",
    subtitle: "It Is Finished",
    passage: "John 19:30",
    description: "A solemn service centered on suffering, sacrifice, and lament.",
    designNotes: "restrained and reverent",
    brandMode: "fresh" as const,
    seriesMarkRequested: false
  },
  {
    id: "lament",
    title: "Lament",
    subtitle: "How Long, O Lord?",
    passage: "Psalm 13:1",
    description: "An honest series on grief, sorrow, and hope.",
    designNotes: "solemn, contemplative, quiet",
    brandMode: "fresh" as const,
    seriesMarkRequested: false
  },
  {
    id: "repentance",
    title: "Repentance",
    subtitle: "Turn and Live",
    passage: "Joel 2:12-13",
    description: "A sobering call to repentance and renewal.",
    designNotes: "serious tone; no playful cues",
    brandMode: "fresh" as const,
    seriesMarkRequested: false
  }
];

function fmtList(values: string[]): string {
  if (values.length === 0) {
    return "none";
  }
  return values.join(", ");
}

function upsertRecentFamilies(history: StyleFamilyKey[], selected: StyleFamilyKey[]): StyleFamilyKey[] {
  const seen = new Set<StyleFamilyKey>();
  const merged = [...selected, ...history].filter((family) => {
    if (seen.has(family)) {
      return false;
    }
    seen.add(family);
    return true;
  });
  return merged.slice(0, 20);
}

function upsertRecentBuckets(history: StyleBucketKey[], selected: StyleBucketKey[]): StyleBucketKey[] {
  const seen = new Set<StyleBucketKey>();
  const merged = [...selected, ...history].filter((bucket) => {
    if (seen.has(bucket)) {
      return false;
    }
    seen.add(bucket);
    return true;
  });
  return merged.slice(0, 20);
}

function whyChosen(params: {
  family: StyleFamilyKey;
  recent: StyleFamilyKey[];
  wantsSeriesMark: boolean;
  wantsTitleStage: boolean;
}): string {
  const reasons: string[] = [];
  if (!params.recent.includes(params.family)) {
    reasons.push("recent-avoidance");
  }
  if (params.wantsSeriesMark && STYLE_FAMILY_BANK[params.family].markFriendly) {
    reasons.push("mark-friendly");
  }
  if (params.wantsTitleStage && TITLE_STAGE_FAMILY_KEYS.has(params.family)) {
    reasons.push("title-stage-friendly");
  }
  return reasons.length > 0 ? reasons.join(", ") : "deterministic fallback/tie-break";
}

function main() {
  const enabledPresetKeys = [...new Set(getDirectionTemplateCatalog().map((template) => template.presetKey))];
  let recentStyleFamilies: StyleFamilyKey[] = [];
  let recentStyleBuckets: StyleBucketKey[] = [];

  for (const sample of SAMPLES) {
    const motifContext = getMotifBankContext({
      title: sample.title,
      subtitle: sample.subtitle,
      scripturePassages: sample.passage,
      description: sample.description,
      designNotes: sample.designNotes
    });
    const runSeed = `style-family-debug:${sample.id}`;
    const playfulIntent = detectPlayfulIntent({
      title: sample.title,
      subtitle: sample.subtitle,
      description: sample.description,
      designNotes: sample.designNotes,
      topics: motifContext.topicNames
    });
    const hasDesignNotes = Boolean(sample.designNotes?.trim());
    const explorationMode = !hasDesignNotes;
    const directionPlan = planDirectionSet({
      runSeed,
      enabledPresetKeys,
      optionCount: 3,
      brandMode: sample.brandMode,
      seriesMarkRequested: sample.seriesMarkRequested,
      wantsSeriesMarkLane: sample.seriesMarkRequested,
      motifs: motifContext.motifCandidates,
      allowedGenericMotifs: motifContext.allowedGenericMotifs,
      markIdeas: motifContext.markIdeaCandidates,
      recentStyleFamilies,
      recentStyleBuckets,
      explorationMode,
      seriesTitle: sample.title,
      seriesSubtitle: sample.subtitle,
      seriesDescription: sample.description,
      designNotes: sample.designNotes,
      topicNames: motifContext.topicNames,
      motifScope: motifContext.scriptureScope,
      primaryThemes: motifContext.primaryThemeCandidates,
      secondaryThemes: motifContext.secondaryThemeCandidates,
      sceneMotifs: motifContext.sceneMotifCandidates,
      sceneMotifRequested: motifContext.sceneMotifRequested
    });
    const selectedFamilies = directionPlan
      .map((direction) => direction.styleFamily)
      .filter((family): family is StyleFamilyKey => Boolean(family));
    const selectedBuckets = directionPlan
      .map((direction) => direction.styleBucket)
      .filter((bucket): bucket is StyleBucketKey => typeof bucket === "string" && bucket.length > 0);
    const selectedTones = directionPlan
      .map((direction) =>
        direction.styleTone || (direction.styleFamily ? STYLE_FAMILY_BANK[direction.styleFamily].tone : null)
      )
      .filter((tone): tone is StyleToneKey => typeof tone === "string" && tone.length > 0);
    const selectedMediums = directionPlan
      .map((direction) =>
        direction.styleMedium || (direction.styleFamily ? STYLE_FAMILY_BANK[direction.styleFamily].medium : null)
      )
      .filter((medium): medium is StyleMediumKey => typeof medium === "string" && medium.length > 0);
    const distinctCount = new Set(selectedFamilies).size;
    const distinctBucketCount = new Set(selectedBuckets).size;
    const distinctMediumCount = new Set(selectedMediums).size;
    const hasLightOrVivid = selectedTones.some((tone) => tone === "light" || tone === "vivid");
    const playfulChosenCount = selectedFamilies.filter((family) => PLAYFUL_STYLE_FAMILIES.has(family)).length;
    const chosenFamilyLine = directionPlan
      .map((direction) => {
        const key = direction.styleFamily;
        return `${direction.optionLabel}=${key || "missing"}`;
      })
      .join(" | ");
    const chosenBucketToneMediumLine = directionPlan
      .map((direction) => {
        const family = direction.styleFamily;
        const tone = direction.styleTone || (family ? STYLE_FAMILY_BANK[family].tone : null);
        const medium = direction.styleMedium || (family ? STYLE_FAMILY_BANK[family].medium : null);
        return `${direction.optionLabel}=${direction.styleBucket || "missing"}/${tone || "missing"}/${medium || "missing"}`;
      })
      .join(" | ");
    const chosenBucketFamilyLine = directionPlan
      .map((direction) => `${direction.optionLabel}=${direction.styleBucket || "missing"}/${direction.styleFamily || "missing"}`)
      .join(" | ");

    console.log(`\n=== ${sample.title} (${sample.brandMode}) ===`);
    console.log(`Run seed: ${runSeed}`);
    console.log(`Exploration mode: ${explorationMode ? "true" : "false"}`);
    console.log(
      `Playful intent: ${playfulIntent.isPlayful ? "true" : "false"} (${playfulIntent.level}; keywords: ${
        playfulIntent.reasonKeywords.join(", ") || "none"
      })`
    );
    console.log(`Books: ${fmtList(motifContext.bookNames)}`);
    console.log(`Topics: ${fmtList(motifContext.topicNames)}`);
    console.log(`Chosen A/B/C bucket+tone+medium: ${chosenBucketToneMediumLine}`);
    console.log(`Chosen A/B/C bucket+family: ${chosenBucketFamilyLine}`);
    console.log(`Chosen A/B/C families: ${chosenFamilyLine}`);
    console.log(`Distinctness check: ${distinctCount}/3`);
    console.log(`Distinct buckets check: ${distinctBucketCount}/3`);
    console.log(`hasLightOrVivid: ${hasLightOrVivid ? "true" : "false"}`);
    console.log(`Distinct mediums check: ${distinctMediumCount}/3`);
    console.log(`Playful family picks: ${playfulChosenCount}/3`);

    for (const direction of directionPlan) {
      const key = direction.styleFamily;
      if (!key) {
        console.log(`  ${direction.optionLabel}: [missing style family]`);
        continue;
      }
      const family = STYLE_FAMILY_BANK[key];
      const reason = whyChosen({
        family: key,
        recent: recentStyleFamilies,
        wantsSeriesMark: direction.wantsSeriesMark,
        wantsTitleStage: direction.wantsTitleStage
      });
      console.log(`  ${direction.optionLabel}: ${family.name} (${key}) -> ${reason}`);
    }

    recentStyleFamilies = upsertRecentFamilies(recentStyleFamilies, selectedFamilies);
    recentStyleBuckets = upsertRecentBuckets(recentStyleBuckets, selectedBuckets);
    console.log(`Recent family cache: ${recentStyleFamilies.slice(0, 8).join(", ") || "none"}`);
  }
}

main();
