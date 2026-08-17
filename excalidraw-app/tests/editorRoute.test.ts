import {
  getWorkspaceEditorPath,
  getWorkspaceFileIdFromPath,
  isWorkspaceEditorPath,
} from "../workspace/editorRoute";

describe("workspace editor route", () => {
  it("builds and parses the canonical /:id/editor route", () => {
    expect(getWorkspaceEditorPath("file id")).toBe("/file%20id/editor");
    expect(getWorkspaceFileIdFromPath("/file%20id/editor")).toBe("file id");
    expect(isWorkspaceEditorPath("/file%20id/editor")).toBe(true);
  });

  it("does not accept the previous query-string editor route", () => {
    expect(getWorkspaceFileIdFromPath("/editor")).toBe("");
    expect(isWorkspaceEditorPath("/editor")).toBe(false);
  });
});
