import { ValidatedActivityRecord, GoalsEngine } from '../goals/goals-engine';
import { Goal } from '../goals/types';
import { AchievementEngine } from '../achievements/achievement-engine';
import { AchievementBadge } from '../achievements/types';
import { Club, ClubChallenge } from '../clubs/types';
import { ClubChallengeEngine } from '../clubs/club-challenge-engine';

export interface RebuildResult {
  updatedGoals: Goal[];
  unlockedAchievements: AchievementBadge[];
  updatedChallenges: ClubChallenge[];
}

export class DerivedDataRebuilder {
  /**
   * Rebuilds all derived subsystems (Goals, Achievements, Challenges) deterministically
   * from canonical validated activity records from scratch.
   */
  static rebuildAll(
    canonicalActivities: (ValidatedActivityRecord & { athleteId: string })[],
    goals: Goal[],
    clubs: Club[],
    challenges: ClubChallenge[]
  ): RebuildResult {
    // 1. Rebuild Goals
    const updatedGoals = goals.map((g) => GoalsEngine.evaluateGoalProgress(g, canonicalActivities));

    // 2. Rebuild Achievements from clean slate
    const achievementEngine = new AchievementEngine();
    for (const act of canonicalActivities) {
      achievementEngine.evaluateActivity(act, canonicalActivities);
    }
    const unlockedAchievements = achievementEngine.getAllUnlockedBadges();

    // 3. Rebuild Challenges
    const clubChallengeEngine = new ClubChallengeEngine();
    const updatedChallenges = challenges.map((ch) => {
      let curr = { ...ch, currentValue: 0, participantCount: 0, isCompleted: false };
      for (const act of canonicalActivities) {
        const res = clubChallengeEngine.ingestActivityContribution(curr, act);
        curr = res.challenge;
      }
      return curr;
    });

    return {
      updatedGoals,
      unlockedAchievements,
      updatedChallenges
    };
  }
}
