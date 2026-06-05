import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { JudgePanel } from "@/components/JudgePanel";
import { makeVerdict } from "../test/fixtures";

describe("<JudgePanel />", () => {
  it("renders nothing when there are no verdicts", () => {
    const { container } = render(<JudgePanel verdicts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the verdict badge, score, reason, and rubric for each sample", () => {
    render(
      <JudgePanel
        verdicts={[
          makeVerdict({
            verdict: "fail",
            score: 0.3,
            reason: "Hallucinated population density.",
            rubric: "Answer must be grounded in the passage.",
            judgeModel: "claude-sonnet-4-6",
          }),
        ]}
      />,
    );

    expect(screen.getByText("fail")).toBeInTheDocument();
    expect(screen.getByText(/score 0\.30/)).toBeInTheDocument();
    expect(
      screen.getByText("Hallucinated population density."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Answer must be grounded in the passage."),
    ).toBeInTheDocument();
    expect(screen.getByText(/judge claude-sonnet-4-6/)).toBeInTheDocument();
  });
});
