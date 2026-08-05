/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SMARTAPI_BASE_URL: string;
  readonly VITE_SMARTAPI_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
