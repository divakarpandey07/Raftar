import * as crypto from 'crypto';

export interface IdempotencyEntry {
  resultPayload: any;
  requestFingerprint: string;
  createdAt: number;
}

export class IdempotencyManager {
  private keyStore: Map<string, IdempotencyEntry> = new Map();
  private inFlightPromises: Map<string, { promise: Promise<any>; requestFingerprint: string }> = new Map();

  /**
   * Generates a SHA-256 fingerprint for the request payload to detect key reuse with different parameters.
   */
  private generateFingerprint(payload: any): string {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Executes an operation idempotently with strict fingerprint verification.
   * Throws `IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_REQUEST` if the key is reused with a different payload.
   */
  async executeIdempotent<T>(
    idempotencyKey: string,
    operation: () => Promise<T> | T,
    payloadForFingerprint?: any
  ): Promise<{ result: T; wasCached: boolean }> {
    const currentFingerprint = this.generateFingerprint(payloadForFingerprint);

    // 1. Check completed cache
    if (this.keyStore.has(idempotencyKey)) {
      const cached = this.keyStore.get(idempotencyKey)!;
      if (cached.requestFingerprint !== currentFingerprint) {
        throw new Error(`IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_REQUEST: Key '${idempotencyKey}' was previously executed with a different request payload.`);
      }
      return { result: cached.resultPayload as T, wasCached: true };
    }

    // 2. Check in-flight concurrent execution lock
    if (this.inFlightPromises.has(idempotencyKey)) {
      const inFlight = this.inFlightPromises.get(idempotencyKey)!;
      if (inFlight.requestFingerprint !== currentFingerprint) {
        throw new Error(`IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_REQUEST: Key '${idempotencyKey}' is in-flight with a different request payload.`);
      }
      const result = await inFlight.promise;
      return { result: result as T, wasCached: true };
    }

    // 3. Initiate atomic execution
    const executionPromise = (async () => {
      try {
        const res = await operation();
        this.keyStore.set(idempotencyKey, {
          resultPayload: res,
          requestFingerprint: currentFingerprint,
          createdAt: Date.now()
        });
        return res;
      } finally {
        this.inFlightPromises.delete(idempotencyKey);
      }
    })();

    this.inFlightPromises.set(idempotencyKey, {
      promise: executionPromise,
      requestFingerprint: currentFingerprint
    });

    const result = await executionPromise;
    return { result: result as T, wasCached: false };
  }

  hasKey(key: string): boolean {
    return this.keyStore.has(key) || this.inFlightPromises.has(key);
  }

  clear(): void {
    this.keyStore.clear();
    this.inFlightPromises.clear();
  }
}
