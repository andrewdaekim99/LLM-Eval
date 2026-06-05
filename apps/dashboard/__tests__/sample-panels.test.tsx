import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SamplePanels } from "@/components/SamplePanels";
import { makeSample } from "../test/fixtures";

describe("<SamplePanels />", () => {
  it("shows a cache-hit badge + the per-scorer pass/fail badge", () => {
    render(
      <SamplePanels
        samples={[
          makeSample({
            output: "Paris.",
            cacheHit: true,
            scores: [
              { scorer: "exactMatch", value: 1, passed: true },
              { scorer: "llmJudge", value: 0.9, passed: true },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText(/cache hit/i)).toBeInTheDocument();
    expect(screen.getByText(/exactMatch: 1\.00/)).toBeInTheDocument();
    expect(screen.getByText(/llmJudge: 0\.90/)).toBeInTheDocument();
    expect(screen.getByText("Paris.")).toBeInTheDocument();
  });

  it("falls back to a placeholder when there are no samples", () => {
    render(<SamplePanels samples={[]} />);
    expect(
      screen.getByText(/no samples recorded for this case/i),
    ).toBeInTheDocument();
  });
});
