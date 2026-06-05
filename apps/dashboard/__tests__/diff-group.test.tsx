import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { DiffGroup } from "@/components/DiffGroup";
import { makeDiff } from "../test/fixtures";

describe("<DiffGroup />", () => {
  it("shows per-case mean score before → after and links to drill-down", () => {
    render(
      <DiffGroup
        title="Fixed"
        runIdB="bbbbbbbb-5555-6666-7777-888888888888"
        diffs={[
          makeDiff({
            caseId: "gen-negation-handling",
            kind: "fixed",
            aScores: [{ scorer: "llmJudge", value: 0.2, passed: false }],
            bScores: [{ scorer: "llmJudge", value: 0.95, passed: true }],
          }),
        ]}
      />,
    );

    const heading = screen.getByText(/^Fixed$/);
    expect(heading.parentElement).toHaveTextContent("(1)");

    const link = screen.getByRole("link", { name: /gen-negation-handling/i });
    expect(link).toHaveAttribute(
      "href",
      "/runs/bbbbbbbb-5555-6666-7777-888888888888/cases/gen-negation-handling",
    );

    const row = link.closest("li") as HTMLElement;
    expect(within(row).getByText("0.20 → 0.95")).toBeInTheDocument();
  });

  it("renders the empty message when the group is empty", () => {
    render(
      <DiffGroup
        title="Regressed"
        runIdB="bbbbbbbb-5555-6666-7777-888888888888"
        diffs={[]}
        emptyMessage="No regressions."
      />,
    );
    expect(screen.getByText("No regressions.")).toBeInTheDocument();
  });
});
