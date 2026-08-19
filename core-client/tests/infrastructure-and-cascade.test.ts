import { IdempotencyManager } from '../src/infrastructure/idempotency-manager';
import { ImmutableAuditLog } from '../src/infrastructure/audit-log';
import { AchievementEngine } from '../src/achievements/achievement-engine';
import { ValidatedActivityRecord } from '../src/goals/goals-engine';

describe('Infrastructure Primitives & Achievement REVOKED Cascade', () => {
  test('IdempotencyManager prevents duplicate execution for identical key', async () => {
    const idemp = new IdempotencyManager();
    let execCount = 0;

    const op = () => {
      execCount++;
      return { processed: true, count: execCount };
    };

    const res1 = await idemp.executeIdempotent('key-abc-123', op);
    expect(res1.wasCached).toBe(false);
    expect(res1.result.count).toBe(1);

    const res2 = await idemp.executeIdempotent('key-abc-123', op);
    expect(res2.wasCached).toBe(true);
    expect(res2.result.count).toBe(1); // Executed only ONCE!
    expect(execCount).toBe(1);
  });

  test('ImmutableAuditLog preserves frozen audit records', () => {
    const audit = new ImmutableAuditLog();
    audit.log('ACTIVITY_VALIDATED', 'act-1', 'ath-1', { score: 98 });
    audit.log('ACHIEVEMENT_UNLOCKED', 'badge-5k', 'ath-1', { badgeId: 'SUB_20_5K' });

    const records = audit.getAllRecords();
    expect(records.length).toBe(2);
    expect(records[0].eventType).toBe('ACTIVITY_VALIDATED');
    expect(records[1].eventType).toBe('ACHIEVEMENT_UNLOCKED');
  });

  test('transitions single-activity achievements to REVOKED when source activity is deleted', () => {
    const engine = new AchievementEngine();
    const marathonRun: ValidatedActivityRecord = {
      id: 'act-marathon-del',
      sportType: 'RUNNING',
      status: 'COMPLETED',
      validityStatus: 'VALID',
      startTime: Date.now(),
      durationSeconds: 12000,
      distanceMeters: 42500,
      elevationGainMeters: 100
    };

    engine.evaluateActivity(marathonRun, [marathonRun]);
    expect(engine.getAllUnlockedBadges().some((b) => b.id === 'MARATHON_HERO')).toBe(true);

    // Source activity is deleted
    const revoked = engine.revokeActivityAchievements('act-marathon-del', 'Activity marked invalid or deleted');
    expect(revoked.some((b) => b.id === 'MARATHON_HERO')).toBe(true);
    expect(engine.getAllUnlockedBadges().some((b) => b.id === 'MARATHON_HERO')).toBe(false);

    const allBadges = engine.getAllBadges();
    const heroBadge = allBadges.find((b) => b.id === 'MARATHON_HERO');
    expect(heroBadge?.status).toBe('REVOKED');
  });
});
