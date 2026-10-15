// Minimal subset of Vite's client types (avoids depending on vite/client for typecheck).
interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
  /** Set only by the hosted test-preview build. */
  readonly TEST_BUILD?: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv | undefined;
}
