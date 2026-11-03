import { IssuesComponent } from './issues.component';

describe('IssuesComponent access rules', () => {
  let component: any;
  let employeeId: string;
  let roles: { isAdmin: boolean; isManager: boolean; isEmployee: boolean };

  beforeEach(() => {
    component = Object.create(IssuesComponent.prototype);
    employeeId = '42';
    roles = { isAdmin: false, isManager: false, isEmployee: true };
    component.storageService = {
      getEmpId: () => employeeId,
      roles
    };
  });

  function canManage(row: any): boolean {
    return component.canManageIssue(row);
  }

  it('allows admins and managers to manage any issue', () => {
    roles.isAdmin = true;
    expect(canManage({ assigned_from: 7, assigned_to: [8] })).toBeTrue();

    roles.isAdmin = false;
    roles.isManager = true;
    expect(canManage({ assigned_from: 7, assigned_to: [8] })).toBeTrue();
  });

  it('allows the assigned_from employee with numeric or string IDs', () => {
    expect(canManage({ assigned_from: 42, assigned_to: [] })).toBeTrue();
    expect(canManage({ assigned_from: '42', assigned_to: [] })).toBeTrue();
  });

  it('allows every employee in scalar, array, and object assigned_to values', () => {
    expect(canManage({ assigned_from: 7, assigned_to: '42' })).toBeTrue();
    expect(canManage({ assigned_from: 7, assigned_to: [7, '42', 9] })).toBeTrue();
    expect(canManage({ assigned_from: 7, assigned_to: [{ employee_id: '42' }] })).toBeTrue();
    expect(canManage({ assigned_from: 7, assigned_to: [{ id: 42 }] })).toBeTrue();
  });

  it('denies unrelated employees and hides their action buttons', () => {
    const row = { assigned_from: 7, assigned_to: [8, 9] };
    expect(canManage(row)).toBeFalse();
    expect(component.actionFormatter({ getData: () => row })).toBe('');

    component.toasterService = { error: jasmine.createSpy('error') };
    const button = { disabled: false, classList: { contains: (name: string) => name === 'btn-edit' } };
    component.handleActionClick(
      { stopPropagation: () => undefined, target: { closest: () => button } },
      { getRow: () => ({ getData: () => row }) }
    );
    expect(component.toasterService.error).toHaveBeenCalledWith('You are Not Allowed.');
  });

  it('can authorize against the saved assignment before an assignee reassignment', () => {
    const originalRow = { assigned_from: 7, assigned_to: [42, 9] };
    const updatedRow = { ...originalRow, assigned_to: [7, 9] };
    const savedPermissionRow = { ...updatedRow, assigned_to: originalRow.assigned_to };
    expect(canManage(savedPermissionRow)).toBeTrue();
    expect(canManage(updatedRow)).toBeFalse();
  });
});
