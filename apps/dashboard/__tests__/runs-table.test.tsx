import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { RunsTable } from "@/components/RunsTable";
import { makeRun } from "../test/fixtures";

describe("<RunsTable />", () => {
  it("shows a placeholder when there are no runs", () => {
    render(<RunsTable runs={[]} />);
    expect(
      screen.getByText(/no runs match the current filters/i),
    ).toBeInTheDocument();
  });

  it("renders one row per run with pass/fail badges and links to detail", () => {
    render(
      <RunsTable
        runs={[
          makeRun({
            runId: "aaaaaaaa-1111-2222-3333-444444444444",
            suite: "generation",
            passRate: 1,
            passedCases: 8,
            totalCases: 8,
          }),
          makeRun({
            runId: "bbbbbbbb-5555-6666-7777-888888888888",
            suite: "extraction",
            passRate: 0.5,
            passedCases: 4,
            totalCases: 8,
          }),
        ]}
      />,
    );

    const rows = screen.getAllByRole("row");
    // Header + 2 data rows.
    expect(rows).toHaveLength(3);

    const passRow = rows[1];
    const failRow = rows[2];
    if (!passRow || !failRow) throw new Error("expected data rows");

    // First row links to its run detail.
    const passLink = within(passRow).getByRole("link", { name: /aaaaaaaa/i });
    expect(passLink).toHaveAttribute("href", "/runs/aaaaaaaa-1111-2222-3333-444444444444");

    // Pass rate badges: 100% on row 1, 50% on row 2.
    expect(within(passRow).getByText("100.0%")).toBeInTheDocument();
    expect(within(failRow).getByText("50.0%")).toBeInTheDocument();

    // Suite name renders + links to /suites.
    expect(
      within(passRow).getByRole("link", { name: /generation/i }),
    ).toHaveAttribute("href", "/suites/generation");
  });
});
