import { OverviewReleasesComponent, ReleaseStatus } from './overview-releases.component';

describe('OverviewReleasesComponent edit permissions', () => {
  let component: OverviewReleasesComponent;
  let storageService: any;
  let drawerService: jasmine.SpyObj<any>;
  let toasterService: jasmine.SpyObj<any>;

  beforeEach(() => {
    storageService = {
      roles: { isAdmin: false, isManager: false, isEmployee: true },
      getEmpId: () => 42
    };
    drawerService = jasmine.createSpyObj('DrawerService', ['open']);
    toasterService = jasmine.createSpyObj('ToasterService', ['error']);

    component = Object.create(OverviewReleasesComponent.prototype);
    (component as any).storageService = storageService;
    (component as any).drawerService = drawerService;
    (component as any).toasterService = toasterService;
    (component as any).employeeDirectory = [];
    component.employeeList = [];
    component.projectid = 10;
    component.releaseList = [];
  });

  it('allows the employee assigned from the release to edit', () => {
    expect(component.canEditRelease({ assigned_from: 42 })).toBeTrue();
    expect(component.canEditRelease({ assignedFromId: '42' })).toBeTrue();
  });

  it('allows the employee assigned to the release to edit', () => {
    expect(component.canEditRelease({ assigned_to: '42' })).toBeTrue();
    expect(component.canEditRelease({ assignedToId: 42 })).toBeTrue();
  });

  it('allows managers and admins to edit regardless of assignment', () => {
    storageService.roles = { isAdmin: false, isManager: true };
    expect(component.canEditRelease({ assigned_from: 7, assigned_to: 8 })).toBeTrue();

    storageService.roles = { isAdmin: true, isManager: false };
    expect(component.canEditRelease({ assigned_from: 7, assigned_to: 8 })).toBeTrue();
  });

  it('denies unrelated employees and releases without assignments', () => {
    expect(component.canEditRelease({ assigned_from: 7, assigned_to: 8 })).toBeFalse();
    expect(component.canEditRelease({})).toBeFalse();

    storageService.getEmpId = () => null;
    expect(component.canEditRelease({ assigned_from: 42, assigned_to: 42 })).toBeFalse();
  });

  it('applies the same edit rule to every release status', () => {
    const statuses: ReleaseStatus[] = [
      'Upcoming-Release',
      'To-be-Tested',
      'On-Hold',
      'In-Progress',
      'Rejected',
      'Pass',
      'Failed'
    ];

    statuses.forEach(status => {
      expect(component.canEditRelease({ status, assigned_to: 42 })).withContext(status).toBeTrue();
      expect(component.canEditRelease({ status, assigned_from: 7, assigned_to: 8 })).withContext(status).toBeFalse();
    });
  });

  it('blocks unauthorized drawer access and shows an error', () => {
    component.openDrawer({ id: 1, assigned_from: 7, assigned_to: 8 });

    expect(drawerService.open).not.toHaveBeenCalled();
    expect(toasterService.error).toHaveBeenCalledOnceWith('You are Not Allowed.');
  });

  it('shows the assignee name supplied by the initial release response', () => {
    const name = (component as any).getReleaseAssigneeDisplayName({
      assigned_to: 17,
      assignee_to_name: 'Initial Assignee'
    });

    expect(name).toBe('Initial Assignee');
  });

  it('resolves the assignee after the employee directory loads', () => {
    (component as any).employeeDirectory = [
      { id: 17, employee_name: 'Directory Assignee' }
    ];

    const name = (component as any).getReleaseAssigneeDisplayName({ assigned_to: '17' });

    expect(name).toBe('Directory Assignee');
  });
});
