// Structured extraction suite: pull a US shipping address out of messy free text.
// Scored by `jsonSchema` (output is valid JSON of the right shape) + `fieldAccuracy`
// (each field matches the expected value).

import { z } from "zod";
import { fieldAccuracy, jsonSchema, type Case, type Suite } from "@yardstick/core";

const AddressSchema = z.object({
  name: z.string(),
  street1: z.string(),
  street2: z.string().nullable(),
  city: z.string(),
  state: z.string().length(2),
  zip: z.string(),
});

type Address = z.infer<typeof AddressSchema>;

const SYSTEM_PROMPT = `You extract US shipping addresses from messy free text.

Output ONLY a JSON object matching this exact shape, with no prose, no markdown fences, no commentary:
{
  "name": string,           // recipient's full name as written
  "street1": string,        // primary street line (number + street, or PO Box)
  "street2": string | null, // unit/apt/suite/floor — null if there isn't one
  "city": string,
  "state": string,          // exactly 2 uppercase letters (e.g., "CA", "NY")
  "zip": string             // 5 digits or 5+4 ("90210" or "90210-1234")
}

Normalize the state to its 2-letter USPS code. Preserve the name's capitalization as written.`;

const cases: readonly Case<string, Address>[] = [
  {
    id: "addr-simple",
    input: "John Smith, 123 Main St, Anytown, CA 90210",
    expectation: {
      name: "John Smith",
      street1: "123 Main St",
      street2: null,
      city: "Anytown",
      state: "CA",
      zip: "90210",
    },
  },
  {
    id: "addr-apt",
    input: "Send to Jane Doe at 456 Oak Avenue Apt 4B, Brooklyn, NY 11201",
    expectation: {
      name: "Jane Doe",
      street1: "456 Oak Avenue",
      street2: "Apt 4B",
      city: "Brooklyn",
      state: "NY",
      zip: "11201",
    },
  },
  {
    id: "addr-suite-prose",
    input: "Hi, please deliver to Mike Johnson — 789 Elm Road, Suite 200, Austin TX 78701. Thanks!",
    expectation: {
      name: "Mike Johnson",
      street1: "789 Elm Road",
      street2: "Suite 200",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
  },
  {
    id: "addr-zip-plus-4",
    input: "Sarah Williams / 321 Pine Lane / Cambridge / MA 02139-4307",
    expectation: {
      name: "Sarah Williams",
      street1: "321 Pine Lane",
      street2: null,
      city: "Cambridge",
      state: "MA",
      zip: "02139-4307",
    },
  },
  {
    id: "addr-po-box",
    input: "PO Box 1234, c/o Robert Lee, Springfield IL 62701",
    expectation: {
      name: "Robert Lee",
      street1: "PO Box 1234",
      street2: null,
      city: "Springfield",
      state: "IL",
      zip: "62701",
    },
  },
  {
    id: "addr-spelled-state",
    input: "delivery to dr emily chen, 555 maple boulevard, portland oregon 97201",
    expectation: {
      name: "dr emily chen",
      street1: "555 maple boulevard",
      street2: null,
      city: "portland",
      state: "OR",
      zip: "97201",
    },
  },
  {
    id: "addr-international-suffix",
    input:
      "Please ship: David Park, 100 Wilshire Blvd Floor 12, Los Angeles, California 90017, USA",
    expectation: {
      name: "David Park",
      street1: "100 Wilshire Blvd",
      street2: "Floor 12",
      city: "Los Angeles",
      state: "CA",
      zip: "90017",
    },
  },
  {
    id: "addr-comma-soup",
    input: "ATTN MARK GARCIA, 88 Riverside Drive #7C New York NY 10024",
    expectation: {
      name: "MARK GARCIA",
      street1: "88 Riverside Drive",
      street2: "#7C",
      city: "New York",
      state: "NY",
      zip: "10024",
    },
  },
];

export const extraction: Suite<string, Address> = {
  name: "extraction",
  promptVersion: "v1",
  params: {
    model: "claude-haiku-4-5",
    maxTokens: 512,
    temperature: 0,
    system: SYSTEM_PROMPT,
  },
  buildPrompt: (input) => [{ role: "user", content: input }],
  cases,
  scorers: [
    jsonSchema(AddressSchema),
    fieldAccuracy({
      schema: AddressSchema,
      trimStrings: true,
      passThreshold: 1,
    }),
  ],
  thresholds: {
    passRate: 0.75,
    maxCostUSD: 0.05,
  },
};

export default extraction;
