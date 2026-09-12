import { of } from 'rxjs';
import { ReleaseManagerComponent, ReleaseStatus } from './release-manager.component';

describe('ReleaseManagerComponent edit permissions', () => {
  let component: ReleaseManagerComponent;
  let storageService: any;
  let drawerService: jasmine.SpyObj<any>;
  let toasterService: jasmine.SpyObj<any>;

  beforeEach(() => {
    storageService = {
      roles: { isAdmin: false, isManager: false, isEmployee: true },
      getEmpId: () => 42,
      getUsername: () => 'test.user',
      getDept: () => 'Software'
    };
    drawerService = jasmine.createSpyObj('DrawerService', ['open'], {
      drawerAction$: of()
    });
    toasterService = jasmine.createSpyObj('ToasterService', ['success', 'error']);

    component = new ReleaseManagerComponent(
      {} as any,
      {} as any,
      drawerService,
      storageService,
      {} as any,
      { paramMap: of({ get: () => null }) } as any,
      toasterService
    );
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
});
