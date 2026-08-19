import { PlatformEventEnvelope } from './types';

export class EventStreamConsumer {
  private lastProcessedVersions: Map<string, number> = new Map(); // aggregateId -> version
  private outOfOrderBuffers: Map<string, Map<number, PlatformEventEnvelope>> = new Map();

  /**
   * Evaluates an incoming event envelope against aggregate version state.
   * - Rejects stale/duplicate events (version <= lastProcessedVersion).
   * - Executes immediate processing for next version (version === lastProcessedVersion + 1).
   * - Buffers out-of-order future events (version > lastProcessedVersion + 1).
   */
  consumeEvent(
    envelope: PlatformEventEnvelope,
    handler: (event: PlatformEventEnvelope) => void
  ): { status: 'PROCESSED' | 'IGNORED_STALE' | 'BUFFERED_GAP'; lastVersion: number } {
    const currentVersion = this.lastProcessedVersions.get(envelope.aggregateId) || 0;

    // 1. Stale / Duplicate Check
    if (envelope.version <= currentVersion) {
      return { status: 'IGNORED_STALE', lastVersion: currentVersion };
    }

    // 2. Exact Next Sequential Version
    if (envelope.version === currentVersion + 1) {
      handler(envelope);
      this.lastProcessedVersions.set(envelope.aggregateId, envelope.version);

      // Drain any buffered subsequent versions
      this.drainBuffer(envelope.aggregateId, handler);

      return {
        status: 'PROCESSED',
        lastVersion: this.lastProcessedVersions.get(envelope.aggregateId)!
      };
    }

    // 3. Out-of-Order Version Gap Detected (Buffer it)
    if (!this.outOfOrderBuffers.has(envelope.aggregateId)) {
      this.outOfOrderBuffers.set(envelope.aggregateId, new Map());
    }
    this.outOfOrderBuffers.get(envelope.aggregateId)!.set(envelope.version, envelope);

    return { status: 'BUFFERED_GAP', lastVersion: currentVersion };
  }

  private drainBuffer(aggregateId: string, handler: (event: PlatformEventEnvelope) => void): void {
    const buffer = this.outOfOrderBuffers.get(aggregateId);
    if (!buffer) return;

    let current = this.lastProcessedVersions.get(aggregateId)!;
    while (buffer.has(current + 1)) {
      const nextEvt = buffer.get(current + 1)!;
      buffer.delete(current + 1);
      handler(nextEvt);
      current = nextEvt.version;
      this.lastProcessedVersions.set(aggregateId, current);
    }
  }

  getLastVersion(aggregateId: string): number {
    return this.lastProcessedVersions.get(aggregateId) || 0;
  }
}
