import { PerformanceComponent } from './performance.component';
import { AuthService } from 'src/app/_core/services/auth.service';
import { ExcelService } from 'src/app/_core/services/excel.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

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

  it('maps API weightages and applies the required SQA 40/40/20 configuration', () => {
    const weightageRows = (component as any).extractWeightageRows({
      weights: {
        'Ridapps/Software/default': { release: 40, dsr: 40, release_status: 20 },
        SQA: { release: 50, dsr: 50 },
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
