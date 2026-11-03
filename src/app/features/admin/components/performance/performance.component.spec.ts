import { PerformanceComponent } from './performance.component';
import { AuthService } from 'src/app/_core/services/auth.service';
import { ExcelService } from 'src/app/_core/services/excel.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { of } from 'rxjs';

describe('PerformanceComponent not eligible employee details', () => {
  let component: PerformanceComponent;

  const notEligibleEmployee = {
    employee_id: 33,
    employee_name: 'BALAKUMARAN R',
    department_id: 1,
    department_name: 'RidApps',
    final_score: 35.38,
    eligible: false,
    eligibility_reasons: ['final_score_below_85', 'release_target_not_met'],
    scores: {
      release_score: 0,
      dsr_score: 88.46,
      release_status_score: 0,
      weights: {
        release: 40,
        dsr: 40,
        release_status: 20
      }
    },
    metrics: {
      total_work_volume: 0,
      total_releases: 0,
      passed_releases: 0,
      failed_releases: 0,
      on_time_releases: 0,
      required_working_days: 26,
      dsr_submitted_days: 23,
      dsr_on_time_days: 23,
      dsr_late_days: 0
    }
  };

  beforeEach(() => {
    component = new PerformanceComponent(
      {} as AuthService,
      {} as ExcelService,
      {} as StorageService,
      {} as ToasterService
    );
  });

  it('uses the shared ten-row viewport threshold for larger page sizes', () => {
    expect(component.weightagePageSize).toBe(10);
    expect(component.notEligiblePageSize).toBe(10);
    expect(component.tableVisibleRowCount).toBe(10);

    component.onWeightagePageSizeChange({ target: { value: '25' } } as unknown as Event);
    component.onNotEligiblePageSizeChange({ target: { value: '100' } } as unknown as Event);

    expect(component.weightagePageSize).toBeGreaterThan(component.tableVisibleRowCount);
    expect(component.notEligiblePageSize).toBeGreaterThan(component.tableVisibleRowCount);
  });

  it('defaults to the first and last day of the current month', () => {
    const today = new Date();

    (component as any).setDefaultDateRange();

    expect(component.fromDate).toEqual(new Date(today.getFullYear(), today.getMonth(), 1));
    expect(component.toDate).toEqual(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  });

  it('loads the current-month report for the manager assigned department on page open', () => {
    const today = new Date();
    const getBestEmployee = jasmine.createSpy('getBestEmployee').and.returnValue(of({}));
    const authService = {
      getAllDepartments: () => of({ data: [
        { department_id: 7, department_name: 'SQA' },
        { department_id: 8, department_name: 'Hardware' }
      ] }),
      getBestEmployee
    } as unknown as AuthService;
    const storageService = {
      getEmpId: () => 'EMP-10',
      getUser: () => ({ empid: 'EMP-10', department_id: 7, department_name: 'SQA' }),
      getDept: () => 'SQA',
      roles: { isAdmin: false, isManager: true, isEmployee: false }
    } as unknown as StorageService;
    component = new PerformanceComponent(
      authService,
      {} as ExcelService,
      storageService,
      { error: jasmine.createSpy('error') } as unknown as ToasterService
    );

    component.ngOnInit();

    expect(component.departments).toEqual([{ id: 7, department_name: 'SQA' }]);
    expect(component.selectedDepartmentId).toBe(7);
    expect(getBestEmployee).toHaveBeenCalledOnceWith({
      employee_id: 'EMP-10',
      department_id: 7,
      fromdate: (component as any).formatDateToYMD(new Date(today.getFullYear(), today.getMonth(), 1)),
      todate: (component as any).formatDateToYMD(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      top: 3
    });
  });

  it('automatically reloads the admin report when department or date range changes', () => {
    const getBestEmployee = jasmine.createSpy('getBestEmployee').and.returnValue(of({}));
    const authService = {
      getAllDepartments: () => of({ data: [
        { department_id: 7, department_name: 'SQA' },
        { department_id: 8, department_name: 'Hardware' }
      ] }),
      getBestEmployee
    } as unknown as AuthService;
    const storageService = {
      getEmpId: () => 'EMP-1',
      getUser: () => ({ empid: 'EMP-1', department_id: 8, department_name: 'Hardware' }),
      getDept: () => 'Hardware',
      roles: { isAdmin: true, isManager: false, isEmployee: false }
    } as unknown as StorageService;
    component = new PerformanceComponent(
      authService,
      {} as ExcelService,
      storageService,
      { error: jasmine.createSpy('error') } as unknown as ToasterService
    );

    component.ngOnInit();
    expect(component.selectedDepartmentId).toBe(8);
    expect(getBestEmployee).toHaveBeenCalledTimes(1);

    component.selectedPerformanceEmployee = {} as any;
    component.selectedDepartmentId = 7;
    component.onDepartmentChanged();

    expect(component.selectedPerformanceEmployee).toBeNull();
    expect(getBestEmployee).toHaveBeenCalledTimes(2);
    expect(getBestEmployee.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      department_id: 7
    }));

    component.fromDate = new Date(2026, 0, 1);
    component.toDate = new Date(2026, 0, 31);
    component.onDateRangeChanged();

    expect(getBestEmployee).toHaveBeenCalledTimes(3);
    expect(getBestEmployee.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      department_id: 7,
      fromdate: '2026-01-01',
      todate: '2026-01-31'
    }));

    component.onDateRangeChanged();
    expect(getBestEmployee).toHaveBeenCalledTimes(3);
  });

  it('does not reload for incomplete or invalid date ranges', () => {
    const getBestEmployee = jasmine.createSpy('getBestEmployee').and.returnValue(of({}));
    const storageService = {
      getEmpId: () => 'EMP-1',
      roles: { isAdmin: true, isManager: false, isEmployee: false }
    } as unknown as StorageService;
    component = new PerformanceComponent(
      { getBestEmployee } as unknown as AuthService,
      {} as ExcelService,
      storageService,
      { error: jasmine.createSpy('error') } as unknown as ToasterService
    );
    component.selectedDepartmentId = 7;

    component.fromDate = new Date(2026, 0, 1);
    component.toDate = null;
    component.onDateRangeChanged();

    component.fromDate = new Date(2026, 1, 1);
    component.toDate = new Date(2026, 0, 31);
    component.onDateRangeChanged();

    component.fromDate = new Date(Number.NaN);
    component.toDate = new Date(2026, 0, 31);
    component.onDateRangeChanged();

    expect(getBestEmployee).not.toHaveBeenCalled();
  });

  function mapEmployee(value: any = notEligibleEmployee, index = 0): any {
    return (component as any).mapWinnerRow(value, index, '2026-09-01', '2026-09-30', false, 'RidApps');
  }

  it('maps every supplied nested score, weight, metric, and reason while preserving zero', () => {
    const row = mapEmployee();

    expect(row.release_score).toBe(0);
    expect(row.dsr_score).toBe(88.46);
    expect(row.release_status_score).toBe(0);
    expect(row.score_weights).toEqual(jasmine.objectContaining({ release: 40, dsr: 40, release_status: 20 }));
    expect(row.metrics.total_work_volume).toBe(0);
    expect(row.metrics.total_releases).toBe(0);
    expect(row.metrics.passed_releases).toBe(0);
    expect(row.metrics.failed_releases).toBe(0);
    expect(row.metrics.on_time_releases).toBe(0);
    expect(row.metrics.dsr_days_required).toBe(26);
    expect(row.metrics.dsr_days_submitted).toBe(23);
    expect(row.metrics.dsr_on_time_days).toBe(23);
    expect(row.metrics.dsr_late_days).toBe(0);
    expect(component.formatScore(row.release_score)).toBe('0');
    expect(component.formatScore(row.task_score)).toBe('-');
    expect(component.getEligibilityReasonLabels(row)).toEqual([
      'Final score below 85',
      'Release target not met'
    ]);
  });

  it('maps department dialog metrics from the API and preserves zero values', () => {
    const software = mapEmployee({
      employee_id: 'SW-1',
      employee_name: 'Software',
      department_name: 'Software',
      metrics: {
        assigned_issues: 2, closed_issues: 0,
        assigned_tasks: 1, closed_tasks: 0,
        total_working_days: 3,
        dsr_on_time_days: 0, dsr_late_days: 0, dsr_missing_days: 3, dsr_submitted_days: 0,
        absent_days: 1, present_days: 2
      }
    });
    expect(software.metrics).toEqual(jasmine.objectContaining({
      assigned_issues: 2, closed_issues: 0, assigned_tasks: 1, closed_tasks: 0,
      total_working_days: 3, dsr_on_time_days: 0, dsr_late_days: 0, dsr_missing_days: 3,
      dsr_days_submitted: 0, absent_days: 1, present_days: 2
    }));
    expect(component.hasIssueDetails(software)).toBeTrue();
    expect(component.hasTaskDetails(software)).toBeTrue();
    expect(component.hasDsrDetails(software)).toBeTrue();

    const hardware = mapEmployee({
      employee_id: 'HW-1', employee_name: 'Hardware', department_name: 'Hardware',
      metrics: {
        closed_tickets_in_range: 0, model_count: 0, department_max_model_count: 100,
        self_tickets: 0, total_working_days: 3
      }
    });
    expect(hardware.metrics).toEqual(jasmine.objectContaining({
      closed_tickets_in_range: 0, model_count: 0, department_max_model_count: 100,
      self_tickets: 0, total_working_days: 3
    }));
    expect(component.hasTicketClientDetails(hardware)).toBeTrue();
    expect(component.hasDsrDetails(hardware)).toBeTrue();
    expect(component.shouldShowTicketClientMetric(hardware, 'closedTicketsInRange')).toBeTrue();
    expect(component.shouldShowTicketClientMetric(hardware, 'departmentMaxModelCount')).toBeTrue();
    expect(component.shouldShowTicketClientMetric(hardware, 'totalWorkingDays')).toBeTrue();

    const headend = mapEmployee({
      employee_id: 'HE-1', employee_name: 'Headend', department_name: 'Headend',
      metrics: {
        self_tickets: 0, closed_self_tickets: 0, handled_clients: 0,
        department_max_self_tickets: 0, department_max_handled_clients: 0, total_working_days: 3
      }
    });
    expect(headend.metrics).toEqual(jasmine.objectContaining({
      self_tickets: 0, closed_self_tickets: 0, handled_clients: 0,
      department_max_self_tickets: 0, department_max_handled_clients: 0, total_working_days: 3
    }));
    expect(component.hasTicketClientDetails(headend)).toBeTrue();
    expect(component.hasDsrDetails(headend)).toBeTrue();
    expect(component.shouldShowTicketClientMetric(headend, 'closedSelfTickets')).toBeTrue();
    expect(component.shouldShowTicketClientMetric(headend, 'departmentMaxSelfTickets')).toBeTrue();
    expect(component.shouldShowTicketClientMetric(headend, 'departmentMaxHandledClients')).toBeTrue();

    const accounts = mapEmployee({
      employee_id: 'AC-1', employee_name: 'Accounts', department_name: 'Accounts',
      metrics: { dsr_on_time_days: 0, dsr_late_days: 0, dsr_missing_days: 3, dsr_submitted_days: 0, closed_dsr: 0, total_working_days: 3 }
    });
    const fiber = mapEmployee({
      employee_id: 'FB-1', employee_name: 'Fiber', department_name: 'Fiber',
      metrics: { total_working_days: 3, present_days: 0, absent_days: 3, closed_dsr: 0, dsr_missing_days: 3 }
    });
    expect(accounts.metrics.closed_dsr).toBe(0);
    expect(component.hasDsrDetails(accounts)).toBeTrue();
    expect(fiber.metrics).toEqual(jasmine.objectContaining({
      total_working_days: 3, present_days: 0, absent_days: 3, closed_dsr: 0, dsr_missing_days: 3
    }));
    expect(component.hasDsrDetails(fiber)).toBeTrue();
    expect(mapEmployee({ employee_id: 'EMPTY', employee_name: 'Empty', department_name: 'Software' }).metrics.closed_tasks).toBeNull();
  });

  it('maps nested DSR attendance for department IDs 4 and 6 and leaves absent values null', () => {
    [4, 6].forEach((departmentId, index) => {
      const row = mapEmployee({
        employee_id: `DEPT-${departmentId}`,
        employee_name: `Department ${departmentId}`,
        department_id: departmentId,
        department_name: departmentId === 4 ? 'Hardware' : 'Headend',
        metrics: {
          dsr_attendance: {
            submitted_days: 18,
            on_time_days: 16,
            late_days: 2,
            missing_days: 0,
            closed_dsr: index === 0 ? 0 : 18
          }
        }
      }, index);

      expect(row.metrics).toEqual(jasmine.objectContaining({
        dsr_days_submitted: 18,
        dsr_on_time_days: 16,
        dsr_late_days: 2,
        dsr_missing_days: 0,
        closed_dsr: index === 0 ? 0 : 18
      }));
      expect(component.hasDsrDetails(row)).toBeFalse();
      expect(component.shouldHideDsrSubmissionMetrics(row)).toBeTrue();
    });

    const withoutAttendance = mapEmployee({
      employee_id: 'EMPTY',
      employee_name: 'No DSR values',
      department_name: 'Software',
      metrics: {}
    });
    expect(withoutAttendance.metrics).toEqual(jasmine.objectContaining({
      dsr_days_submitted: null,
      dsr_on_time_days: null,
      dsr_late_days: null,
      dsr_missing_days: null,
      closed_dsr: null
    }));
    expect(component.hasDsrDetails(withoutAttendance)).toBeFalse();
  });

  it('hides DSR submission metrics for Hardware and Headend while retaining other attendance metrics', () => {
    [4, 6].forEach((departmentId, index) => {
      const row = mapEmployee({
        employee_id: `DEPT-${departmentId}`,
        employee_name: `Department ${departmentId}`,
        department_id: departmentId,
        department_name: departmentId === 4 ? 'Hardware' : 'Headend',
        metrics: {
          present_days: 10,
          absent_days: 0,
          half_days: 0,
          holiday_days: 1,
          dsr_submitted_days: 0,
          dsr_on_time_days: 0,
          dsr_late_days: 0,
          dsr_missing_days: 10,
          assigned_tickets: 55,
          closed_tickets: 55,
          pending_tickets: 0,
          closed_tickets_in_range: 0,
          model_count: 3065,
          department_max_model_count: 3065,
          self_tickets: 55,
          total_working_days: 10
        }
      }, index);

      expect(row.metrics).toEqual(jasmine.objectContaining({
        dsr_days_submitted: 0,
        dsr_on_time_days: 0,
        dsr_late_days: 0,
        dsr_missing_days: 10,
        closed_dsr: null
      }));
      expect(component.hasDsrDetails(row)).toBeTrue();
      expect(component.shouldHideDsrSubmissionMetrics(row)).toBeTrue();
    });

    const noDsrValues = mapEmployee({
      employee_id: 'HW-EMPTY',
      employee_name: 'Hardware without DSR metrics',
      department_name: 'Hardware',
      metrics: {}
    });
    expect(component.hasDsrDetails(noDsrValues)).toBeFalse();
    expect(component.shouldHideDsrSubmissionMetrics(noDsrValues)).toBeTrue();
    expect(noDsrValues.metrics.closed_dsr).toBeNull();
  });

  it('does not infer eligibility reasons or weightages when the API omits them', () => {
    const row = mapEmployee({
      employee_id: 35,
      employee_name: 'NO REASON',
      department_name: 'RidApps',
      eligible: false,
      scores: { dsr_score: 20 },
      metrics: { required_working_days: 10, dsr_submitted_days: 2 }
    });

    expect(component.getEligibilityReason(row)).toBe('-');
    expect(component.getEligibilityReasonLabels(row)).toEqual([]);
    expect(component.getEligibilityReasonTone(row)).toBe('neutral');

    const report = (component as any).mapPerformanceReport({
      not_eligible_employees: [{
        employee_id: 35,
        employee_name: 'NO WEIGHTS',
        eligible: false
      }]
    }, '2026-09-01', '2026-09-30');
    expect(report.weightageRows).toEqual([]);
    component['applyReportState'](report);
    expect(component.weightageRows).toEqual([]);
  });

  it('uses the selected department API weights to choose not-eligible table columns', () => {
    component.departments = [{ id: 10, department_name: 'RidApps/Software' }];
    component.selectedDepartmentId = 10;
    component.weightageRows = (component as any).extractWeightageRows({
      weights: {
        'RidApps/Software': { task: 25, issue: 25, ticket: 25, dsr: 25 },
        Accounts: { dsr: 100 },
        default: { release: 40, dsr: 40, release_status: 20 },
        SQA: { release: 40, dsr: 40, on_time_release: 20 },
        Fiber: { ticket: 10, dsr: 90 },
        Hardware: { ticket: 100 },
        Headend: { ticket: 50, client: 50 }
      }
    });

    const ridappsWeights = component.weightageRows.find(row => row.department === 'RidApps/Software');
    expect(ridappsWeights).toEqual(jasmine.objectContaining({ task: 25, issue: 25, ticket: 25, dsr: 25 }));
    expect(component.weightageRows.some(row => row.department === 'Accounts' && row.dsr === 100)).toBeTrue();

    expect(component.displayedNotEligibleColumns.map(column => column.key)).toEqual([
      'index', 'employee', 'final', 'task', 'issue', 'ticket', 'dsr', 'reason'
    ]);
    const row = mapEmployee({
      ...notEligibleEmployee,
      scores: { task_score: 0, issue_score: 75, ticket_score: 50, dsr_score: 88 }
    });
    expect(component.getNotEligibleCellValue(row, 'task')).toBe('0');
    expect(component.getNotEligibleCellValue(row, 'issue')).toBe('75');

    component.departments = [{ id: 13, department_name: 'Software development team' }];
    component.selectedDepartmentId = 13;
    expect(component.displayedNotEligibleColumns.map(column => column.key)).toEqual([
      'index', 'employee', 'final', 'task', 'issue', 'ticket', 'dsr', 'reason'
    ]);

    component.departments = [{ id: 11, department_name: 'SQA' }];
    component.selectedDepartmentId = 11;
    expect(component.displayedNotEligibleColumns.map(column => column.key)).toEqual([
      'index', 'employee', 'final', 'release', 'onTimeRelease', 'dsr', 'reason'
    ]);

    component.departments = [{ id: 12, department_name: 'Hardware' }];
    component.selectedDepartmentId = 12;
    expect(component.displayedNotEligibleColumns.map(column => column.key)).toEqual([
      'index', 'employee', 'final', 'ticket', 'reason'
    ]);

    component.departments = [{ id: 13, department_name: 'Headend' }];
    component.selectedDepartmentId = 13;
    expect(component.displayedNotEligibleColumns.map(column => column.key)).toEqual([
      'index', 'employee', 'final', 'ticket', 'client', 'reason'
    ]);

    component.departments = [{ id: 14, department_name: 'Accounts' }];
    component.selectedDepartmentId = 14;
    expect(component.displayedNotEligibleColumns.map(column => column.key)).toEqual(
      component.notEligibleColumns.map(column => column.key)
    );
  });

  it('limits detail cards and score metrics to each configured department group', () => {
    const row = mapEmployee({
      ...notEligibleEmployee,
      department_name: 'RidApps/Software',
      scores: {
        task_score: 80,
        release_score: 70,
        issue_score: 60,
        ticket_score: 50,
        dsr_score: 90,
        client_score: 40,
        weights: { task: 25, release: 25, issue: 25, ticket: 25, dsr: 25, client: 20 }
      },
      metrics: { assigned_tasks: 4, completed_tasks: 3, assigned_issues: 2, assigned_tickets: 1 }
    });

    expect(component.shouldShowDetailMetric(row, 'task')).toBeTrue();
    expect(component.shouldShowDetailMetric(row, 'issue')).toBeTrue();
    expect(component.shouldShowDetailMetric(row, 'ticket')).toBeTrue();
    expect(component.shouldShowDetailMetric(row, 'release')).toBeFalse();
    expect(component.hasTaskDetails(row)).toBeTrue();
    expect(component.hasIssueDetails(row)).toBeTrue();
    expect(component.hasGeneralWorkDetails(row)).toBeFalse();

    row.department_name = 'Hardware';
    expect(component.shouldShowDetailMetric(row, 'ticket')).toBeTrue();
    expect(component.shouldShowDetailMetric(row, 'client')).toBeFalse();
    row.dsr_score = null;
    row.metrics.total_working_days = 3;
    expect(component.hasDsrDetails(row)).toBeTrue();

    row.department_name = 'Headend';
    expect(component.shouldShowDetailMetric(row, 'client')).toBeTrue();
    expect(component.isHeadendPerformanceRow(row)).toBeTrue();
    component.weightageRows = [{
      department: 'Headend', task: null, release: null, releasePass: null, releaseStatus: null,
      onTimeRelease: null, sqaProject: null, qcTimeline: null, issue: null, ticket: 50,
      client: 50, dsr: null, modelCount: null, quality: null, specialRule: '-', icon: ''
    }];
    row.score_weights.ticket = null;
    expect(component.getDetailScoreWeight(row, 'ticket')).toBe(50);
  });

  it('opens one employee modal and clears it when the employee leaves the page', () => {
    const first = mapEmployee();
    const second = mapEmployee({ ...notEligibleEmployee, employee_id: 34, employee_name: 'SECOND EMPLOYEE' }, 1);
    component.notEligibleRows = [first, second];
    (component as any).rebuildNotEligibleTable();

    component.openEmployeePerformanceDetails(first);
    expect(component.selectedPerformanceEmployee).toBe(first);

    component.openEmployeePerformanceDetails(second);
    expect(component.selectedPerformanceEmployee).toBe(second);

    component.notEligibleSearchTerm = 'balakumaran';
    (component as any).rebuildNotEligibleTable();
    expect(component.selectedPerformanceEmployee).toBeNull();

    component.openEmployeePerformanceDetails(first);
    component.closeEmployeePerformanceDetailsOnEscape();
    expect(component.selectedPerformanceEmployee).toBeNull();
  });

  it('searches nested detail values and readable eligibility reasons', () => {
    component.notEligibleRows = [mapEmployee()];
    component.notEligibleSearchTerm = 'release target not met';
    (component as any).rebuildNotEligibleTable();
    expect(component.filteredNotEligibleRows.length).toBe(1);

    component.notEligibleSearchTerm = '26';
    (component as any).rebuildNotEligibleTable();
    expect(component.filteredNotEligibleRows.length).toBe(1);
  });

  it('opens the shared full-detail modal for an overall winner', () => {
    const winner = mapEmployee({
      ...notEligibleEmployee,
      employee_id: 32,
      employee_name: 'SUBHALAKSHMI L',
      final_score: 86.15,
      eligible: true,
      eligibility_reasons: [],
      scores: {
        release_score: 100,
        dsr_score: 65.38,
        release_status_score: 100,
        weights: { release: 40, dsr: 40, release_status: 20 }
      }
    });

    component.openEmployeePerformanceDetails(winner);

    expect(component.selectedPerformanceEmployee).toBe(winner);
    expect(component.selectedPerformanceEmployee?.release_status_score).toBe(100);
    expect(component.selectedPerformanceEmployee?.score_weights.release_status).toBe(20);
  });

  it('preserves API final scores for overall winners and not eligible employees', () => {
    const response = {
      overall_top_winners: [{
        employee_id: 37,
        employee_name: 'TOP WINNER',
        department_name: 'Headend',
        final_score: 94.05,
        scores: { ticket_score: 88.1 },
        metrics: { support_ticket_count: 50 }
      }],
      not_eligible_employees: [{
        employee_id: 38,
        employee_name: 'NOT ELIGIBLE',
        department_name: 'Headend',
        final_score: 42.25,
        scores: { ticket_score: 40 },
        metrics: { support_ticket_count: 100 }
      }]
    };

    const report = (component as any).mapPerformanceReport(response, '2026-09-01', '2026-09-30');

    expect(report.overallTopWinners[0].final_score).toBe(94.05);
    expect(report.notEligibleRows[0].final_score).toBe(42.25);
  });

  it('maps API weightages without replacing supplied department weights', () => {
    const weightageRows = (component as any).extractWeightageRows({
      weights: {
        'Ridapps/Software/default': { release: 40, dsr: 40, release_status: 20 },
        SQA: { release: 40, dsr: 40, on_time_release: 20 },
        default: { task: 25, release: 20, dsr: 25 },
        Fiber: { ticket: 10, dsr: 90 },
        Hardware: { ticket: 100 },
        Headend: { ticket: 50, client: 50 }
      }
    });

    const hardware = weightageRows.find((row: any) => row.department === 'Hardware');
    const headend = weightageRows.find((row: any) => row.department === 'Headend');
    const sqa = weightageRows.find((row: any) => row.department === 'SQA');
    const ridappsSoftware = weightageRows.find((row: any) => row.department === 'Ridapps/Software');

    expect(hardware).toEqual(jasmine.objectContaining({ modelCount: null, ticket: 100, client: null }));
    expect(headend).toEqual(jasmine.objectContaining({ ticket: 50, client: 50, modelCount: null }));
    expect(sqa).toEqual(jasmine.objectContaining({
      release: 40,
      dsr: 40,
      releaseStatus: null,
      onTimeRelease: 20,
      sqaProject: null,
      qcTimeline: null
    }));
    expect(ridappsSoftware).toEqual(jasmine.objectContaining({
      release: 40,
      dsr: 40,
      releaseStatus: 20,
      onTimeRelease: null
    }));
    expect(weightageRows.some((row: any) => row.department.toLowerCase() === 'default')).toBeFalse();

    component.weightageRows = weightageRows;
    const releaseStatusColumn = component.displayedWeightageColumns.find(column => column.key === 'releaseStatus');
    const onTimeReleaseColumn = component.displayedWeightageColumns.find(column => column.key === 'onTimeRelease');
    expect(releaseStatusColumn?.label).toBe('Release status');
    expect(onTimeReleaseColumn?.label).toBe('On-time release');
    expect(component.displayedWeightageColumns.map(column => column.key)).not.toContain('sqaProject');
    expect(component.displayedWeightageColumns.map(column => column.key)).not.toContain('qcTimeline');
  });

  it('shows RidApps Task and Issues weights and matching Software employee columns', () => {
    component.weightageRows = (component as any).extractWeightageRows({
      weights: {
        'RidApps/Software': { task: 25, issue: 25, ticket: 25, dsr: 25 }
      }
    });

    const ridapps = component.weightageRows[0];
    expect(ridapps).toEqual(jasmine.objectContaining({
      department: 'RidApps/Software', task: 25, issue: 25, ticket: 25, dsr: 25
    }));
    expect(component.displayedWeightageColumns.map(column => column.key)).toEqual([
      'department', 'task', 'issue', 'ticket', 'dsr'
    ]);
    expect(component.getWeightageValue(ridapps, 'task')).toBe('25%');
    expect(component.getWeightageValue(ridapps, 'issue')).toBe('25%');

    component.departments = [{ id: 21, department_name: 'Software' }];
    component.selectedDepartmentId = 21;
    expect(component.displayedNotEligibleColumns.map(column => column.key)).toEqual([
      'index', 'employee', 'final', 'task', 'issue', 'ticket', 'dsr', 'reason'
    ]);
    expect(component.displayedNotEligibleColumns.find(column => column.key === 'task')?.label).toBe('Task');
    expect(component.displayedNotEligibleColumns.find(column => column.key === 'issue')?.label).toBe('Issues');

    const softwareEmployee = mapEmployee({
      employee_id: 'SW-1',
      employee_name: 'Software Employee',
      department_name: 'Software',
      final_score: 65,
      scores: { task_score: 10, issue_score: 20, ticket_score: 30, dsr_score: 40 }
    });
    expect(component.getNotEligibleCellValue(softwareEmployee, 'task')).toBe('10');
    expect(component.getNotEligibleCellValue(softwareEmployee, 'issue')).toBe('20');
    expect(component.getNotEligibleCellValue(softwareEmployee, 'ticket')).toBe('30');
    expect(component.getNotEligibleCellValue(softwareEmployee, 'dsr')).toBe('40');
  });

  it('accepts on-time release API aliases in weightage rows', () => {
    const row = (component as any).normalizeWeightageRow({
      department: 'Quality',
      on_time_release_weight: 20
    }, 0, '');

    expect(row.onTimeRelease).toBe(20);
  });

  it('maps Headend ticket/client details and calculates its weighted final score', () => {
    const row = mapEmployee({
      employee_id: 37,
      employee_name: 'MARI MUTHU M',
      department_id: 6,
      department_name: 'Headend',
      final_score: 94.05,
      eligible: true,
      scores: {
        ticket_score: 88.1,
        client_score: 100,
        weights: { ticket: 50, client: 50 }
      },
      metrics: {
        total_work_volume: 119,
        self_tickets: 74,
        handled_clients: 45,
        assigned_tickets: 74,
        closed_tickets: 0,
        pending_tickets: 74
      }
    });

    expect(row.ticket_score).toBe(88.1);
    expect(row.client_score).toBe(100);
    expect(row.score_weights.ticket).toBe(50);
    expect(row.score_weights.client).toBe(50);
    expect(row.metrics.self_tickets).toBe(74);
    expect(row.metrics.handled_clients).toBe(45);
    expect(row.metrics.assigned_tickets).toBe(74);
    expect(row.metrics.closed_tickets).toBe(0);
    expect(row.metrics.pending_tickets).toBe(74);
    expect(component.hasTicketClientDetails(row)).toBeTrue();
    expect(component.getCalculatedFinalScore(row)).toBeCloseTo(94.05, 2);
    expect(component.getFinalScoreCalculation(row).map(item => item.label)).toEqual(['Ticket', 'Client']);
  });

  it('keeps release and work metrics visible for Hardware employees without optional counters', () => {
    const row = mapEmployee({
      employee_id: 39,
      employee_name: 'HARDWARE EMPLOYEE',
      department_name: 'Hardware',
      final_score: 90,
      eligible: true,
      scores: { ticket_score: 90 },
      metrics: {}
    });

    expect(component.hasGeneralWorkDetails(row)).toBeTrue();
  });

  it('exports the full flattened not eligible details', () => {
    component.notEligibleRows = [mapEmployee()];
    (component as any).rebuildNotEligibleTable();

    const section = (component as any).buildPerformanceTableExportSections()
      .find((item: any) => item.sheetName === 'Not Eligible Employees');
    const values = Object.fromEntries(section.headers.map((header: string, index: number) => [header, section.rows[0][index]]));

    expect(values['Eligibility Reasons']).toBe('Final score below 85, Release target not met');
    expect(values['Release Status Score']).toBe('0');
    expect(values['Release Weight']).toBe('40');
    expect(values['Failed Releases']).toBe('0');
    expect(values['DSR On-Time Days']).toBe('23');
    expect(values['DSR Late Days']).toBe('0');
    expect(values['Task Score']).toBe('-');
  });
});
