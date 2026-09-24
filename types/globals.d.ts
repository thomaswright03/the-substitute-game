// Globals the game's modules share with the classic script src/boot.js, which runs first.

interface SubstituteBoot {
  blocked: boolean;
  reason?: string | null;
  show(card: string): void;
  progress(fraction: number, detail?: string | null): void;
  fail(err?: unknown): void;
  crash(err?: unknown): void;
  ready(): void;
}

interface Window {
  SubstituteBoot?: SubstituteBoot;
  // the ?test API (src/testhooks.js)
  __substitute?: Record<string, unknown>;
}
