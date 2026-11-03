import { FormControl, FormGroup } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { DsrFormComponent } from './dsr-form.component';

describe('DsrFormComponent edit dates', () => {
  it('keeps the request project selected when project loading fails', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = { entryMode: 'dsr-entries', project_id: 3, employeeId: 42, fixedDsrDate: '2026-09-17', notSendDsrRequestId: 91 };
    component.projectList = [];
    component.projectsLoading = false;
    component.projectsError = '';
    component.taskList = [];
    component.logEntries = [];
    component.taskForm = new FormGroup({
      subtaskid: new FormControl(null), completion_percentage: new FormControl(0),
      date: new FormControl(null), worked_hours: new FormControl('08:00:00'),
      comments: new FormControl(''), username: new FormControl('employee')
    });
    component.storageService = { getUsername: () => 'employee' };
    component.initialDate = new Date(2026, 8, 17);
    component.route = { snapshot: { queryParamMap: { get: () => null } } };
    component.getSubtasks = jasmine.createSpy('getSubtasks');
    component.loadDsrDetails = jasmine.createSpy('loadDsrDetails');
    component.approvedProjectRequestVersion = 0;
    component.authService = jasmine.createSpyObj('AuthService', ['getAllProjectsByEmployeeId', 'getProjectActiveTaskList']);
    component.authService.getAllProjectsByEmployeeId.and.returnValue(throwError(() => new Error('offline')));

    component.loadFormOpenData();

    expect(component.selectedProjectId).toBe(3);
    expect(component.canCreateTaskFromApprovedDsr).toBeTrue();
  });

  it('sums DSR hours returned inside a data wrapper', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = { entryMode: 'dsr-entries' };
    component.taskList = [];
    component.taskForm = new FormGroup({ subtaskid: new FormControl(77) });
    component.authService = jasmine.createSpyObj('AuthService', ['getdsrdetailsbytask']);
    component.authService.getdsrdetailsbytask.and.returnValue(of({ data: [
      { id: 1, worked_hours: '01:30:00' },
      { id: 2, worked_hours: '02:15:00' }
    ] }));

    component.loadDsrDetails(77);

    expect(component.totalTime).toBe('3h 45m');
  });

  it('opens task creation with the selected project and approved DSR context', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = {
      entryMode: 'dsr-entries', employeeId: 42, employeeName: 'Employee',
      fixedDsrDate: '2026-09-17', notSendDsrRequestId: 91
    };
    component.selectedProjectId = 3;
    component.taskList = [{ id: 77, task: 'Current task' }];
    component.taskForm = new FormGroup({
      subtaskid: new FormControl(77), worked_hours: new FormControl('02:30:00'),
      comments: new FormControl('Draft comment'), completion_percentage: new FormControl(35),
      date: new FormControl(new Date(2026, 8, 17)), username: new FormControl('employee')
    });
    component.editId = 19;
    component.selectedDsr = { id: 19, subtaskid: 0, task: 'Current task', comments: 'Draft comment', worked_hours: '02:30:00', date: '2026-09-17', completion_percentage: 35 };
    component.drawerService = jasmine.createSpyObj('DrawerService', ['open']);
    component.getEntryDate = () => new Date(2026, 8, 17);
    component.formatDateToYMD = (date: Date) => '2026-09-17';
    component.resolveHistoricalRequestId = () => 91;

    component.openNewTask();

    expect(component.drawerService.open).toHaveBeenCalledWith('task', jasmine.objectContaining({
      mode: 'create', project_id: 3, employee_id: 42, employee_name: 'Employee',
      start_date: '2026-09-17', end_date: '2026-09-17',
      locked_fields: ['start_date', 'end_date'], not_send_dsr_request_id: 91,
      returnToDsrContext: jasmine.objectContaining({
        entryMode: 'dsr-entries', employeeId: 42, fixedDsrDate: '2026-09-17', notSendDsrRequestId: 91,
        selectedEntryId: 77,
        dsrDraft: jasmine.objectContaining({
          formValue: jasmine.objectContaining({ worked_hours: '02:30:00', comments: 'Draft comment', completion_percentage: 35 }),
          editId: 19
        })
      })
    }), 'requirement');
  });

  it('restores DSR draft values and edit state when returning from task creation', () => {
    const selectedDsr = { id: 19, subtaskid: 0, task: 'Current task', comments: 'Old comment', worked_hours: '01:00:00', date: '2026-09-17', completion_percentage: 10 };
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = {
      entryMode: 'dsr-entries', project_id: 3, fixedDsrDate: '2026-09-17',
      selectedEntryId: 77,
      dsrDraft: {
        formValue: {
          subtaskid: 77, worked_hours: '02:30:00', comments: 'Draft comment',
          completion_percentage: 35, date: new Date(2026, 8, 17)
        },
        editId: 19,
        selectedDsr
      }
    };
    component.taskForm = new FormGroup({
      subtaskid: new FormControl(null), worked_hours: new FormControl('08:00:00'),
      comments: new FormControl(''), completion_percentage: new FormControl(0), date: new FormControl(null)
    });
    component.getEntryDate = () => new Date(2026, 8, 17);
    component.selectedProjectId = null;

    component.restoreDsrDraft();

    expect(component.taskForm.getRawValue()).toEqual(jasmine.objectContaining({
      subtaskid: 77, worked_hours: '02:30:00', comments: 'Draft comment', completion_percentage: 35
    }));
    expect(component.editId).toBe(19);
    expect(component.selectedDsr).toBe(selectedDsr);
    expect(component.selectedProjectId).toBe(3);
  });

  it('does not open task creation without a selected project', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = { entryMode: 'dsr-entries', notSendDsrRequestId: 91 };
    component.selectedProjectId = null;
    component.drawerService = jasmine.createSpyObj('DrawerService', ['open']);

    component.openNewTask();

    expect(component.drawerService.open).not.toHaveBeenCalled();
  });

  function createEditedComponent(date: unknown, isEmployee = true): any {
    const storageService = {
      getTaskItem: () => null,
      getEmpId: () => 42,
      getUsername: () => 'employee@example.com',
      roles: { isEmployee }
    };
    const route = {
      snapshot: { paramMap: { get: () => null } },
      parent: null
    };
    const component = new DsrFormComponent(
      storageService as any, {} as any, route as any, {} as any, {} as any
    ) as any;
    component.initialDate = new Date(2026, 8, 29);
    component.data = { entryMode: 'dsr-entries', editMode: true, selectedEntryId: 77 };
    component.taskid = 77;
    component.taskForm = new FormGroup({
      subtaskid: new FormControl(77),
      worked_hours: new FormControl('08:00:00'),
      comments: new FormControl(''),
      completion_percentage: new FormControl(0),
      date: new FormControl(component.initialDate),
      username: new FormControl('employee@example.com')
    });

    component.applyEditState({
      id: 5,
      subtaskid: 0,
      task: 'Employee task',
      comments: 'Previous update',
      worked_hours: '07:30:00',
      date,
      completion_percentage: 75
    });

    return component;
  }

  function expectLocalDate(value: Date, year: number, month: number, day: number): void {
    expect(value instanceof Date).toBeTrue();
    expect(value.getFullYear()).toBe(year);
    expect(value.getMonth()).toBe(month - 1);
    expect(value.getDate()).toBe(day);
    expect(value.getHours()).toBe(0);
  }

  it('shows the saved local day for supported employee API date formats', () => {
    const cases = [
      { value: '2026-09-17', year: 2026, month: 9, day: 17 },
      { value: '2026-09-18T23:30:00.000Z', year: 2026, month: 9, day: 18 },
      { value: '19-09-2026', year: 2026, month: 9, day: 19 },
      { value: '20/09/2026', year: 2026, month: 9, day: 20 },
      { value: new Date(2026, 8, 21, 14, 30), year: 2026, month: 9, day: 21 }
    ];

    for (const testCase of cases) {
      const component = createEditedComponent(testCase.value);
      const formDate = component.taskForm.get('date').value as Date;

      expectLocalDate(formDate, testCase.year, testCase.month, testCase.day);
      expect(component.fromdate).toBe(
        `${testCase.year}-${String(testCase.month).padStart(2, '0')}-${String(testCase.day).padStart(2, '0')}`
      );
      expect(component.todate).toBe(component.fromdate);
    }
  });

  it('falls back safely when an edit date is missing or invalid', () => {
    for (const value of [null, '', 'not-a-date', '31-02-2026']) {
      const component = createEditedComponent(value);
      const formDate = component.taskForm.get('date').value as Date;

      expectLocalDate(formDate, 2026, 9, 29);
      expect(component.fromdate).toBe('2026-09-29');
      expect(component.todate).toBe('2026-09-29');
    }
  });

  it('disables employee edit dates before today except the saved DSR date', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const savedDate = new Date(today);
    savedDate.setDate(savedDate.getDate() - 3);
    const anotherPastDate = new Date(today);
    anotherPastDate.setDate(anotherPastDate.getDate() - 1);
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 1);
    const component = createEditedComponent(savedDate);

    expect(component.dsrDateFilter(savedDate)).toBeTrue();
    expect(component.dsrDateFilter(anotherPastDate)).toBeFalse();
    expect(component.dsrDateFilter(today)).toBeTrue();
    expect(component.dsrDateFilter(futureDate)).toBeTrue();
  });

  it('disables past dates for employees creating a regular DSR', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - 1);
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 1);
    const component = createEditedComponent(today);
    component.data.editMode = false;
    component.selectedDsr = null;

    expect(component.dsrDateFilter(pastDate)).toBeFalse();
    expect(component.dsrDateFilter(today)).toBeTrue();
    expect(component.dsrDateFilter(futureDate)).toBeTrue();
  });

  it('keeps the approved missed DSR date as the only selectable date', () => {
    const component = createEditedComponent('2026-09-17');
    component.data = {
      entryMode: 'dsr-entries',
      editMode: false,
      taskid: 77,
      selectedEntryId: 77,
      generatedTaskId: 77,
      fixedDsrDate: '2026-09-17',
      notSendDsrRequestId: 91
    };

    expect(component.isDateLocked).toBeTrue();
    expect(component.dsrDateFilter(new Date(2026, 8, 17))).toBeTrue();
    expect(component.dsrDateFilter(new Date(2026, 8, 16))).toBeFalse();
  });

  it('locks the approved date while allowing task selection for the request flow', () => {
    const component = createEditedComponent('2026-09-17');
    component.data = {
      entryMode: 'dsr-entries',
      editMode: false,
      fixedDsrDate: '2026-09-17',
      employeeId: 42,
      notSendDsrRequestId: 91
    };

    expect(component.isDateLocked).toBeTrue();
    expect(component.isTaskSelectionLocked).toBeFalse();
    expect(component.dsrDateFilter(new Date(2026, 8, 17))).toBeTrue();
    expect(component.dsrDateFilter(new Date(2026, 8, 16))).toBeFalse();
  });

  it('loads project choices first and waits for selection before loading tasks', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = { entryMode: 'dsr-entries', employeeId: 42, notSendDsrRequestId: 91 };
    component.projectList = [];
    component.projectsLoading = false;
    component.projectsError = '';
    component.selectedProjectId = null;
    component.authService = jasmine.createSpyObj('AuthService', ['getAllProjectsByEmployeeId', 'getProjectActiveTaskList']);
    component.authService.getAllProjectsByEmployeeId.and.returnValue(of([
      { project_id: 3, project_name: 'Project Three' },
      { id: 4, project_title: 'Project Four' }
    ]));

    component.loadProjectsForApprovedRequest();

    expect(component.authService.getAllProjectsByEmployeeId).toHaveBeenCalledOnceWith(42);
    expect(component.projectList.map((project: any) => project.project_title)).toEqual(['Project Three', 'Project Four']);
    expect(component.selectedProjectId).toBeNull();
    expect(component.authService.getProjectActiveTaskList).not.toHaveBeenCalled();
  });

  it('loads open project tasks for the approved date with date-overlapping tasks first', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = {
      entryMode: 'dsr-entries',
      fixedDsrDate: '2026-09-17',
      employeeId: 42,
      notSendDsrRequestId: 91
    };
    component.selectedProjectId = null;
    component.fromdate = '2026-09-17';
    component.todate = '2026-09-17';
    component.taskForm = new FormGroup({ subtaskid: new FormControl(null), completion_percentage: new FormControl(0) });
    component.taskList = [];
    component.storageService = { getEmpId: () => 42 };
    component.authService = jasmine.createSpyObj('AuthService', [
      'getProjectActiveTaskList', 'getTasksByProjectIdNdEmployeeId', 'getTaskOverviewByEmp'
    ]);
    component.authService.getProjectActiveTaskList.and.returnValue(of([
      { id: 8, task: 'Other open task', status: 'In Progress', project_id: 3, start_date: '2026-09-19', end_date: '2026-09-20', completion_percentage: 50 },
      { id: 7, task: 'Date-related task', status: 'In Progress', projectid: 3, start_date: '2026-09-16', end_date: '2026-09-18', completion_percentage: 75 },
      { id: 9, task: 'Closed task', status: 'Closed', projectid: 3, start_date: '2026-09-17', end_date: '2026-09-17', completion_percentage: 100 }
    ]));
    component.toasterService = jasmine.createSpyObj('ToasterService', ['error']);
    component.loadDsrDetails = jasmine.createSpy('loadDsrDetails');

    component.onProjectSelectionChange(3);

    expect(component.authService.getProjectActiveTaskList).toHaveBeenCalledOnceWith(
      3, 42, '2026-09-17'
    );
    expect(component.authService.getTasksByProjectIdNdEmployeeId).not.toHaveBeenCalled();
    expect(component.authService.getTaskOverviewByEmp).not.toHaveBeenCalled();
    expect(component.taskList.map((task: any) => task.task)).toEqual(['Date-related task', 'Other open task']);
    expect(component.taskList[0].projectid).toBe(3);
    expect(component.taskList[1].project_id).toBe(3);
    expect(component.taskForm.get('subtaskid').value).toBe(7);
  });

  it('shows a project loading error and keeps the selector empty when projects fail', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = { entryMode: 'dsr-entries', employeeId: 42, notSendDsrRequestId: 91 };
    component.projectList = [{ id: 3, project_title: 'Old project' }];
    component.authService = jasmine.createSpyObj('AuthService', ['getAllProjectsByEmployeeId']);
    component.authService.getAllProjectsByEmployeeId.and.returnValue(throwError(() => ({ error: { message: 'Project API unavailable' } })));

    component.loadProjectsForApprovedRequest();

    expect(component.projectList).toEqual([]);
    expect(component.projectsLoading).toBeFalse();
    expect(component.projectsError).toBe('Project API unavailable');
  });

  it('clears the task list and reports tasklist API errors', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = {
      entryMode: 'dsr-entries', fixedDsrDate: '2026-09-17', employeeId: 42,
      notSendDsrRequestId: 91
    };
    component.selectedProjectId = 3;
    component.fromdate = '2026-09-17';
    component.todate = '2026-09-17';
    component.taskList = [{ id: 1, task: 'Old task' }];
    component.taskForm = new FormGroup({ subtaskid: new FormControl(null), completion_percentage: new FormControl(0) });
    component.authService = jasmine.createSpyObj('AuthService', ['getProjectActiveTaskList']);
    component.authService.getProjectActiveTaskList.and.returnValue(throwError(() => ({ error: { message: 'API unavailable' } })));
    component.toasterService = jasmine.createSpyObj('ToasterService', ['error']);

    component.getTasksByProjectIdNdEmployeeId();

    expect(component.taskList).toEqual([]);
    expect(component.taskListLoading).toBeFalse();
    expect(component.toasterService.error).toHaveBeenCalledWith('API unavailable');
  });

  it('keeps regular DSR task selection on the existing task list API', () => {
    const component = Object.create(DsrFormComponent.prototype) as any;
    component.data = { entryMode: 'dsr-entries', employeeId: 42 };
    component.projectid = 3;
    component.empid = 42;
    component.type = 'requirement';
    component.fromdate = '2026-09-17';
    component.todate = '2026-09-17';
    component.taskList = [];
    component.taskForm = new FormGroup({ subtaskid: new FormControl(null), completion_percentage: new FormControl(0) });
    component.authService = jasmine.createSpyObj('AuthService', ['getProjectActiveTaskList', 'getTasksByProjectIdNdEmployeeId']);
    component.authService.getTasksByProjectIdNdEmployeeId.and.returnValue(of([]));
    component.ensureSelectedTaskInList = jasmine.createSpy('ensureSelectedTaskInList');
    component.updateCompletionFromSelection = jasmine.createSpy('updateCompletionFromSelection');
    component.loadDsrDetails = jasmine.createSpy('loadDsrDetails');

    component.getTasksByProjectIdNdEmployeeId();

    expect(component.authService.getTasksByProjectIdNdEmployeeId).toHaveBeenCalledOnceWith(
      3, 42, 0, 'requirement', '2026-09-17', '2026-09-17'
    );
    expect(component.authService.getProjectActiveTaskList).not.toHaveBeenCalled();
  });

  it('does not restrict previous dates for admin or manager edit flows', () => {
    const pastDate = new Date();
    pastDate.setHours(0, 0, 0, 0);
    pastDate.setDate(pastDate.getDate() - 1);
    const component = createEditedComponent(pastDate, false);

    expect(component.dsrDateFilter(pastDate)).toBeTrue();
  });
});
