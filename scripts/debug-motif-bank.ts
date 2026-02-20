import { getMotifBankContext } from "../lib/bible-motif-bank";

type InputArgs = {
  title: string;
  subtitle?: string;
  scripturePassages?: string;
  description?: string;
  designNotes?: string;
};

function parseArgs(argv: string[]): InputArgs {
  const get = (flag: string): string | undefined => {
    const index = argv.findIndex((value) => value === flag);
    if (index < 0) {
      return undefined;
    }
    return argv[index + 1];
  };

  return {
    title: get("--title") || "Galatians: Free",
    subtitle: get("--subtitle") || "Adopted, no longer enslaved",
    scripturePassages: get("--scripture") || "Galatians 4:4-7",
    description: get("--description") || "A series on adoption, freedom, and life in the Spirit.",
    designNotes: get("--notes") || "Avoid generic church iconography."
  };
}

async function debugCase(label: string, args: InputArgs) {
  const motifBankContext = getMotifBankContext(args);
  let chosenMotifs = motifBankContext.motifCandidates.slice(0, 6);
  let chosenMarkIdeas = motifBankContext.markIdeaCandidates.slice(0, 3);
  let source = "deterministic-candidate-fallback";

  try {
    const briefModule = await import("../lib/bible-creative-brief");
    if (typeof briefModule.extractBibleCreativeBrief === "function") {
      const brief = await briefModule.extractBibleCreativeBrief({
        ...args,
        motifBankContext
      });
      chosenMotifs = brief.motifs;
      chosenMarkIdeas = brief.markIdeas;
      source = "extractBibleCreativeBrief";
    }
  } catch {
    // Intentionally silent so this remains runnable outside the Next.js server runtime.
  }

  console.log(`\n[Motif Bank Debug] ${label}`);
  console.log("title:", args.title);
  console.log("source:", source);
  console.log("bookKeys:", motifBankContext.bookKeys);
  console.log("bookNames:", motifBankContext.bookNames);
  console.log("topicKeys:", motifBankContext.topicKeys);
  console.log("topicNames:", motifBankContext.topicNames);
  console.log("scriptureScope:", motifBankContext.scriptureScope);
  console.log("sceneMotifRequested:", motifBankContext.sceneMotifRequested);
  console.log("fallbackMode:", motifBankContext.fallbackMode);
  console.log("primaryThemeCandidates:", motifBankContext.primaryThemeCandidates);
  console.log("secondaryThemeCandidates:", motifBankContext.secondaryThemeCandidates);
  console.log("sceneMotifCandidates:", motifBankContext.sceneMotifCandidates);
  console.log("\nmotifCandidates:", motifBankContext.motifCandidates);
  console.log("\nmarkIdeaCandidates:", motifBankContext.markIdeaCandidates);
  console.log("\nantiMotifs:", motifBankContext.antiMotifs);
  console.log("\nallowedGenericMotifs:", motifBankContext.allowedGenericMotifs);
  console.log("\nchosen.motifs:", chosenMotifs);
  console.log("\nchosen.markIdeas:", chosenMarkIdeas);
}

async function main() {
  const argv = process.argv.slice(2);
  const hasCustomTitle = argv.includes("--title");
  if (hasCustomTitle) {
    await debugCase("custom", parseArgs(argv));
    return;
  }

  const builtInCases: Array<{ label: string; input: InputArgs }> = [
    {
      label: "Advent: Hope",
      input: {
        title: "Advent: Hope",
        subtitle: "Waiting for the coming King",
        scripturePassages: "Isaiah 9:2-7",
        description: "An Advent series centered on watchful expectation and promise.",
        designNotes: "theme:Advent. Avoid nativity clipart."
      }
    },
    {
      label: "Vision Sunday",
      input: {
        title: "Vision Sunday",
        subtitle: "Where We Are Going Together",
        description: "A church-wide message on values, mission, and the next 12 months.",
        designNotes: "theme:Vision Sunday #theme=values roadmap mission focus."
      }
    },
    {
      label: "What Is the Gospel?",
      input: {
        title: "What Is the Gospel?",
        subtitle: "Good News for Sinners and Skeptics",
        description: "A foundational teaching series on gospel, grace, salvation, and justification.",
        designNotes: "[theme: gospel]"
      }
    },
    {
      label: "Prayer",
      input: {
        title: "Prayer",
        subtitle: "A House of Prayer for All Nations",
        scripturePassages: "Luke 11:1-4; Acts 4:23-31",
        description: "Teaching on intercession, persistence, and communal prayer.",
        designNotes: "season:Prayer"
      }
    },
    {
      label: "Galatians",
      input: {
        title: "Galatians: Free",
        subtitle: "Adopted, no longer enslaved",
        scripturePassages: "Galatians 4:4-7",
        description: "A series on adoption, freedom, and life in the Spirit.",
        designNotes: "Avoid generic church iconography."
      }
    }
  ];

  for (const testCase of builtInCases) {
    await debugCase(testCase.label, testCase.input);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
