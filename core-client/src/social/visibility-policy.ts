import { FollowRelationship, VisibilityLevel } from './types';

export type SurfaceType =
  | 'FEED'
  | 'COMMENTS'
  | 'PROFILE'
  | 'SEARCH'
  | 'MENTIONS'
  | 'CLUBS'
  | 'CHALLENGES'
  | 'LEADERBOARD';

export class VisibilityPolicy {
  /**
   * Central authorization guard evaluating permissions and block relationships across all surfaces.
   */
  static canView(
    viewerId: string,
    targetUserId: string,
    resourceVisibility: VisibilityLevel,
    relationships: FollowRelationship[],
    surface: SurfaceType
  ): boolean {
    if (viewerId === targetUserId) {
      return true; // Athlete always has access to own content
    }

    // 1. Universal Block Check: If either party has blocked the other, deny access across all surfaces!
    const isBlocked = relationships.some(
      (r) =>
        ((r.followerId === viewerId && r.followingId === targetUserId) ||
          (r.followerId === targetUserId && r.followingId === viewerId)) &&
        r.status === 'BLOCKED'
    );

    if (isBlocked) {
      return false;
    }

    // 2. Private Visibility Rule: Never visible to third parties
    if (resourceVisibility === 'PRIVATE') {
      return false;
    }

    // 3. Followers Only Rule
    if (resourceVisibility === 'FOLLOWERS_ONLY') {
      const isFollowing = relationships.some(
        (r) => r.followerId === viewerId && r.followingId === targetUserId && r.status === 'ACCEPTED'
      );
      return isFollowing;
    }

    // 4. Public Visibility
    return true;
  }
}
