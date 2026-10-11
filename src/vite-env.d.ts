/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_BETA_AUTH_ENABLED?: string;
  readonly VITE_SMARTAPI_BASE_URL: string;
  readonly VITE_PROVIDER_PROXY_ENABLED: string;
  readonly VITE_XKIRO_PROXY_ENABLED: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
// Cloud persistence is explicitly enabled only after migration and access tests.
interface ImportMetaEnv { readonly VITE_CLOUD_DATA_ENABLED?: string }
