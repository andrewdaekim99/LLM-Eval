// Classification suite: sentiment labeling. Scored by exactMatch (with trim +
// case-insensitive) against the canonical three-label set. The CLI's summary detects
// classification-shaped runs and prints a confusion matrix below the per-case lines.

import { exactMatch, type Case, type Suite } from "@yardstick/core";

type Sentiment = "positive" | "negative" | "neutral";

const SYSTEM_PROMPT = `Classify the sentiment of the user's message as one of three labels.

Respond with ONLY the single label, lowercase, no punctuation, no quotes, no explanation.
Allowed labels:
positive
negative
neutral

If the message expresses overall approval, satisfaction, or praise: positive.
If it expresses dissatisfaction, frustration, or criticism: negative.
If it is purely factual, descriptive, or genuinely mixed without leaning: neutral.

Detect sarcasm: surface-level praise that is clearly meant as criticism is negative.`;

const cases: readonly Case<string, Sentiment>[] = [
  {
    id: "sent-clear-positive",
    input: "Best product I've ever used. Highly recommend!",
    expectation: "positive",
  },
  {
    id: "sent-clear-negative",
    input: "Terrible. Broke after one day. Don't waste your money.",
    expectation: "negative",
  },
  {
    id: "sent-clear-neutral",
    input: "The package arrived on Tuesday at 3pm.",
    expectation: "neutral",
  },
  {
    id: "sent-sarcasm",
    input: "Oh great, another buggy update. Just what I needed today.",
    expectation: "negative",
  },
  {
    id: "sent-mostly-positive",
    input: "Some quirks here and there, but overall I'm really happy with it.",
    expectation: "positive",
  },
  {
    id: "sent-backhanded",
    input: "It's fine, I guess. Nothing special but it works.",
    expectation: "neutral",
  },
  {
    id: "sent-strong-negative",
    input: "Honestly the worst customer experience I've had with any brand. Never again.",
    expectation: "negative",
  },
  {
    id: "sent-mild-positive",
    input: "Pretty good for the price.",
    expectation: "positive",
  },
  {
    id: "sent-factual",
    input: "Compatible with iPhone 14 and later. Requires iOS 17.",
    expectation: "neutral",
  },
  {
    id: "sent-frustrated",
    input: "Spent 3 hours on hold and they still didn't resolve my issue.",
    expectation: "negative",
  },
];

export const classification: Suite<string, Sentiment> = {
  name: "classification",
  promptVersion: "v1",
  params: {
    model: "claude-haiku-4-5",
    maxTokens: 8,
    temperature: 0,
    system: SYSTEM_PROMPT,
  },
  buildPrompt: (input) => [{ role: "user", content: input }],
  cases,
  scorers: [exactMatch({ trim: true, caseInsensitive: true })],
  thresholds: {
    passRate: 0.8,
    maxCostUSD: 0.01,
  },
};

export default classification;
