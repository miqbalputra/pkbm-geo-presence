/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface Window {
  google?: any
  turnstile?: any
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
