import { callOpenRouter, type OpenRouterMessage } from "./openrouter";

const SYSTEM_PROMPT = `You are a text cleaning and translation assistant for product marketing content.

Your task is to process raw text extracted from Excel cells that may contain:
1. Chinese characters (中文) → translate to English
2. Japanese characters (日本語) → translate to English
3. Korean characters (한글) → translate to English
4. Symbol characters (!@#$%^&*()_+-=[]{}|;':",./<>?\`~) → remove
5. Emoji and emoticons → remove
6. Garbled/misencoded characters (�, â, ¢, ™, etc.) → remove
7. HTML entities and Excel cell artifacts → remove
8. Random garbage text (乱七八糟) → remove

Rules:
- TRANSLATE Chinese/Japanese/Korean text to English — do NOT delete it
- Keep line breaks only if they separate distinct content
- Return clean, readable English text
- If the input has no meaningful content to translate (only garbled/symbols), return an empty string
- Preserve meaningful English words and sentences as-is
- Keep basic punctuation (.,!?-:) and spaces

Output format: Return ONLY a JSON object with this structure:
{
  "cleaned_text": "the cleaned and/or translated English text"
}`;

function hasForeignCharacters(text: string): boolean {
  // CJK range check
  if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text)) {
    return true;
  }
  // Common non-ASCII that isn't basic Latin
  if (/[^\x00-\x7F]/.test(text)) {
    return true;
  }
  return false;
}

export async function cleanTextField(rawText: string): Promise<string> {
  if (!rawText || rawText.trim().length === 0) {
    return "";
  }

  // Already clean — skip AI call
  if (!hasForeignCharacters(rawText)) {
    return rawText;
  }

  const messages: OpenRouterMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Clean and translate this text:\n\n${rawText}` },
  ];

  try {
    const result = await callOpenRouter<{ cleaned_text: string }>(messages, { type: "json_object" });
    return result.cleaned_text?.trim() ?? "";
  } catch {
    // On failure, fall back to stripping non-ASCII chars
    return rawText.replace(/[^\x00-\x7F]/g, " ").replace(/\s+/g, " ").trim();
  }
}
