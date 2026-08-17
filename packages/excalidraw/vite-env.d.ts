/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />
interface ImportMetaEnv {
  // The port to run the dev server
  VITE_APP_PORT: string;

  VITE_APP_LIBRARY_URL: string;
  VITE_APP_LIBRARY_BACKEND: string;
  // To enable bounding box for text containers
  VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX: string;

  FAST_REFRESH: string;

  // Set this flag to false if you want to open the overlay by default
  VITE_APP_COLLAPSE_OVERLAY: string;
  // Enable eslint in dev server
  VITE_APP_ENABLE_ESLINT: string;

  PKG_NAME: string;
  PKG_VERSION: string;

  VITE_WORKER_ID: string;
  MODE: string;
  DEV: string;
  PROD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
