import { SidebarComponent } from './sidebar.component';

describe('SidebarComponent notification total', () => {
  it('includes the Account Not sent ticket count without merging regular ticket rows', () => {
    const component = Object.create(SidebarComponent.prototype) as any;
    component.storageService = {
      roles: { isAdmin: false, isManager: true, isEmployee: false },
      getUser: () => ({ employee_id: 99, department_id: 11, department_name: 'Account' }),
      getEmpId: () => 99,
      getDept: () => 'Account'
    };
    component.employeeDirectory = [];
    component.notificationData = {
      tickets: [],
      ticket_count: 0,
      not_send_ticket: [{ employee_id: 101, department_id: 11 }],
      not_send_ticket_count: 6,
      not_send_dsr: [],
      not_send_dsr_count: 0,
      not_send_dsr_request_count: 0,
      total_issue_count: 0,
      total_release_count: 0
    };

    component.updateNotificationTotal();

    expect(component.total).toBe(1);
  });

  it('includes department 8 manager DSR notifications using department-scoped rows', () => {
    const component = Object.create(SidebarComponent.prototype) as any;
    component.storageService = {
      roles: { isAdmin: false, isManager: true, isEmployee: false },
      getUser: () => ({ employee_id: 80, department_id: 8 }),
      getEmpId: () => 80,
      getDept: () => null
    };
    component.employeeDirectory = [];
    component.notificationData = {
      tickets: [],
      not_send_ticket: [],
      not_send_dsr: [{ employee_id: 81, department_id: 8 }, { employee_id: 91, department_id: 9 }],
      not_send_dsr_count: 9,
      not_send_dsr_requests: [],
      total_issue_count: 0,
      total_release_count: 0
    };

    component.updateNotificationTotal();

    expect(component.total).toBe(1);
  });
});
