/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SMARTAPI_BASE_URL: string;
  readonly VITE_SMARTAPI_KEY: string;
  readonly VITE_MCSIX_BASE_URL: string;
  readonly VITE_MCSIX_API_KEY: string;
  readonly VITE_GLOW_AUTH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
