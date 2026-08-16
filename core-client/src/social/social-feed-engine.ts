import { FeedItem, FollowRelationship, ReactionType, ReactionSummary, ReactionRecord, ThreadedComment, FeedCursor } from './types';

export class SocialFeedEngine {
  private feedItems: Map<string, FeedItem> = new Map();
  private authoritativeReactions: Map<string, Map<string, ReactionRecord>> = new Map(); // itemId -> (athleteId -> ReactionRecord)
  private comments: Map<string, ThreadedComment[]> = new Map();
  private followGraph: FollowRelationship[] = [];

  constructor(initialItems: FeedItem[] = [], initialFollows: FollowRelationship[] = []) {
    for (const item of initialItems) {
      this.feedItems.set(item.id, { ...item });
      this.authoritativeReactions.set(item.id, new Map());
      this.comments.set(item.id, []);
    }
    this.followGraph = [...initialFollows];
  }

  /**
   * Retrieves paginated feed using deterministic composite cursor (createdAt, id)
   */
  getTimelineFeed(
    viewerAthleteId: string,
    limit = 20,
    cursor?: FeedCursor
  ): FeedItem[] {
    const followingIds = new Set<string>(
      this.followGraph
        .filter((f) => f.followerId === viewerAthleteId && f.status === 'ACCEPTED')
        .map((f) => f.followingId)
    );
    followingIds.add(viewerAthleteId);

    const blockedIds = new Set<string>(
      this.followGraph
        .filter((f) => (f.followerId === viewerAthleteId || f.followingId === viewerAthleteId) && f.status === 'BLOCKED')
        .map((f) => (f.followerId === viewerAthleteId ? f.followingId : f.followerId))
    );

    const eligibleItems: FeedItem[] = [];

    for (const item of this.feedItems.values()) {
      if (blockedIds.has(item.athleteId)) {
        continue;
      }

      if (item.visibility === 'PRIVATE' && item.athleteId !== viewerAthleteId) {
        continue;
      }

      if (item.visibility === 'FOLLOWERS_ONLY' && !followingIds.has(item.athleteId)) {
        continue;
      }

      // Cursor filtering with deterministic tie-breaking on ID
      if (cursor) {
        if (item.createdAt > cursor.createdAt) {
          continue;
        }
        if (item.createdAt === cursor.createdAt && item.id >= cursor.id) {
          continue;
        }
      }

      // Authoritative reaction derivation
      const reactionsMap = this.authoritativeReactions.get(item.id);
      const userRecord = reactionsMap?.get(viewerAthleteId);

      const activeComments = (this.comments.get(item.id) || []).filter((c) => !c.isDeleted);

      eligibleItems.push({
        ...item,
        reactions: this.computeAuthoritativeReactionSummary(item.id, viewerAthleteId),
        commentsCount: activeComments.length
      });
    }

    // Deterministic sort: ORDER BY created_at DESC, id DESC
    return eligibleItems
      .sort((a, b) => {
        if (b.createdAt !== a.createdAt) {
          return b.createdAt - a.createdAt;
        }
        return b.id.localeCompare(a.id);
      })
      .slice(0, limit);
  }

  /**
   * Sets or toggles a reaction: One user -> exactly one active reaction.
   * Clicking the same reaction removes it. Clicking a different reaction replaces it atomically.
   */
  setReaction(feedItemId: string, athleteId: string, reaction: ReactionType): ReactionSummary {
    const item = this.feedItems.get(feedItemId);
    if (!item) {
      throw new Error(`Feed item ${feedItemId} not found`);
    }

    if (!this.authoritativeReactions.has(feedItemId)) {
      this.authoritativeReactions.set(feedItemId, new Map());
    }

    const itemMap = this.authoritativeReactions.get(feedItemId)!;
    const existing = itemMap.get(athleteId);

    if (existing && existing.reactionType === reaction) {
      // Toggle OFF
      itemMap.delete(athleteId);
    } else {
      // Set or REPLACE atomically
      itemMap.set(athleteId, {
        athleteId,
        reactionType: reaction,
        createdAt: Date.now()
      });
    }

    const summary = this.computeAuthoritativeReactionSummary(feedItemId, athleteId);
    item.reactions = summary;
    return summary;
  }

  private computeAuthoritativeReactionSummary(feedItemId: string, viewerAthleteId?: string): ReactionSummary {
    const itemMap = this.authoritativeReactions.get(feedItemId);
    let kudos = 0;
    let fire = 0;
    let muscle = 0;
    let heart = 0;
    let currentUserReaction: ReactionType | undefined = undefined;

    if (itemMap) {
      for (const record of itemMap.values()) {
        if (record.reactionType === 'KUDOS') kudos++;
        if (record.reactionType === 'FIRE') fire++;
        if (record.reactionType === 'MUSCLE') muscle++;
        if (record.reactionType === 'HEART') heart++;
      }
      if (viewerAthleteId && itemMap.has(viewerAthleteId)) {
        currentUserReaction = itemMap.get(viewerAthleteId)!.reactionType;
      }
    }

    return {
      kudosCount: kudos,
      fireCount: fire,
      muscleCount: muscle,
      heartCount: heart,
      totalReactions: kudos + fire + muscle + heart,
      currentUserReaction
    };
  }

  /**
   * Adds comment with strict max nesting depth = 2 (Root -> Reply)
   */
  addComment(
    feedItemId: string,
    athleteId: string,
    athleteName: string,
    content: string,
    parentCommentId?: string
  ): ThreadedComment {
    const item = this.feedItems.get(feedItemId);
    if (!item) {
      throw new Error(`Feed item ${feedItemId} not found`);
    }

    if (!this.comments.has(feedItemId)) {
      this.comments.set(feedItemId, []);
    }

    const itemComments = this.comments.get(feedItemId)!;

    // Enforce max nesting depth of 2
    let resolvedParentId = parentCommentId;
    if (parentCommentId) {
      const parent = itemComments.find((c) => c.id === parentCommentId);
      if (parent && parent.parentCommentId) {
        // If parent is already a reply, flatten to root comment
        resolvedParentId = parent.parentCommentId;
      }
    }

    const comment: ThreadedComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      feedItemId,
      athleteId,
      athleteName,
      content,
      parentCommentId: resolvedParentId,
      isDeleted: false,
      createdAt: Date.now()
    };

    itemComments.push(comment);
    item.commentsCount = itemComments.filter((c) => !c.isDeleted).length;
    return comment;
  }

  /**
   * Soft deletes a comment, preserving context for replies
   */
  deleteComment(feedItemId: string, commentId: string, athleteId: string): boolean {
    const itemComments = this.comments.get(feedItemId);
    if (!itemComments) return false;

    const comment = itemComments.find((c) => c.id === commentId);
    if (!comment || comment.athleteId !== athleteId) return false;

    comment.isDeleted = true;
    comment.content = 'This comment has been deleted';
    comment.updatedAt = Date.now();

    const item = this.feedItems.get(feedItemId);
    if (item) {
      item.commentsCount = itemComments.filter((c) => !c.isDeleted).length;
    }
    return true;
  }

  getComments(feedItemId: string): ThreadedComment[] {
    return this.comments.get(feedItemId) || [];
  }
}
