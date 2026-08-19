export type AuditEventType =
  | 'ACTIVITY_VALIDATED'
  | 'ACTIVITY_INVALIDATED'
  | 'ACHIEVEMENT_UNLOCKED'
  | 'ACHIEVEMENT_REVOKED'
  | 'GOAL_ACHIEVED'
  | 'CHALLENGE_CONTRIBUTION'
  | 'SOS_TRIGGERED'
  | 'SOS_CANCELLED'
  | 'PRIVACY_CHANGED'
  | 'BEACON_STARTED'
  | 'BEACON_STOPPED';

export interface AuditRecord {
  id: string;
  eventType: AuditEventType;
  entityId: string;
  athleteId: string;
  details: Record<string, any>;
  idempotencyKey?: string;
  timestamp: number;
}

export interface PlatformEventEnvelope<T = any> {
  eventId: string;
  aggregateId: string;
  version: number;
  eventType: string;
  payload: T;
  causationId?: string;
  idempotencyKey: string;
  timestamp: number;
}
