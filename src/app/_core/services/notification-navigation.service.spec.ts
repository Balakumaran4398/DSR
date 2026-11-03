import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { NotificationNavigationService } from './notification-navigation.service';
import { NotificationsComponent } from 'src/app/_shared/components/drawer/notifications/notifications.component';

describe('NotificationNavigationService', () => {
  let service: NotificationNavigationService;

  beforeEach(() => {
    sessionStorage.clear();
    history.replaceState({}, '');
    service = new NotificationNavigationService();
  });

  it('restores only a matching category and target', () => {
    const context = service.create('ticket', 42, null, '2026-09-01', '2026-09-30');
    service.store(context);

    expect(service.resolve('ticket', '42')).toEqual(context);
    expect(service.resolve('ticket', '43')).toBeNull();
    expect(service.resolve('issue', '42')).toBeNull();
  });

  it('rejects expired stored context', () => {
    const context = service.create('ticket', 42, null, '2026-09-01', '2026-09-30');
    sessionStorage.setItem('notificationNavigationContext', JSON.stringify({
      ...context,
      createdAt: Date.now() - (31 * 60 * 1000)
    }));

    expect(service.resolve('ticket', '42')).toBeNull();
  });

  it('consumes a freshly stored navigation context once', () => {
    const context = service.create('not-send-dsr', 19, null, null, null, '2026-09-12', 'Jane Doe');
    service.store(context);

    expect(service.consumePendingNavigationContext('not-send-dsr')).toEqual(context);
    expect(service.consumePendingNavigationContext('not-send-dsr')).toBeNull();
  });

  it('does not treat persisted context as a fresh navigation after service recreation', () => {
    const context = service.create('not-send-dsr', 19, null, null, null, '2026-09-12', 'Jane Doe');
    service.store(context);
    service = new NotificationNavigationService();

    expect(service.resolve('not-send-dsr', '19')).toEqual(context);
    expect(service.consumePendingNavigationContext('not-send-dsr')).toBeNull();
  });

  it('emits repeated DSR targets, including the same employee on another date', () => {
    const emittedDates: Array<string | null | undefined> = [];
    const subscription = service.context$.subscribe(context => emittedDates.push(context?.targetDate));
    const first = service.create('not-send-dsr', 19, null, '2026-09-01', '2026-09-30', '2026-09-12', 'Jane Doe');
    const second = service.create('not-send-dsr', 19, null, '2026-09-01', '2026-09-30', '2026-09-13', 'Jane Doe');

    service.store(first);
    service.store(second);

    expect(emittedDates).toEqual([undefined, '2026-09-12', '2026-09-13']);
    expect(service.currentContext).toEqual(second);
    expect(service.currentContext?.targetLabel).toBe('Jane Doe');
    subscription.unsubscribe();
  });
});

