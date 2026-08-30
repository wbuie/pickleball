import { describe, it, expect } from 'vitest';
import { canScoreMatch, scoreAccessFor, type ScoreAccess } from './scoreAccess';
import type { MatchStatus } from './types/app';

const match = (status: MatchStatus, players: [string | null, string | null] = ['a', 'b']) => ({
  status,
  player1_id: players[0],
  player2_id: players[1],
});

describe('scoreAccessFor', () => {
  it('gives organizers the full run of scoring', () => {
    expect(scoreAccessFor(true, false)).toBe('full');
    expect(scoreAccessFor(true, true)).toBe('full');
  });

  it('keeps everyone else out unless the tournament opened scoring', () => {
    expect(scoreAccessFor(false, false)).toBe('none');
    expect(scoreAccessFor(false, null)).toBe('none');
    expect(scoreAccessFor(false, undefined)).toBe('none');
    expect(scoreAccessFor(false, true)).toBe('report');
  });
});

describe('canScoreMatch', () => {
  it('offers nothing to a viewer without access', () => {
    expect(canScoreMatch('none', match('pending'))).toBe(false);
    expect(canScoreMatch('none', match('completed'))).toBe(false);
  });

  it('lets anyone with access score a match that is ready', () => {
    for (const access of ['report', 'full'] as ScoreAccess[]) {
      expect(canScoreMatch(access, match('pending'))).toBe(true);
      expect(canScoreMatch(access, match('in_progress'))).toBe(true);
    }
  });

  it('leaves a final score to the organizers', () => {
    expect(canScoreMatch('report', match('completed'))).toBe(false);
    expect(canScoreMatch('full', match('completed'))).toBe(true);
  });

  it('never scores a bye or a match still missing a side', () => {
    for (const access of ['report', 'full'] as ScoreAccess[]) {
      expect(canScoreMatch(access, match('bye'))).toBe(false);
      expect(canScoreMatch(access, match('pending', ['a', null]))).toBe(false);
      expect(canScoreMatch(access, match('pending', [null, 'b']))).toBe(false);
    }
  });
});
