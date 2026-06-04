// Open-ended generation suite: answer a question grounded in a short passage.
// Scored by `llmJudge` against a written rubric — this is where the judge machinery
// (rubric, structured JSON output, anti-self-preference default judge model) earns its keep.

import { llmJudge, type Case, type Suite } from "@yardstick/core";

interface GenerationInput {
  readonly passage: string;
  readonly question: string;
}

interface GenerationExpectation {
  readonly answer: string;
}

const SYSTEM_PROMPT = `You answer questions strictly using the provided passage. Be concise.

Rules:
- If the passage contains the answer, give it directly.
- If the passage does NOT contain the answer, reply exactly: "The passage does not contain this information."
- Do not invent facts. Do not add commentary the user didn't ask for.`;

const RUBRIC = `Compare the OUTPUT to the REFERENCE answer object.

PASS if the output:
- Covers the reference's factual content (paraphrases and shorter equivalents are fine)
- Does not invent facts beyond the passage / reference
- Respects refusal: if the reference is "The passage does not contain this information", the
  output must also refuse rather than fabricate an answer

FAIL if the output:
- Misses key facts present in the reference
- Contains factual errors or hallucinations
- Refuses when the reference is a real answer
- Gives an answer when the reference is a refusal
- Pads with off-topic content

Ignore: minor wording differences, ordering, capitalization, and length.`;

const cases: readonly Case<GenerationInput, GenerationExpectation>[] = [
  {
    id: "gen-simple-lookup",
    input: {
      passage:
        "The Mariana Trench is the deepest known oceanic trench in the world. Its Challenger Deep, located in the southern end of the trench, reaches approximately 10,935 meters below sea level.",
      question: "What is the deepest known point in the ocean, and how deep is it?",
    },
    expectation: {
      answer: "Challenger Deep, in the Mariana Trench, at about 10,935 meters below sea level.",
    },
  },
  {
    id: "gen-named-person",
    input: {
      passage:
        "The Apollo 11 mission launched on July 16, 1969 and landed on the Moon on July 20, 1969. Neil Armstrong became the first person to walk on the lunar surface, followed by Buzz Aldrin. Michael Collins remained in lunar orbit aboard the command module.",
      question: "Who stayed in orbit while the other astronauts walked on the Moon?",
    },
    expectation: { answer: "Michael Collins." },
  },
  {
    id: "gen-numeric-fact",
    input: {
      passage:
        "RAID 5 distributes parity blocks across every drive in the array, allowing the array to tolerate the failure of any single drive without data loss. It requires a minimum of three drives.",
      question: "What is the minimum number of drives required for a RAID 5 array?",
    },
    expectation: { answer: "Three." },
  },
  {
    id: "gen-multi-item-list",
    input: {
      passage:
        "Cytokines are small proteins crucial in cell signaling. They are produced by a broad range of cells including macrophages, B lymphocytes, T lymphocytes and mast cells. Cytokines act through receptors and are important in the immune system, particularly in inflammation.",
      question: "Which cell types are mentioned as producers of cytokines?",
    },
    expectation: {
      answer: "Macrophages, B lymphocytes, T lymphocytes, and mast cells.",
    },
  },
  {
    id: "gen-refusal-when-absent",
    input: {
      passage:
        "Mount Everest's official height is 8,848.86 meters, as measured by a joint China-Nepal survey concluded in 2020.",
      question: "How many climbers attempt to summit Mount Everest each year?",
    },
    expectation: {
      answer: "The passage does not contain this information.",
    },
  },
  {
    id: "gen-negation-handling",
    input: {
      passage:
        "Photosynthesis requires light, but not all plants photosynthesize the same way. C3 plants close their stomata in hot, dry weather to conserve water, which limits CO2 intake. CAM plants, by contrast, open their stomata at night.",
      question: "Do C3 plants open their stomata at night?",
    },
    expectation: {
      answer:
        "No. The passage says C3 plants close their stomata in hot, dry weather; CAM plants are the ones that open at night.",
    },
  },
  {
    id: "gen-nuanced-history",
    input: {
      passage:
        "The Library of Alexandria was a major library in ancient Egypt. Its destruction is shrouded in mystery. Historical accounts variously blame Julius Caesar in 48 BCE, the Christian Emperor Theodosius in 391 CE, or the Muslim conqueror Amr ibn al-As in 642 CE. Modern scholarship generally regards the library as having declined gradually over centuries rather than being destroyed in a single event.",
      question:
        "What does modern scholarship say about how the Library of Alexandria was destroyed?",
    },
    expectation: {
      answer:
        "Modern scholarship generally views it as a gradual decline over centuries, not a single destructive event.",
    },
  },
  {
    id: "gen-attribute-extraction",
    input: {
      passage:
        "Le Corbusier's Villa Savoye, completed in 1931 near Paris, is regarded as a paradigmatic example of his Five Points of Architecture: pilotis, a flat roof terrace, an open plan, ribbon windows, and a free facade.",
      question: "List Le Corbusier's Five Points of Architecture as referenced in the passage.",
    },
    expectation: {
      answer: "Pilotis, a flat roof terrace, an open plan, ribbon windows, and a free facade.",
    },
  },
];

export const generation: Suite<GenerationInput, GenerationExpectation> = {
  name: "generation",
  promptVersion: "v1",
  params: {
    model: "claude-haiku-4-5",
    maxTokens: 256,
    temperature: 0,
    system: SYSTEM_PROMPT,
  },
  buildPrompt: ({ passage, question }) => [
    { role: "user", content: `Passage:\n${passage}\n\nQuestion: ${question}` },
  ],
  cases,
  scorers: [
    llmJudge<GenerationExpectation>({
      rubric: RUBRIC,
      // judgeModel defaults to claude-sonnet-4-6 (different family from the haiku SUT —
      // anti-self-preference, ADR-0007).
      passThreshold: 0.7,
    }),
  ],
  thresholds: {
    passRate: 0.75,
    maxCostUSD: 0.1,
  },
};

export default generation;