describe('NotificationsComponent clean navigation', () => {
  let component: any;
  let router: jasmine.SpyObj<any>;
  let drawer: jasmine.SpyObj<any>;

  beforeEach(() => {
    sessionStorage.clear();
    history.replaceState({}, '');
    const navigationService = new NotificationNavigationService();
    router = jasmine.createSpyObj('Router', ['navigate']);
    drawer = jasmine.createSpyObj('DrawerService', ['close']);
    router.navigate.and.returnValue(Promise.resolve(true));
    component = Object.create(NotificationsComponent.prototype);
    component.router = router;
    component.drawerService = drawer;
    component.notificationNavigationService = navigationService;
    component.filterStartDate = new Date(2026, 8, 1);
    component.filterEndDate = new Date(2026, 8, 30);
  });

  it('routes a ticket by ID without query parameters', fakeAsync(() => {
    component.navigateToTicket({ ticketId: 77 });
    flushMicrotasks();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/main/ticket-info', 77],
      jasmine.objectContaining({ state: jasmine.any(Object) })
    );
    expect(router.navigate.calls.mostRecent().args[1].queryParams).toBeUndefined();
    expect(drawer.close).toHaveBeenCalled();
  }));

  it('routes Not sent DSR by employee ID without query parameters', fakeAsync(() => {
    component.navigateTodsr({ employee_id: 19, employee_name: 'Jane Doe', date: '2026-09-12' });
    flushMicrotasks();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/main/notsenddsr', 19],
      jasmine.objectContaining({ state: jasmine.any(Object) })
    );
    expect(router.navigate.calls.mostRecent().args[1].queryParams).toBeUndefined();
    expect(component.notificationNavigationService.currentContext).toEqual(jasmine.objectContaining({
      category: 'not-send-dsr',
      targetId: '19',
      targetDate: '2026-09-12',
      targetLabel: 'Jane Doe'
    }));
  }));

  it('routes a Not sent ticket entry to the matching DSR employee and date', fakeAsync(() => {
    const event = jasmine.createSpyObj<MouseEvent>('MouseEvent', ['stopPropagation']);
    component.navigateToNotSentTicket({ employee_id: 27, employee_name: 'Alex Smith', date: '2026-09-14' }, event);
    flushMicrotasks();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/main/notsenddsr', 27],
      jasmine.objectContaining({ state: jasmine.any(Object) })
    );
    expect(component.notificationNavigationService.currentContext).toEqual(jasmine.objectContaining({
      category: 'not-send-dsr',
      targetId: '27',
      targetDate: '2026-09-14',
      targetLabel: 'Alex Smith'
    }));
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(drawer.close).toHaveBeenCalled();
  }));

  it('keeps a DSR request date in one-time navigation context instead of the refreshable URL', fakeAsync(() => {
    component.navigateToDsrRequest({
      employee_id: 19,
      request_id: 501,
      date: '2026-09-12'
    });
    flushMicrotasks();

    const navigationExtras = router.navigate.calls.mostRecent().args[1];
    expect(navigationExtras.queryParams).toEqual({ requestId: 501 });
    expect(navigationExtras.queryParams['fromdate']).toBeUndefined();
    expect(component.notificationNavigationService.currentContext).toEqual(jasmine.objectContaining({
      category: 'not-send-dsr',
      targetId: '19',
      targetDate: '2026-09-12'
    }));
  }));

  it('filters manager notification rows and counts to the manager department', () => {
    const manager = createNotificationComponent('ROLE_MANAGER', { employee_id: 100, department_id: 4 });
    manager.component.applyNotificationData({
      tickets: [
        { ticket_id: 1, assigned_to: 11, department_id: 4 },
        { ticket_id: 2, assigned_to: 12, department_id: 4 },
        { ticket_id: 3, assigned_to: 20, department_id: 6 }
      ],
      ticket_count: 8,
      not_send_ticket: [
        { employee_id: 11, employee_name: 'Jane Doe', department_id: 4, date: '2026-09-12' },
        { employee_id: 20, employee_name: 'Alex Smith', department_id: 6, date: '2026-09-12' }
      ],
      not_send_ticket_count: 5,
      not_send_dsr: [],
      total_issue_count: 0,
      total_release_count: 0,
      not_send_dsr_count: 0,
      not_send_dsr_requests: [],
      project_counts: []
    });

    expect(manager.component.tickets.map((ticket: any) => ticket.ticket_id)).toEqual([1, 2]);
    expect(manager.component.ticket_count).toBe(2);
    expect(manager.component.loadedTicketCount).toBe(2);
    expect(manager.component.notSentTickets.length).toBe(1);
    expect(manager.component.notSentTicketCount).toBe(1);
    expect(manager.component.loadedNotSentTicketCount).toBe(1);
    expect(manager.component.total).toBe(3);
  });

  it('shows every notification category to a manager and scopes rows and projects to their department', () => {
    const manager = createNotificationComponent('ROLE_MANAGER', { employee_id: 200, department_id: 8 });
    manager.component.applyNotificationData({
      tickets: [{ ticket_id: 1, department_id: 8 }, { ticket_id: 2, department_id: 9 }],
      ticket_count: 2,
      not_send_ticket: [{ employee_id: 81, department_id: 8 }, { employee_id: 91, department_id: 9 }],
      not_send_ticket_count: 2,
      not_send_dsr: [{ employee_id: 82, department_id: 8 }, { employee_id: 92, department_id: 9 }],
      not_send_dsr_count: 2,
      not_send_dsr_requests: [{ employee_id: 83, department_id: 8 }, { employee_id: 93, department_id: 9 }],
      not_send_dsr_request_count: 2,
      total_issue_count: 3,
      total_release_count: 4,
      project_counts: [
        { project_id: 80, department_id: 8, issue_count: 1, release_count: 1 },
        { project_id: 90, department_id: 9, issue_count: 1, release_count: 1 }
      ]
    });

    expect(manager.component.canSeeTickets).toBeTrue();
    expect(manager.component.canSeeNotSentTickets).toBeTrue();
    expect(manager.component.canSeeIssueAndReleaseNotifications).toBeTrue();
    expect(manager.component.canSeeNotSentDsr).toBeTrue();
    expect(manager.component.tickets.map((row: any) => row.ticket_id)).toEqual([1]);
    expect(manager.component.notSentTickets.map((row: any) => row.employee_id)).toEqual([81]);
    expect(manager.component.dsr.map((row: any) => row.employee_id)).toEqual([82]);
    expect(manager.component.dsrRequests.map((row: any) => row.employee_id)).toEqual([83]);
    expect(manager.component.projects.map((row: any) => row.project_id)).toEqual([80]);
    expect(manager.component.ticket_count).toBe(1);
    expect(manager.component.notSentTicketCount).toBe(1);
    expect(manager.component.dsrCount).toBe(1);
    expect(manager.component.dsrRequestCount).toBe(1);
    expect(manager.component.issues).toBe(1);
    expect(manager.component.release).toBe(1);
    expect(manager.component.total).toBe(6);
    expect(manager.component.loadedTicketCount).toBe(1);
  });

  it('shows Account Not sent tickets separately from regular Tickets', () => {
    const account = createNotificationComponent('ROLE_MANAGER', {
      employee_id: 99,
      department_id: 11,
      department_name: 'Account'
    });
    account.component.applyNotificationData({
      tickets: [],
      ticket_count: 0,
      not_send_ticket: [{ employee_id: 101, department_id: 11, employee_name: 'Account employee', date: '2026-10-01' }],
      not_send_ticket_count: 6,
      not_send_dsr: [],
      not_send_dsr_count: 0,
      not_send_dsr_requests: [],
      not_send_dsr_request_count: 0,
      total_issue_count: 0,
      total_release_count: 0,
      project_counts: []
    });

    expect(account.component.canSeeTickets).toBeTrue();
    expect(account.component.ticket_count).toBe(0);
    expect(account.component.tickets).toEqual([]);
    expect(account.component.canSeeNotSentTickets).toBeTrue();
    expect(account.component.notSentTicketCount).toBe(1);
    expect(account.component.notSentTickets.length).toBe(1);
    expect(account.component.total).toBe(1);
  });

  it('filters employee notifications to their own employee ID', () => {
    const employee = createNotificationComponent('ROLE_EMPLOYEE', { empid: 11, department_id: 4 });
    employee.component.applyNotificationData({
      tickets: [
        { ticket_id: 1, assigned_to: 11, department_id: 4 },
        { ticket_id: 2, assigned_to: 12, department_id: 4 }
      ],
      ticket_count: 2,
      not_send_ticket: [
        { employee_id: 11, employee_name: 'Jane Doe', department_id: 4, date: '2026-09-12' },
        { employee_id: 12, employee_name: 'Other Employee', department_id: 4, date: '2026-09-12' }
      ],
      not_send_ticket_count: 2,
      not_send_dsr: [],
      total_issue_count: 0,
      total_release_count: 0,
      not_send_dsr_count: 0,
      not_send_dsr_requests: [],
      project_counts: []
    });

    expect(employee.component.tickets.map((ticket: any) => ticket.ticket_id)).toEqual([1]);
    expect(employee.component.notSentTickets.map((ticket: any) => ticket.employee_id)).toEqual([11]);
    expect(employee.component.loadedTicketCount).toBe(1);
    expect(employee.component.loadedNotSentTicketCount).toBe(1);
  });

  it('filters Not sent DSR rows to the logged-in employee in a DSR department', () => {
    const employee = createNotificationComponent('ROLE_EMPLOYEE', { empid: 31, department_id: 1 });
    employee.component.applyNotificationData({
      tickets: [],
      ticket_count: 0,
      not_send_ticket: [],
      not_send_ticket_count: 0,
      not_send_dsr: [
        { employee_id: 31, employee_name: 'Current Employee', department_id: 1, date: '2026-09-12' },
        { employee_id: 32, employee_name: 'Other Employee', department_id: 1, date: '2026-09-12' }
      ],
      not_send_dsr_count: 2,
      total_issue_count: 0,
      total_release_count: 0,
      not_send_dsr_requests: [],
      project_counts: []
    });

    expect(employee.component.dsr.map((record: any) => record.employee_id)).toEqual([31]);
    expect(employee.component.dsrCount).toBe(2);
    expect(employee.component.loadedDsrCount).toBe(1);
  });

  function createNotificationComponent(role: string, user: any): { component: any } {
    const component = Object.create(NotificationsComponent.prototype);
    component.storageService = {
      roles: {
        isAdmin: role === 'ROLE_ADMIN',
        isManager: role === 'ROLE_MANAGER',
        isEmployee: role === 'ROLE_EMPLOYEE'
      },
      getUser: () => user,
      getEmpId: () => user?.empid ?? user?.employee_id ?? null,
      getDept: () => user?.department_name ?? null
    };
    component.employeeDirectory = [
      { employee_id: 11, department_id: 4, department_name: 'Hardware' },
      { employee_id: 12, department_id: 4, department_name: 'Hardware' },
      { employee_id: 20, department_id: 6, department_name: 'Headend' },
      { employee_id: 100, department_id: 4, department_name: 'Hardware' },
      { employee_id: 31, department_id: 1, department_name: 'Ridapps' },
      { employee_id: 32, department_id: 1, department_name: 'Ridapps' }
    ];
    return { component };
  }

  it("routes an issue directly by project and issue IDs", fakeAsync(() => {
    component.navigateToIssue(5, 88);
    flushMicrotasks();

    expect(router.navigate).toHaveBeenCalledWith(
      ["/main/projects/project-content", 5, 88],
      jasmine.objectContaining({ state: jasmine.any(Object) })
    );
    expect(router.navigate.calls.mostRecent().args[1].queryParams).toBeUndefined();
  }));

  it("opens the project Releases tab without query parameters", fakeAsync(() => {
    component.navigateToProject(5, "release");
    flushMicrotasks();

    expect(router.navigate).toHaveBeenCalledWith(
      ["/main/projects/project-content", 5],
      jasmine.objectContaining({ state: jasmine.any(Object) })
    );
    expect(sessionStorage.getItem("activeProjectTab")).toBe("release");
    expect(router.navigate.calls.mostRecent().args[1].queryParams).toBeUndefined();
  }));
});
