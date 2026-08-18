import { render, screen } from "@testing-library/react";

import { TopErrorBoundary } from "./TopErrorBoundary";

const ThrowingChild = () => {
  throw new Error("test canvas failure");
};

describe("TopErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders its fallback without requiring the editor Jotai provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <TopErrorBoundary>
        <ThrowingChild />
      </TopErrorBoundary>,
    );

    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
