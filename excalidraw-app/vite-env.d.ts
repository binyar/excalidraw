/// <reference types="vite-plugin-svgr/client" />
interface ImportMetaEnv {
  VITE_APP_PORT: string;
  VITE_APP_COLLAPSE_OVERLAY: string;
  VITE_APP_ENABLE_ESLINT: string;
  MODE: string;

  DEV: string;
  PROD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
