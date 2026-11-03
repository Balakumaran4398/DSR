import { ChangeDetectorRef } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { Observable, of, Subject } from 'rxjs';
import { ExcelService } from 'src/app/_core/services/excel.service';
import { OverallPerformanceReportComponent } from './overall-performance-report.component';

describe('OverallPerformanceReportComponent loading', () => {
  let component: OverallPerformanceReportComponent;
  let authService: jasmine.SpyObj<any>;

  const createDepartment = (id: number) => ({
    filter_id: `${id}`,
    department_name: `Department ${id}`,
    api_id: id,
    raw: { id, department_name: `Department ${id}` }
  });

  const createReleaseDepartment = (id: number, name: string) => ({
    ...createDepartment(id),
    department_name: name,
    raw: { id, department_name: name }
  });

  const primeReport = (departments: any[], selectAll = false): void => {
    component.departments = departments;
    component.filteredDepartments = departments;
    component.selectedDepartmentIds = selectAll
      ? [component.allDepartmentsValue, ...departments.map(item => item.filter_id)]
      : departments.map(item => item.filter_id);
    component.startDate = '2026-09-01';
    component.endDate = '2026-09-07';
    (component as any).metadataLoaded = true;
    (component as any).loadReportData({ forceRefresh: true, clearExistingData: true });
  };

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', [
      'getAllDepartments',
      'getUsersAll',
      'getEmployeeList',
      'getDashboardDetailsByEmployeeIdDeptwise',
      'getReleaseOverviewListByEmp',
      'getActivityLogs'
    ]);
    authService.getReleaseOverviewListByEmp.and.returnValue(of([]));
    authService.getActivityLogs.and.returnValue(of([]));
    authService.getEmployeeList.and.returnValue(of([]));

    component = new OverallPerformanceReportComponent(
      authService,
      {
        getEmpId: () => 17,
        getEmpName: () => 'Test User',
        getUsername: () => 'test.user'
      } as any,
      jasmine.createSpyObj('ToasterService', ['success', 'error']),
      {} as any,
      jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['markForCheck'])
    );
  });

  afterEach(() => component.ngOnDestroy());

  it('shortens the Software Development Team department label across report displays and exports', () => {
    const section = {
      departmentName: '',
      title: 'SOFTWARE-DEVELOPMENT TEAM DEPARTMENT - Task Report',
      reportKind: 'task',
      reportTitle: 'Task Report',
      summary: [],
      columns: [],
      filteredRows: []
    } as any;

    expect(component.getDisplayDepartmentName('Software Development Team Department'))
      .toBe('Software Development Team');
    expect(component.getDepartmentEyebrow('SOFTWARE-DEVELOPMENT TEAM DEPARTMENT'))
      .toBe('Software Development Team');
    expect(component.getDepartmentName(section)).toBe('Software Development Team');
    expect((component as any).buildExcelSections([section])[0].departmentName)
      .toBe('Software Development Team');
    expect(component.getDepartmentEyebrow('Sales')).toBe('Sales Department');
  });

  it('uses the shared ten-row viewport threshold for report page sizes', () => {
    const section = (component as any).createSection(
      'department-1-task',
      createDepartment(1),
      'task',
      'Task Report',
      [37, 99, 235],
      ['Task'],
      [],
      () => [],
      'No tasks found.'
    );
    component.sections = [section];

    expect(section.pageSize).toBe(10);
    expect(component.tableVisibleRowCount).toBe(10);

    component.onPageSizeChange(section, { target: { value: '25' } } as unknown as Event);

    expect(component.sections[0].pageSize).toBe(25);
    expect(component.sections[0].pageSize).toBeGreaterThan(component.tableVisibleRowCount);
  });

  it('formats worked hours in task, issue, and ticket report rows', () => {
    const department = createDepartment(1);
    const record = { id: 1, worked_hours: '08:00:00 00:00:00' };
    const sections = [
      (component as any).buildTaskSection([record], 'task', department, 'Task Report'),
      (component as any).buildIssueSection([record], 'issue', department, 'Issue Report'),
      (component as any).buildTicketSection([record], 'ticket', department, 'Tickets Report')
    ];

    sections.forEach(section => {
      const hoursIndex = section.columns.indexOf('Worked Hours');
      expect(section.rows[0].cells[hoursIndex]).toBe('08:00:00');
      expect((component as any).buildExcelSections([section])[0].rows[0][hoursIndex]).toBe('08:00:00');
    });
  });
  it('shows source and destination assignment departments in ticket tables and Excel exports', () => {
    (component as any).departmentList = [
      { id: 10, department_name: 'Sales' },
      { id: 20, department_name: 'Engineering' }
    ];

    const section = (component as any).buildTicketSection([
      {
        id: 1,
        assigned_from_name: 'Asha',
        assigned_from_department_id: 10,
        assigned_to_name: 'Bala',
        assigned_to_department: { department_id: 20 }
      },
      { id: 2, assigned_from_name: 'Chitra', assigned_to_name: 'Deepak' }
    ], 'department-1-ticket', createDepartment(1), 'Tickets Report');
    const excelSection = (component as any).buildExcelSections([section])[0];
    const fromDepartmentIndex = section.columns.indexOf('Assigned From Department');
    const toDepartmentIndex = section.columns.indexOf('Assigned To Department');

    expect(fromDepartmentIndex).toBe(section.columns.indexOf('Assigned From') + 1);
    expect(toDepartmentIndex).toBe(section.columns.indexOf('Assigned To') + 1);
    expect(section.rows[0].cells[fromDepartmentIndex]).toBe('Sales');
    expect(section.rows[0].cells[toDepartmentIndex]).toBe('Engineering');
    expect(section.rows[1].cells[fromDepartmentIndex]).toBe('-');
    expect(section.rows[1].cells[toDepartmentIndex]).toBe('-');
    expect(excelSection.headers).toEqual(section.columns);
    expect(excelSection.rows[0][fromDepartmentIndex]).toBe('Sales');
    expect(excelSection.rows[0][toDepartmentIndex]).toBe('Engineering');
  });


  it('uses the first Upcoming transition for before, exact, and overdue colors in table, Excel, and PDF', () => {
    const department = createDepartment(1);
    const excelService = new ExcelService();
    const section = (component as any).buildReleaseSection([
      { id: 1, status: 'Pass', released_date: '2026-09-20', release_transition_date: '2026-09-20', status_changed_date: '2026-09-22' },
      { id: 2, status: 'Pass', releaseDate: '2026-09-19', releaseTransitionDate: '2026-09-18', status_changed_date: '2026-09-20' },
      { id: 3, status: 'Pass', released_date: '2026-09-18', release_transition_date: '2026-09-16', status_changed_date: '2026-09-19' },
      { id: 4, status: 'Pass', released_date: '2026-09-22', release_transition_date: '2026-09-24', status_changed_date: '2026-09-26' },
      { id: 5, status: 'Pass', released_date: '2026-02-30', status_changed_date: '2026-09-20' }
    ], 'release', department, 'Release Report');
    const overdueIndex = section.columns.indexOf('OVERDUE');
    const statusIndex = section.columns.indexOf('STATUS');
    const expected = [
      ['2026-09-20 (0)', 'status-chip--info', 10, [30, 64, 175]],
      ['2026-09-18 (1)', 'status-chip--success', 11, [21, 128, 61]],
      ['2026-09-16 (2)', 'status-chip--success', 11, [21, 128, 61]],
      ['2026-09-24 (2)', 'status-chip--danger', 13, [185, 28, 28]],
      ['-', '', null, null]
    ];

    expected.forEach(([text, chipClass, excelStyle, pdfColor], index) => {
      expect(section.rows[index].cells[overdueIndex]).toBe(text);
      expect(section.rows[index].cells[statusIndex]).toBe('Released');
      expect(section.rows[index].cellViews[overdueIndex].chipClass).toBe(chipClass);
      expect((component as any).buildExcelSections([section])[0].rows[index][overdueIndex]).toBe(text);
      if (excelStyle !== null) {
        expect((excelService as any).getOverallPerformanceCellStyleId('OVERDUE', text)).toBe(excelStyle);
        expect((component as any).getPdfSemanticCellStyle('OVERDUE', text).textColor).toEqual(pdfColor);
      }
    });
  });

  it('uses embedded release logs without requesting activity logs', () => {
    let enrichedRows: any[] = [];

    (component as any).enrichReleaseTransitionDates([{
      id: 7,
      status: 'Pass',
      released_date: '2026-09-20',
      status_logs: [
        { status: 'Pass', logdate: '2026-09-20' },
        { status: 'Upcoming-Release', logdate: '2026-09-15' },
        { status: 'In-Progress', logdate: '2026-09-18' }
      ]
    }]).subscribe((rows: any[]) => enrichedRows = rows);

    expect(authService.getActivityLogs).not.toHaveBeenCalled();
    expect(enrichedRows[0].release_transition_date).toBe('2026-09-18');
  });

  it('requests the complete release timeline and filters release sections by the selected range', () => {
    component.startDate = '2026-09-07';
    component.endDate = '2026-09-13';
    const payload = (component as any).getReleaseOverviewPayload(17, 1);

    expect(payload.fromdate).toBe('1900-01-01');
    expect(payload.todate).toBe('9999-12-31');

    (component as any).getApplicableReportKinds = () => ['release'];
    (component as any).filterRowsForDepartmentScope = (rows: any[]) => rows;
    const report = {
      department: createReleaseDepartment(1, 'Software Team'),
      dashboardData: {},
      releaseOverviewLoaded: true,
      releaseOverviewRows: [
        { id: 1, status: 'Pass', closed_date: '2026-09-07' },
        { id: 2, status: 'Failed', closedDate: '2026-09-13' },
        { id: 3, status: 'Pass', planned_date: '2026-09-08', released_date: '2026-09-10', closed_date: '2026-09-14' },
        { id: 4, status: 'In-Progress', planned_date: '2026-09-01', released_date: '2026-09-18' }
      ]
    };

    const releaseSection = (component as any).buildDepartmentSections(report)
      .find((section: any) => section.reportKind === 'release');

    expect(releaseSection.rows.length).toBe(3);
  });

  it('shows only remaining or overdue days for upcoming releases', () => {
    const today = new Date();
    const dateOffset = (days: number): string => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const section = (component as any).buildReleaseSection([
      { id: 1, status: 'Upcoming Release', planned_date: dateOffset(3), released_date: null },
      { id: 2, status: 'Upcoming Release', planned_date: dateOffset(-2), released_date: null }
    ], 'release', createDepartment(1), 'Release Report');
    const overdueIndex = section.columns.indexOf('OVERDUE');
    const statusIndex = section.columns.indexOf('STATUS');

    expect(section.rows[0].cells[overdueIndex]).toBe(`${dateOffset(3)} (3)`);
    expect(section.rows[0].cells[statusIndex]).toBe('Upcoming Release');
    expect(section.rows[0].cellViews[overdueIndex].chipClass).toBe('status-chip--warning');
    expect(section.rows[1].cells[overdueIndex]).toBe(`${dateOffset(-2)} (2)`);
    expect(section.rows[1].cellViews[overdueIndex].chipClass).toBe('status-chip--danger');
    const excelService = new ExcelService();
    expect((excelService as any).getOverallPerformanceCellStyleId('OVERDUE', section.rows[0].cells[overdueIndex])).toBe(12);
    expect((excelService as any).getOverallPerformanceCellStyleId('OVERDUE', section.rows[1].cells[overdueIndex])).toBe(13);
    expect((component as any).getPdfSemanticCellStyle('OVERDUE', section.rows[0].cells[overdueIndex]).textColor).toEqual([146, 64, 14]);
    expect((component as any).getPdfSemanticCellStyle('OVERDUE', section.rows[1].cells[overdueIndex]).textColor).toEqual([185, 28, 28]);
  });

  it('uses the requested 15-column release schema for table and export data', () => {
    const section = (component as any).buildReleaseSection(
      [{ id: 1, title: 'Release A', release_performance: 'Good', manager_name: 'Manager A' }],
      'department-1-release',
      createDepartment(1),
      'Release Report'
    );
    const exportedSection = (component as any).buildExcelSections([section])[0];

    expect(section.columns).toEqual([
      'PROJECT', 'TITLE', 'VERSION', 'MANAGER / TL', 'WORKED BY / RELEASED BY',
      'PLANNED DATE', 'RELEASED DATE', 'OVERDUE', 'TESTED BY', 'QC START DATE',
      'QC RELEASE DATE', 'STATUS', 'RELEASE TYPE', 'REMARKS', 'CLIENT'
    ]);
    expect(section.rows[0].cells).not.toContain('Good');
    expect(section.rows[0].cells).toContain('Manager A');
    expect(exportedSection.headers).toEqual(section.columns);
    expect(exportedSection.rows[0].length).toBe(exportedSection.headers.length);
  });

  it('omits Category from the tickets table and export data', () => {
    const section = (component as any).buildTicketSection(
      [{ id: 1, ticket_name: 'Ticket A', ticket_category_name: 'Service' }],
      'department-1-ticket',
      createDepartment(1),
      'Tickets Report'
    );
    const exportedSection = (component as any).buildExcelSections([section])[0];

    expect(section.columns).not.toContain('Category');
    expect(section.rows[0].cells).not.toContain('Service');
    expect(exportedSection.headers).not.toContain('Category');
    expect(exportedSection.rows[0].length).toBe(exportedSection.headers.length);
  });

  it('uses one grouped dashboard request for multiple departments', () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const requestSubscribers: any[] = [];

    authService.getDashboardDetailsByEmployeeIdDeptwise.and.callFake(() => new Observable(subscriber => {
      activeRequests++;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      requestSubscribers.push(subscriber);
      return () => activeRequests--;
    }));

    primeReport(Array.from({ length: 7 }, (_value, index) => createDepartment(index + 1)));

    expect(maximumActiveRequests).toBe(1);
    expect(requestSubscribers.length).toBe(1);
    expect(authService.getDashboardDetailsByEmployeeIdDeptwise)
      .toHaveBeenCalledOnceWith(17, 0, '2026-09-01', '2026-09-07', '1,2,3,4,5,6,7');
  });

  it('requests dashboard data from the department-wise API for each department', () => {
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(of({}));

    primeReport([createDepartment(42)]);

    expect(authService.getDashboardDetailsByEmployeeIdDeptwise)
      .toHaveBeenCalledOnceWith(17, 0, '2026-09-01', '2026-09-07', 42);
  });

  it('passes the SQA department ID to department-scoped APIs', () => {
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(of({}));

    primeReport([createReleaseDepartment(3, 'SQA')]);

    expect(authService.getDashboardDetailsByEmployeeIdDeptwise)
      .toHaveBeenCalledOnceWith(17, 0, '2026-09-01', '2026-09-07', 3);
    expect(authService.getReleaseOverviewListByEmp.calls.mostRecent().args[0].department_id).toBe(3);
  });

  it('defaults managers to their department while keeping all departments selectable', () => {
    const storageService = (component as any).storageService;
    storageService.roles = { isAdmin: false, isManager: true };
    storageService.getDept = () => 2;
    storageService.getUser = () => ({ department_id: 2, department_name: 'Software' });
    (component as any).departmentList = [
      { id: 1, department_name: 'RidApps' },
      { id: 2, department_name: 'Software' },
      { id: 3, department_name: 'SQA' }
    ];
    component.selectedDepartmentIds = [];

    (component as any).refreshDepartmentOptions(false);

    expect(component.selectedDepartmentIds).toEqual(['2']);
    expect(component.departments.length).toBe(3);
    expect(component.canSelectAllDepartments).toBeTrue();
    expect(component.isDepartmentSelectionLocked).toBeFalse();
  });

  it('requests release data once with department ID zero for the default all-departments scope', () => {
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(of({}));
    const departments = [
      createReleaseDepartment(1, 'RidApps'),
      createReleaseDepartment(2, 'Software')
    ];

    primeReport(departments, true);

    expect(authService.getReleaseOverviewListByEmp).toHaveBeenCalledTimes(1);
    expect(authService.getReleaseOverviewListByEmp.calls.mostRecent().args[0].department_id).toBe(0);
  });

  it('requests release data once with the selected department ID', () => {
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(of({}));

    primeReport([createReleaseDepartment(42, 'Software')]);

    expect(authService.getReleaseOverviewListByEmp).toHaveBeenCalledTimes(1);
    expect(authService.getReleaseOverviewListByEmp.calls.mostRecent().args[0].department_id).toBe(42);
  });

  it('requests release data once with all selected department IDs', () => {
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(of({}));
    const departments = [
      createReleaseDepartment(1, 'RidApps'),
      createReleaseDepartment(2, 'Software'),
      createReleaseDepartment(3, 'SQA')
    ];

    primeReport(departments);

    expect(authService.getReleaseOverviewListByEmp).toHaveBeenCalledTimes(1);
    expect(authService.getReleaseOverviewListByEmp.calls.mostRecent().args[0].department_id).toBe('1,2,3');
  });

  it('loads a changed department selection immediately', () => {
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(of({}));
    const departments = [
      createReleaseDepartment(1, 'RidApps'),
      createReleaseDepartment(2, 'Software')
    ];
    primeReport(departments);
    authService.getReleaseOverviewListByEmp.calls.reset();
    authService.getDashboardDetailsByEmployeeIdDeptwise.calls.reset();

    component.onDepartmentFilterChange(['2']);

    expect(authService.getReleaseOverviewListByEmp.calls.mostRecent().args[0].department_id).toBe(2);
    expect(authService.getDashboardDetailsByEmployeeIdDeptwise)
      .toHaveBeenCalledOnceWith(17, 0, '2026-09-01', '2026-09-07', 2);
  });

  it('keeps only the newly selected individual department', () => {
    const departments = [createDepartment(1), createDepartment(2), createDepartment(3)];
    component.departments = departments;
    component.filteredDepartments = departments;
    component.selectedDepartmentIds = ['1'];

    component.onDepartmentFilterChange(['1', '2']);

    expect(component.selectedDepartmentIds).toEqual(['2']);
    expect(component.isDepartmentSelected('1')).toBeFalse();
    expect(component.isDepartmentSelected('2')).toBeTrue();
  });

  it('selects every department when All Department is selected', () => {
    const departments = [createDepartment(1), createDepartment(2), createDepartment(3)];
    component.departments = departments;
    component.filteredDepartments = departments;
    component.selectedDepartmentIds = ['1'];

    component.onDepartmentFilterChange(['1', component.allDepartmentsValue]);

    expect(component.selectedDepartmentIds).toEqual([
      component.allDepartmentsValue,
      '1',
      '2',
      '3'
    ]);
    expect(departments.every(department => component.isDepartmentSelected(department.filter_id))).toBeTrue();
  });

  it('keeps only an individual department selected after All Department', () => {
    const departments = [createDepartment(1), createDepartment(2), createDepartment(3)];
    component.departments = departments;
    component.filteredDepartments = departments;
    component.selectedDepartmentIds = [component.allDepartmentsValue, '1', '2', '3'];

    // Angular Material removes the clicked department from its multiple-selection value
    // before emitting the event, so the missing ID identifies the user's new single choice.
    component.onDepartmentFilterChange([component.allDepartmentsValue, '1', '3']);

    expect(component.selectedDepartmentIds).toEqual(['2']);
    expect(component.isDepartmentSelected(component.allDepartmentsValue)).toBeFalse();
    expect(component.isDepartmentSelected('1')).toBeFalse();
    expect(component.isDepartmentSelected('2')).toBeTrue();
    expect(component.isDepartmentSelected('3')).toBeFalse();
  });

  it('partitions a combined release response without duplicating unscoped rows', fakeAsync(() => {
    const response = new Subject<any>();
    authService.getReleaseOverviewListByEmp.and.returnValue(response);
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(of({}));
    const departments = [
      createReleaseDepartment(1, 'RidApps'),
      createReleaseDepartment(2, 'Software')
    ];

    primeReport(departments);
    response.next([
      { release_id: 11, title: 'RidApps release', department_id: 1 },
      { release_id: 22, title: 'Software release', department_id: 2 },
      { release_id: 33, title: 'Unscoped release' }
    ]);
    response.complete();
    tick();

    const ridAppsRelease = component.sections.find(section =>
      section.departmentId === '1' && section.reportKind === 'release'
    );
    const softwareRelease = component.sections.find(section =>
      section.departmentId === '2' && section.reportKind === 'release'
    );
    expect(ridAppsRelease!.rows.map(row => row.cells)).toEqual([
      jasmine.arrayContaining(['RidApps release'])
    ]);
    expect(softwareRelease!.rows.map(row => row.cells)).toEqual([
      jasmine.arrayContaining(['Software release'])
    ]);
    expect(component.sections
      .filter(section => section.reportKind === 'release')
      .flatMap(section => section.rows)
      .some(row => row.cells.includes('Unscoped release'))).toBeFalse();
  }));

  it('requests all departments once with department ID zero and shares the response', fakeAsync(() => {
    const response = new Subject<any>();
    const departments = [createDepartment(1), createDepartment(2)];
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(response);

    primeReport(departments, true);

    expect(authService.getDashboardDetailsByEmployeeIdDeptwise)
      .toHaveBeenCalledOnceWith(17, 0, '2026-09-01', '2026-09-07', 0);

    const dashboard = {
      ticket_list: [
        { id: 1, ticket_name: 'Department 1 ticket', department_id: 1 },
        { id: 2, ticket_name: 'Department 2 ticket', department_id: 2 }
      ],
      bug_list: [
        { bug_id: 11, bug_name: 'Department 1 bug', department_id: 1 },
        { bug_id: 22, bug_name: 'Department 2 bug', department_id: 2 }
      ]
    };
    response.next(dashboard);
    response.complete();
    tick();

    const reports = (component as any).departmentReportData;
    expect(reports.length).toBe(2);
    expect(reports.every((report: any) => report.dashboardData === dashboard)).toBeTrue();
    const departmentOneIssues = component.sections.find(section =>
      section.departmentId === '1' && section.reportKind === 'issue'
    );
    const departmentTwoIssues = component.sections.find(section =>
      section.departmentId === '2' && section.reportKind === 'issue'
    );
    expect(departmentOneIssues!.rows.length).toBe(1);
    expect(departmentOneIssues!.rows[0].cells).toContain('Department 1 bug');
    expect(departmentTwoIssues!.rows.length).toBe(1);
    expect(departmentTwoIssues!.rows[0].cells).toContain('Department 2 bug');
  }));

  it('provides an Issue Report for every department type', () => {
    const departmentNames = ['Ridapps', 'Software', 'SQA', 'Fiber', 'Hardware'];

    departmentNames.forEach((departmentName, index) => {
      const department = {
        ...createDepartment(index + 1),
        department_name: departmentName
      };
      expect((component as any).getApplicableReportKinds(department)).toContain('issue');
    });
  });

  it('shows bug_list records in the Issue Report even when a bug references a task', fakeAsync(() => {
    const response = new Subject<any>();
    const softwareDepartment = {
      ...createDepartment(42),
      department_name: 'Software',
      raw: { id: 42, department_name: 'Software' }
    };
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(response);

    primeReport([softwareDepartment], true);
    response.next({
      bug_list: [{
        bug_id: 7,
        bug_code: 'BUG-7',
        bug_name: 'Login failure',
        task_id: 99,
        department_id: 42,
        project_name: 'Customer Portal',
        assigned_to_name: 'Test Engineer',
        testing_type: 'Functional',
        priority_name: 'High',
        status: 'Open',
        remarks: 'Reproduced'
      }, {
        bug_id: 7,
        bug_code: 'BUG-7',
        bug_name: 'Login failure',
        task_id: 99,
        department_id: 42,
        project_name: 'Customer Portal',
        assigned_to_name: 'Test Engineer',
        testing_type: 'Functional',
        priority_name: 'High',
        status: 'Open',
        remarks: 'Reproduced'
      }]
    });
    response.complete();
    tick();

    const issueSection = component.sections.find(section => section.reportKind === 'issue');
    expect(issueSection).toBeDefined();
    expect(issueSection!.rows.length).toBe(1);
    expect(issueSection!.rows[0].cells).toEqual(jasmine.arrayContaining([
      'Customer Portal',
      'BUG-7',
      'Login failure',
      'Test Engineer',
      'Functional',
      'High',
      'Open'
    ]));
    const taskSection = component.sections.find(section => section.reportKind === 'task');
    expect(taskSection!.rows.length).toBe(0);
  }));

  it('maps task-shaped bug_list records returned by dashboarddetails_deptwise', fakeAsync(() => {
    const response = new Subject<any>();
    const ridAppsDepartment = {
      ...createDepartment(1),
      department_name: 'RidApps',
      raw: { id: 1, department_name: 'RidApps' }
    };
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(response);

    primeReport([ridAppsDepartment], true);
    response.next({
      bug_list: [{
        id: 3347,
        task_type: 'bug',
        task_category: 'Bug',
        taskcode: 'TSK003347',
        task: 'Incorrect Action Displayed for REFUNDED Status',
        description: 'The Settled action is displayed for a refunded transaction.',
        project_name: 'Healthcare CRM',
        task_assigned_to_name: 'Saravanan S',
        department_name: 'RidApps',
        department_id: 1,
        priority: 'Medium',
        status: 'Failed',
        remark: null,
        created_date: '2026-09-07T07:29:18.000+00:00'
      }]
    });
    response.complete();
    tick();

    const issueSection = component.sections.find(section => section.reportKind === 'issue');
    expect(issueSection!.rows.length).toBe(1);
    expect(issueSection!.rows[0].cells).toEqual(jasmine.arrayContaining([
      'Healthcare CRM',
      'TSK003347',
      'Incorrect Action Displayed for REFUNDED Status',
      'Saravanan S',
      'Bug',
      'Medium',
      'Failed'
    ]));
    const taskSection = component.sections.find(section => section.reportKind === 'task');
    expect(taskSection!.rows.length).toBe(0);
  }));

  it('shows a bug for both its owning and assigned-to departments', () => {
    const firstDepartment = createDepartment(1);
    const secondDepartment = createDepartment(2);
    const bugWithOwner = { bug_id: 1, department_id: 1, assigned_to_department_id: 2 };
    const bugWithoutOwner = { bug_id: 2, assigned_to_department_id: 2 };

    expect((component as any).filterIssueRowsForDepartment(
      [bugWithOwner, bugWithoutOwner],
      firstDepartment,
      false
    )).toEqual([bugWithOwner]);
    expect((component as any).filterIssueRowsForDepartment(
      [bugWithOwner, bugWithoutOwner],
      secondDepartment,
      false
    )).toEqual([bugWithOwner, bugWithoutOwner]);
  });

  it('maps dashboard bug_list assign_from and assign_to employees to both departments', () => {
    const firstDepartment = createDepartment(1);
    const secondDepartment = createDepartment(2);
    const transferredBug = { bug_id: 1, assign_from: 101, assign_to: 202 };
    (component as any).employeeList = [
      { id: 101, department_id: 1 },
      { id: 202, department_id: 2 }
    ];

    expect((component as any).filterIssueRowsForDepartment(
      [transferredBug],
      firstDepartment,
      false
    )).toEqual([transferredBug]);
    expect((component as any).filterIssueRowsForDepartment(
      [transferredBug],
      secondDepartment,
      false
    )).toEqual([transferredBug]);
  });

  it('maps release, task and ticket rows to both assign_from and assign_to departments', () => {
    const firstDepartment = createDepartment(1);
    const secondDepartment = createDepartment(2);
    const transferredRow = { id: 1, assign_from: 101, assign_to: 202 };
    (component as any).employeeList = [
      { id: 101, department_id: 1 },
      { id: 202, department_id: 2 }
    ];

    expect((component as any).filterRowsForDepartmentScope(
      [transferredRow],
      firstDepartment,
      false,
      true
    )).toEqual([transferredRow]);
    expect((component as any).filterRowsForDepartmentScope(
      [transferredRow],
      secondDepartment,
      false,
      true
    )).toEqual([transferredRow]);
    expect((component as any).filterCombinedReleaseRowsForDepartment(
      [transferredRow],
      firstDepartment,
      true
    )).toEqual([transferredRow]);
    expect((component as any).filterCombinedReleaseRowsForDepartment(
      [transferredRow],
      secondDepartment,
      true
    )).toEqual([transferredRow]);
  });

  it('merges employee directory department data used by assigned_from IDs', () => {
    const assignedFromDepartment = createDepartment(1);
    const transferredRow = { id: 1, assigned_from: 101, assigned_to_department_id: 2 };
    (component as any).employeeList = (component as any).mergeEmployeeDirectoryRows(
      [{ id: 101, employee_name: 'Issue Creator' }],
      [{ employee_id: 101, department_id: 1 }]
    );

    expect((component as any).filterRowsForDepartmentScope(
      [transferredRow],
      assignedFromDepartment,
      false,
      true
    )).toEqual([transferredRow]);
  });

  it('keeps unscoped bugs returned by an individual department request', () => {
    const department = createDepartment(3);
    const unscopedBug = { bug_id: 3, bug_name: 'Unscoped backend row' };

    expect((component as any).filterIssueRowsForDepartment(
      [unscopedBug],
      department,
      true
    )).toEqual([unscopedBug]);
    expect((component as any).filterIssueRowsForDepartment(
      [unscopedBug],
      department,
      false
    )).toEqual([]);
  });

  it('does not assign an entirely unscoped combined release response to every department', () => {
    const unscopedRelease = { release_id: 10, title: 'Unscoped release' };

    expect((component as any).filterCombinedReleaseRowsForDepartment(
      [unscopedRelease],
      createReleaseDepartment(1, 'RidApps'),
      false
    )).toEqual([]);
  });

  it('renders cached data and incrementally replaces it with a fresh response', fakeAsync(() => {
    const response = new Subject<any>();
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(response);
    primeReport([createDepartment(1)]);

    response.next({ ticket_list: [{ id: 1, ticket_name: 'Cached ticket', status: 'Open' }] });
    tick();
    expect(component.sections[0].rows.length).toBe(1);
    expect(component.sections[0].rows[0].cells).toContain('Cached ticket');

    response.next({
      ticket_list: [
        { id: 1, ticket_name: 'Fresh ticket 1', status: 'Open' },
        { id: 2, ticket_name: 'Fresh ticket 2', status: 'Closed' }
      ]
    });
    tick();
    response.complete();
    tick();

    expect(component.sections[0].rows.length).toBe(2);
    expect(component.sections[0].loading).toBeFalse();
  }));

  it('times out a stalled request and clears its loading state', fakeAsync(() => {
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(new Observable(() => undefined));
    primeReport([createDepartment(1)]);

    expect(component.sections[0].loading).toBeTrue();
    tick(30_001);

    expect(component.sections[0].loading).toBeFalse();
    expect(component.sections[0].errorMessage).toBe('Unable to load Tickets Report.');
  }));

  it('keeps cached rows usable when the fresh response times out', fakeAsync(() => {
    const response = new Subject<any>();
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(response);
    primeReport([createDepartment(1)]);

    response.next({ ticket_list: [{ id: 1, ticket_name: 'Cached ticket', status: 'Open' }] });
    tick(30_001);

    expect(component.sections[0].rows.length).toBe(1);
    expect(component.sections[0].loading).toBeFalse();
    expect(component.sections[0].errorMessage).toBe('');
    expect(component.sections[0].warningMessage).toContain('Showing available data');
    expect(component.sections[0].canExport).toBeTrue();
  }));

  it('cancels obsolete requests when a newer report load starts', () => {
    const firstResponse = new Subject<any>();
    const secondResponse = new Subject<any>();
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValues(firstResponse, secondResponse);
    const departments = [createDepartment(1)];

    primeReport(departments);
    expect(firstResponse.observers.length).toBe(1);

    component.startDate = '2026-09-08';
    component.endDate = '2026-09-14';
    (component as any).loadReportData({ forceRefresh: true, clearExistingData: true });

    expect(firstResponse.observers.length).toBe(0);
    expect(secondResponse.observers.length).toBe(1);
  });

  it('cancels active report work when the component is destroyed', () => {
    let requestCancelled = false;
    authService.getDashboardDetailsByEmployeeIdDeptwise.and.returnValue(new Observable(() => {
      return () => requestCancelled = true;
    }));

    primeReport([createDepartment(1)]);
    component.ngOnDestroy();

    expect(requestCancelled).toBeTrue();
  });
});
