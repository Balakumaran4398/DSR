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

  function createHighlightFixture(records: any[], employeeId: string, employeeName: string, date: string): any {
    const component = Object.create(NotSendDsrComponent.prototype) as any;
    const rows = records.map(data => {
      const element = document.createElement('div');
      const row = jasmine.createSpyObj('Row', ['getData', 'getElement', 'select', 'scrollTo']);
      row.getData.and.returnValue(data);
      row.getElement.and.returnValue(element);
      row.scrollTo.and.returnValue(Promise.resolve());
      return { row, element };
    });
    component.requestedHighlightId = null;
    component.requestedEmployeeId = employeeId;
    component.requestedEmployeeName = employeeName;
    component.requestedDate = date;
    component.tableOps = Promise.resolve();
    component.tableBuiltPromise = Promise.resolve();
    component.enqueueTableOp = (action: () => any) => action();
    component.resolveEmployeeId = (data: any) => Number(data?.employee_id) || null;
    component.normalizeEmployeeName = (value: unknown) => `${value ?? ''}`.trim().replace(/\s+/g, ' ').toUpperCase();
    component.normalizeNotificationDate = (value: unknown) => `${value ?? ''}`.slice(0, 10);
    component.table = jasmine.createSpyObj('Table', ['getRows', 'setPageToRow']);
    component.table.getRows.and.returnValue(rows.map(item => item.row));
    component.table.setPageToRow.and.returnValue(Promise.resolve());
    return { component, rows };
  }

  it('highlights the notification name when its employee ID points to a different row', fakeAsync(() => {
    const { component, rows } = createHighlightFixture([
      { employee_id: 19, employee_name: 'Alex Smith', date: '2026-09-12' },
      { employee_id: 27, employee_name: 'Jane Doe', date: '2026-09-12' }
    ], '19', 'Jane Doe', '2026-09-12');

    component.highlightRequestedRow();
    tick();

    expect(rows[1].row.select).toHaveBeenCalled();
    expect(rows[0].row.select).not.toHaveBeenCalled();
    expect(rows[1].element.classList.contains('dsr-request-highlight')).toBeTrue();
  }));

  it('normalizes the notification name and uses the ID to resolve duplicate names', fakeAsync(() => {
    const { component, rows } = createHighlightFixture([
      { employee_id: 20, employee_name: 'Jane Doe', date: '2026-09-12' },
      { employee_id: 19, employee_name: '  JANE   DOE ', date: '2026-09-12T00:00:00.000Z' }
    ], '19', ' jane doe ', '2026-09-12');

    component.highlightRequestedRow();
    tick();

    expect(rows[1].row.select).toHaveBeenCalled();
    expect(rows[0].row.select).not.toHaveBeenCalled();
  }));

  it('falls back to employee ID when no row name matches', fakeAsync(() => {
    const { component, rows } = createHighlightFixture([
      { employee_id: 19, employee_name: 'Jane Smith', date: '2026-09-12' }
    ], '19', 'Jane Doe', '2026-09-12');

    component.highlightRequestedRow();
    tick();

    expect(rows[0].row.select).toHaveBeenCalled();
  }));

  it('does not highlight an ambiguous duplicate name when the ID matches neither row', fakeAsync(() => {
    const { component, rows } = createHighlightFixture([
      { employee_id: 20, employee_name: 'Jane Doe', date: '2026-09-12' },
      { employee_id: 21, employee_name: 'Jane Doe', date: '2026-09-12' }
    ], '19', 'Jane Doe', '2026-09-12');

    component.highlightRequestedRow();
    tick();

    expect(rows[0].row.select).not.toHaveBeenCalled();
    expect(rows[1].row.select).not.toHaveBeenCalled();
    expect(rows[0].element.classList.contains('dsr-request-highlight')).toBeFalse();
    expect(rows[1].element.classList.contains('dsr-request-highlight')).toBeFalse();
  }));

  it('highlights only the row matching both notification employee ID and date', fakeAsync(() => {
    const component = Object.create(NotSendDsrComponent.prototype) as any;
    const oldElement = document.createElement('div');
    const wrongDateElement = document.createElement('div');
    const targetElement = document.createElement('div');
    const scrollIntoView = jasmine.createSpy('scrollIntoView');
    targetElement.scrollIntoView = scrollIntoView;
    oldElement.classList.add('dsr-request-highlight');

    const makeRow = (data: any, element: HTMLElement) => {
      const row = jasmine.createSpyObj('Row', ['getData', 'getElement', 'select', 'scrollTo']);
      row.getData.and.returnValue(data);
      row.getElement.and.returnValue(element);
      row.scrollTo.and.returnValue(Promise.resolve());
      return row;
    };
    const oldRow = makeRow({ employee_id: 8, date: '2026-09-10' }, oldElement);
    const wrongDateRow = makeRow({ employee_id: 19, date: '2026-09-11' }, wrongDateElement);
    const targetRow = makeRow({ employee_id: 19, date: '2026-09-12' }, targetElement);
    component.requestedHighlightId = null;
    component.requestedEmployeeId = '19';
    component.requestedEmployeeName = 'Wrong fallback name';
    component.requestedDate = '2026-09-12';
    component.tableOps = Promise.resolve();
    component.tableBuiltPromise = Promise.resolve();
    component.enqueueTableOp = (action: () => any) => action();
    component.resolveEmployeeId = (data: any) => data.employee_id;
    component.table = jasmine.createSpyObj('Table', ['getRows', 'setPageToRow']);
    component.table.getRows.and.returnValue([oldRow, wrongDateRow, targetRow]);
    component.table.setPageToRow.and.returnValue(Promise.resolve());

    component.highlightRequestedRow();
    tick();

    expect(component.table.setPageToRow).toHaveBeenCalledWith(targetRow);
    expect(targetRow.select).toHaveBeenCalled();
    expect(targetRow.scrollTo).toHaveBeenCalledWith('center', false);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    expect(targetElement.classList.contains('dsr-request-highlight')).toBeTrue();
    expect(oldElement.classList.contains('dsr-request-highlight')).toBeFalse();
    expect(wrongDateRow.select).not.toHaveBeenCalled();
  }));

  it('normalizes notification datetimes and falls back to employee name when matching a row', fakeAsync(() => {
    const component = Object.create(NotSendDsrComponent.prototype) as any;
    const targetElement = document.createElement('div');
    const targetRow = jasmine.createSpyObj('Row', ['getData', 'getElement', 'select', 'scrollTo']);
    targetRow.getData.and.returnValue({ employee_name: 'Jane Doe', date: '2026-09-12' });
    targetRow.getElement.and.returnValue(targetElement);
    targetRow.scrollTo.and.returnValue(Promise.resolve());
    component.requestedHighlightId = null;
    component.requestedEmployeeId = null;
    component.requestedEmployeeName = 'Jane Doe';
    component.requestedDate = '2026-09-12T00:00:00.000Z';
    component.tableOps = Promise.resolve();
    component.tableBuiltPromise = Promise.resolve();
    component.enqueueTableOp = (action: () => any) => action();
    component.table = jasmine.createSpyObj('Table', ['getRows']);
    component.table.getRows.and.returnValue([targetRow]);

    component.highlightRequestedRow();
    tick();

    expect(targetRow.select).toHaveBeenCalled();
    expect(targetElement.classList.contains('dsr-request-highlight')).toBeTrue();
  }));

  it('locates a DSR request notification by request ID', fakeAsync(() => {
    const component = Object.create(NotSendDsrComponent.prototype) as any;
    const element = document.createElement('div');
    const row = jasmine.createSpyObj('Row', ['getData', 'getElement', 'select', 'scrollTo']);
    row.getData.and.returnValue({ request_id: 91, employee_id: 19, date: '2026-09-12' });
    row.getElement.and.returnValue(element);
    row.scrollTo.and.returnValue(Promise.resolve());
    component.requestedHighlightId = '91';
    component.requestedEmployeeId = null;
    component.requestedEmployeeName = null;
    component.requestedDate = null;
    component.tableOps = Promise.resolve();
    component.tableBuiltPromise = Promise.resolve();
    component.enqueueTableOp = (action: () => any) => action();
    component.table = jasmine.createSpyObj('Table', ['getRows']);
    component.table.getRows.and.returnValue([row]);

    component.highlightRequestedRow();
    tick();

    expect(row.select).toHaveBeenCalled();
    expect(element.classList.contains('dsr-request-highlight')).toBeTrue();
  }));

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

  it('returns to approved DSR entry with the created task selected when requested', () => {
    const component = Object.create(NotSendDsrComponent.prototype) as any;
    component.getNotsendTasksOverview = jasmine.createSpy('getNotsendTasksOverview');
    component.router = jasmine.createSpyObj('Router', ['navigate']);
    component.drawerService = jasmine.createSpyObj('DrawerService', ['open']);
    component.toasterService = jasmine.createSpyObj('ToasterService', ['warning']);

    component.handleAppliedTaskCreated({
      source: 'task', action: 'created',
      payload: {
        task_id: 77, task: 'New task', project_id: 5, date: '2026-09-17',
        not_send_dsr_request_id: 91,
        return_to_dsr_context: {
          entryMode: 'dsr-entries', employeeId: 42, employeeName: 'Employee',
          fixedDsrDate: '2026-09-17', notSendDsrRequestId: 91,
          dsrDraft: { formValue: { comments: 'unsaved DSR text' } }
        }
      }
    });

    expect(component.drawerService.open).toHaveBeenCalledWith('dsr', jasmine.objectContaining({
      id: 77, taskid: 77, task_id: 77, selectedEntryId: 77, generatedTaskId: 77,
      project_id: 5, fixedDsrDate: '2026-09-17', task: 'New task', dsrDraft: null
    }));
    expect(component.router.navigate).not.toHaveBeenCalled();
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
    component.data = {
      fixedDsrDate: '2026-09-17', generatedTaskId: 77, taskid: 77,
      selectedEntryId: 77, entryMode: 'dsr-entries', editMode: false
    };

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
      generatedTaskId: 3500,
      taskid: 3500,
      selectedEntryId: 3500,
      entryMode: 'dsr-entries',
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
      generatedTaskId: 3500,
      taskid: 3500,
      selectedEntryId: 3500,
      entryMode: 'dsr-entries',
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
    component.data = {
      fixedDsrDate: '2026-09-18', generatedTaskId: 3500, taskid: 3500,
      selectedEntryId: 3500, entryMode: 'dsr-entries', editMode: false, task: 'uiui'
    };
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

  it('keeps the approved date and task ID in the historical DSR payload', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = {
      fixedDsrDate: '2026-09-18', generatedTaskId: 3500, taskid: 3500,
      selectedEntryId: 3500, entryMode: 'dsr-entries', notSendDsrRequestId: 94,
      editMode: false, task: 'Generated task'
    };
    component.taskid = 3500;
    component.taskList = [{ id: 3500, task: 'Generated task' }];
    component.taskForm = new FormGroup({ subtaskid: new FormControl(3500) });
    component.storageService = { toLocalDate: () => '2026-09-18' };

    const payload = component.buildTaskDsrPayload({
      subtaskid: 3500,
      date: '2026-10-09',
      comments: 'Historical update'
    });

    expect(component.isDateLocked).toBeTrue();
    expect(payload.taskid).toBe(3500);
    expect(payload.date).toBe('2026-09-18');
    expect(payload.request_id).toBe(94);
  });

  it('does not treat a mismatched generated task as an approved historical context', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = {
      fixedDsrDate: '2026-09-18', generatedTaskId: 3500, taskid: 3501,
      selectedEntryId: 3501, entryMode: 'dsr-entries', notSendDsrRequestId: 94,
      editMode: false
    };
    component.taskForm = new FormGroup({ subtaskid: new FormControl(3501) });

    expect(component.isDateLocked).toBeFalse();
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
