/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SMARTAPI_BASE_URL: string;
  readonly VITE_PROVIDER_PROXY_ENABLED: string;
  readonly VITE_XKIRO_PROXY_ENABLED: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
