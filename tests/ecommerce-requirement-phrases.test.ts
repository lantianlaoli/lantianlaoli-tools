import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addRequirementPhrase,
  appendRequirementPhrase,
  DEFAULT_REQUIREMENT_PHRASES,
  deleteRequirementPhrase,
  parseStoredRequirementPhrases,
  updateRequirementPhrase,
} from "../src/lib/ecommerce-requirement-phrases";

test("requirement phrases fall back to defaults when storage is empty or invalid", () => {
  assert.deepEqual(parseStoredRequirementPhrases(null), {
    phrases: DEFAULT_REQUIREMENT_PHRASES,
    shouldPersist: true,
  });
  assert.deepEqual(parseStoredRequirementPhrases("not-json"), {
    phrases: DEFAULT_REQUIREMENT_PHRASES,
    shouldPersist: true,
  });
  assert.deepEqual(parseStoredRequirementPhrases(JSON.stringify(["自定义短语"])), {
    phrases: ["自定义短语"],
    shouldPersist: false,
  });
});

test("requirement phrases split the legacy carousel text shortcut", () => {
  assert.deepEqual(
    parseStoredRequirementPhrases(JSON.stringify(["轮播图不要出现产品本身之外的文字、引导说明、箭头或标签", "自定义短语"])),
    {
      phrases: [
        "轮播图不要出现产品本身之外的文字",
        "轮播图不要出现引导说明、箭头或标签",
        "自定义短语",
      ],
      shouldPersist: true,
    }
  );
  assert.equal(DEFAULT_REQUIREMENT_PHRASES.includes("轮播图不要出现产品本身之外的文字、引导说明、箭头或标签"), false);
});

test("requirement phrase click appends without overwriting existing text", () => {
  assert.equal(appendRequirementPhrase("", "画面保持极简高级，减少装饰元素"), "画面保持极简高级，减少装饰元素");
  assert.equal(
    appendRequirementPhrase("已有要求", "不要出现价格、促销角标、二维码、水印"),
    "已有要求\n不要出现价格、促销角标、二维码、水印"
  );
});

test("requirement phrase CRUD trims empty values and prevents duplicates", () => {
  assert.deepEqual(addRequirementPhrase(["A"], " "), ["A"]);
  assert.deepEqual(addRequirementPhrase(["A"], "A"), ["A"]);
  assert.deepEqual(addRequirementPhrase(["A"], " B "), ["A", "B"]);

  assert.deepEqual(updateRequirementPhrase(["A", "B"], 0, " "), ["A", "B"]);
  assert.deepEqual(updateRequirementPhrase(["A", "B"], 0, "B"), ["A", "B"]);
  assert.deepEqual(updateRequirementPhrase(["A", "B"], 0, " C "), ["C", "B"]);

  assert.deepEqual(deleteRequirementPhrase(["A", "B"], 0), ["B"]);
  assert.deepEqual(deleteRequirementPhrase(["A"], 0), []);
});
