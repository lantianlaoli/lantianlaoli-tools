import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addRequirementPhrase,
  appendRequirementPhrase,
  deleteRequirementPhrase,
  getDefaultRequirementPhrases,
  parseStoredRequirementPhrases,
  updateRequirementPhrase,
} from "../src/lib/ecommerce-requirement-phrases";

test("requirement phrases fall back to localized defaults when storage is empty or invalid", () => {
  const zhDefaults = getDefaultRequirementPhrases("zh");
  assert.deepEqual(parseStoredRequirementPhrases(null, "zh"), {
    phrases: zhDefaults,
    shouldPersist: true,
  });
  assert.deepEqual(parseStoredRequirementPhrases("not-json", "zh"), {
    phrases: zhDefaults,
    shouldPersist: true,
  });
  assert.deepEqual(parseStoredRequirementPhrases(JSON.stringify(["自定义短语"]), "zh"), {
    phrases: ["自定义短语"],
    shouldPersist: false,
  });

  const enDefaults = getDefaultRequirementPhrases("en");
  assert.deepEqual(parseStoredRequirementPhrases(null, "en"), {
    phrases: enDefaults,
    shouldPersist: true,
  });
  assert.deepEqual(parseStoredRequirementPhrases(JSON.stringify(["Custom phrase"]), "en"), {
    phrases: ["Custom phrase"],
    shouldPersist: false,
  });

  for (const phrase of enDefaults) {
    assert.equal(/\p{Extended_Pictographic}/u.test(phrase), false, `English default still contains emoji: ${phrase}`);
  }
});

test("requirement phrases split the legacy carousel text shortcut per language", () => {
  assert.deepEqual(
    parseStoredRequirementPhrases(
      JSON.stringify(["轮播图不要出现产品本身之外的文字、引导说明、箭头或标签", "自定义短语"]),
      "zh",
    ),
    {
      phrases: [
        "轮播图不要出现产品本身之外的文字",
        "轮播图不要出现引导说明、箭头或标签",
        "自定义短语",
      ],
      shouldPersist: true,
    }
  );
  assert.equal(
    getDefaultRequirementPhrases("zh").includes("轮播图不要出现产品本身之外的文字、引导说明、箭头或标签"),
    false
  );

  assert.deepEqual(
    parseStoredRequirementPhrases(
      JSON.stringify(["Carousel images must not include text, calls-to-action, arrows, or labels beyond the product itself", "Custom phrase"]),
      "en",
    ),
    {
      phrases: [
        "Carousel images must not include text beyond the product itself",
        "Carousel images must not include calls-to-action, arrows, or labels",
        "Custom phrase",
      ],
      shouldPersist: true,
    }
  );
  assert.equal(
    getDefaultRequirementPhrases("en").includes(
      "Carousel images must not include text, calls-to-action, arrows, or labels beyond the product itself"
    ),
    false
  );
});

test("requirement phrase click appends without overwriting existing text", () => {
  assert.equal(appendRequirementPhrase("", "画面保持极简高级，减少装饰元素"), "画面保持极简高级，减少装饰元素");
  assert.equal(
    appendRequirementPhrase("已有要求", "不要出现价格、促销角标、二维码、水印"),
    "已有要求\n不要出现价格、促销角标、二维码、水印"
  );
  assert.equal(appendRequirementPhrase("", "Keep the look minimal and premium — no decorative clutter"), "Keep the look minimal and premium — no decorative clutter");
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
