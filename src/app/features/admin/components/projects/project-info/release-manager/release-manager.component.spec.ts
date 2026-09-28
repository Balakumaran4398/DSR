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

  it('allows the employee assigned to the release except at To-be-Tested', () => {
    expect(component.canEditRelease({ status: 'In-Progress', assigned_to: '42' })).toBeTrue();
    expect(component.canEditRelease({ status: 'Pass', assignedToId: 42 })).toBeTrue();
    expect(component.canEditRelease({ status: 'Upcoming-Release', assigned_to: 42 })).toBeTrue();
    expect(component.canEditRelease({ status: 'to-be-tested', assignedToId: 42 })).toBeFalse();
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

  it('allows assigned-from at every status and blocks assigned-to only at To-be-Tested', () => {
    const statuses: ReleaseStatus[] = [
      'Upcoming-Release',
      'Open',
      'To-be-Tested',
      'On-Hold',
      'In-Progress',
      'In-Review',
      'Rejected',
      'Pass',
      'Failed'
    ];

    statuses.forEach(status => {
      expect(component.canEditRelease({ status, assigned_from: 42 })).withContext(status).toBeTrue();
      expect(component.canEditRelease({ status, assigned_to: 42 }))
        .withContext(status)
        .toBe(status !== 'To-be-Tested');
      expect(component.canEditRelease({ status, assigned_from: 7, assigned_to: 8 })).withContext(status).toBeFalse();
    });
  });

  it('uses the edit permission rule for dragging', () => {
    expect(component.canDragRelease({ status: 'To-be-Tested', assigned_to: 42 })).toBeFalse();
    expect(component.canDragRelease({ status: 'Upcoming-Release', assigned_to: 42 })).toBeTrue();
    expect(component.canDragRelease({ status: 'In-Progress', assigned_to: 42 })).toBeTrue();
    expect(component.canDragRelease({ status: 'In-Progress', assigned_from: 42 })).toBeTrue();
  });

  it('prevents an unauthorized drag and shows the access error', () => {
    const event = {
      preventDefault: jasmine.createSpy('preventDefault')
    } as any;

    component.onDragStart(event, { status: 'To-be-Tested', assigned_to: 42 });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(toasterService.error).toHaveBeenCalledOnceWith('You are Not Allowed.');
  });

  it('preserves employee drag transitions between In-Progress and To-be-Tested', () => {
    expect(component.canDragOrDrop('In-Progress', 'To-be-Tested')).toBeTrue();
    expect(component.canDragOrDrop('To-be-Tested', 'In-Progress')).toBeTrue();
    expect(component.canDragOrDrop('Upcoming-Release', 'To-be-Tested')).toBeFalse();
    expect(component.canDragOrDrop('To-be-Tested', 'Pass')).toBeFalse();
  });

  it('rechecks release permission when a card is dropped', () => {
    component.releaseList = [{
      id: '1',
      status: 'To-be-Tested',
      assigned_to: '42'
    } as any];
    spyOn(component, 'updateRelease');
    const event = {
      preventDefault: jasmine.createSpy('preventDefault'),
      dataTransfer: { getData: () => '1' }
    } as any;

    component.onDrop(event, 'In-Progress');

    expect(component.updateRelease).not.toHaveBeenCalled();
    expect(component.releaseList[0].status).toBe('To-be-Tested');
    expect(toasterService.error).toHaveBeenCalledWith('You are Not Allowed.');
  });

  it('blocks unauthorized drawer access and shows an error', () => {
    component.openDrawer({ id: 1, assigned_from: 7, assigned_to: 8 });

    expect(drawerService.open).not.toHaveBeenCalled();
    expect(toasterService.error).toHaveBeenCalledOnceWith('You are Not Allowed.');
  });
});
