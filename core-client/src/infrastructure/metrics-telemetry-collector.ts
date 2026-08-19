export interface SosLifecycleTimers {
  sosDetectedAt: number;
  apiAcceptedAt?: number;
  dispatchInitiatedAt?: number;
  providerAcceptedAt?: number;
  contactNotifiedAt?: number;
  contactAcknowledgedAt?: number;
}

export interface OperationalMetrics {
  syncFailureCount: number;
  syncSuccessCount: number;
  gpsRejectionCount: number;
  sosDispatchedCount: number;
  heartbeatLossCount: number;
  p95SosDispatchLatencyMs: number;
  p99SosDispatchLatencyMs: number;
  totalSosLatencies: number[];
}

export class MetricsTelemetryCollector {
  private metrics: OperationalMetrics = {
    syncFailureCount: 0,
    syncSuccessCount: 0,
    gpsRejectionCount: 0,
    sosDispatchedCount: 0,
    heartbeatLossCount: 0,
    p95SosDispatchLatencyMs: 0,
    p99SosDispatchLatencyMs: 0,
    totalSosLatencies: []
  };

  private highPriorityAlerts: string[] = [];

  // Correct SLA Thresholds
  private readonly SOS_P95_WARNING_THRESHOLD_MS = 500;
  private readonly SOS_P99_CRITICAL_THRESHOLD_MS = 1000;

  recordSyncResult(success: boolean): void {
    if (success) this.metrics.syncSuccessCount++;
    else this.metrics.syncFailureCount++;
  }

  recordGpsRejection(): void {
    this.metrics.gpsRejectionCount++;
  }

  /**
   * Records end-to-end SOS lifecycle delivery and evaluates SLA thresholds.
   * Alerts if delivery latency EXCEEDS SLA thresholds (> 500ms warning, > 1000ms critical).
   */
  recordSosLifecycle(timers: SosLifecycleTimers): void {
    const endTimestamp = timers.contactNotifiedAt || timers.providerAcceptedAt || timers.dispatchInitiatedAt || Date.now();
    const latencyMs = Math.max(0, endTimestamp - timers.sosDetectedAt);

    this.metrics.sosDispatchedCount++;
    this.metrics.totalSosLatencies.push(latencyMs);
    this.metrics.totalSosLatencies.sort((a, b) => a - b);

    // Calculate percentiles
    const p95Idx = Math.floor(this.metrics.totalSosLatencies.length * 0.95);
    const p99Idx = Math.floor(this.metrics.totalSosLatencies.length * 0.99);

    this.metrics.p95SosDispatchLatencyMs = this.metrics.totalSosLatencies[p95Idx] || latencyMs;
    this.metrics.p99SosDispatchLatencyMs = this.metrics.totalSosLatencies[p99Idx] || latencyMs;

    // SLA Violation Alerting
    if (latencyMs > this.SOS_P99_CRITICAL_THRESHOLD_MS) {
      this.highPriorityAlerts.push(`CRITICAL SLA BREACH: SOS Dispatch Latency ${latencyMs}ms exceeds SLA limit of ${this.SOS_P99_CRITICAL_THRESHOLD_MS}ms!`);
    } else if (latencyMs > this.SOS_P95_WARNING_THRESHOLD_MS) {
      this.highPriorityAlerts.push(`WARNING: SOS Dispatch Latency ${latencyMs}ms exceeds target ${this.SOS_P95_WARNING_THRESHOLD_MS}ms.`);
    }
  }

  recordHeartbeatLoss(sessionId: string): void {
    this.metrics.heartbeatLossCount++;
    this.highPriorityAlerts.push(`SAFETY WARNING: Heartbeat lost for beacon session ${sessionId}`);
  }

  getSnapshot(): OperationalMetrics {
    return { ...this.metrics };
  }

  getAlerts(): string[] {
    return [...this.highPriorityAlerts];
  }
}
