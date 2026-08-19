import { SqliteStorage } from '../src/database/sqlite-storage';
import { LocalFitnessAnalytics } from '../src/processing/fitness-analytics';

describe('LocalFitnessAnalytics (Real Data Aggregator)', () => {
  let storage: SqliteStorage;
  let analytics: LocalFitnessAnalytics;

  beforeEach(() => {
    storage = new SqliteStorage(':memory:');
    analytics = new LocalFitnessAnalytics(storage);
  });

  afterEach(() => {
    storage.close();
  });

  test('returns 0 for empty database with clean install', () => {
    const totals = analytics.getLifetimeTotals();
    expect(totals.distanceKm).toBe(0);
    expect(totals.totalHours).toBe(0);
    expect(totals.elevationGainM).toBe(0);
    expect(totals.activityCount).toBe(0);

    const prs = analytics.getPersonalRecords();
    expect(prs.fastest5k).toBeUndefined();
    expect(prs.pr10k).toBeUndefined();
  });
});
