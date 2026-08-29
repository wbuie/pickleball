import { describe, it, expect } from 'vitest';
import { planRemoval } from './registrations';

const solo = { player_id: 'alice', partner_id: null };
const team = { player_id: 'alice', partner_id: 'bob' };
const roster = { player_id: 'alice', partner_id: null, members: [{ player_id: 'cara' }] };

describe('planRemoval', () => {
  it('drops the whole entry when no player is named', () => {
    expect(planRemoval(team)).toEqual({ kind: 'delete-entry' });
    expect(planRemoval(roster, null)).toEqual({ kind: 'delete-entry' });
  });

  it('drops the entry for a solo player', () => {
    expect(planRemoval(solo, 'alice')).toEqual({ kind: 'delete-entry' });
  });

  it('leaves the captain solo when the partner goes', () => {
    expect(planRemoval(team, 'bob')).toEqual({ kind: 'clear-partner' });
  });

  it('hands the entry to the partner when the captain goes', () => {
    expect(planRemoval(team, 'alice')).toEqual({ kind: 'promote-partner', playerId: 'bob' });
  });

  it('takes a roster player off their team', () => {
    expect(planRemoval(roster, 'cara')).toEqual({ kind: 'remove-member', playerId: 'cara' });
  });

  it('reports a player who is not on the entry', () => {
    expect(planRemoval(team, 'dave')).toEqual({ kind: 'not-found' });
    expect(planRemoval(roster, 'dave')).toEqual({ kind: 'not-found' });
  });
});
