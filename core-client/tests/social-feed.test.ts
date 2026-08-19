import { SocialFeedEngine } from '../src/social/social-feed-engine';
import { FeedItem, FollowRelationship } from '../src/social/types';

describe('SocialFeedEngine (One Reaction Per User, Depth-2 Comments & Composite Cursor)', () => {
  const items: FeedItem[] = [
    {
      id: 'post-1',
      athleteId: 'ath-1',
      athleteName: 'Athlete One',
      type: 'ACTIVITY',
      title: 'Morning 10K Run',
      visibility: 'PUBLIC',
      reactions: { kudosCount: 0, fireCount: 0, muscleCount: 0, heartCount: 0, totalReactions: 0 },
      commentsCount: 0,
      createdAt: 5000
    },
    {
      id: 'post-2',
      athleteId: 'ath-blocked',
      athleteName: 'Spam User',
      type: 'ACTIVITY',
      title: 'Spam Post',
      visibility: 'PUBLIC',
      reactions: { kudosCount: 0, fireCount: 0, muscleCount: 0, heartCount: 0, totalReactions: 0 },
      commentsCount: 0,
      createdAt: 4000
    },
    {
      id: 'post-3',
      athleteId: 'ath-2',
      athleteName: 'Athlete Two',
      type: 'ACTIVITY',
      title: 'Evening 5K Run',
      visibility: 'PUBLIC',
      reactions: { kudosCount: 0, fireCount: 0, muscleCount: 0, heartCount: 0, totalReactions: 0 },
      commentsCount: 0,
      createdAt: 3000
    }
  ];

  const follows: FollowRelationship[] = [
    { followerId: 'viewer-ath', followingId: 'ath-blocked', status: 'BLOCKED', createdAt: 100 }
  ];

  test('switching reactions replaces atomically and maintains exactly one reaction per user', () => {
    const engine = new SocialFeedEngine(items, follows);

    // 1. Give Kudos (⚡)
    const r1 = engine.setReaction('post-1', 'viewer-ath', 'KUDOS');
    expect(r1.kudosCount).toBe(1);
    expect(r1.fireCount).toBe(0);
    expect(r1.totalReactions).toBe(1);
    expect(r1.currentUserReaction).toBe('KUDOS');

    // 2. Switch to Fire (🔥) -> Kudos decrements, Fire increments
    const r2 = engine.setReaction('post-1', 'viewer-ath', 'FIRE');
    expect(r2.kudosCount).toBe(0);
    expect(r2.fireCount).toBe(1);
    expect(r2.totalReactions).toBe(1);
    expect(r2.currentUserReaction).toBe('FIRE');

    // 3. Click Fire again -> Toggles OFF
    const r3 = engine.setReaction('post-1', 'viewer-ath', 'FIRE');
    expect(r3.fireCount).toBe(0);
    expect(r3.totalReactions).toBe(0);
    expect(r3.currentUserReaction).toBeUndefined();
  });

  test('limits comment nesting depth to 2 and supports soft deletion', () => {
    const engine = new SocialFeedEngine(items, follows);

    // Root Comment (Depth 1)
    const root = engine.addComment('post-1', 'viewer-ath', 'Viewer', 'Great pace!');
    expect(root.parentCommentId).toBeUndefined();

    // Reply to Root (Depth 2)
    const reply1 = engine.addComment('post-1', 'ath-1', 'Athlete One', 'Thanks!', root.id);
    expect(reply1.parentCommentId).toBe(root.id);

    // Attempt Reply to Reply (Depth 3) -> Flattened to Root (Depth 2)
    const reply2 = engine.addComment('post-1', 'viewer-ath', 'Viewer', 'Keep it up!', reply1.id);
    expect(reply2.parentCommentId).toBe(root.id);

    // Soft delete root comment
    const deleted = engine.deleteComment('post-1', root.id, 'viewer-ath');
    expect(deleted).toBe(true);

    const comments = engine.getComments('post-1');
    const rootComment = comments.find((c) => c.id === root.id);
    expect(rootComment?.isDeleted).toBe(true);
    expect(rootComment?.content).toBe('This comment has been deleted');
  });

  test('filters out blocked users and paginates using composite cursor (createdAt, id)', () => {
    const engine = new SocialFeedEngine(items, follows);
    const feedPage1 = engine.getTimelineFeed('viewer-ath', 1);

    expect(feedPage1.length).toBe(1);
    expect(feedPage1[0].id).toBe('post-1'); // newest

    const feedPage2 = engine.getTimelineFeed('viewer-ath', 2, { createdAt: feedPage1[0].createdAt, id: feedPage1[0].id });
    // Post 2 is blocked -> should skip to post 3
    expect(feedPage2.length).toBe(1);
    expect(feedPage2[0].id).toBe('post-3');
  });
});
