const EDITOR_ROUTE_PATTERN = /^\/([^/]+)\/editor\/?$/;

export const getWorkspaceFileIdFromPath = (
  pathname = window.location.pathname,
) => {
  const match = pathname.match(EDITOR_ROUTE_PATTERN);
  return match ? decodeURIComponent(match[1]) : "";
};

export const isWorkspaceEditorPath = (pathname = window.location.pathname) =>
  Boolean(getWorkspaceFileIdFromPath(pathname));

export const getWorkspaceEditorPath = (workspaceFileId: string) =>
  `/${encodeURIComponent(workspaceFileId)}/editor`;
