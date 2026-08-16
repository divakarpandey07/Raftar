import { AuditRecord, AuditEventType } from './types';

export class ImmutableAuditLog {
  private records: AuditRecord[] = [];

  log(
    eventType: AuditEventType,
    entityId: string,
    athleteId: string,
    details: Record<string, any>,
    idempotencyKey?: string
  ): AuditRecord {
    const record: AuditRecord = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventType,
      entityId,
      athleteId,
      details,
      idempotencyKey,
      timestamp: Date.now()
    };

    this.records.push(Object.freeze({ ...record }));
    return record;
  }

  getRecordsForEntity(entityId: string): AuditRecord[] {
    return this.records.filter((r) => r.entityId === entityId);
  }

  getAllRecords(): AuditRecord[] {
    return [...this.records];
  }
}
