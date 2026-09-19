import { fakeAsync, tick } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { DsrFormComponent } from 'src/app/_shared/components/drawer/dsr-form/dsr-form.component';
import { TaskContentAccessComponent } from '../task-content-access/task-content-access.component';
import { TasksComponent } from '../../tasks/tasks.component';
import { NotSendDsrComponent } from './not-send-dsr.component';

describe('Not Send DSR continuation workflow', () => {
  function queryParamMap(values: Record<string, string | null>): any {
    return { get: (key: string) => values[key] ?? null };
  }

  it('navigates to the created task project with persistent workflow context', () => {
    const component = Object.create(NotSendDsrComponent.prototype) as any;
    component.getNotsendTasksOverview = jasmine.createSpy('getNotsendTasksOverview');
    component.router = jasmine.createSpyObj('Router', ['navigate']);
    component.toasterService = jasmine.createSpyObj('ToasterService', ['warning']);
    component.authService = jasmine.createSpyObj('AuthService', ['getTasksByProjectIdNdEmployeeId']);

    component.handleAppliedTaskCreated({
      source: 'task',
      action: 'created',
      payload: {
        task_id: 77,
        project_id: 5,
        date: '2026-09-17',
        not_send_dsr_request_id: 91
      }
    });

    expect(component.router.navigate).toHaveBeenCalledWith(
      ['/main/projects/project-content', 5],
      { queryParams: jasmine.objectContaining({
        fromdate: '2026-09-17',
        todate: '2026-09-17',
        generatedTaskId: 77,
        notSendDsrDate: '2026-09-17',
        notSendDsrRequestId: 91
      }) }
    );
    expect(sessionStorage.getItem('activeProjectTab')).toBe('tasks');
  });

  it('finds the generated task when the create response has no task ID', () => {
    const component = Object.create(NotSendDsrComponent.prototype) as any;
    component.empid = 42;
    component.getNotsendTasksOverview = jasmine.createSpy('getNotsendTasksOverview');
    component.router = jasmine.createSpyObj('Router', ['navigate']);
    component.toasterService = jasmine.createSpyObj('ToasterService', ['warning']);
    component.authService = jasmine.createSpyObj('AuthService', ['getTasksByProjectIdNdEmployeeId']);
    component.authService.getTasksByProjectIdNdEmployeeId.and.returnValue(of([{ id: 88, task: 'Recovered task', assigned_to: 42, start_date: '2026-09-17' }]));

    component.handleAppliedTaskCreated({
      source: 'task',
      action: 'created',
      payload: {
        response: { message: 'Created' },
        project_id: 5,
        employee_id: 42,
        task: 'Recovered task',
        date: '2026-09-17',
        task_type: 'requirement',
        not_send_dsr_request_id: 91
      }
    });

    expect(component.router.navigate).toHaveBeenCalledWith(
      ['/main/projects/project-content', 5],
      { queryParams: jasmine.objectContaining({ generatedTaskId: 88 }) }
    );
  });

  it('preserves workflow parameters when the generated task is opened', () => {
    const component = Object.create(TasksComponent.prototype) as any;
    component.route = { snapshot: { queryParamMap: queryParamMap({
      generatedTaskId: '77',
      notSendDsrDate: '2026-09-17',
      notSendDsrRequestId: '91'
    }) } };
    component.fromdate = '2026-09-15';
    component.todate = '2026-09-20';
    component.type = 'requirement';
    component.applyGeneratedTaskContext();

    const params = component.buildTaskDetailsQueryParams({ start_date: '2026-09-17', task_type: 'requirement' });

    expect(params.generatedTaskId).toBe('77');
    expect(params.notSendDsrDate).toBe('2026-09-17');
    expect(params.notSendDsrRequestId).toBe('91');
  });

  it('selects, scrolls to, and highlights the generated task row', fakeAsync(() => {
    const component = Object.create(TasksComponent.prototype) as any;
    const element = document.createElement('div');
    const row = jasmine.createSpyObj('Row', ['getElement', 'select', 'scrollTo']);
    row.getElement.and.returnValue(element);
    row.scrollTo.and.returnValue(Promise.resolve());
    component.generatedTaskId = '77';
    component.destroyed = false;
    component.table = jasmine.createSpyObj('Table', ['getRow', 'getRows']);
    component.table.getRow.and.returnValue(row);
    component.table.getRows.and.returnValue([row]);

    component.highlightGeneratedTask();
    tick(75);

    expect(element.classList.contains('generated-task-highlight')).toBeTrue();
    expect(row.select).toHaveBeenCalled();
    expect(row.scrollTo).toHaveBeenCalledWith('center', false);
  }));

  it('uses and locks the approved missed date only for a new DSR entry', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.initialDate = new Date(2026, 8, 19);
    component.data = { fixedDsrDate: '2026-09-17', editMode: false };

    const value = component.getEntryDate();

    expect(component.isDateLocked).toBeTrue();
    expect(value.getFullYear()).toBe(2026);
    expect(value.getMonth()).toBe(8);
    expect(value.getDate()).toBe(17);
  });

  it('includes the approved request ID in the historical task DSR payload', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = {
      fixedDsrDate: '2026-09-18',
      notSendDsrRequestId: '91',
      editMode: false,
      task: 'uiui'
    };
    component.taskid = 3500;
    component.taskList = [{ id: 3500, task: 'uiui' }];
    component.taskForm = new FormGroup({ subtaskid: new FormControl(3500) });

    const payload = component.buildTaskDsrPayload({
      subtaskid: 3500,
      worked_hours: '08:00:00',
      comments: 'Historical update',
      completion_percentage: 50,
      date: '2026-09-18',
      username: 'employee@example.com'
    });

    expect(payload.request_id).toBe(91);
    expect(payload.taskid).toBe(3500);
    expect(payload.subtaskid).toBe(0);
  });

  it('keeps the historical request ID when drawer data uses the API field name', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = {
      fixedDsrDate: '2026-09-18',
      not_send_dsr_request_id: 92,
      editMode: false,
      task: 'uiui'
    };
    component.route = { snapshot: { queryParamMap: queryParamMap({}) } };
    component.taskid = 3500;
    component.taskList = [{ id: 3500, task: 'uiui' }];
    component.taskForm = new FormGroup({ subtaskid: new FormControl(3500) });

    const payload = component.buildTaskDsrPayload({
      subtaskid: 3500,
      date: '2026-09-18'
    });

    expect(payload.request_id).toBe(92);
  });

  it('falls back to the workflow query parameter for a historical DSR', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = { fixedDsrDate: '2026-09-18', editMode: false, task: 'uiui' };
    component.route = { snapshot: { queryParamMap: queryParamMap({ notSendDsrRequestId: '93' }) } };
    component.taskid = 3500;
    component.taskList = [{ id: 3500, task: 'uiui' }];
    component.taskForm = new FormGroup({ subtaskid: new FormControl(3500) });

    const payload = component.buildTaskDsrPayload({
      subtaskid: 3500,
      date: '2026-09-18'
    });

    expect(payload.request_id).toBe(93);
  });

  it('passes the fixed date only to the matching generated task and clears it after success', () => {
    const component = Object.create(TaskContentAccessComponent.prototype) as any;
    component.route = { snapshot: { queryParamMap: queryParamMap({
      generatedTaskId: '77',
      notSendDsrDate: '2026-09-17',
      notSendDsrRequestId: '91'
    }) } };
    component.router = jasmine.createSpyObj('Router', ['navigate']);

    expect(component.getNotSendDsrWorkflowContext(77)).toEqual({
      fixedDsrDate: '2026-09-17',
      generatedTaskId: '77',
      notSendDsrRequestId: '91'
    });
    expect(component.getNotSendDsrWorkflowContext(78)).toBeNull();

    component.pendingFixedDsrSubmission = true;
    component.clearNotSendDsrWorkflowContext();
    expect(component.router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      relativeTo: component.route,
      queryParams: {
        generatedTaskId: null,
        notSendDsrDate: null,
        notSendDsrRequestId: null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    }));
  });
});
