import assert from "node:assert/strict";
import { inferScriptureScope } from "../lib/bible-motif-bank";

function main(): void {
  assert.equal(
    inferScriptureScope({
      passageRef: "",
      seriesTitle: "The Gospel of John"
    }),
    "whole_book",
    "Expected empty passage with whole-book series title to infer whole_book."
  );

  assert.equal(
    inferScriptureScope({
      passageRef: "John"
    }),
    "whole_book",
    "Expected book-only passage to infer whole_book."
  );

  assert.equal(
    inferScriptureScope({
      passageRef: "John 3:16"
    }),
    "specific_passage",
    "Expected a single chapter:verse reference to infer specific_passage."
  );

  assert.equal(
    inferScriptureScope({
      passageRef: "John 1; John 3; John 20"
    }),
    "multi_passage",
    "Expected semicolon-separated discrete references to infer multi_passage."
  );

  console.log("scripture-scope-tests: ok");
}

main();
