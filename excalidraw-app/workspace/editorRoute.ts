const WORKSPACE_ROUTE_PATTERN = /^\/([^/]+)\/(editor|preview)\/?$/;

const getWorkspaceRoute = (pathname: string) => {
  const match = pathname.match(WORKSPACE_ROUTE_PATTERN);
  return match
    ? { fileId: decodeURIComponent(match[1]), mode: match[2] }
    : null;
};

export const getWorkspaceFileIdFromPath = (
  pathname = window.location.pathname,
) => getWorkspaceRoute(pathname)?.fileId ?? "";

export const isWorkspaceEditorPath = (pathname = window.location.pathname) =>
  getWorkspaceRoute(pathname)?.mode === "editor";

export const isWorkspacePreviewPath = (pathname = window.location.pathname) =>
  getWorkspaceRoute(pathname)?.mode === "preview";

export const isWorkspaceCanvasPath = (pathname = window.location.pathname) =>
  Boolean(getWorkspaceRoute(pathname));

export const getWorkspaceEditorPath = (workspaceFileId: string) =>
  `/${encodeURIComponent(workspaceFileId)}/editor`;

export const getWorkspacePreviewPath = (workspaceFileId: string) =>
  `/${encodeURIComponent(workspaceFileId)}/preview`;
