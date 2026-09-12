import { AssignTicketFormComponent } from './assign-ticket-form/assign-ticket-form.component';
import { SelfTicketFormComponent } from './self-ticket-form/self-ticket-form.component';
import { TaskFormComponent } from './task-form/task-form.component';

describe('terminal status notification refresh', () => {
  const createAuthService = () => jasmine.createSpyObj('AuthService', ['refreshNotificationCount']);

  it('refreshes only for Closed tickets', () => {
    const component = Object.create(SelfTicketFormComponent.prototype) as any;
    component.authService = createAuthService();

    component.refreshNotificationsWhenClosed('CLOSED');
    component.refreshNotificationsWhenClosed('Open');

    expect(component.authService.refreshNotificationCount).toHaveBeenCalledTimes(1);
  });

  it('refreshes only for Closed assigned tickets', () => {
    const component = Object.create(AssignTicketFormComponent.prototype) as any;
    component.authService = createAuthService();

    component.refreshNotificationsWhenClosed('closed');
    component.refreshNotificationsWhenClosed('Resolved');

    expect(component.authService.refreshNotificationCount).toHaveBeenCalledTimes(1);
  });

  it('refreshes Closed issues but not ordinary tasks', () => {
    const issueComponent = Object.create(TaskFormComponent.prototype) as any;
    issueComponent.authService = createAuthService();
    issueComponent._type = 'bug';

    issueComponent.refreshNotificationsWhenClosed('Closed');

    const taskComponent = Object.create(TaskFormComponent.prototype) as any;
    taskComponent.authService = createAuthService();
    taskComponent._type = 'requirement';

    taskComponent.refreshNotificationsWhenClosed('Closed');

    expect(issueComponent.authService.refreshNotificationCount).toHaveBeenCalledTimes(1);
    expect(taskComponent.authService.refreshNotificationCount).not.toHaveBeenCalled();
  });
});
