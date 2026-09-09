export type PracticePrefetchFingerprint = {
  kind: "reading" | "listening";
  topic: string;
  weekNumber: number;
  targetIlr: number;
  practiceMode: string;
  register: string;
  targetWords: string[];
  wordDefinitions: Array<{ word: string; meaning: string }>;
  knownWords: string[];
};

export function practicePrefetchKey(fingerprint: PracticePrefetchFingerprint) {
  return JSON.stringify(fingerprint);
}

export async function loadPracticeWithRetries<T>(load: () => Promise<T>, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { return await load(); }
    catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Background practice preparation failed.");
}

/**
 * Keeps at most one prepared result for a practice surface. Results are only
 * exposed when their complete generation fingerprint still matches.
 */
export class LatestPracticePrefetch<T> {
  private key: string | null = null;
  private ready: T | null = null;
  private pending: Promise<T | null> | null = null;

  prepare(key: string, load: () => Promise<T>) {
    if (this.key === key && (this.ready !== null || this.pending)) return this.pending;

    this.key = key;
    this.ready = null;
    const request = load()
      .then((value) => {
        if (this.key === key) this.ready = value;
        return value;
      })
      .catch(() => null)
      .finally(() => {
        if (this.key === key && this.pending === request) this.pending = null;
      });
    this.pending = request;
    return request;
  }

  take(key: string) {
    if (this.key !== key) {
      this.clear();
      return null;
    }
    const value = this.ready;
    this.ready = null;
    return value;
  }

  async waitAndTake(key: string) {
    if (this.key !== key || !this.pending) return this.take(key);
    await this.pending;
    return this.take(key);
  }

  clear() {
    this.key = null;
    this.ready = null;
    this.pending = null;
  }
}
