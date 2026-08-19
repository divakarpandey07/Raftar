import { GoalsEngine, ValidatedActivityRecord } from '../src/goals/goals-engine';
import { Goal } from '../src/goals/types';
import { AchievementEngine } from '../src/achievements/achievement-engine';
import { AchievementUnlockedEvent } from '../src/achievements/types';

describe('GoalsEngine & Centurion Achievement Subsystem (Comprehensive Hardening)', () => {
  test('evaluates offline occurrence date strictly, ignoring upload timestamp', () => {
    const goal: Goal = {
      id: 'g-august-100k',
      athleteId: 'ath-1',
      goalType: 'DISTANCE_METERS',
      sportType: 'RUNNING',
      period: 'MONTHLY',
      targetValue: 100000,
      currentValue: 0,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'ACTIVE',
      progressPercentage: 0,
      isAchieved: false,
      createdAt: 1000
    };

    const activities: ValidatedActivityRecord[] = [
      {
        id: 'act-1',
        sportType: 'RUNNING',
        status: 'COMPLETED',
        validityStatus: 'VALID',
        isManual: false,
        startTime: new Date('2026-08-15T07:00:00Z').getTime(), // Completed Aug 15
        durationSeconds: 3600,
        distanceMeters: 105000, // 105 km
        elevationGainMeters: 400
      }
    ];

    const result = GoalsEngine.evaluateGoalProgress(goal, activities);

    expect(result.currentValue).toBe(105000);
    expect(result.progressPercentage).toBe(100);
    expect(result.isAchieved).toBe(true);
    expect(result.status).toBe('ACHIEVED');
  });

  test('AchievementEngine is strictly idempotent (zero duplicate badges or events)', () => {
    const engine = new AchievementEngine();
    const eventLog: AchievementUnlockedEvent[] = [];
    engine.subscribe((e) => eventLog.push(e));

    // Afternoon run so time-of-day badges are not triggered
    const afternoonTime = new Date('2026-08-19T10:00:00Z').getTime();

    const marathonRun: ValidatedActivityRecord = {
      id: 'act-mumbai-marathon',
      sportType: 'RUNNING',
      status: 'COMPLETED',
      validityStatus: 'VALID',
      isManual: false,
      startTime: afternoonTime,
      durationSeconds: 12600,
      distanceMeters: 42300,
      elevationGainMeters: 180
    };

    // First ingestion (Unlocks Marathon Hero + Half Marathon Warrior)
    const firstPass = engine.evaluateActivity(marathonRun, [marathonRun]);
    expect(firstPass.some((b) => b.id === 'MARATHON_HERO')).toBe(true);
    expect(firstPass.some((b) => b.id === 'HALF_MARATHON_WARRIOR')).toBe(true);
    expect(firstPass.length).toBe(2);
    expect(eventLog.length).toBe(2);

    // Second ingestion (re-sync / reconciliation / duplicate webhook)
    const secondPass = engine.evaluateActivity(marathonRun, [marathonRun]);
    expect(secondPass.length).toBe(0); // ZERO duplicate badges
    expect(eventLog.length).toBe(2);   // ZERO duplicate events
  });

  test('evaluates exact time-of-day boundary tests (Dawn Patrol & Midnight Runner)', () => {
    const engine = new AchievementEngine();

    // 1. Dawn Patrol boundary test: 05:59:59 (TRUE)
    const tDawnValid = new Date();
    tDawnValid.setHours(5, 59, 59, 0);

    const actDawn: ValidatedActivityRecord = {
      id: 'act-dawn',
      sportType: 'RUNNING',
      status: 'COMPLETED',
      validityStatus: 'VALID',
      isManual: false,
      startTime: tDawnValid.getTime(),
      durationSeconds: 1800,
      distanceMeters: 5000,
      elevationGainMeters: 50
    };

    const resDawn = engine.evaluateActivity(actDawn, [actDawn]);
    expect(resDawn.some((b) => b.id === 'DAWN_PATROL')).toBe(true);
  });
});
