import { FormControl } from '@angular/forms';
import { ReleaseFormComponent, ReleaseStatus, ReleaseType } from './release-form.component';

describe('ReleaseFormComponent select filters', () => {
  let component: ReleaseFormComponent;

  beforeEach(() => {
    component = Object.create(ReleaseFormComponent.prototype);
    (component as any).releaseTypeOptions = ['Internal', 'External'] as ReleaseType[];
    component.statusList = [
      'Upcoming-Release',
      'Open',
      'To-be-Tested',
      'On-Hold',
      'In-Progress',
      'Rejected',
      'Pass',
      'Failed'
    ] as ReleaseStatus[];
    component.filteredReleaseTypes = [...component.releaseTypeOptions];
    component.filteredStatuses = [...component.statusList];
    component.releaseTypeFilterControl = new FormControl('');
    component.statusFilterControl = new FormControl('');
  });

  it('filters release types case-insensitively', () => {
    (component as any).applyReleaseTypeFilter('ext');
    expect(component.filteredReleaseTypes).toEqual(['External']);

    (component as any).applyReleaseTypeFilter('');
    expect(component.filteredReleaseTypes).toEqual(['Internal', 'External']);
  });

  it('filters statuses and restores all options for an empty query', () => {
    (component as any).applyStatusFilter('progress');
    expect(component.filteredStatuses).toEqual(['In-Progress']);

    (component as any).applyStatusFilter('');
    expect(component.filteredStatuses).toEqual(component.statusList);
  });

  it('refreshes notifications only when a release is saved with Pass status', () => {
    const authService = jasmine.createSpyObj('AuthService', ['refreshNotificationCount']);
    (component as any).authService = authService;

    (component as any).refreshNotificationsWhenPassed('PASS');
    (component as any).refreshNotificationsWhenPassed('Failed');

    expect(authService.refreshNotificationCount).toHaveBeenCalledTimes(1);
  });
});
