import {
  getWorkspaceEditorPath,
  getWorkspaceFileIdFromPath,
  getWorkspacePreviewPath,
  isWorkspaceCanvasPath,
  isWorkspaceEditorPath,
  isWorkspacePreviewPath,
} from "../workspace/editorRoute";

describe("workspace editor route", () => {
  it("builds and parses the canonical /:id/editor route", () => {
    expect(getWorkspaceEditorPath("file id")).toBe("/file%20id/editor");
    expect(getWorkspaceFileIdFromPath("/file%20id/editor")).toBe("file id");
    expect(isWorkspaceEditorPath("/file%20id/editor")).toBe(true);
  });

  it("builds and parses the read-only /:id/preview route", () => {
    expect(getWorkspacePreviewPath("file id")).toBe("/file%20id/preview");
    expect(getWorkspaceFileIdFromPath("/file%20id/preview")).toBe("file id");
    expect(isWorkspacePreviewPath("/file%20id/preview")).toBe(true);
    expect(isWorkspaceEditorPath("/file%20id/preview")).toBe(false);
    expect(isWorkspaceCanvasPath("/file%20id/preview")).toBe(true);
  });

  it("does not accept the previous query-string editor route", () => {
    expect(getWorkspaceFileIdFromPath("/editor")).toBe("");
    expect(isWorkspaceEditorPath("/editor")).toBe(false);
    expect(isWorkspacePreviewPath("/preview")).toBe(false);
    expect(isWorkspaceCanvasPath("/preview")).toBe(false);
  });
});
