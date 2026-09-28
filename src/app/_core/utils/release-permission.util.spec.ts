import { canModifyRelease } from './release-permission.util';

describe('canModifyRelease', () => {
  const employeeRoles = { isAdmin: false, isManager: false };

  it('allows assigned-from at every status', () => {
    expect(canModifyRelease({ status: 'In-Progress', assigned_from: 42 }, '42', employeeRoles)).toBeTrue();
    expect(canModifyRelease({ status: 'Pass', assignedFromId: '42' }, 42, employeeRoles)).toBeTrue();
  });

  it('allows assigned-to except at To-be-Tested', () => {
    expect(canModifyRelease({ status: 'In-Progress', assigned_to_id: 42 }, 42, employeeRoles)).toBeTrue();
    expect(canModifyRelease({ status: 'Pass', assignedToId: 42 }, '42', employeeRoles)).toBeTrue();
    expect(canModifyRelease({ status: ' Upcoming-Release ', assigned_to: '42' }, 42, employeeRoles)).toBeTrue();
    expect(canModifyRelease({ status: 'TO-BE-TESTED', assignedToId: 42 }, '42', employeeRoles)).toBeFalse();
  });

  it('allows managers and admins without an assignment match', () => {
    expect(canModifyRelease({}, null, { isManager: true })).toBeTrue();
    expect(canModifyRelease({}, null, { isAdmin: true })).toBeTrue();
  });

  it('denies unrelated employees and missing employee identities', () => {
    expect(canModifyRelease({ status: 'In-Progress', assigned_from: 7, assigned_to: 8 }, 42, employeeRoles)).toBeFalse();
    expect(canModifyRelease({ status: 'In-Progress', assigned_to: 42 }, null, employeeRoles)).toBeFalse();
  });
});
