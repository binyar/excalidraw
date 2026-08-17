const EXCALIDRAW_FILE_EXTENSION = /\.excalidraw$/i;

export const getWorkspaceFileDisplayName = (name: string) =>
  String(name || "")
    .replace(EXCALIDRAW_FILE_EXTENSION, "")
    .trim();
