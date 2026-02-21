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
      passageRef: "John 1-21"
    }),
    "whole_book",
    "Expected full John chapter range to infer whole_book."
  );

  assert.equal(
    inferScriptureScope({
      passageRef: "Romans 1-16"
    }),
    "whole_book",
    "Expected full Romans chapter range to infer whole_book."
  );

  assert.equal(
    inferScriptureScope({
      passageRef: "John 1-12"
    }),
    "multi_passage",
    "Expected non-full chapter range to infer multi_passage."
  );

  assert.equal(
    inferScriptureScope({
      passageRef: "John 1; John 3; John 20"
    }),
    "multi_passage",
    "Expected semicolon-separated discrete references to infer multi_passage."
  );

  assert.equal(
    inferScriptureScope({
      passageRef: "Song of Songs 1-8"
    }),
    "whole_book",
    "Expected Song of Songs alias range to infer whole_book."
  );

  assert.equal(
    inferScriptureScope({
      passageRef: "I John 1-5"
    }),
    "whole_book",
    "Expected I John alias range to infer whole_book."
  );

  console.log("scripture-scope-tests: ok");
}

main();
