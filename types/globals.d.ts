// Globals the game's modules share with the classic script src/boot.js, which runs first.

interface SubstituteBoot {
  blocked: boolean;
  reason: 'file' | 'no-webgl' | 'load-failed' | 'crashed' | null;
  show(card: string): void;
  progress(fraction: number, detail?: string | null): void;
  fail(err?: unknown): void;
  crash(err?: unknown): void;
  ready(): void;
}

// The start-up cards' text in each language (src/boot-strings.js).
declare var SubstituteBootStrings: Record<'en' | 'es' | 'fr', Record<string, string>>;

interface Window {
  SubstituteBoot?: SubstituteBoot;
  // the ?test API (src/testhooks.js)
  __substitute?: Record<string, unknown>;
}
