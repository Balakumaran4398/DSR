import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { NotSendDsrComponent } from './not-send-dsr.component';
import { NotSendDsrRequestDialogComponent } from './not-send-dsr-request-dialog.component';
import { TaskFormComponent } from 'src/app/_shared/components/drawer/task-form/task-form.component';
import { NotificationsComponent } from 'src/app/_shared/components/drawer/notifications/notifications.component';
import { NEVER } from 'rxjs';

describe('Not Send DSR workflow', () => {
  const cellFor = (data: any) => ({ getRow: () => ({ getData: () => data }) });
  const componentFor = (roles: { admin?: boolean; manager?: boolean; employee?: boolean; empid?: number }, busy: string[] = []) => {
    const component = Object.create(NotSendDsrComponent.prototype) as any;
    component.isAdmin = !!roles.admin;
    component.isManager = !!roles.manager;
    component.isEmployee = !!roles.employee;
    component.empid = roles.empid ?? 42;
    component.pendingRequestIds = new Set<string>(busy);
    return component;
  };

  it('shows approval actions to a manager for an employee request', () => {
    const component = componentFor({ manager: true });
    const html = component.requestActionFormatter(cellFor({
      request_id: 12,
      request_status: 'PENDING',
      employee_id: 7,
      requested_by: 7,
      requested_by_role: 'ROLE_EMPLOYEE'
    }));

    expect(html).toContain('data-action="approve"');
    expect(html).toContain('data-action="reject"');
  });

  it('shows approval actions to an admin for a manager request', () => {
    const component = componentFor({ admin: true });
    const html = component.requestActionFormatter(cellFor({
      request_id: 12,
      request_status: 'PENDING',
      employee_id: 7,
      requested_by: 7,
      requested_by_role: 'MANAGER'
    }));

    expect(html).toContain('data-action="approve"');
    expect(html).toContain('data-action="reject"');
  });

  it('does not let an admin approve an employee request', () => {
    const component = componentFor({ admin: true });
    const html = component.requestActionFormatter(cellFor({
      request_id: 12,
      request_status: 'PENDING',
      employee_id: 7,
      requested_by: 7,
      requested_by_role: 'ROLE_EMPLOYEE'
    }));

    expect(html).not.toContain('data-action="approve"');
  });

  it('defaults a missing status to Request for an employee own row', () => {
    const component = componentFor({ employee: true, empid: 42 });

    const html = component.requestActionFormatter(cellFor({ employee_id: 42, date: '2026-09-17' }));

    expect(html).toContain('data-action="request"');
    expect(html).not.toContain('disabled');
  });

  it('shows Request to a manager only on the manager own row', () => {
    const component = componentFor({ manager: true, employee: true, empid: 42 });

    const ownHtml = component.requestActionFormatter(cellFor({ employee_id: 42, date: '2026-09-17' }));
    const teamHtml = component.requestActionFormatter(cellFor({ employee_id: 7, date: '2026-09-17' }));

    expect(ownHtml).toContain('data-action="request"');
    expect(teamHtml).not.toContain('data-action="request"');
  });

  it('does not expose Request to an employee for another employee row', () => {
    const component = componentFor({ employee: true, empid: 42 });

    const html = component.requestActionFormatter(cellFor({ employee_id: 7, date: '2026-09-17' }));

    expect(html).not.toContain('data-action="request"');
  });

  it('does not expose ownership actions when the employee ID is missing', () => {
    const component = componentFor({ employee: true, empid: 42 });

    const html = component.requestActionFormatter(cellFor({ date: '2026-09-17' }));

    expect(html).not.toContain('data-action="request"');
    expect(html).not.toContain('data-action="apply"');
  });

  it('does not treat a generic row ID as the employee ID', () => {
    const component = componentFor({ employee: true, empid: 42 });

    const html = component.requestActionFormatter(cellFor({ id: 42, date: '2026-09-17' }));

    expect(html).not.toContain('data-action="request"');
  });

  it('accepts an explicit legacy employeeid field for ownership checks', () => {
    const component = componentFor({ employee: true, empid: 42 });

    const html = component.requestActionFormatter(cellFor({ employeeid: 42, date: '2026-09-17' }));

    expect(html).toContain('data-action="request"');
  });

  it('resolves a missing row employee ID from one exact employee-directory name match', () => {
    const component = componentFor({ manager: true, empid: 42 });
    component.employeeList = [
      { id: 42, employee_name: 'BALAKUMARAN R' },
      { id: 7, employee_name: 'BUVANESHWARI S' }
    ];

    const ownHtml = component.requestActionFormatter(cellFor({ employee_name: 'Balakumaran  R' }));
    const teamHtml = component.requestActionFormatter(cellFor({ employee_name: 'BUVANESHWARI S' }));

    expect(ownHtml).toContain('data-action="request"');
    expect(teamHtml).not.toContain('data-action="request"');
  });

  it('does not replace an explicitly invalid employee ID using a name match', () => {
    const component = componentFor({ employee: true, empid: 42 });
    component.employeeList = [{ id: 42, employee_name: 'BALAKUMARAN R' }];

    const html = component.requestActionFormatter(cellFor({
      employee_id: 'invalid',
      employee_name: 'BALAKUMARAN R'
    }));

    expect(html).not.toContain('data-action="request"');
  });

  it('does not expose review actions when requester identity is missing or inconsistent', () => {
    const component = componentFor({ manager: true, empid: 42 });
    const missingRequester = component.requestActionFormatter(cellFor({
      request_id: 12,
      request_status: 'PENDING',
      employee_id: 7,
      requested_by_role: 'ROLE_EMPLOYEE'
    }));
    const mismatchedRequester = component.requestActionFormatter(cellFor({
      request_id: 13,
      request_status: 'PENDING',
      employee_id: 7,
      requested_by: 8,
      requested_by_role: 'ROLE_EMPLOYEE'
    }));

    expect(missingRequester).not.toContain('data-action="approve"');
    expect(mismatchedRequester).not.toContain('data-action="approve"');
  });

  it('does not expose review actions without a valid request ID', () => {
    const component = componentFor({ manager: true, empid: 42 });
    const html = component.requestActionFormatter(cellFor({
      request_status: 'PENDING',
      employee_id: 7,
      requested_by: 7,
      requested_by_role: 'ROLE_EMPLOYEE'
    }));

    expect(html).not.toContain('data-action="approve"');
  });

  it('does not expose an action for an unknown request status', () => {
    const component = componentFor({ employee: true, empid: 42 });
    const html = component.requestActionFormatter(cellFor({
      request_status: 'unexpected',
      employee_id: 42
    }));

    expect(html).not.toContain('data-action=');
  });

  it('does not expose Apply when requester role does not match the logged-in role', () => {
    const component = componentFor({ employee: true, empid: 42 });
    const html = component.requestActionFormatter(cellFor({
      request_id: 12,
      request_status: 'APPROVED',
      employee_id: 42,
      requested_by: 42,
      requested_by_role: 'ROLE_MANAGER'
    }));

    expect(html).not.toContain('data-action="apply"');
  });

  it('keeps admins review-only even when another role is also present', () => {
    const component = componentFor({ admin: true, manager: true, employee: true, empid: 42 });

    const html = component.requestActionFormatter(cellFor({ employee_id: 42, date: '2026-09-17' }));

    expect(html).not.toContain('data-action="request"');
  });

  it('prevents a manager from approving their own pending request', () => {
    const component = componentFor({ manager: true, employee: true, empid: 42 });
    const html = component.requestActionFormatter(cellFor({
      request_id: 12,
      request_status: 'PENDING',
      employee_id: 42,
      requested_by: 42,
      requested_by_role: 'ROLE_MANAGER'
    }));

    expect(html).not.toContain('data-action="approve"');
    expect(html).toContain('Awaiting admin review');
  });

  it('disables Request only while the same row is submitting', () => {
    const component = componentFor({ employee: true, empid: 42 }, ['new:42:2026-09-17']);

    const html = component.requestActionFormatter(cellFor({ employee_id: 42, date: '2026-09-17' }));

    expect(html).toContain('data-action="request"');
    expect(html).toContain('disabled');
  });

  it('opens task create mode with the employee and fixed approved date', () => {
    const component = componentFor({ employee: true, empid: 42 });
    component.drawerService = jasmine.createSpyObj('DrawerService', ['open']);
    component.toasterService = jasmine.createSpyObj('ToasterService', ['error']);

    component.openApplyTask({
      request_id: 91,
      request_status: 'APPROVED',
      employee_id: 42,
      requested_by: 42,
      requested_by_role: 'ROLE_EMPLOYEE',
      employee_name: 'BALAKUMARAN R',
      date: '2026-09-17'
    });

    expect(component.drawerService.open).toHaveBeenCalledWith('task', jasmine.objectContaining({
      mode: 'create',
      employee_id: 42,
      start_date: '2026-09-17',
      end_date: '2026-09-17',
      not_send_dsr_request_id: 91
    }), 'requirement');
  });

  it('passes the request API payload with employee ID, date, and trimmed reason', () => {
    const component = componentFor({ employee: true, empid: 33 });
    component.authService = jasmine.createSpyObj('AuthService', ['createNotSendDsrRequest']);
    component.authService.createNotSendDsrRequest.and.returnValue(NEVER);
    component.toasterService = jasmine.createSpyObj('ToasterService', ['error']);

    component.submitRequest({
      employee_id: 33,
      request_status: 'NOT_REQUESTED',
      date: '2026-09-17'
    }, '  Forgot to submit my DSR  ');

    expect(component.authService.createNotSendDsrRequest).toHaveBeenCalledOnceWith({
      employee_id: 33,
      date: '2026-09-17',
      reason: 'Forgot to submit my DSR'
    });
  });

  it('passes APPROVED status to the decision API without an approval reason', () => {
    const component = componentFor({ manager: true, empid: 42 });
    component.authService = jasmine.createSpyObj('AuthService', ['decideNotSendDsrRequest']);
    component.authService.decideNotSendDsrRequest.and.returnValue(NEVER);
    component.toasterService = jasmine.createSpyObj('ToasterService', ['error']);

    component.submitDecision({
      request_id: 73,
      request_status: 'PENDING',
      employee_id: 33,
      requested_by: 33,
      requested_by_role: 'ROLE_EMPLOYEE'
    }, 'APPROVED', 'reason must not be sent');

    expect(component.authService.decideNotSendDsrRequest).toHaveBeenCalledOnceWith(73, {
      status: 'APPROVED'
    });
  });

  it('passes REJECTED status and trimmed reason to the decision API', () => {
    const component = componentFor({ manager: true, empid: 42 });
    component.authService = jasmine.createSpyObj('AuthService', ['decideNotSendDsrRequest']);
    component.authService.decideNotSendDsrRequest.and.returnValue(NEVER);
    component.toasterService = jasmine.createSpyObj('ToasterService', ['error']);

    component.submitDecision({
      request_id: 74,
      request_status: 'PENDING',
      employee_id: 33,
      requested_by: 33,
      requested_by_role: 'ROLE_EMPLOYEE'
    }, 'REJECTED', '  Missing details  ');

    expect(component.authService.decideNotSendDsrRequest).toHaveBeenCalledOnceWith(74, {
      status: 'REJECTED',
      reason: 'Missing details'
    });
  });

  it('treats an Accepted backend status as approved for the original requester', () => {
    const component = componentFor({ employee: true, empid: 33 });
    const html = component.requestActionFormatter(cellFor({
      request_id: 73,
      request_status: 'Accepted',
      employee_id: 33,
      requested_by: 33,
      requested_by_role: 'ROLE_EMPLOYEE'
    }));

    expect(html).toContain('data-action="apply"');
  });

  it('requires a non-whitespace reason when requesting or rejecting', () => {
    const requestDialog = new NotSendDsrRequestDialogComponent(
      new FormBuilder(),
      jasmine.createSpyObj('MatDialogRef', ['close']),
      { mode: 'request', employeeName: 'Employee', date: '2026-09-17' }
    );
    requestDialog.form.get('reason')?.setValue('   ');

    expect(requestDialog.form.invalid).toBeTrue();

    const approveDialog = new NotSendDsrRequestDialogComponent(
      new FormBuilder(),
      jasmine.createSpyObj('MatDialogRef', ['close']),
      { mode: 'approve', employeeName: 'Employee', date: '2026-09-17' }
    );
    expect(approveDialog.form.valid).toBeTrue();
  });

  it('patches DSR task defaults without entering edit mode', () => {
    const component = Object.create(TaskFormComponent.prototype) as any;
    component.taskForm = new FormGroup({
      projectid: new FormControl(0),
      start_date: new FormControl(null),
      end_date: new FormControl(null),
      assigned_to: new FormControl(null),
      assigned_from: new FormControl(null),
      task_type: new FormControl('requirement')
    });
    component.projectDetails = { id: 7 };
    component.projectid = 0;
    component.type = 'requirement';
    component.storageService = { getEmpId: () => 9 };
    component.getEmployees = jasmine.createSpy('getEmployees');

    component.patchCreateContext({
      mode: 'create',
      employee_id: 42,
      employee_name: 'BALAKUMARAN R',
      start_date: '2026-09-17',
      end_date: '2026-09-17',
      locked_fields: ['start_date', 'end_date'],
      not_send_dsr_request_id: 91
    });

    expect(component.isEditMode).toBeFalse();
    expect(component.lockDsrDates).toBeTrue();
    expect(component.taskForm.get('assigned_to')?.value).toBe(42);
    expect(component.taskForm.get('assigned_to')?.disabled).toBeTrue();
    expect(component.taskForm.get('start_date')?.value.getFullYear()).toBe(2026);
    expect(component.taskForm.get('start_date')?.value.getMonth()).toBe(8);
    expect(component.taskForm.get('start_date')?.value.getDate()).toBe(17);
  });

  it('includes DSR workflow notifications in the displayed total', () => {
    const component = Object.create(NotificationsComponent.prototype) as any;

    component.applyNotificationData({
      ticket_count: 1,
      total_issue_count: 2,
      total_release_count: 3,
      not_send_dsr_count: 4,
      not_send_dsr_request_count: 2,
      tickets: [],
      not_send_dsr: [],
      not_send_dsr_requests: [{ request_id: 1 }, { request_id: 2 }],
      project_counts: []
    });

    expect(component.dsrRequestCount).toBe(2);
    expect(component.total).toBe(12);
  });
});
