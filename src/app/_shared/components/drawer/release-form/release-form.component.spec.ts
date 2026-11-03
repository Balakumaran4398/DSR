import { FormControl, FormGroup, Validators } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ReleaseFormComponent, releaseVersionValidator, ReleaseStatus, ReleaseType, VERSION_ERROR_STATE_MATCHER } from './release-form.component';

describe('ReleaseFormComponent select filters', () => {
  let component: ReleaseFormComponent;

  beforeEach(() => {
    component = Object.create(ReleaseFormComponent.prototype);
    (component as any).releaseTypeOptions = ['Internal', 'External'] as ReleaseType[];
    component.statusList = [
      'Upcoming-Release',
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
    expect(component.filteredStatuses).not.toContain('Open');
  });

  it('refreshes notifications only when a release is saved with Pass status', () => {
    const authService = jasmine.createSpyObj('AuthService', ['refreshNotificationCount']);
    (component as any).authService = authService;

    (component as any).refreshNotificationsWhenPassed('PASS');
    (component as any).refreshNotificationsWhenPassed('Failed');

    expect(authService.refreshNotificationCount).toHaveBeenCalledTimes(1);
  });

  it('accepts the supported release version formats', () => {
    const control = new FormControl('', releaseVersionValidator);

    [
      'v1.2', 'v-1.2', 'v1.2.3', 'v-1.2.3',
      'v11.22.33', 'v-11.22.33', 'v123.213.312', 'v-123.45.6',
      'v123.123.123'
    ].forEach(version => {
      control.setValue(version);
      expect(control.valid).withContext(version).toBeTrue();
    });
  });

  it('rejects invalid release version formats', () => {
    const control = new FormControl('', releaseVersionValidator);

    [
      'V1.2', 'V-1.2.3', '1.2', 'v 1.2', 'v- 1.2', 'v1. 2',
      'v-1', 'v1', 'v.1.2', 'v1..2', 'v1.2.', 'v1.2a',
      'v-1-2', 'v--1.2', 'v1234.2', 'v1.2345', 'v1.2.3.4'
    ].forEach(version => {
      control.setValue(version);
      expect(control.hasError('versionFormat')).withContext(version).toBeTrue();
    });
  });

  it('keeps required and format validation errors separate', () => {
    const control = new FormControl('', [Validators.required, releaseVersionValidator]);

    expect(control.hasError('required')).toBeTrue();
    expect(control.hasError('versionFormat')).toBeFalse();

    control.setValue('V1.2');
    expect(control.hasError('required')).toBeFalse();
    expect(control.hasError('versionFormat')).toBeTrue();

    control.setValue('v1.2');
    expect(control.valid).toBeTrue();
    expect(control.errors).toBeNull();
  });

  it('shows the version error state as soon as an invalid control is edited', () => {
    const control = new FormControl('invalid', releaseVersionValidator);
    control.markAsDirty();

    expect(VERSION_ERROR_STATE_MATCHER.isErrorState(control, null)).toBeTrue();
  });

  it('limits assignee changes for employees only at To-be-Tested status', () => {
    (component as any).storageService = { roles: { isAdmin: false, isManager: false } };

    expect(component.canEditAssignedTo('Upcoming-Release')).toBeTrue();
    expect(component.canEditAssignedTo('To-be-Tested')).toBeFalse();
    expect(component.canEditAssignedTo('In-Progress')).toBeTrue();

    (component as any).storageService.roles = { isAdmin: false, isManager: true };
    expect(component.canEditAssignedTo('Upcoming-Release')).toBeTrue();
  });
});

describe('ReleaseFormComponent QC testing start date', () => {
  let component: ReleaseFormComponent;
  let qcStartDateControl: FormControl;
  const capturedDate = new Date(2026, 9, 3);

  beforeEach(() => {
    component = Object.create(ReleaseFormComponent.prototype);
    (component as any).qcStartDateStatuses = ['On-Hold', 'In-Progress', 'Rejected', 'Pass', 'Failed'];
    (component as any).qcStartRequiredStatuses = ['In-Progress', 'Pass', 'Failed'];
    (component as any).qcEndDateStatuses = ['In-Progress', 'Pass', 'Failed'];
    (component as any).qcEndRequiredStatuses = ['In-Progress'];
    qcStartDateControl = new FormControl('');
    component.releaseForm = new FormGroup({
      status: new FormControl<ReleaseStatus>('To-be-Tested', { nonNullable: true }),
      release_type: new FormControl<ReleaseType>('Internal', { nonNullable: true }),
      qc_testing_start_date: qcStartDateControl,
      qc_testing_end_date: new FormControl('')
    });
    spyOn<any>(component, 'getTodayDate').and.returnValue(capturedDate);
  });

  it('shows the start date for every QC result status in the requirement', () => {
    ['On-Hold', 'In-Progress', 'Rejected', 'Pass', 'Failed'].forEach(status => {
      expect((component as any).shouldShowQcTestingStartDate(status)).withContext(status).toBeTrue();
    });
    expect((component as any).shouldShowQcTestingStartDate('To-be-Tested')).toBeFalse();
    expect((component as any).shouldShowQcTestingStartDate('Upcoming-Release')).toBeFalse();
  });

  it('captures today only for the first transition from To-be-Tested to a non-upcoming status', () => {
    (component as any).captureQcTestingStartDate('To-be-Tested', 'On-Hold');
    expect(qcStartDateControl.value).toBe(capturedDate);

    const manuallyChangedDate = new Date(2026, 9, 1);
    qcStartDateControl.setValue(manuallyChangedDate);
    (component as any).captureQcTestingStartDate('To-be-Tested', 'Failed');
    expect(qcStartDateControl.value).toBe(manuallyChangedDate);
  });

  it('does not capture a start date when To-be-Tested changes to Upcoming-Release', () => {
    (component as any).captureQcTestingStartDate('To-be-Tested', 'Upcoming-Release');
    expect(qcStartDateControl.value).toBeFalsy();
  });

  it('allows editing only while the status is In-Progress', () => {
    (component as any).syncQcTestingDatesWithStatus('On-Hold');
    expect(qcStartDateControl.disabled).toBeTrue();

    (component as any).syncQcTestingDatesWithStatus('In-Progress');
    expect(qcStartDateControl.enabled).toBeTrue();

    (component as any).syncQcTestingDatesWithStatus('Rejected');
    expect(qcStartDateControl.disabled).toBeTrue();
  });
});

describe('ReleaseFormComponent submission', () => {
  let component: ReleaseFormComponent;
  let authService: jasmine.SpyObj<any>;
  let toasterService: jasmine.SpyObj<any>;
  let drawerService: jasmine.SpyObj<any>;

  const createValidForm = (ismail = false) => new FormGroup({
    title: new FormControl('Release title', Validators.required),
    ismail: new FormControl(ismail),
    username: new FormControl('test.user')
  });

  beforeEach(() => {
    component = Object.create(ReleaseFormComponent.prototype);
    authService = jasmine.createSpyObj('AuthService', ['createRelease', 'updateRelease', 'refreshNotificationCount']);
    toasterService = jasmine.createSpyObj('ToasterService', ['success', 'warning', 'error']);
    drawerService = jasmine.createSpyObj('DrawerService', ['notifyAction', 'close']);
    (component as any).authService = authService;
    (component as any).toasterService = toasterService;
    (component as any).drawerService = drawerService;
    (component as any).storageService = {
      getUsername: () => 'test.user',
      getEmpId: () => 42,
      roles: { isAdmin: false, isManager: false, isEmployee: true }
    };
    component.submitting = false;
    component.selectedFiles = [];
  });

  it('marks invalid fields touched and shows a validation error without calling an API', async () => {
    const title = new FormControl('', Validators.required);
    component.releaseForm = new FormGroup({ title });
    component.isEditMode = false;

    await component.onSubmit();

    expect(title.touched).toBeTrue();
    expect(toasterService.error).toHaveBeenCalledOnceWith('Please complete all required fields.');
    expect(authService.createRelease).not.toHaveBeenCalled();
    expect(authService.updateRelease).not.toHaveBeenCalled();
  });

  it('blocks an edit submission when the release is assigned to a different employee', async () => {
    component.releaseForm = createValidForm();
    component.isEditMode = true;
    component.data = { id: 1, mode: 'edit', status: 'Upcoming-Release', assigned_from: 7, assigned_to: 8 };
    spyOn<any>(component, 'buildReleaseRequestPayload').and.resolveTo({ title: 'Release title' });

    await component.onSubmit();

    expect(authService.updateRelease).not.toHaveBeenCalled();
    expect(component.submitting).toBeFalse();
    expect(toasterService.error).toHaveBeenCalledOnceWith('You are Not Allowed.');
  });

  it('allows the assigned employee to submit an edit and restores the button on API error', async () => {
    component.releaseForm = createValidForm();
    component.isEditMode = true;
    component.data = { id: 1, mode: 'edit', status: 'Upcoming-Release', assigned_from: 7, assigned_to: 42 };
    spyOn<any>(component, 'buildReleaseRequestPayload').and.resolveTo({ title: 'Release title' });
    authService.updateRelease.and.returnValue(throwError(() => ({ error: { message: 'Update failed.' } })));

    await component.onSubmit();

    expect(authService.updateRelease).toHaveBeenCalled();
    expect(component.submitting).toBeFalse();
    expect(toasterService.error).toHaveBeenCalledWith('Update failed.');
  });

  it('allows the assign-from employee to update a release at Upcoming-Release status', async () => {
    component.releaseForm = createValidForm();
    component.isEditMode = true;
    component.data = { id: 1, mode: 'edit', status: 'Upcoming-Release', assign_from: 42, assigned_to: 8 };
    spyOn<any>(component, 'buildReleaseRequestPayload').and.resolveTo({ title: 'Release title' });
    authService.updateRelease.and.returnValue(throwError(() => ({ error: { message: 'Update failed.' } })));

    await component.onSubmit();

    expect(authService.updateRelease).toHaveBeenCalled();
    expect(toasterService.error).toHaveBeenCalledWith('Update failed.');
  });

  it('shows the create fallback message and restores the button when the API has no error message', async () => {
    component.releaseForm = createValidForm();
    component.isEditMode = false;
    component.data = { mode: 'create' };
    spyOn<any>(component, 'buildReleaseRequestPayload').and.resolveTo({ title: 'Release title' });
    authService.createRelease.and.returnValue(throwError(() => ({})));

    await component.onSubmit();

    expect(component.submitting).toBeFalse();
    expect(toasterService.error).toHaveBeenCalledWith('Unable to create release.');
  });

  it('restores the button when attachment processing fails', async () => {
    component.releaseForm = createValidForm();
    component.isEditMode = false;
    spyOn<any>(component, 'buildReleaseRequestPayload').and.rejectWith(new Error('File error'));

    await component.onSubmit();

    expect(component.submitting).toBeFalse();
    expect(toasterService.error).toHaveBeenCalledWith('Unable to process the selected attachments.');
    expect(authService.createRelease).not.toHaveBeenCalled();
  });

  it('reports a successful update when only email delivery fails', async () => {
    component.releaseForm = createValidForm(true);
    component.isEditMode = true;
    component.data = { id: 1, mode: 'edit', assigned_to: 42 };
    spyOn<any>(component, 'buildReleaseRequestPayload').and.resolveTo({ title: 'Release title' });
    spyOn(component, 'onCancel');
    authService.updateRelease.and.returnValue(of({
      mail_status: 'FAILED',
      failed_recipients: 'recipient@example.com'
    }));

    await component.onSubmit();

    expect(toasterService.warning).toHaveBeenCalledWith(
      'Release updated, but email was not sent\nrecipient@example.com',
      'Failed:'
    );
    expect(component.submitting).toBeFalse();
  });
});
