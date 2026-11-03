import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { NotSendDsrComponent } from './not-send-dsr.component';
import { NotSendDsrRequestDialogComponent } from './not-send-dsr-request-dialog.component';
import { TaskFormComponent } from 'src/app/_shared/components/drawer/task-form/task-form.component';
import { NotificationsComponent } from 'src/app/_shared/components/drawer/notifications/notifications.component';
import { NEVER, of, Subject } from 'rxjs';

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

  const componentForRequestLifecycle = (row: any, mutation: Subject<any>, refresh: Subject<any>) => {
    const component = componentFor({ employee: true, empid: row.employee_id });
    component.destroyed = false;
    component.startDate = '2026-09-29';
    component.endDate = '2026-09-29';
    component.selected_emp_id = null;
    component.selectedEmployeeName = null;
    component.pendingRequestIds = new Set<string>();
    component.notSentDsrRequestVersion = 0;
    component.activeNotSentDsrRequestKey = null;
    component.loadedNotSentDsrRequestKey = null;
    component.tableData = [{ ...row }];
    component.employeeList = [];
    component.authService = jasmine.createSpyObj('AuthService', [
      'createNotSendDsrRequest', 'decideNotSendDsrRequest', 'getNotsendTasks', 'refreshNotificationCount'
    ]);
    component.authService.createNotSendDsrRequest.and.returnValue(mutation);
    component.authService.getNotsendTasks.and.returnValue(refresh);
    component.toasterService = jasmine.createSpyObj('ToasterService', ['success', 'error']);
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

  it('keeps Request and Apply actions while exposing reason details after a decision', () => {
    const component = componentFor({ employee: true, empid: 42 });
    component.isTicketDepartment = () => false;
    const rejected = component.requestActionFormatter(cellFor({
      request_id: 31, request_status: 'REJECTED', employee_id: 42, requested_by: 42,
      requested_by_role: 'ROLE_EMPLOYEE'
    }));
    const approved = component.requestActionFormatter(cellFor({
      request_id: 32, request_status: 'APPROVED', employee_id: 42, requested_by: 42,
      requested_by_role: 'ROLE_EMPLOYEE'
    }));
    const applied = component.requestActionFormatter(cellFor({ request_status: 'APPLIED' }));

    expect(rejected).toContain('data-action="request"');
    expect(rejected).toContain('data-action="view-reasons"');
    expect(approved).toContain('data-action="apply"');
    expect(approved).toContain('data-action="view-reasons"');
    expect(applied).toContain('data-action="view-reasons"');
  });

  it('exposes and opens rejection reasons for employee, manager, and admin roles', () => {
    const row = {
      request_id: 31,
      request_status: 'REJECTED',
      employee_id: 42,
      requested_by: 42,
      requested_by_role: 'ROLE_EMPLOYEE',
      employee_name: 'Employee',
      date: '2026-09-17',
      request_reason: 'Missed DSR due to outage',
      rejection_reason: 'Insufficient details'
    };

    ([{ employee: true }, { manager: true }, { admin: true }] as const).forEach(roles => {
      const component = componentFor(roles);
      component.canRequest = () => false;
      component.dialog = jasmine.createSpyObj('MatDialog', ['open']);
      component.getDialogWorkType = () => 'DSR';

      expect(component.requestActionFormatter(cellFor(row))).toContain('data-action="view-reasons"');
      component.openReasonDialog(row);

      expect(component.dialog.open).toHaveBeenCalledWith(NotSendDsrRequestDialogComponent, jasmine.objectContaining({
        data: jasmine.objectContaining({
          mode: 'view',
          requestReason: 'Missed DSR due to outage',
          rejectionReason: 'Insufficient details'
        })
      }));
    });
  });

  it('routes the View reasons table action to the reasons dialog', () => {
    const component = componentFor({ manager: true });
    component.openReasonDialog = jasmine.createSpy('openReasonDialog');
    const row = { request_id: 21, request_status: 'APPROVED' };
    const event = {
      stopPropagation: jasmine.createSpy('stopPropagation'),
      target: { closest: () => ({ dataset: { action: 'view-reasons' }, disabled: false }) }
    } as any;

    component.handleRequestAction(event, cellFor(row));

    expect(component.openReasonDialog).toHaveBeenCalledOnceWith(row);
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

  it('opens the request approval dialog for a Hardware employee own row', () => {
    const component = componentFor({ employee: true, empid: 42 });
    component.storageService = {
      getUser: () => ({ department_id: 4 }),
      getDept: () => 'Hardware'
    };
    component.drawerService = jasmine.createSpyObj('DrawerService', ['open']);
    component.dialog = jasmine.createSpyObj('MatDialog', ['open']);
    component.dialog.open.and.returnValue({ afterClosed: () => of(null) });
    const row = { employee_id: 42, request_status: 'NOT_REQUESTED', date: '2026-09-17' };
    const event = {
      stopPropagation: jasmine.createSpy('stopPropagation'),
      target: { closest: () => ({ dataset: { action: 'request' }, disabled: false }) }
    } as any;

    component.handleRequestAction(event, cellFor(row));

    expect(component.dialog.open).toHaveBeenCalled();
    expect(component.drawerService.open).not.toHaveBeenCalled();
  });

  it('defaults Hardware and Headend DSR status fields to requestable workflow status', () => {
    const component = componentFor({ employee: true, empid: 42 });
    component.storageService = {
      getUser: () => ({ department: '6' }),
      getDept: () => 'Headend Department'
    };
    const row = { employee_id: 42, date: '2026-09-17', status: 'Not Sent' };
    const workflowStatus = component.normalizeDsrRequestStatus(row);

    expect(workflowStatus).toBe('NOT_REQUESTED');
    expect(component.requestActionFormatter(cellFor({ ...row, request_status: workflowStatus })))
      .toContain('data-action="request"');
    expect(component.requestStatusFormatter(cellFor({ ...row, request_status: workflowStatus })))
      .toContain('Not requested');
  });

  it('preserves an explicit request workflow status for Hardware and Headend rows', () => {
    const component = componentFor({ employee: true, empid: 42 });
    component.storageService = { getUser: () => ({ department_id: 4 }), getDept: () => 'Hardware' };

    expect(component.normalizeDsrRequestStatus({ status: 'Not Sent', request_status: 'PENDING' }))
      .toBe('PENDING');
    expect(component.normalizeDsrRequestStatus({ status: 'Not Sent', request_status: 'Not Sent' }))
      .toBe('NOT_REQUESTED');
  });

  it('shows Hardware Request to a manager on their own row only', () => {
    const manager = componentFor({ manager: true, empid: 42 });
    manager.storageService = { getUser: () => ({ department_id: 6 }), getDept: () => 'Headend' };
    const employee = componentFor({ employee: true, empid: 42 });
    employee.storageService = { getUser: () => ({ department_id: 4 }), getDept: () => 'Hardware' };

    expect(manager.requestActionFormatter(cellFor({ employee_id: 42, date: '2026-09-17' })))
      .toContain('data-action="request"');
    expect(manager.requestActionFormatter(cellFor({ employee_id: 7, date: '2026-09-17' })))
      .not.toContain('data-action="request"');
    expect(employee.requestActionFormatter(cellFor({ employee_id: 7, date: '2026-09-17' })))
      .not.toContain('data-action="request"');
  });

  it('opens Self Ticket on Apply for an approved Hardware request with date and request ID', () => {
    const component = componentFor({ employee: true, empid: 42 });
    component.storageService = { getUser: () => ({ department_id: 4 }), getDept: () => 'Hardware' };
    component.drawerService = jasmine.createSpyObj('DrawerService', ['open']);
    const row = {
      request_id: 91,
      request_status: 'APPROVED',
      employee_id: 42,
      requested_by: 42,
      requested_by_role: 'ROLE_EMPLOYEE',
      date: '2026-09-17'
    };
    const event = {
      stopPropagation: jasmine.createSpy('stopPropagation'),
      target: { closest: () => ({ dataset: { action: 'apply' }, disabled: false }) }
    } as any;

    component.handleRequestAction(event, cellFor(row));

    expect(component.drawerService.open).toHaveBeenCalledOnceWith('ticket', {
      mode: 'create',
      source: 'not-send-dsr',
      notSentDsrDate: '2026-09-17',
      not_send_dsr_request_id: 91
    });
  });

  it('opens Self Ticket on Apply for an approved Account request', () => {
    const component = componentFor({ employee: true, empid: 42 });
    component.storageService = { getUser: () => ({ department_id: 11 }), getDept: () => 'Account' };
    component.drawerService = jasmine.createSpyObj('DrawerService', ['open']);
    const row = {
      request_id: 92,
      request_status: 'APPROVED',
      employee_id: 42,
      requested_by: 42,
      requested_by_role: 'ROLE_EMPLOYEE',
      date: '2026-10-01'
    };
    const event = {
      stopPropagation: jasmine.createSpy('stopPropagation'),
      target: { closest: () => ({ dataset: { action: 'apply' }, disabled: false }) }
    } as any;

    component.handleRequestAction(event, cellFor(row));

    expect(component.drawerService.open).toHaveBeenCalledOnceWith('ticket', {
      mode: 'create',
      source: 'not-send-dsr',
      notSentDsrDate: '2026-10-01',
      not_send_dsr_request_id: 92
    });
  });

  it('submits Account missed DSR requests with ticket work type', () => {
    const component = componentFor({ employee: true, empid: 42 });
    component.storageService = { getUser: () => ({ department_id: 11 }), getDept: () => 'Account' };
    component.canRequest = () => true;
    component.setRowBusy = jasmine.createSpy('setRowBusy');
    component.authService = { createNotSendDsrRequest: jasmine.createSpy('createNotSendDsrRequest').and.returnValue(of({})) };
    component.handleWorkflowSuccess = jasmine.createSpy('handleWorkflowSuccess');

    component.submitRequest({ employee_id: 42, date: '2026-10-01' }, 'Missed ticket');

    expect(component.authService.createNotSendDsrRequest).toHaveBeenCalledWith({
      employee_id: 42,
      date: '2026-10-01',
      reason: 'Missed ticket',
      work_type: 'TICKET'
    });
  });

  it('shows the optimistic request status while a silent table refresh runs', () => {
    const mutation = new Subject<any>();
    const refresh = new Subject<any>();
    const row = { employee_id: 42, employee_name: 'Employee', date: '2026-09-29', request_status: 'NOT_REQUESTED' };
    const component = componentForRequestLifecycle(row, mutation, refresh);
    component.canRequest = () => true;

    component.submitRequest(row, 'Missed entry');
    expect(component.pendingRequestIds.size).toBe(1);
    expect(component.notSentDsrLoading).toBeFalse();

    mutation.next({ message: 'Request sent', request_id: 101 });
    mutation.complete();

    expect(component.tableData[0].request_status).toBe('PENDING');
    expect(component.pendingRequestIds.size).toBe(1);
    expect(component.notSentDsrLoading).toBeFalse();
    expect(component.authService.getNotsendTasks).toHaveBeenCalledWith(jasmine.any(Object), true);

    refresh.next([{
      employee_id: 42,
      employee_name: 'Employee',
      date: '2026-09-29',
      request_id: 101,
      request_status: 'PENDING'
    }]);
    refresh.complete();

    expect(component.tableData[0].request_id).toBe(101);
    expect(component.tableData[0].request_status).toBe('PENDING');
    expect(component.tableData[0].request_reason).toBe('Missed entry');
    expect(component.pendingRequestIds.size).toBe(0);
  });

  it('keeps approve and reject rows busy through their silent refreshes', () => {
    (['APPROVED', 'REJECTED'] as const).forEach(status => {
      const mutation = new Subject<any>();
      const refresh = new Subject<any>();
      const row = {
        request_id: 203,
        employee_id: 42,
        employee_name: 'Employee',
        date: '2026-09-29',
        request_status: 'PENDING',
        request_reason: 'Original request reason'
      };
      const component = componentForRequestLifecycle(row, mutation, refresh);
      component.canReview = () => true;
      component.authService.decideNotSendDsrRequest.and.returnValue(mutation);

      component.submitDecision(row, status, status === 'REJECTED' ? 'Rejection reason' : undefined);
      expect(component.pendingRequestIds.size).toBe(1);
      mutation.next({ message: `Request ${status.toLowerCase()}` });
      mutation.complete();

      expect(component.tableData[0].request_status).toBe(status);
      expect(component.pendingRequestIds.size).toBe(1);
      expect(component.notSentDsrLoading).toBeFalse();

      refresh.next([{ ...row, request_status: status, request_reason: undefined, rejection_reason: undefined }]);
      refresh.complete();
      expect(component.pendingRequestIds.size).toBe(0);
      expect(component.tableData[0].request_reason).toBe('Original request reason');
      if (status === 'REJECTED') expect(component.tableData[0].rejection_reason).toBe('Rejection reason');
    });
  });

  it('keeps optimistic status and clears the row spinner when the refresh fails', () => {
    const mutation = new Subject<any>();
    const refresh = new Subject<any>();
    const row = { employee_id: 42, employee_name: 'Employee', date: '2026-09-29', request_status: 'NOT_REQUESTED' };
    const component = componentForRequestLifecycle(row, mutation, refresh);
    component.canRequest = () => true;

    component.submitRequest(row, 'Missed entry');
    mutation.next({ message: 'Request sent' });
    mutation.complete();
    refresh.error({ error: { message: 'Refresh failed' } });

    expect(component.tableData[0].request_status).toBe('PENDING');
    expect(component.pendingRequestIds.size).toBe(0);
    expect(component.notSentDsrLoading).toBeFalse();
  });

  it('clears the row spinner without changing status when the mutation fails', () => {
    const mutation = new Subject<any>();
    const refresh = new Subject<any>();
    const row = { employee_id: 42, employee_name: 'Employee', date: '2026-09-29', request_status: 'NOT_REQUESTED' };
    const component = componentForRequestLifecycle(row, mutation, refresh);
    component.canRequest = () => true;

    component.submitRequest(row, 'Missed entry');
    expect(component.pendingRequestIds.size).toBe(1);
    mutation.error({ error: { message: 'Request failed' } });

    expect(component.tableData[0].request_status).toBe('NOT_REQUESTED');
    expect(component.pendingRequestIds.size).toBe(0);
    expect(component.authService.getNotsendTasks).not.toHaveBeenCalled();
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

  it('resolves empId rows so own-row Request is not hidden by an ID alias', () => {
    const component = componentFor({ employee: true, empid: 42 });
    component.storageService = { getUser: () => ({ department_id: 4 }), getDept: () => 'Hardware' };
    const employeeId = component.resolveEmployeeId({ empId: 42 });
    const html = component.requestActionFormatter(cellFor({ employee_id: employeeId }));

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

  it('opens the DSR form with the employee, request ID, and fixed approved date', () => {
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
      projectId: 3,
      date: '2026-09-17'
    });

    expect(component.drawerService.open).toHaveBeenCalledWith('dsr', jasmine.objectContaining({
      entryMode: 'dsr-entries',
      employeeId: 42,
      employeeName: 'BALAKUMARAN R',
      project_id: 3,
      fixedDsrDate: '2026-09-17',
      notSendDsrRequestId: 91
    }));
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
      reason: 'Forgot to submit my DSR',
      work_type: 'TASK'
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

  it('uses department-specific titles and descriptions for DSR entries', () => {
    const dialogFor = (mode: 'request' | 'approve' | 'reject') => new NotSendDsrRequestDialogComponent(
      new FormBuilder(),
      jasmine.createSpyObj('MatDialogRef', ['close']),
      { mode, employeeName: 'Employee', date: '2026-09-17', workType: 'DSR' }
    );

    expect(dialogFor('approve').title).toBe('Approve DSR request');
    expect(dialogFor('approve').description).toBe('Confirm that the requester can add the missing task.');
    expect(dialogFor('reject').title).toBe('Reject DSR request');
    expect(dialogFor('reject').description).toBe('Tell the requester why this task request cannot be approved.');
    expect(dialogFor('request').title).toBe('Request task entry');
    expect(dialogFor('request').description).toBe('Explain why a task must be added for this missing DSR date.');

    const reasonsDialog = new NotSendDsrRequestDialogComponent(
      new FormBuilder(),
      jasmine.createSpyObj('MatDialogRef', ['close']),
      { mode: 'view', employeeName: 'Employee', date: '2026-09-17', workType: 'DSR', requestReason: 'Original reason' }
    );
    expect(reasonsDialog.title).toBe('Request reasons');
    expect(reasonsDialog.requiresReason).toBeFalse();
    expect(reasonsDialog.data.requestReason).toBe('Original reason');
  });

  it('uses department-specific titles and descriptions for Ticket entries', () => {
    const dialogFor = (mode: 'request' | 'approve' | 'reject') => new NotSendDsrRequestDialogComponent(
      new FormBuilder(),
      jasmine.createSpyObj('MatDialogRef', ['close']),
      { mode, employeeName: 'Employee', date: '2026-09-17', workType: 'Ticket' }
    );

    expect(dialogFor('approve').title).toBe('Approve Ticket request');
    expect(dialogFor('approve').description).toBe('Confirm that the requester can add the missing Ticket.');
    expect(dialogFor('reject').title).toBe('Reject Ticket request');
    expect(dialogFor('reject').description).toBe('Tell the requester why this Ticket request cannot be approved.');
    expect(dialogFor('request').title).toBe('Request Ticket entry');
    expect(dialogFor('request').description).toBe('Explain why a Ticket must be added for this missing Ticket date.');
  });

  it('uses neutral copy when department type is unavailable', () => {
    const dialogFor = (mode: 'request' | 'approve' | 'reject') => new NotSendDsrRequestDialogComponent(
      new FormBuilder(),
      jasmine.createSpyObj('MatDialogRef', ['close']),
      { mode, employeeName: 'Employee', date: '2026-09-17' }
    );

    expect(dialogFor('approve').title).toBe('Approve work entry request');
    expect(dialogFor('approve').description).toBe('Confirm that the requester can add the missing work entry.');
    expect(dialogFor('reject').title).toBe('Reject work entry request');
    expect(dialogFor('reject').description).toBe('Tell the requester why this work entry request cannot be approved.');
    expect(dialogFor('request').title).toBe('Request work entry');
    expect(dialogFor('request').description).toBe('Explain why a work entry must be added for this missing date.');
  });

  it('classifies dialog copy by the signed-in department ID and hides it for unknown IDs', () => {
    const component = Object.create(NotSendDsrComponent.prototype) as any;
    const departmentTypes: Record<number, 'DSR' | 'Ticket'> = {
      1: 'DSR', 2: 'DSR', 3: 'DSR', 11: 'DSR', 4: 'Ticket', 6: 'Ticket'
    };

    Object.entries(departmentTypes).forEach(([departmentId, workType]) => {
      component.storageService = { getUser: () => ({ department_id: Number(departmentId) }) };
      expect(component.getDialogWorkType()).withContext(`department ${departmentId}`).toBe(workType);
    });

    component.storageService = { getUser: () => ({ department_id: 99 }) };
    expect(component.getDialogWorkType()).toBeUndefined();
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
