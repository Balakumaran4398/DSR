import { FormControl } from '@angular/forms';
import { ReleaseFormComponent, releaseVersionValidator, ReleaseStatus, ReleaseType, VERSION_ERROR_STATE_MATCHER } from './release-form.component';

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

  it('accepts the supported release version formats', () => {
    const control = new FormControl('V1.2345', releaseVersionValidator);
    expect(control.valid).toBeTrue();

    control.setValue('V-1.23434');
    expect(control.valid).toBeTrue();
  });

  it('rejects invalid release version formats and more than six digits', () => {
    const control = new FormControl('1.2345', releaseVersionValidator);
    expect(control.hasError('versionFormat')).toBeTrue();

    control.setValue('V1.234345');
    expect(control.hasError('versionMaxDigits')).toBeTrue();

    control.setValue('V1.2.3');
    expect(control.hasError('versionFormat')).toBeTrue();
  });

  it('shows the version error state as soon as an invalid control is edited', () => {
    const control = new FormControl('invalid', releaseVersionValidator);
    control.markAsDirty();

    expect(VERSION_ERROR_STATE_MATCHER.isErrorState(control, null)).toBeTrue();
  });
});
