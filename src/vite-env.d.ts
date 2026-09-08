/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SMARTAPI_BASE_URL: string;
  readonly VITE_SMARTAPI_KEY: string;
  readonly VITE_MCSIX_BASE_URL: string;
  readonly VITE_MCSIX_API_KEY: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
