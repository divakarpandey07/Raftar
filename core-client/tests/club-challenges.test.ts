import { ClubChallengeEngine } from '../src/clubs/club-challenge-engine';
import { Club, ClubChallenge } from '../src/clubs/types';
import { ValidatedActivityRecord } from '../src/goals/goals-engine';

describe('ClubChallengeEngine (Idempotency & Lifecycle Invariants)', () => {
  const sampleClub: Club = {
    id: 'club-mumbai',
    name: 'Mumbai Cyclists',
    description: 'Cycling club',
    sportType: 'CYCLING',
    privacy: 'PUBLIC',
    memberCount: 2,
    members: [
      { athleteId: 'ath-1', athleteName: 'Rohan', role: 'OWNER', joinedAt: 1000 },
      { athleteId: 'ath-2', athleteName: 'Ananya', role: 'MEMBER', joinedAt: 2000 }
    ],
    createdAt: 1000
  };

  const challenge: ClubChallenge = {
    id: 'chal-100k',
    clubId: 'club-mumbai',
    title: 'Club 100K Ride',
    description: 'Ride 100km collectively',
    challengeType: 'TOTAL_DISTANCE',
    targetValue: 100000,
    currentValue: 0,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'ACTIVE',
    isCompleted: false,
    participantCount: 0,
    createdAt: 1000
  };

  const activity: ValidatedActivityRecord & { athleteId: string } = {
    id: 'act-50k',
    athleteId: 'ath-1',
    sportType: 'CYCLING',
    status: 'COMPLETED',
    validityStatus: 'VALID',
    startTime: new Date('2026-08-15T06:00:00Z').getTime(),
    durationSeconds: 5400,
    distanceMeters: 50000,
    elevationGainMeters: 200
  };

  test('ingests contribution idempotently (zero double-counting upon re-sync)', () => {
    const engine = new ClubChallengeEngine();

    // First ingestion
    const res1 = engine.ingestActivityContribution(challenge, activity);
    expect(res1.isNewContribution).toBe(true);
    expect(res1.challenge.currentValue).toBe(50000);
    expect(res1.challenge.isCompleted).toBe(false);

    // Second ingestion (re-sync / duplicate retry)
    const res2 = engine.ingestActivityContribution(res1.challenge, activity);
    expect(res2.isNewContribution).toBe(false);
    expect(res2.challenge.currentValue).toBe(50000); // STABLE: Not 100,000!
  });
});
