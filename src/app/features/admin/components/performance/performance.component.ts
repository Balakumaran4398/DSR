import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { finalize, Subscription } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { ExcelService } from 'src/app/_core/services/excel.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { APP_TABLE_DEFAULT_PAGE_SIZE, APP_TABLE_PAGE_SIZE_OPTIONS, APP_TABLE_VISIBLE_ROW_COUNT, buildTablePageNumbers, getNextTablePageGroupPage, getPreviousTablePageGroupPage } from 'src/app/_core/utils/tabulator-pagination.util';
import { DateRangeChange } from 'src/app/_shared/components/date-range-filter/date-range-filter.component';

type PerformanceStatus = 'Outstanding' | 'Excellent' | 'Very Good' | 'Good' | 'Needs Improvement';
type ScoreTone = 'blue' | 'teal' | 'amber' | 'violet' | 'rose' | 'green' | 'slate';
type SummaryTone = 'blue' | 'green' | 'red' | 'violet';
type RuleTone = 'green' | 'orange' | 'blue' | 'violet' | 'teal';
type PerformanceMetricKey = 'task' | 'release' | 'releasePass' | 'issue' | 'ticket' | 'dsr' | 'quality';
type PerformanceWeightageMetricKey = PerformanceMetricKey | 'releaseStatus' | 'onTimeRelease' | 'sqaProject' | 'qcTimeline' | 'modelCount' | 'client';
type DepartmentPerformanceKind = 'ridappsSoftware' | 'sqa' | 'hardware' | 'headend' | 'hardwareHeadend' | 'default';
type PerformanceTableSortColumn = 'index' | 'employee' | 'final' | 'dsrDays' | 'reason' | PerformanceWeightageMetricKey | 'workVolume' | 'tasks' | 'issues' | 'tickets';
type PerformanceWeightageSortColumn = 'department' | PerformanceWeightageMetricKey | 'specialRule';
type PerformanceSortDirection = 'asc' | 'desc';
type PerformanceSortValue = string | number | null;

interface DepartmentOption {
  id: string | number;
  department_name: string;
}

interface PerformanceMetrics {
  total_work_volume: number | null;
  assigned_tasks: number | null;
  completed_tasks: number | null;
  closed_tasks: number | null;
  assigned_issues: number | null;
  closed_issues: number | null;
  assigned_tickets: number | null;
  support_ticket_count: number | null;
  model_count: number | null;
  total_releases: number | null;
  on_time_releases: number | null;
  passed_releases: number | null;
  failed_releases: number | null;
  dsr_days_submitted: number | null;
  dsr_days_required: number | null;
  total_working_days: number | null;
  dsr_on_time_days: number | null;
  dsr_late_days: number | null;
  dsr_missing_days: number | null;
  present_days: number | null;
  absent_days: number | null;
  closed_dsr: number | null;
  self_tickets: number | null;
  closed_tickets_in_range: number | null;
  department_max_model_count: number | null;
  closed_self_tickets: number | null;
  department_max_self_tickets: number | null;
  handled_clients: number | null;
  department_max_handled_clients: number | null;
  closed_tickets: number | null;
  pending_tickets: number | null;
}

interface PerformanceScoreWeights {
  task: number | null;
  release: number | null;
  release_pass: number | null;
  dsr: number | null;
  release_status: number | null;
  on_time_release: number | null;
  sqa_project: number | null;
  qc_timeline: number | null;
  model_count: number | null;
  issue: number | null;
  ticket: number | null;
  quality: number | null;
  client: number | null;
}

interface PerformanceRow {
  uid: string;
  rank: number | null;
  attendance_id: string;
  employee_id: string;
  employee_name: string;
  department_name: string;
  performance: string;
  performance_status: PerformanceStatus | '';
  final_score: number | null;
  dsr_score: number | null;
  task_score: number | null;
  release_score: number | null;
  release_status_score: number | null;
  on_time_release_score: number | null;
  sqa_project_score: number | null;
  qc_timeline_score: number | null;
  release_pass_score: number | null;
  issue_score: number | null;
  ticket_score: number | null;
  quality_score: number | null;
  client_score: number | null;
  fromdate: string;
  todate: string;
  eligible: boolean | null;
  reason: string;
  eligibility_reasons: string[];
  score_weights: PerformanceScoreWeights;
  avatar_url: string;
  metrics: PerformanceMetrics;
}

interface PerformanceRule {
  icon: string;
  value: string;
  title: string;
  description: string;
  tone: RuleTone;
}

interface PerformanceWeightageRow {
  department: string;
  task: number | null;
  release: number | null;
  releasePass: number | null;
  releaseStatus: number | null;
  onTimeRelease: number | null;
  sqaProject: number | null;
  qcTimeline: number | null;
  issue: number | null;
  ticket: number | null;
  client: number | null;
  dsr: number | null;
  modelCount: number | null;
  quality: number | null;
  specialRule: string;
  icon: string;
}

interface WinnerGroup {
  departmentName: string;
  rows: PerformanceRow[];
}

interface ScoreBreakdownItem {
  key: PerformanceMetricKey;
  label: string;
  weight: number | null;
  score: number | null;
  valueLabel: string;
  percentage: number;
  tone: ScoreTone;
}

interface MetricItem {
  icon: string;
  label: string;
  value: string;
}

interface ScoreCalculationItem {
  label: string;
  score: number;
  weight: number;
  contribution: number;
}

interface SummaryTile {
  icon: string;
  label: string;
  value: string | number;
  tone: SummaryTone;
}

interface PerformanceSummary {
  totalEmployeesEvaluated: number;
  eligibleEmployees: number;
  notEligibleEmployees: number;
  eligibilityPercentage: number;
}

interface PerformanceReportState {
  winnerGroups: WinnerGroup[];
  overallTopWinners: PerformanceRow[];
  notEligibleRows: PerformanceRow[];
  weightageRows: PerformanceWeightageRow[];
  summary: PerformanceSummary;
  rows: PerformanceRow[];
  fromdate: string;
  todate: string;
}

interface PerformanceTableColumn {
  key: PerformanceTableSortColumn;
  label: string;
  title: string;
  align: 'left' | 'right';
}

interface PerformanceWeightageTableColumn {
  key: PerformanceWeightageSortColumn;
  label: string;
  title: string;
  align: 'left' | 'right';
}

interface DepartmentScoreDefinition {
  key: PerformanceMetricKey;
  label: string;
  weight: number | null;
  tone: ScoreTone;
}

interface PerformanceTableExportSection {
  title: string;
  sheetName: string;
  summary?: Array<[string, any]>;
  headers: string[];
  rows: any[][];
  color: [number, number, number];
}

@Component({
  selector: 'app-performance',
  templateUrl: './performance.component.html',
  styleUrls: ['./performance.component.scss']
})
export class PerformanceComponent implements OnInit, OnDestroy {
  departments: DepartmentOption[] = [];
  filteredDepartments: DepartmentOption[] = [];
  departmentSearchTerm = '';
  selectedDepartmentId: string | number | null = null;
  fromDate: Date | null = null;
  toDate: Date | null = null;
  top = 3;

  rows: PerformanceRow[] = [];
  winnerGroups: WinnerGroup[] = [];
  overallTopWinners: PerformanceRow[] = [];
  notEligibleRows: PerformanceRow[] = [];
  filteredNotEligibleRows: PerformanceRow[] = [];
  pagedNotEligibleRows: PerformanceRow[] = [];
  weightageRows: PerformanceWeightageRow[] = [];
  filteredWeightageRows: PerformanceWeightageRow[] = [];
  pagedWeightageRows: PerformanceWeightageRow[] = [];
  summaryTiles: SummaryTile[] = [];
  weightageSearchTerm = '';
  weightagePageIndex = 0;
  weightagePageSize = APP_TABLE_DEFAULT_PAGE_SIZE;
  readonly tableVisibleRowCount = APP_TABLE_VISIBLE_ROW_COUNT;
  weightageTotalPages = 1;
  weightageShowingFrom = 0;
  weightageShowingTo = 0;
  weightagePageNumbers: number[] = [];
  weightageSortColumn: PerformanceWeightageSortColumn = 'department';
  weightageSortDirection: PerformanceSortDirection = 'asc';
  notEligibleSearchTerm = '';
  notEligiblePageIndex = 0;
  notEligiblePageSize = APP_TABLE_DEFAULT_PAGE_SIZE;
  notEligibleTotalPages = 1;
  notEligibleShowingFrom = 0;
  notEligibleShowingTo = 0;
  notEligiblePageNumbers: number[] = [];
  notEligibleSortColumn: PerformanceTableSortColumn = 'index';
  notEligibleSortDirection: PerformanceSortDirection = 'asc';
  selectedPerformanceEmployee: PerformanceRow | null = null;

  departmentsLoading = false;
  tableLoading = false;
  hasLoaded = false;
  errorMessage = '';
  excelExporting = false;
  pdfExporting = false;

  readonly eligibilityRules: PerformanceRule[] = [
    {
      icon: '',
      value: '90+',
      title: 'Minimum DSR Score',
      description: 'Employee must score at least 90% in DSR',
      tone: 'green'
    },
    {
      icon: 'ri-calendar-check-line',
      value: '',
      title: 'Required Working Days',
      description: 'Current range/month completed working days',
      tone: 'orange'
    },
    {
      icon: 'ri-clipboard-line',
      value: '',
      title: 'DSR Days',
      description: 'Completed working days only, excluding holidays and approved leave',
      tone: 'blue'
    },
    {
      icon: 'ri-award-line',
      value: '',
      title: 'Release Pass Score',
      description: 'Passed release contribution used for Ridapps/Software scoring',
      tone: 'violet'
    },
    {
      icon: 'ri-computer-line',
      value: '',
      title: 'Hardware/Headend Rule',
      description: 'Tickets only, no DSR considered',
      tone: 'teal'
    }
  ];

  private departmentsSubscription?: Subscription;
  private performanceSubscription?: Subscription;
  private lastRequestKey = '';

  readonly weightagePageSizeOptions = APP_TABLE_PAGE_SIZE_OPTIONS;
  readonly weightageColumns: PerformanceWeightageTableColumn[] = [
    { key: 'department', label: 'Department / category', title: 'Department / category', align: 'left' },
    { key: 'task', label: 'Task', title: 'Task Weightage', align: 'right' },
    { key: 'issue', label: 'Issues', title: 'Issues Weightage', align: 'right' },
    { key: 'release', label: 'Release', title: 'Release Weightage', align: 'right' },
    { key: 'releasePass', label: 'Release pass', title: 'Release Pass Weightage', align: 'right' },
    { key: 'releaseStatus', label: 'Release status', title: 'Release Status Weightage', align: 'right' },
    { key: 'onTimeRelease', label: 'On-time release', title: 'On-time Release Weightage', align: 'right' },
    { key: 'sqaProject', label: 'SQA project', title: 'SQA Project Weightage', align: 'right' },
    { key: 'qcTimeline', label: 'QC timeline', title: 'QC Timeline Weightage', align: 'right' },
    { key: 'ticket', label: 'Ticket', title: 'Ticket Weightage', align: 'right' },
    { key: 'client', label: 'Client support', title: 'Client Support Weightage', align: 'right' },
    { key: 'dsr', label: 'DSR', title: 'DSR Weightage', align: 'right' },
    { key: 'modelCount', label: 'Model count', title: 'Model Count Weightage', align: 'right' },
    { key: 'specialRule', label: 'Special rule', title: 'Special rule', align: 'left' }
  ];
  readonly notEligiblePageSizeOptions = APP_TABLE_PAGE_SIZE_OPTIONS;
  readonly notEligibleColumns: PerformanceTableColumn[] = [
    { key: 'index', label: 'S.No', title: 'Serial number', align: 'left' },
    { key: 'employee', label: 'Employee', title: 'Employee', align: 'left' },
    { key: 'final', label: 'Final Score', title: 'Final Score', align: 'left' },
    { key: 'release', label: 'Release', title: 'Release Score', align: 'left' },
    { key: 'releasePass', label: 'Release pass', title: 'Release Pass Score', align: 'left' },
    { key: 'ticket', label: 'Ticket', title: 'Ticket Score', align: 'left' },
    { key: 'dsr', label: 'DSR', title: 'DSR Score', align: 'left' },
    { key: 'dsrDays', label: 'DSR days', title: 'DSR Days', align: 'left' },
    { key: 'reason', label: 'Reason', title: 'Eligibility Reason', align: 'left' }
  ];
  readonly notEligibleMetricColumns: PerformanceTableColumn[] = [
    { key: 'task', label: 'Task', title: 'Task Score', align: 'left' },
    { key: 'release', label: 'Release', title: 'Release Score', align: 'left' },
    { key: 'releasePass', label: 'Release pass', title: 'Release Pass Score', align: 'left' },
    { key: 'releaseStatus', label: 'Release status', title: 'Release Status Score', align: 'left' },
    { key: 'onTimeRelease', label: 'On-time release', title: 'On-time Release Score', align: 'left' },
    { key: 'sqaProject', label: 'SQA project', title: 'SQA Project Score', align: 'left' },
    { key: 'qcTimeline', label: 'QC timeline', title: 'QC Timeline Score', align: 'left' },
    { key: 'issue', label: 'Issues', title: 'Issues Score', align: 'left' },
    { key: 'ticket', label: 'Ticket', title: 'Ticket Score', align: 'left' },
    { key: 'client', label: 'Client support', title: 'Client Support Score', align: 'left' },
    { key: 'dsr', label: 'DSR', title: 'DSR Score', align: 'left' },
    { key: 'modelCount', label: 'Model count', title: 'Model Count', align: 'left' },
    { key: 'quality', label: 'Quality', title: 'Quality Score', align: 'left' }
  ];

  constructor(
    private authService: AuthService,
    private excelService: ExcelService,
    private storageService: StorageService,
    private toasterService: ToasterService
  ) {
    this.weightageRows = [];
    this.rebuildWeightageTable();
    this.summaryTiles = this.buildSummaryTiles({
      totalEmployeesEvaluated: 0,
      eligibleEmployees: 0,
      notEligibleEmployees: 0,
      eligibilityPercentage: 0
    });
  }

  ngOnInit(): void {
    this.setDefaultDateRange();
    this.loadDepartments();
  }

  ngOnDestroy(): void {
    this.departmentsSubscription?.unsubscribe();
    this.performanceSubscription?.unsubscribe();
  }

  get canLoad(): boolean {
    return !!this.storageService.getEmpId()
      && this.selectedDepartmentId !== null
      && `${this.selectedDepartmentId}`.trim() !== ''
      && !!this.fromDate
      && !!this.toDate
      && this.isValidDate(this.fromDate)
      && this.isValidDate(this.toDate)
      && Number(this.top) > 0;
  }

  get canExport(): boolean {
    return this.rows.length > 0;
  }

  get dateRangeLabel(): string {
    const fromDate = this.fromDate ? this.formatDateForDisplay(this.fromDate) : '-';
    const toDate = this.toDate ? this.formatDateForDisplay(this.toDate) : '-';
    return `${fromDate} to ${toDate}`;
  }

  get reportPeriodLabel(): string {
    const fromDate = this.fromDate ? this.formatDateToYMD(this.fromDate) : '-';
    const toDate = this.toDate ? this.formatDateToYMD(this.toDate) : '-';
    return `${fromDate} to ${toDate}`;
  }

  get selectedDepartmentName(): string {
    return this.getSelectedDepartmentName();
  }

  get isManagerPerformanceScope(): boolean {
    const roles = this.storageService.roles;
    return !!roles?.isManager && !roles?.isAdmin;
  }

  get displayedNotEligibleColumns(): PerformanceTableColumn[] {
    const departmentKind = this.getDepartmentPerformanceKind(this.selectedDepartmentName);
    if (departmentKind === 'default') {
      return this.notEligibleColumns;
    }

    const weightage = this.getWeightageForDepartment(this.selectedDepartmentName);
    const baseColumns = this.notEligibleColumns.filter(column =>
      column.key === 'index' || column.key === 'employee' || column.key === 'final'
    );
    const metricColumns = weightage
      ? this.notEligibleMetricColumns.filter(column => {
        const key = column.key as PerformanceWeightageMetricKey;
        return this.getWeightageMetricValue(weightage, key) !== null;
      })
      : [];
    const reasonColumn = this.notEligibleColumns.find(column => column.key === 'reason');

    return [...baseColumns, ...metricColumns, ...(reasonColumn ? [reasonColumn] : [])];
  }

  get displayedWeightageColumns(): PerformanceWeightageTableColumn[] {
    return this.weightageColumns.filter(column => {
      const key = column.key;

      if (key === 'department') {
        return true;
      }

      if (key === 'specialRule') {
        return this.weightageRows.some(row => !!row.specialRule && row.specialRule !== '-');
      }

      return this.isWeightageMetricColumnKey(key)
        && this.weightageRows.some(row => this.getWeightageMetricValue(row, key) !== null);
    });
  }

  loadDepartments(): void {
    this.departmentsLoading = true;
    this.departmentsSubscription = this.authService.getAllDepartments()
      .pipe(finalize(() => {
        this.departmentsLoading = false;
      }))
      .subscribe({
        next: (response: unknown) => {
          this.departments = this.applyDepartmentAccessRestriction(this.normalizeDepartments(response));
          this.applyDepartmentSearch();
          this.selectStoredDepartment();

          // The date range is initialized before departments are requested. Once
          // the applicable department is known, load the opening report just as
          // if Apply had been pressed. Subsequent filter changes remain manual.
          if (this.canLoad) {
            this.loadBestEmployees();
          }

          if (this.isManagerPerformanceScope && !this.departments.length) {
            this.toasterService.error('No team department is assigned to this manager');
          }
        },
        error: (error: any) => {
          this.departments = [];
          this.filteredDepartments = [];
          this.toasterService.error(error?.error?.message || 'Unable to load departments');
        }
      });
  }

  onDepartmentChanged(): void {
    this.errorMessage = '';

    if (this.canLoad) {
      this.loadBestEmployees();
    }
  }

  onDepartmentSelectOpened(_opened: boolean): void {
    this.departmentSearchTerm = '';
    this.applyDepartmentSearch();
  }

  filterDepartments(event: Event): void {
    this.departmentSearchTerm = (event.target as HTMLInputElement).value || '';
    this.applyDepartmentSearch();
  }

  onDateRangeChanged(range: DateRangeChange): void {
    const rangeStart = this.formatDateToYMD(range.startDate);
    const rangeEnd = this.formatDateToYMD(range.endDate);
    const currentStart = this.fromDate ? this.formatDateToYMD(this.fromDate) : '';
    const currentEnd = this.toDate ? this.formatDateToYMD(this.toDate) : '';
    if (rangeStart === currentStart && rangeEnd === currentEnd) return;

    this.fromDate = range.startDate;
    this.toDate = range.endDate;
    this.errorMessage = '';

    if (!this.fromDate
      || !this.toDate
      || !this.isValidDate(this.fromDate)
      || !this.isValidDate(this.toDate)
      || this.fromDate > this.toDate) {
      return;
    }

    this.loadBestEmployees();
  }

  onWeightageSearch(event: Event): void {
    this.weightageSearchTerm = (event.target as HTMLInputElement).value || '';
    this.weightagePageIndex = 0;
    this.rebuildWeightageTable();
  }

  clearWeightageSearch(): void {
    this.weightageSearchTerm = '';
    this.weightagePageIndex = 0;
    this.rebuildWeightageTable();
  }

  onWeightagePageSizeChange(event: Event): void {
    const nextPageSize = Number((event.target as HTMLSelectElement).value);

    if (!this.weightagePageSizeOptions.includes(nextPageSize)) {
      return;
    }

    this.weightagePageSize = nextPageSize;
    this.weightagePageIndex = 0;
    this.rebuildWeightageTable();
  }

  sortWeightageRows(column: PerformanceWeightageSortColumn): void {
    if (this.weightageSortColumn === column) {
      this.weightageSortDirection = this.weightageSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.weightageSortColumn = column;
      this.weightageSortDirection = 'asc';
    }

    this.weightagePageIndex = 0;
    this.rebuildWeightageTable();
  }

  getWeightageSortIcon(column: PerformanceWeightageSortColumn): string {
    if (this.weightageSortColumn !== column) {
      return 'ri-arrow-up-down-line';
    }

    return this.weightageSortDirection === 'asc' ? 'ri-arrow-up-line' : 'ri-arrow-down-line';
  }

  goToWeightagePage(pageIndex: number): void {
    const nextPageIndex = Math.max(0, Math.min(this.weightageTotalPages - 1, pageIndex));

    if (nextPageIndex === this.weightagePageIndex) {
      return;
    }

    this.weightagePageIndex = nextPageIndex;
    this.rebuildWeightageTable();
  }

  getPreviousWeightagePageGroup(): number {
    return getPreviousTablePageGroupPage(this.weightagePageIndex + 1, this.weightageTotalPages) - 1;
  }

  getNextWeightagePageGroup(): number {
    return getNextTablePageGroupPage(this.weightagePageIndex + 1, this.weightageTotalPages) - 1;
  }

  onNotEligibleSearch(event: Event): void {
    this.notEligibleSearchTerm = (event.target as HTMLInputElement).value || '';
    this.notEligiblePageIndex = 0;
    this.rebuildNotEligibleTable();
  }

  clearNotEligibleSearch(): void {
    this.notEligibleSearchTerm = '';
    this.notEligiblePageIndex = 0;
    this.rebuildNotEligibleTable();
  }

  onNotEligiblePageSizeChange(event: Event): void {
    const nextPageSize = Number((event.target as HTMLSelectElement).value);

    if (!this.notEligiblePageSizeOptions.includes(nextPageSize)) {
      return;
    }

    this.notEligiblePageSize = nextPageSize;
    this.notEligiblePageIndex = 0;
    this.rebuildNotEligibleTable();
  }

  sortNotEligibleRows(column: PerformanceTableSortColumn): void {
    if (this.notEligibleSortColumn === column) {
      this.notEligibleSortDirection = this.notEligibleSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.notEligibleSortColumn = column;
      this.notEligibleSortDirection = 'asc';
    }

    this.notEligiblePageIndex = 0;
    this.rebuildNotEligibleTable();
  }

  getNotEligibleSortIcon(column: PerformanceTableSortColumn): string {
    if (this.notEligibleSortColumn !== column) {
      return 'ri-arrow-up-down-line';
    }

    return this.notEligibleSortDirection === 'asc' ? 'ri-arrow-up-line' : 'ri-arrow-down-line';
  }

  goToNotEligiblePage(pageIndex: number): void {
    const nextPageIndex = Math.max(0, Math.min(this.notEligibleTotalPages - 1, pageIndex));

    if (nextPageIndex === this.notEligiblePageIndex) {
      return;
    }

    this.notEligiblePageIndex = nextPageIndex;
    this.rebuildNotEligibleTable();
  }

  getPreviousNotEligiblePageGroup(): number {
    return getPreviousTablePageGroupPage(this.notEligiblePageIndex + 1, this.notEligibleTotalPages) - 1;
  }

  getNextNotEligiblePageGroup(): number {
    return getNextTablePageGroupPage(this.notEligiblePageIndex + 1, this.notEligibleTotalPages) - 1;
  }

  loadBestEmployees(force = false): void {
    if (!this.canLoad || !this.fromDate || !this.toDate || this.selectedDepartmentId === null) {
      this.toasterService.error('Please select department and date range');
      return;
    }

    const employeeId = this.storageService.getEmpId();
    if (!employeeId) {
      this.toasterService.error('Logged-in employee details are not available');
      return;
    }

    const payload = {
      employee_id: employeeId,
      department_id: this.selectedDepartmentId,
      fromdate: this.formatDateToYMD(this.fromDate),
      todate: this.formatDateToYMD(this.toDate),
      top: Math.max(1, Math.floor(Number(this.top) || 3))
    };
    const requestKey = JSON.stringify(payload);

    if (!force && requestKey === this.lastRequestKey) {
      return;
    }

    this.performanceSubscription?.unsubscribe();
    this.selectedPerformanceEmployee = null;
    this.lastRequestKey = requestKey;
    this.tableLoading = true;
    this.errorMessage = '';
    this.hasLoaded = true;

    this.performanceSubscription = this.authService.getBestEmployee(payload)
      .pipe(finalize(() => {
        this.tableLoading = false;
      }))
      .subscribe({
        next: (response: unknown) => {
          this.applyReportState(this.mapPerformanceReport(response, payload.fromdate, payload.todate));
        },
        error: (error: any) => {
          this.clearReportState();
          this.errorMessage = error?.error?.message || 'Unable to load performance data.';
          this.toasterService.error(this.errorMessage);
        }
      });
  }

  exportExcel(): void {
    if (!this.canExport) {
      this.toasterService.error('No performance data available for Excel export');
      return;
    }

    try {
      this.excelExporting = true;
      const tableSections = this.buildPerformanceTableExportSections();
      const fromDate = this.fromDate ? this.formatDateToYMD(this.fromDate) : '-';
      const toDate = this.toDate ? this.formatDateToYMD(this.toDate) : '-';

      if (!this.hasTableExportRows(tableSections)) {
        this.toasterService.error('No table data available for Excel export');
        return;
      }

      this.excelService.generateTableWorkbookExcel(
        {
          workbookTitle: 'Performance Table Report',
          author: this.getExportGeneratedBy(),
          fromDate,
          toDate,
          departmentName: this.selectedDepartmentName,
          filename: this.buildExportFileName('xlsx')
        },
        tableSections
      );
      this.toasterService.success('Excel downloaded successfully');
    } catch (error) {
      console.error('Performance Excel export failed', error);
      this.toasterService.error('Unable to generate Excel export');
    } finally {
      this.excelExporting = false;
    }
  }

  exportPdf(): void {
    if (!this.canExport) {
      this.toasterService.error('No performance data available for PDF export');
      return;
    }

    try {
      this.pdfExporting = true;
      const tableSections = this.buildPerformanceTableExportSections();

      if (!this.hasTableExportRows(tableSections)) {
        this.toasterService.error('No table data available for PDF export');
        return;
      }

      const jsPdfCtor = (window as any).jspdf?.jsPDF;
      if (!jsPdfCtor) {
        throw new Error('PDF export library is not available.');
      }

      const doc = new jsPdfCtor('l', 'mm', 'a3');
      let y = this.drawPdfHeader(doc);
      tableSections.forEach(section => {
        y = this.addPdfTable(
          doc,
          section.title,
          section.headers,
          section.rows,
          y,
          section.color
        );
      });

      doc.save(this.buildExportFileName('pdf'));
      this.toasterService.success('PDF downloaded successfully');
    } catch (error) {
      console.error('Performance PDF export failed', error);
      this.toasterService.error('Unable to generate PDF export');
    } finally {
      this.pdfExporting = false;
    }
  }

  getScoreBreakdown(row: PerformanceRow): ScoreBreakdownItem[] {
    return this.getDepartmentScoreDefinitions(row.department_name)
      .map(definition => this.buildScoreItem(
        definition.key,
        definition.label,
        definition.weight,
        this.getScoreForMetric(row, definition.key),
        definition.tone
      ));
  }

  getMetricItems(row: PerformanceRow): MetricItem[] {
    return [
      {
        icon: 'ri-briefcase-4-line',
        label: 'Total Work Volume',
        value: this.formatMetricNumber(row.metrics.total_work_volume)
      },
      {
        icon: 'ri-task-line',
        label: 'Assigned Tasks',
        value: this.formatMetricNumber(row.metrics.assigned_tasks)
      },
      {
        icon: 'ri-checkbox-circle-line',
        label: 'Completed Tasks',
        value: this.formatMetricNumber(row.metrics.completed_tasks)
      },
      {
        icon: 'ri-bug-line',
        label: 'Assigned Issues',
        value: this.formatMetricNumber(row.metrics.assigned_issues)
      },
      {
        icon: 'ri-customer-service-2-line',
        label: 'Assigned Tickets',
        value: this.formatMetricNumber(row.metrics.assigned_tickets)
      },
      {
        icon: 'ri-calendar-todo-line',
        label: 'DSR Days',
        value: this.getDsrDaysLabel(row)
      }
    ];
  }

  getInitials(name: string): string {
    const parts = `${name || ''}`
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!parts.length) {
      return 'NA';
    }

    return parts
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  }

  getMedalTone(index: number): string {
    if (index === 0) return 'gold';
    if (index === 1) return 'silver';
    if (index === 2) return 'bronze';
    return 'blue';
  }

  getEligibilityLabel(row: PerformanceRow): string {
    if (row.eligible === false) {
      return 'Not Eligible';
    }

    if (row.eligible === true) {
      return 'Eligible';
    }

    return '-';
  }

  getEligibilityReason(row: PerformanceRow): string {
    const reasonLabels = this.getEligibilityReasonLabels(row);
    if (reasonLabels.length) {
      return reasonLabels.join(', ');
    }

    if (row.reason) {
      return this.formatEligibilityReason(row.reason);
    }

    return '-';
  }

  getEligibilityReasonLabels(row: PerformanceRow): string[] {
    if (row.eligibility_reasons.length) {
      return row.eligibility_reasons.map(reason => this.formatEligibilityReason(reason));
    }

    if (row.reason) {
      return [this.formatEligibilityReason(row.reason)];
    }

    return [];
  }

  getEligibilityReasonTone(row: PerformanceRow): string {
    const reason = this.getEligibilityReason(row).toLowerCase();
    if (reason === '-') return 'neutral';
    if (/score|target|threshold|below|not met|minimum/.test(reason)) return 'danger';
    if (/dsr|attendance|late|submission/.test(reason)) return 'warning';
    if (/release|quality|ticket|issue|task/.test(reason)) return 'info';
    return 'neutral';
  }

  formatEligibilityReason(reason: string): string {
    const readableReason = `${reason || ''}`
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    const sentence = readableReason
      ? `${readableReason.charAt(0).toUpperCase()}${readableReason.slice(1)}`
      : '-';

    return sentence.replace(/\bdsr\b/gi, 'DSR');
  }

  openEmployeePerformanceDetails(row: PerformanceRow): void {
    this.selectedPerformanceEmployee = row;
  }

  closeEmployeePerformanceDetails(): void {
    this.selectedPerformanceEmployee = null;
  }

  @HostListener('document:keydown.escape')
  closeEmployeePerformanceDetailsOnEscape(): void {
    if (this.selectedPerformanceEmployee) {
      this.closeEmployeePerformanceDetails();
    }
  }

  getDsrDaysLabel(row: PerformanceRow): string {
    const submitted = row.metrics.dsr_days_submitted;
    const required = row.metrics.dsr_days_required;

    if (submitted !== null && required !== null) {
      return `${this.formatMetricNumber(submitted)} / ${this.formatMetricNumber(required)}`;
    }

    if (submitted !== null) {
      return this.formatMetricNumber(submitted);
    }

    return '-';
  }

  formatScore(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return '-';
    }

    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  formatMetricNumber(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return '-';
    }

    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2
    }).format(value);
  }

  formatWeight(value: number | null): string {
    return value === null ? '-' : `${this.formatScore(value)}`;
  }

  formatWeightWithPercent(value: number | null): string {
    return value === null ? '-' : `${this.formatScore(value)}%`;
  }

  hasTicketClientDetails(row: PerformanceRow): boolean {
    const kind = this.getDepartmentPerformanceKind(row.department_name);
    if (kind === 'sqa') {
      return false;
    }

    if (kind === 'ridappsSoftware' || kind === 'hardware') {
      return [
        row.ticket_score,
        row.score_weights.ticket,
        row.metrics.self_tickets,
        row.metrics.model_count,
        row.metrics.assigned_tickets,
        row.metrics.support_ticket_count,
        row.metrics.closed_tickets,
        row.metrics.pending_tickets,
        row.metrics.closed_tickets_in_range,
        row.metrics.department_max_model_count,
        row.metrics.total_working_days,
        row.metrics.closed_self_tickets,
        row.metrics.department_max_self_tickets,
        row.metrics.department_max_handled_clients
      ].some(value => value !== null);
    }

    return [
      row.ticket_score,
      row.client_score,
      row.score_weights.ticket,
      row.score_weights.client,
      row.metrics.self_tickets,
      row.metrics.handled_clients,
      row.metrics.assigned_tickets,
      row.metrics.closed_tickets,
      row.metrics.pending_tickets,
      row.metrics.closed_tickets_in_range,
      row.metrics.department_max_model_count,
      row.metrics.total_working_days,
      row.metrics.closed_self_tickets,
      row.metrics.department_max_self_tickets,
      row.metrics.department_max_handled_clients
    ].some(value => value !== null);
  }

  hasReleaseDetails(row: PerformanceRow): boolean {
    return this.hasReleaseWorkMetrics(row)
      || row.release_score !== null
      || row.release_status_score !== null;
  }

  hasReleaseWorkMetrics(row: PerformanceRow): boolean {
    return [
      row.metrics.total_releases,
      row.metrics.passed_releases,
      row.metrics.failed_releases,
      row.metrics.on_time_releases
    ].some(value => value !== null);
  }

  hasGeneralWorkDetails(row: PerformanceRow): boolean {
    const departmentKind = this.getDepartmentPerformanceKind(row.department_name);

    if (departmentKind === 'sqa') {
      return this.hasReleaseWorkMetrics(row);
    }

    if (departmentKind === 'ridappsSoftware'
      || departmentKind === 'hardware'
      || departmentKind === 'headend'
      || departmentKind === 'hardwareHeadend') {
      return false;
    }

    return [
      row.metrics.total_releases,
      row.metrics.passed_releases,
      row.metrics.failed_releases,
      row.metrics.on_time_releases,
      row.metrics.assigned_tasks,
      row.metrics.completed_tasks,
      row.metrics.assigned_issues,
      row.metrics.support_ticket_count,
      row.metrics.model_count
    ].some(value => value !== null);
  }

  hasDsrDetails(row: PerformanceRow): boolean {
    const departmentOnlyMetrics = this.shouldHideDsrSubmissionMetrics(row)
      ? []
      : [
        row.metrics.dsr_days_submitted,
        row.metrics.dsr_on_time_days,
        row.metrics.dsr_late_days,
        row.metrics.dsr_missing_days,
        row.metrics.closed_dsr
      ];

    return [
      row.dsr_score,
      row.metrics.dsr_days_required,
      row.metrics.total_working_days,
      row.metrics.present_days,
      row.metrics.absent_days,
      ...departmentOnlyMetrics
    ].some(value => value !== null);
  }

  shouldHideDsrSubmissionMetrics(row: PerformanceRow): boolean {
    const kind = this.getDepartmentPerformanceKind(row.department_name);
    return kind === 'hardware' || kind === 'headend' || kind === 'hardwareHeadend';
  }

  hasTaskDetails(row: PerformanceRow): boolean {
    if (this.getDepartmentPerformanceKind(row.department_name) !== 'ridappsSoftware') {
      return false;
    }
    return row.metrics.assigned_tasks !== null || row.metrics.completed_tasks !== null || row.metrics.closed_tasks !== null;
  }

  hasIssueDetails(row: PerformanceRow): boolean {
    if (this.getDepartmentPerformanceKind(row.department_name) !== 'ridappsSoftware') {
      return false;
    }
    return row.metrics.assigned_issues !== null || row.metrics.closed_issues !== null;
  }

  shouldShowDetailMetric(row: PerformanceRow, metric: PerformanceWeightageMetricKey): boolean {
    const kind = this.getDepartmentPerformanceKind(row.department_name);
    if (kind === 'ridappsSoftware') {
      return ['task', 'issue', 'ticket', 'dsr'].includes(metric);
    }
    if (kind === 'sqa') {
      return ['release', 'dsr', 'onTimeRelease'].includes(metric);
    }
    if (kind === 'hardware') {
      return metric === 'ticket';
    }
    if (kind === 'headend' || kind === 'hardwareHeadend') {
      return metric === 'ticket' || metric === 'client';
    }
    return true;
  }

  shouldShowTicketClientMetric(row: PerformanceRow, metric: 'workVolume' | 'selfTickets' | 'closedSelfTickets' | 'handledClients' | 'assignedTickets' | 'closedTickets' | 'closedTicketsInRange' | 'pendingTickets' | 'supportTickets' | 'models' | 'departmentMaxModelCount' | 'departmentMaxSelfTickets' | 'departmentMaxHandledClients' | 'totalWorkingDays'): boolean {
    const kind = this.getDepartmentPerformanceKind(row.department_name);
    if (kind === 'ridappsSoftware') {
      return ['selfTickets', 'assignedTickets', 'closedTickets', 'pendingTickets'].includes(metric);
    }
    if (kind === 'hardware') {
      return ['selfTickets', 'closedTicketsInRange', 'models', 'departmentMaxModelCount', 'totalWorkingDays'].includes(metric);
    }
    if (kind === 'headend' || kind === 'hardwareHeadend') {
      return ['selfTickets', 'closedSelfTickets', 'handledClients', 'departmentMaxSelfTickets', 'departmentMaxHandledClients', 'totalWorkingDays'].includes(metric);
    }
    return !['supportTickets', 'models'].includes(metric);
  }

  shouldShowReleaseWorkMetric(row: PerformanceRow, metric: 'workVolume' | 'totalReleases' | 'passedReleases' | 'failedReleases' | 'onTimeReleases' | 'tasks' | 'issues' | 'tickets' | 'supportTickets' | 'models'): boolean {
    const kind = this.getDepartmentPerformanceKind(row.department_name);
    if (kind === 'sqa') {
      return ['totalReleases', 'passedReleases', 'failedReleases', 'onTimeReleases'].includes(metric);
    }
    if (kind === 'ridappsSoftware' || kind === 'hardware' || kind === 'headend' || kind === 'hardwareHeadend') {
      return false;
    }
    return true;
  }

  getFinalScoreCalculation(row: PerformanceRow): ScoreCalculationItem[] {
    const factors: Array<{ key: PerformanceWeightageMetricKey; label: string; score: number | null; weight: number | null }> = [
      { key: 'task', label: 'Task', score: row.task_score, weight: row.score_weights.task },
      { key: 'release', label: 'Release', score: row.release_score, weight: row.score_weights.release },
      { key: 'releasePass', label: 'Release pass', score: row.release_pass_score, weight: row.score_weights.release_pass },
      { key: 'releaseStatus', label: 'Release status', score: row.release_status_score, weight: row.score_weights.release_status },
      { key: 'onTimeRelease', label: 'On-time release', score: this.getOnTimeReleaseScore(row), weight: row.score_weights.on_time_release },
      { key: 'issue', label: 'Issue', score: row.issue_score, weight: row.score_weights.issue },
      { key: 'ticket', label: 'Ticket', score: row.ticket_score, weight: row.score_weights.ticket },
      { key: 'dsr', label: 'DSR', score: row.dsr_score, weight: row.score_weights.dsr },
      { key: 'quality', label: 'Quality', score: row.quality_score, weight: row.score_weights.quality },
      { key: 'client', label: 'Client', score: row.client_score, weight: row.score_weights.client }
    ];

    return factors
      .filter((factor): factor is { key: PerformanceWeightageMetricKey; label: string; score: number; weight: number } =>
        factor.score !== null && factor.weight !== null && this.shouldShowDetailMetric(row, factor.key))
      .map(({ key: _key, ...factor }) => ({
        ...factor,
        contribution: (factor.score * factor.weight) / 100
      }));
  }

  getOnTimeReleaseScore(row: PerformanceRow): number | null {
    return row.on_time_release_score ?? this.getRatioScore(row.metrics.on_time_releases, row.metrics.total_releases);
  }

  getDetailScoreWeight(row: PerformanceRow, metric: PerformanceWeightageMetricKey): number | null {
    const scoreWeight = {
      task: row.score_weights.task,
      release: row.score_weights.release,
      releasePass: row.score_weights.release_pass,
      releaseStatus: row.score_weights.release_status,
      onTimeRelease: row.score_weights.on_time_release,
      sqaProject: row.score_weights.sqa_project,
      qcTimeline: row.score_weights.qc_timeline,
      issue: row.score_weights.issue,
      ticket: row.score_weights.ticket,
      client: row.score_weights.client,
      dsr: row.score_weights.dsr,
      modelCount: row.score_weights.model_count,
      quality: row.score_weights.quality
    }[metric];
    const departmentWeightage = this.getWeightageForDepartment(row.department_name);
    return scoreWeight ?? (departmentWeightage ? this.getWeightageMetricValue(departmentWeightage, metric) : null);
  }

  getCalculatedFinalScore(row: PerformanceRow): number | null {
    const calculation = this.getFinalScoreCalculation(row);
    return calculation.length
      ? calculation.reduce((total, item) => total + item.contribution, 0)
      : null;
  }

  getWeightageValue(row: PerformanceWeightageRow, column: PerformanceWeightageSortColumn): string {
    if (column === 'department') {
      return row.department;
    }

    if (column === 'specialRule') {
      return row.specialRule || '-';
    }

    return this.formatWeightWithPercent(this.getWeightageMetricValue(row, column));
  }

  getNotEligibleCellValue(row: PerformanceRow, column: PerformanceTableSortColumn): string {
    switch (column) {
      case 'index':
      case 'employee':
        return '';
      case 'final':
        return this.formatScore(row.final_score);
      case 'reason':
        return this.getEligibilityReason(row);
      case 'releasePass':
        return this.formatScore(row.release_pass_score);
      case 'releaseStatus':
        return this.formatScore(row.release_status_score);
      case 'onTimeRelease':
        return this.formatScore(row.on_time_release_score ?? this.getOnTimeReleaseScore(row));
      case 'sqaProject':
        return this.formatScore(row.sqa_project_score);
      case 'qcTimeline':
        return this.formatScore(row.qc_timeline_score);
      case 'client':
        return this.formatScore(row.client_score);
      case 'modelCount':
        return this.formatMetricNumber(row.metrics.model_count);
      case 'dsrDays':
        return this.formatMetricNumber(row.metrics.dsr_days_submitted);
      case 'task':
      case 'release':
      case 'issue':
      case 'ticket':
      case 'dsr':
      case 'quality':
        return this.formatScore(this.getScoreForMetric(row, column));
      case 'workVolume':
        return this.formatMetricNumber(row.metrics.total_work_volume);
      case 'tasks':
        return this.formatMetricNumber(row.metrics.assigned_tasks);
      case 'issues':
        return this.formatMetricNumber(row.metrics.assigned_issues);
      case 'tickets':
        return this.formatMetricNumber(this.getTicketCount(row));
      default:
        return '-';
    }
  }

  isNotEligibleScoreColumn(column: PerformanceTableSortColumn): boolean {
    return column === 'final';
  }

  getSummaryProgress(tile: SummaryTile): number {
    const total = this.getSummaryNumericValue('Total Employees Evaluated');
    const value = this.getSummaryNumericValue(tile.label);

    if (tile.label === 'Eligible Employees' || tile.label === 'Not Eligible Employees') {
      return total > 0 ? this.toPercent((value / total) * 100) : 0;
    }

    if (tile.label === 'Eligibility Percentage') {
      return this.toPercent(value);
    }

    return 0;
  }

  getWeightageSwatchTone(index: number): string {
    return ['blue', 'amber', 'teal', 'slate', 'violet', 'rose', 'green'][index % 7];
  }

  formatDateForDisplay(value: Date | string | null): string {
    if (!value) {
      return '-';
    }

    if (typeof value === 'string') {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      if (match) {
        const monthIndex = Number(match[2]) - 1;
        const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIndex] || match[2];
        return `${match[3]} ${month} ${match[1]}`;
      }
    }

    const date = value instanceof Date ? value : new Date(value);
    if (!this.isValidDate(date)) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
  }

  trackByDepartment(_index: number, department: DepartmentOption): string {
    return `${department.id}`;
  }

  trackByRule(_index: number, rule: PerformanceRule): string {
    return rule.title;
  }

  trackByWeightage(_index: number, row: PerformanceWeightageRow): string {
    return row.department;
  }

  trackByWeightageColumn(_index: number, column: PerformanceWeightageTableColumn): string {
    return column.key;
  }

  trackByWinnerGroup(_index: number, group: WinnerGroup): string {
    return group.departmentName;
  }

  trackByRow(_index: number, row: PerformanceRow): string {
    return row.uid;
  }

  trackBySummary(_index: number, tile: SummaryTile): string {
    return tile.label;
  }

  trackByScore(_index: number, item: ScoreBreakdownItem): string {
    return item.key;
  }

  trackByMetric(_index: number, item: MetricItem): string {
    return item.label;
  }

  trackByNotEligibleColumn(_index: number, column: PerformanceTableColumn): string {
    return column.key;
  }

  trackByNumber(_index: number, value: number): number {
    return value;
  }

  private applyReportState(report: PerformanceReportState): void {
    this.selectedPerformanceEmployee = null;
    this.rows = report.rows;
    this.winnerGroups = report.winnerGroups;
    this.overallTopWinners = report.overallTopWinners;
    this.notEligibleRows = report.notEligibleRows;
    this.weightageRows = report.weightageRows;
    this.summaryTiles = this.buildSummaryTiles(report.summary);
    this.weightagePageIndex = 0;
    this.rebuildWeightageTable();
    this.notEligiblePageIndex = 0;
    this.rebuildNotEligibleTable();
  }

  private clearReportState(): void {
    this.selectedPerformanceEmployee = null;
    this.rows = [];
    this.winnerGroups = [];
    this.overallTopWinners = [];
    this.notEligibleRows = [];
    this.filteredNotEligibleRows = [];
    this.pagedNotEligibleRows = [];
    this.weightageRows = [];
    this.filteredWeightageRows = [];
    this.pagedWeightageRows = [];
    this.summaryTiles = this.buildSummaryTiles({
      totalEmployeesEvaluated: 0,
      eligibleEmployees: 0,
      notEligibleEmployees: 0,
      eligibilityPercentage: 0
    });
    this.weightageSearchTerm = '';
    this.weightagePageIndex = 0;
    this.rebuildWeightageTable();
    this.notEligibleSearchTerm = '';
    this.notEligiblePageIndex = 0;
    this.rebuildNotEligibleTable();
  }

  isSqaPerformanceRow(row: PerformanceRow): boolean {
    return this.getDepartmentPerformanceKind(row.department_name) === 'sqa';
  }

  isHeadendPerformanceRow(row: PerformanceRow): boolean {
    const kind = this.getDepartmentPerformanceKind(row.department_name);
    return kind === 'headend' || kind === 'hardwareHeadend';
  }

  getTicketMetricsTitle(row: PerformanceRow): string {
    const kind = this.getDepartmentPerformanceKind(row.department_name);
    return kind === 'ridappsSoftware' || kind === 'hardware' ? 'Ticket metrics' : 'Ticket and client metrics';
  }

  private getDepartmentPerformanceKind(departmentName: string): DepartmentPerformanceKind {
    const label = this.normalizeLookupLabel(departmentName);

    if (label.includes('hardware') && label.includes('headend')) {
      return 'hardwareHeadend';
    }

    if (label.includes('headend')) {
      return 'headend';
    }

    if (label.includes('hardware')) {
      return 'hardware';
    }

    if (label.includes('sqa')) {
      return 'sqa';
    }

    if (label.includes('ridapps') || label.includes('software')) {
      return 'ridappsSoftware';
    }

    return 'default';
  }

  private getDepartmentScoreDefinitions(departmentName: string): DepartmentScoreDefinition[] {
    const kind = this.getDepartmentPerformanceKind(departmentName);

    if (kind === 'ridappsSoftware') {
      return [
        { key: 'release', label: 'Release', weight: 40, tone: 'teal' },
        { key: 'releasePass', label: 'Release Pass', weight: 20, tone: 'green' },
        { key: 'dsr', label: 'DSR', weight: 40, tone: 'rose' }
      ];
    }

    if (kind === 'sqa') {
      return [
        { key: 'release', label: 'Release', weight: 50, tone: 'teal' },
        { key: 'dsr', label: 'DSR', weight: 50, tone: 'rose' }
      ];
    }

    if (kind === 'hardware' || kind === 'headend' || kind === 'hardwareHeadend') {
      return [
        { key: 'ticket', label: 'Ticket', weight: 100, tone: 'violet' }
      ];
    }

    return this.getDefaultScoreDefinitions(departmentName);
  }

  private getDefaultScoreDefinitions(departmentName: string): DepartmentScoreDefinition[] {
    const weightage = this.getWeightageForDepartment(departmentName);
    const definitions: DepartmentScoreDefinition[] = [
      { key: 'task', label: 'Task', weight: weightage ? weightage.task : 25, tone: 'blue' },
      { key: 'release', label: 'Release', weight: weightage ? weightage.release : 20, tone: 'teal' },
      { key: 'releasePass', label: 'Release Pass', weight: weightage ? weightage.releasePass : null, tone: 'green' },
      { key: 'issue', label: 'Issue', weight: weightage ? weightage.issue : 15, tone: 'amber' },
      { key: 'ticket', label: 'Ticket', weight: weightage ? weightage.ticket : 5, tone: 'violet' },
      { key: 'dsr', label: 'DSR', weight: weightage ? weightage.dsr : 25, tone: 'rose' },
      { key: 'quality', label: 'Quality', weight: weightage ? weightage.quality : 10, tone: 'green' }
    ];
    const relevant = definitions.filter(definition =>
      definition.weight !== null || this.getScorePresenceForMetric(departmentName, definition.key)
    );

    return relevant.length ? relevant : definitions;
  }

  private getVisibleMetricKeySet(rows: PerformanceRow[]): Set<PerformanceMetricKey> {
    const metricKeys = new Set<PerformanceMetricKey>();
    const sourceRows = rows.length
      ? rows
      : [{ department_name: this.selectedDepartmentName } as PerformanceRow];

    sourceRows.forEach(row => {
      this.getDepartmentScoreDefinitions(row.department_name).forEach(definition => {
        metricKeys.add(definition.key);
      });
    });

    return metricKeys;
  }

  private getVisibleActivityKeySet(metricKeys: Set<PerformanceMetricKey>): Set<PerformanceTableSortColumn> {
    const activityKeys = new Set<PerformanceTableSortColumn>();

    if (metricKeys.has('task')) {
      activityKeys.add('tasks');
      activityKeys.add('workVolume');
    }

    if (metricKeys.has('issue')) {
      activityKeys.add('issues');
      activityKeys.add('workVolume');
    }

    if (metricKeys.has('ticket')) {
      activityKeys.add('tickets');
    }

    if (metricKeys.has('dsr')) {
      activityKeys.add('dsrDays');
    }

    return activityKeys;
  }

  private isMetricColumnKey(column: PerformanceTableSortColumn): column is PerformanceMetricKey {
    return ['task', 'release', 'releasePass', 'issue', 'ticket', 'dsr', 'quality'].includes(column);
  }

  private isWeightageMetricColumnKey(column: PerformanceWeightageSortColumn): column is PerformanceWeightageMetricKey {
    return column !== 'department' && column !== 'specialRule';
  }

  private getScoreForMetric(row: PerformanceRow, metric: PerformanceMetricKey): number | null {
    switch (metric) {
      case 'task':
        return row.task_score;
      case 'release':
        return row.release_score;
      case 'releasePass':
        return row.release_pass_score;
      case 'issue':
        return row.issue_score;
      case 'ticket':
        return row.ticket_score;
      case 'dsr':
        return row.dsr_score;
      case 'quality':
        return row.quality_score;
      default:
        return null;
    }
  }

  private getScorePresenceForMetric(departmentName: string, metric: PerformanceMetricKey): boolean {
    return this.rows.some(row =>
      this.valuesMatch(row.department_name, departmentName)
      && this.getScoreForMetric(row, metric) !== null
    );
  }

  private getWeightageMetricValue(row: PerformanceWeightageRow, metric: PerformanceWeightageMetricKey): number | null {
    switch (metric) {
      case 'task':
        return row.task;
      case 'release':
        return row.release;
      case 'releasePass':
        return row.releasePass;
      case 'releaseStatus':
        return row.releaseStatus;
      case 'onTimeRelease':
        return row.onTimeRelease;
      case 'sqaProject':
        return row.sqaProject;
      case 'qcTimeline':
        return row.qcTimeline;
      case 'issue':
        return row.issue;
      case 'ticket':
        return row.ticket;
      case 'client':
        return row.client;
      case 'dsr':
        return row.dsr;
      case 'modelCount':
        return row.modelCount;
      case 'quality':
        return row.quality;
      default:
        return null;
    }
  }

  private applyDepartmentScoreRules(rows: PerformanceRow[]): void {
    this.applyReleaseAndDsrScoreRules(rows);
    this.applyTicketScoreRules(rows);
    rows.forEach(row => this.refreshPerformanceLabel(row));
  }

  private applyReleaseAndDsrScoreRules(rows: PerformanceRow[]): void {
    rows.forEach(row => {
      const kind = this.getDepartmentPerformanceKind(row.department_name);
      if (kind !== 'ridappsSoftware' && kind !== 'sqa') {
        return;
      }

      row.release_score = row.release_score ?? this.getRatioScore(row.metrics.on_time_releases, row.metrics.total_releases);
      row.dsr_score = row.dsr_score ?? this.getRatioScore(row.metrics.dsr_days_submitted, row.metrics.dsr_days_required);

      if (kind === 'ridappsSoftware') {
        row.release_pass_score = row.release_pass_score
          ?? row.quality_score
          ?? this.getRatioScore(row.metrics.passed_releases, row.metrics.total_releases);
      }

      this.setWeightedFinalScore(row, this.getDepartmentScoreDefinitions(row.department_name));
    });
  }

  private applyTicketScoreRules(rows: PerformanceRow[]): void {
    const ticketRows = rows.filter(row => {
      const kind = this.getDepartmentPerformanceKind(row.department_name);
      return kind === 'hardware' || kind === 'headend' || kind === 'hardwareHeadend';
    });
    const rowsByDepartment = new Map<string, PerformanceRow[]>();

    ticketRows.forEach(row => {
      const key = this.normalizeLookupLabel(row.department_name) || 'ticket';
      rowsByDepartment.set(key, [...(rowsByDepartment.get(key) || []), row]);
    });

    rowsByDepartment.forEach(departmentRows => {
      const maxCount = Math.max(
        0,
        ...departmentRows
          .map(row => this.getTicketScoreBasis(row))
          .filter((value): value is number => value !== null && value > 0)
      );

      departmentRows.forEach(row => {
        const count = this.getTicketScoreBasis(row);
        if (row.ticket_score === null && count !== null && maxCount > 0) {
          row.ticket_score = Number(((count / maxCount) * 100).toFixed(2));
        }

        if (row.final_score === null && row.ticket_score !== null) {
          row.final_score = row.ticket_score;
        }
      });
    });
  }

  private setWeightedFinalScore(row: PerformanceRow, definitions: DepartmentScoreDefinition[]): void {
    // The API's final_score is authoritative. Department rules only provide a
    // fallback for older responses that do not include a final score.
    if (row.final_score !== null) {
      return;
    }

    const scoredDefinitions = definitions.filter(definition =>
      definition.weight !== null && this.getScoreForMetric(row, definition.key) !== null
    );
    const expectedWeight = definitions.reduce((total, definition) => total + (definition.weight ?? 0), 0);
    const scoredWeight = scoredDefinitions.reduce((total, definition) => total + (definition.weight ?? 0), 0);

    if (!scoredDefinitions.length || expectedWeight <= 0 || scoredWeight < expectedWeight) {
      return;
    }

    const weightedScore = scoredDefinitions.reduce((total, definition) => {
      const score = this.getScoreForMetric(row, definition.key) ?? 0;
      return total + (score * ((definition.weight ?? 0) / expectedWeight));
    }, 0);

    row.final_score = Number(weightedScore.toFixed(2));
  }

  private getTicketCount(row: PerformanceRow): number | null {
    return row.metrics.support_ticket_count
      ?? row.metrics.assigned_tickets
      ?? row.metrics.self_tickets;
  }

  private getTicketScoreBasis(row: PerformanceRow): number | null {
    const kind = this.getDepartmentPerformanceKind(row.department_name);

    if (kind === 'headend') {
      return row.metrics.support_ticket_count
        ?? row.metrics.assigned_tickets
        ?? row.metrics.total_work_volume;
    }

    if (kind === 'hardware') {
      return row.metrics.model_count
        ?? row.metrics.assigned_tickets
        ?? row.metrics.total_work_volume;
    }

    return row.metrics.model_count
      ?? row.metrics.support_ticket_count
      ?? row.metrics.assigned_tickets
      ?? row.metrics.total_work_volume;
  }

  private getRatioScore(numerator: number | null, denominator: number | null): number | null {
    if (numerator === null || denominator === null || denominator <= 0) {
      return null;
    }

    return Number(this.toPercent((numerator / denominator) * 100).toFixed(2));
  }

  private refreshPerformanceLabel(row: PerformanceRow): void {
    if (row.final_score === null) {
      row.performance = '-';
      row.performance_status = '';
      return;
    }

    const performanceStatus = this.getPerformanceStatus(row.final_score);
    row.performance_status = performanceStatus;
    row.performance = `${this.formatScore(row.final_score)} - ${performanceStatus}`;
  }

  private rankRows(rows: PerformanceRow[]): PerformanceRow[] {
    rows.forEach((row, index) => {
      row.rank = index + 1;
    });

    return rows;
  }

  private rebuildWeightageTable(): void {
    const searchTerm = this.normalizeTableSearch(this.weightageSearchTerm);
    const sourceRows = searchTerm
      ? this.weightageRows.filter(row => this.matchesWeightageSearch(row, searchTerm))
      : [...this.weightageRows];

    this.filteredWeightageRows = sourceRows.sort((first, second) => this.compareWeightageRows(first, second));
    this.weightageTotalPages = Math.max(1, Math.ceil(this.filteredWeightageRows.length / this.weightagePageSize));
    this.weightagePageIndex = Math.max(0, Math.min(this.weightagePageIndex, this.weightageTotalPages - 1));

    const startIndex = this.weightagePageIndex * this.weightagePageSize;
    this.pagedWeightageRows = this.filteredWeightageRows.slice(startIndex, startIndex + this.weightagePageSize);
    this.weightageShowingFrom = this.filteredWeightageRows.length ? startIndex + 1 : 0;
    this.weightageShowingTo = this.filteredWeightageRows.length
      ? Math.min(startIndex + this.weightagePageSize, this.filteredWeightageRows.length)
      : 0;
    this.weightagePageNumbers = this.buildWeightagePageNumbers();
  }

  private matchesWeightageSearch(row: PerformanceWeightageRow, searchTerm: string): boolean {
    const searchableValues = this.weightageColumns.map(column => this.getWeightageValue(row, column.key));

    return searchableValues.some(value => this.normalizeTableSearch(value).includes(searchTerm));
  }

  private compareWeightageRows(first: PerformanceWeightageRow, second: PerformanceWeightageRow): number {
    const direction = this.weightageSortDirection === 'asc' ? 1 : -1;
    const comparison = this.compareSortValues(
      this.getWeightageSortValue(first),
      this.getWeightageSortValue(second),
      direction
    );

    if (comparison !== 0) {
      return comparison;
    }

    return first.department.localeCompare(second.department, undefined, { numeric: true, sensitivity: 'base' });
  }

  private getWeightageSortValue(row: PerformanceWeightageRow): PerformanceSortValue {
    switch (this.weightageSortColumn) {
      case 'specialRule':
        return row.specialRule;
      case 'department':
        return row.department;
      default:
        return this.getWeightageMetricValue(row, this.weightageSortColumn);
    }
  }

  private buildWeightagePageNumbers(): number[] {
    return buildTablePageNumbers(this.weightageTotalPages, this.weightagePageIndex + 1);
  }

  private rebuildNotEligibleTable(): void {
    const searchTerm = this.normalizeTableSearch(this.notEligibleSearchTerm);
    const sourceRows = searchTerm
      ? this.notEligibleRows.filter(row => this.matchesNotEligibleSearch(row, searchTerm))
      : [...this.notEligibleRows];

    this.filteredNotEligibleRows = sourceRows.sort((first, second) => this.compareNotEligibleRows(first, second));
    this.notEligibleTotalPages = Math.max(1, Math.ceil(this.filteredNotEligibleRows.length / this.notEligiblePageSize));
    this.notEligiblePageIndex = Math.max(0, Math.min(this.notEligiblePageIndex, this.notEligibleTotalPages - 1));

    const startIndex = this.notEligiblePageIndex * this.notEligiblePageSize;
    this.pagedNotEligibleRows = this.filteredNotEligibleRows.slice(startIndex, startIndex + this.notEligiblePageSize);
    if (this.selectedPerformanceEmployee?.eligible === false
      && !this.pagedNotEligibleRows.some(row => row.uid === this.selectedPerformanceEmployee?.uid)) {
      this.selectedPerformanceEmployee = null;
    }
    this.notEligibleShowingFrom = this.filteredNotEligibleRows.length ? startIndex + 1 : 0;
    this.notEligibleShowingTo = this.filteredNotEligibleRows.length
      ? Math.min(startIndex + this.notEligiblePageSize, this.filteredNotEligibleRows.length)
      : 0;
    this.notEligiblePageNumbers = this.buildNotEligiblePageNumbers();
  }

  private matchesNotEligibleSearch(row: PerformanceRow, searchTerm: string): boolean {
    const searchableValues = [
      row.employee_name,
      row.employee_id,
      row.department_name,
      this.formatScore(row.final_score),
      this.formatScore(row.dsr_score),
      this.getDsrDaysLabel(row),
      this.getEligibilityReason(row),
      this.formatScore(row.task_score),
      this.formatScore(row.release_score),
      this.formatScore(row.release_status_score),
      this.formatScore(row.release_pass_score),
      this.formatScore(row.issue_score),
      this.formatScore(row.ticket_score),
      this.formatScore(row.quality_score),
      this.formatScore(row.client_score),
      this.formatMetricNumber(row.metrics.total_work_volume),
      this.formatMetricNumber(row.metrics.assigned_tasks),
      this.formatMetricNumber(row.metrics.assigned_issues),
      this.formatMetricNumber(row.metrics.assigned_tickets),
      this.formatMetricNumber(row.metrics.support_ticket_count),
      this.formatMetricNumber(row.metrics.model_count),
      this.formatMetricNumber(row.metrics.completed_tasks),
      this.formatMetricNumber(row.metrics.total_releases),
      this.formatMetricNumber(row.metrics.passed_releases),
      this.formatMetricNumber(row.metrics.failed_releases),
      this.formatMetricNumber(row.metrics.on_time_releases),
      this.formatMetricNumber(row.metrics.dsr_days_required),
      this.formatMetricNumber(row.metrics.dsr_days_submitted),
      this.formatMetricNumber(row.metrics.dsr_on_time_days),
      this.formatMetricNumber(row.metrics.dsr_late_days),
      this.formatMetricNumber(row.metrics.self_tickets),
      this.formatMetricNumber(row.metrics.handled_clients),
      this.formatMetricNumber(row.metrics.closed_tickets),
      this.formatMetricNumber(row.metrics.pending_tickets),
      this.formatWeight(row.score_weights.ticket),
      this.formatWeight(row.score_weights.client),
      this.formatWeight(row.score_weights.release),
      this.formatWeight(row.score_weights.dsr),
      this.formatWeight(row.score_weights.release_status),
      ...this.getEligibilityReasonLabels(row)
    ];

    return searchableValues.some(value => this.normalizeTableSearch(value).includes(searchTerm));
  }

  private compareNotEligibleRows(first: PerformanceRow, second: PerformanceRow): number {
    const direction = this.notEligibleSortDirection === 'asc' ? 1 : -1;
    const comparison = this.compareSortValues(
      this.getNotEligibleSortValue(first),
      this.getNotEligibleSortValue(second),
      direction
    );

    if (comparison !== 0) {
      return comparison;
    }

    return first.employee_name.localeCompare(second.employee_name, undefined, { numeric: true, sensitivity: 'base' });
  }

  private getNotEligibleSortValue(row: PerformanceRow): PerformanceSortValue {
    switch (this.notEligibleSortColumn) {
      case 'index':
        return this.notEligibleRows.findIndex(item => item.uid === row.uid) + 1;
      case 'employee':
        return row.employee_name || row.employee_id || '';
      case 'final':
        return row.final_score;
      case 'dsr':
        return row.dsr_score;
      case 'dsrDays':
        return row.metrics.dsr_days_submitted;
      case 'reason':
        return this.getEligibilityReason(row);
      case 'task':
        return row.task_score;
      case 'release':
        return row.release_score;
      case 'releasePass':
        return row.release_pass_score;
      case 'releaseStatus':
        return row.release_status_score;
      case 'onTimeRelease':
        return row.on_time_release_score ?? this.getOnTimeReleaseScore(row);
      case 'sqaProject':
      case 'qcTimeline':
        return null;
      case 'issue':
        return row.issue_score;
      case 'ticket':
        return row.ticket_score;
      case 'client':
        return row.client_score;
      case 'modelCount':
        return row.metrics.model_count;
      case 'quality':
        return row.quality_score;
      case 'workVolume':
        return row.metrics.total_work_volume;
      case 'tasks':
        return row.metrics.assigned_tasks;
      case 'issues':
        return row.metrics.assigned_issues;
      case 'tickets':
        return this.getTicketCount(row);
      default:
        return '';
    }
  }

  private compareSortValues(firstValue: PerformanceSortValue, secondValue: PerformanceSortValue, direction: 1 | -1): number {
    const firstEmpty = firstValue === null || firstValue === '';
    const secondEmpty = secondValue === null || secondValue === '';

    if (firstEmpty && secondEmpty) {
      return 0;
    }

    if (firstEmpty) {
      return 1;
    }

    if (secondEmpty) {
      return -1;
    }

    if (typeof firstValue === 'number' && typeof secondValue === 'number') {
      return (firstValue - secondValue) * direction;
    }

    return String(firstValue).localeCompare(String(secondValue), undefined, {
      numeric: true,
      sensitivity: 'base'
    }) * direction;
  }

  private buildNotEligiblePageNumbers(): number[] {
    return buildTablePageNumbers(this.notEligibleTotalPages, this.notEligiblePageIndex + 1);
  }

  private mapPerformanceReport(response: unknown, requestFromDate: string, requestToDate: string): PerformanceReportState {
    const payload = this.unwrapPayload(response);
    const responseRecord = this.asRecord(payload);
    const responseFromDate = this.getStringValue(responseRecord, ['fromdate', 'from_date', 'start_date']) || requestFromDate;
    const responseToDate = this.getStringValue(responseRecord, ['todate', 'to_date', 'end_date']) || requestToDate;
    const configuredWeightageRows = this.extractWeightageRows(payload);
    const rawWinnerGroups = this.extractDepartmentWinnerGroups(payload, responseFromDate, responseToDate);
    const explicitOverallTopWinners = this.extractOverallTopRows(payload, responseFromDate, responseToDate);
    const notEligibleRows = this.extractNotEligibleRows(payload, responseFromDate, responseToDate);
    this.applyDepartmentScoreRules([
      ...rawWinnerGroups.flatMap(group => group.rows),
      ...explicitOverallTopWinners
    ]);

    const winnerGroups = rawWinnerGroups.map(group => ({
      departmentName: group.departmentName,
      rows: this.rankRows(this.sortRowsByFinalScore(group.rows))
    }));
    const departmentWinnerRows = winnerGroups.flatMap(group => group.rows);
    const overallTopWinners = explicitOverallTopWinners.length
      ? this.rankRows(this.sortRowsByFinalScore(explicitOverallTopWinners).slice(0, this.top))
      : this.sortRowsByFinalScore(departmentWinnerRows).slice(0, this.top);
    const rows = this.mergeRows([...departmentWinnerRows, ...overallTopWinners, ...notEligibleRows]);
    const weightageRows = configuredWeightageRows.length
      ? configuredWeightageRows
      : this.extractWeightageRowsFromPerformanceRows(rows);
    const summary = this.extractSummary(payload, rows, notEligibleRows);

    return {
      winnerGroups,
      overallTopWinners,
      notEligibleRows,
      weightageRows,
      summary,
      rows,
      fromdate: responseFromDate,
      todate: responseToDate
    };
  }

  private extractDepartmentWinnerGroups(payload: unknown, fromdate: string, todate: string): WinnerGroup[] {
    const record = this.asRecord(payload);
    const departmentWiseWinners = record?.['department_wise_winners'] ?? record?.['departmentWiseWinners'];

    if (Array.isArray(departmentWiseWinners)) {
      const mappedRows = departmentWiseWinners.flatMap((item, index) => {
        const itemRecord = this.asRecord(item);
        const groupedRows = itemRecord
          ? this.getArrayByKeys(itemRecord, ['winners', 'employees', 'rows', 'records', 'list', 'top_winners', 'topWinners'])
          : [];

        if (groupedRows.length && itemRecord) {
          const groupName = this.getStringValue(itemRecord, ['department_name', 'departmentName', 'department', 'name', 'title'])
            || this.getSelectedDepartmentName();

          return groupedRows.map((row, rowIndex) => this.mapWinnerRow(row, rowIndex, fromdate, todate, true, groupName));
        }

        return [this.mapWinnerRow(item, index, fromdate, todate, true, this.getSelectedDepartmentName())];
      });

      return this.groupRowsByDepartment(mappedRows);
    }

    if (departmentWiseWinners && typeof departmentWiseWinners === 'object') {
      return Object.entries(departmentWiseWinners as Record<string, unknown>)
        .map(([departmentName, value]) => {
          const valueRecord = this.asRecord(value);
          const rows = this.rowsFromGroupValue(value).map((winner, index) =>
            this.mapWinnerRow(winner, index, fromdate, todate, true, this.resolveDepartmentGroupName(departmentName, valueRecord))
          );

          return {
            departmentName: this.resolveDepartmentGroupName(departmentName, valueRecord),
            rows
          };
        })
        .filter(group => group.rows.length);
    }

    const winners = this.extractWinnerRows(payload);
    const mappedRows = winners.map((winner, index) =>
      this.mapWinnerRow(winner, index, fromdate, todate, true, this.getSelectedDepartmentName())
    );

    return this.groupRowsByDepartment(mappedRows);
  }

  private extractOverallTopRows(payload: unknown, fromdate: string, todate: string): PerformanceRow[] {
    const record = this.asRecord(payload);
    const rows = this.getArrayByKeys(record, [
      'overall_top_winners',
      'overallTopWinners',
      'top_winners',
      'topWinners',
      'overall_winners',
      'overallWinners'
    ]);

    return rows.map((row, index) => this.mapWinnerRow(row, index, fromdate, todate, true, ''));
  }

  private extractNotEligibleRows(payload: unknown, fromdate: string, todate: string): PerformanceRow[] {
    const record = this.asRecord(payload);
    const rows = this.getArrayByKeys(record, [
      'not_eligible_employees',
      'notEligibleEmployees',
      'not_eligible',
      'notEligible',
      'ineligible_employees',
      'ineligibleEmployees',
      'rejected_employees',
      'rejectedEmployees'
    ]);

    return rows.map((row, index) => this.mapWinnerRow(row, index, fromdate, todate, false, this.getSelectedDepartmentName()));
  }

  private extractWinnerRows(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    const record = this.asRecord(payload);
    return this.getArrayByKeys(record, [
      'employees',
      'bestEmployees',
      'best_employees',
      'records',
      'rows',
      'list',
      'winners',
      'department_winners',
      'departmentWinners'
    ]);
  }

  private rowsFromGroupValue(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    const record = this.asRecord(value);
    if (record) {
      const rows = this.getArrayByKeys(record, ['winners', 'employees', 'rows', 'records', 'list', 'top_winners', 'topWinners']);
      if (rows.length) {
        return rows;
      }
    }

    return value ? [value] : [];
  }

  private mapWinnerRow(
    winner: unknown,
    index: number,
    fromdate: string,
    todate: string,
    fallbackEligible: boolean | null,
    fallbackDepartmentName: string
  ): PerformanceRow {
    const record = this.asRecord(winner) || {};
    const scores = this.asRecord(record['scores'])
      || this.asRecord(record['score'])
      || this.asRecord(record['score_breakdown'])
      || this.asRecord(record['scoreBreakdown'])
      || {};
    const metrics = this.asRecord(record['metrics'])
      || this.asRecord(record['key_metrics'])
      || this.asRecord(record['keyMetrics'])
      || {};
    const dsrMetrics = this.asRecord(metrics['dsr_attendance'])
      || this.asRecord(metrics['dsrAttendance'])
      || this.asRecord(metrics['attendance'])
      || this.asRecord(record['dsr_attendance'])
      || this.asRecord(record['dsrAttendance'])
      || this.asRecord(record['attendance'])
      || {};
    const scoreWeights = this.asRecord(scores['weights'])
      || this.asRecord(record['weights'])
      || this.asRecord(record['score_weights'])
      || this.asRecord(record['scoreWeights'])
      || {};
    const finalScore = this.getNumberFromSources([record, scores], [
      'final_score',
      'finalScore',
      'score',
      'total_score',
      'totalScore',
      'performance_score',
      'performanceScore'
    ]);
    const dsrScore = this.getNumberFromSources([scores, record], [
      'dsr_score',
      'dsrScore',
      'dsr',
      'dsr_percentage',
      'dsrPercentage'
    ]);
    const releasePassScore = this.getNumberFromSources([scores, record], [
      'release_pass_score',
      'releasePassScore',
      'release_pass',
      'releasePass',
      'passed_release_score',
      'passedReleaseScore',
      'passed_release',
      'passedRelease',
      'pass_score',
      'passScore'
    ]);
    const qualityScore = this.getNumberFromSources([scores, record], ['quality_score', 'qualityScore', 'quality']);
    const performanceStatus = finalScore === null ? '' : this.getPerformanceStatus(finalScore);
    const performanceScore = this.formatScore(finalScore);
    const employeeName = this.getEmployeeName(record);
    const employeeId = this.getStringValue(record, [
      'employee_id',
      'employeeId',
      'employeeid',
      'emp_id',
      'empId',
      'empid',
      'user_id',
      'userId',
      'id'
    ]);
    const departmentName = this.getStringValue(record, [
      'department_name',
      'departmentName',
      'department',
      'dept_name',
      'deptName',
      'category'
    ]) || fallbackDepartmentName || this.getSelectedDepartmentName();
    const reason = this.getStringValue(record, [
      'reason',
      'eligibility_reason',
      'eligibilityReason',
      'not_eligible_reason',
      'notEligibleReason',
      'remarks',
      'remark'
    ]);
    const eligibilityReasons = this.getStringArrayValue(record, [
      'eligibility_reasons',
      'eligibilityReasons',
      'not_eligible_reasons',
      'notEligibleReasons'
    ]);
    const explicitEligible = this.getBooleanValue(record, [
      'eligible',
      'is_eligible',
      'isEligible',
      'eligibility',
      'eligible_status',
      'eligibleStatus'
    ]);
    const eligible = explicitEligible !== null
      ? explicitEligible
      : fallbackEligible !== null
        ? fallbackEligible
        : reason || eligibilityReasons.length
          ? false
          : null;

    return {
      uid: this.buildRowUid(employeeId, employeeName, departmentName, index, fromdate, todate),
      rank: this.getNumberFromSources([record], ['rank', 'position', 'top']) ?? index + 1,
      attendance_id: this.getStringValue(record, ['attendance_id', 'attendanceId', 'attendanceid']) || '',
      employee_id: employeeId,
      employee_name: employeeName || '-',
      department_name: departmentName || '-',
      performance: finalScore === null ? '-' : `${performanceScore} - ${performanceStatus}`,
      performance_status: performanceStatus,
      final_score: finalScore,
      dsr_score: dsrScore,
      task_score: this.getNumberFromSources([scores, record], ['task_score', 'taskScore', 'task']),
      release_score: this.getNumberFromSources([scores, record], ['release_score', 'releaseScore', 'release']),
      release_status_score: this.getNumberFromSources([scores, record], ['release_status_score', 'releaseStatusScore', 'release_status', 'releaseStatus']),
      on_time_release_score: this.getNumberFromSources([scores, record], ['on_time_release_score', 'onTimeReleaseScore', 'on_time_release', 'onTimeRelease']),
      sqa_project_score: this.getNumberFromSources([scores, record], ['sqa_project_score', 'sqaProjectScore', 'sqa_project', 'sqaProject']),
      qc_timeline_score: this.getNumberFromSources([scores, record], ['qc_timeline_score', 'qcTimelineScore', 'qc_timeline', 'qcTimeline']),
      release_pass_score: releasePassScore ?? qualityScore,
      issue_score: this.getNumberFromSources([scores, record], ['issue_score', 'issueScore', 'issue']),
      ticket_score: this.getNumberFromSources([scores, record], ['ticket_score', 'ticketScore', 'ticket', 'tickets_score', 'ticketsScore']),
      quality_score: qualityScore,
      client_score: this.getNumberFromSources([scores, record], ['client_score', 'clientScore', 'client']),
      fromdate: this.getStringValue(record, ['fromdate', 'from_date']) || fromdate,
      todate: this.getStringValue(record, ['todate', 'to_date']) || todate,
      eligible,
      reason,
      eligibility_reasons: eligibilityReasons,
      score_weights: {
        task: this.getNumberFromSources([scoreWeights], ['task', 'task_weight', 'taskWeight']),
        release: this.getNumberFromSources([scoreWeights], ['release', 'release_weight', 'releaseWeight']),
        release_pass: this.getNumberFromSources([scoreWeights], ['release_pass', 'releasePass', 'release_pass_weight', 'releasePassWeight']),
        dsr: this.getNumberFromSources([scoreWeights], ['dsr', 'dsr_weight', 'dsrWeight']),
        release_status: this.getNumberFromSources([scoreWeights], ['release_status', 'releaseStatus', 'release_status_weight', 'releaseStatusWeight']),
        on_time_release: this.getNumberFromSources([scoreWeights], ['on_time_release', 'onTimeRelease', 'on_time_release_weight', 'onTimeReleaseWeight']),
        sqa_project: this.getNumberFromSources([scoreWeights], ['sqa_project', 'sqaProject', 'sqa_project_weight', 'sqaProjectWeight']),
        qc_timeline: this.getNumberFromSources([scoreWeights], ['qc_timeline', 'qcTimeline', 'qc_timeline_weight', 'qcTimelineWeight']),
        model_count: this.getNumberFromSources([scoreWeights], ['model_count', 'modelCount', 'model_count_weight', 'modelCountWeight']),
        issue: this.getNumberFromSources([scoreWeights], ['issue', 'issue_weight', 'issueWeight']),
        ticket: this.getNumberFromSources([scoreWeights], ['ticket', 'ticket_weight', 'ticketWeight']),
        quality: this.getNumberFromSources([scoreWeights], ['quality', 'quality_weight', 'qualityWeight']),
        client: this.getNumberFromSources([scoreWeights], ['client', 'client_weight', 'clientWeight'])
      },
      avatar_url: this.getStringValue(record, ['avatar_url', 'avatarUrl', 'photo', 'photo_url', 'image', 'profile_image']),
      metrics: {
        total_work_volume: this.getNumberFromSources([metrics, record], ['total_work_volume', 'totalWorkVolume', 'work_volume', 'workVolume', 'workload', 'work_load']),
        assigned_tasks: this.getNumberFromSources([metrics, record], ['assigned_tasks', 'assignedTasks', 'tasks_assigned', 'tasksAssigned', 'task_count', 'taskCount']),
        completed_tasks: this.getNumberFromSources([metrics, record], ['completed_tasks', 'completedTasks', 'tasks_completed', 'tasksCompleted', 'completed_task_count']),
        closed_tasks: this.getNumberFromSources([metrics, record], ['closed_tasks', 'closedTasks']),
        assigned_issues: this.getNumberFromSources([metrics, record], ['assigned_issues', 'assignedIssues', 'issues_assigned', 'issuesAssigned', 'issue_count', 'issueCount']),
        closed_issues: this.getNumberFromSources([metrics, record], ['closed_issues', 'closedIssues']),
        assigned_tickets: this.getNumberFromSources([metrics, record], ['assigned_tickets', 'assignedTickets', 'tickets_assigned', 'ticketsAssigned', 'ticket_count', 'ticketCount']),
        support_ticket_count: this.getNumberFromSources([metrics, record], [
          'support_ticket_count',
          'supportTicketCount',
          'client_support_ticket_count',
          'clientSupportTicketCount',
          'self_ticket_count',
          'selfTicketCount',
          'client_ticket_count',
          'clientTicketCount',
          'support_count',
          'supportCount'
        ]),
        model_count: this.getNumberFromSources([metrics, record], [
          'model_count',
          'modelCount',
          'client_model_count',
          'clientModelCount',
          'hardware_model_count',
          'hardwareModelCount',
          'stb_count',
          'stbCount',
          'count'
        ]),
        total_releases: this.getNumberFromSources([metrics, record], [
          'total_releases',
          'totalReleases',
          'release_count',
          'releaseCount',
          'releases_count',
          'releasesCount'
        ]),
        on_time_releases: this.getNumberFromSources([metrics, record], [
          'on_time_releases',
          'onTimeReleases',
          'ontime_releases',
          'ontimeReleases',
          'on_time_release_count',
          'onTimeReleaseCount',
          'testing_on_time_releases',
          'testingOnTimeReleases',
          'testing_release_count',
          'testingReleaseCount'
        ]),
        passed_releases: this.getNumberFromSources([metrics, record], [
          'passed_releases',
          'passedReleases',
          'pass_releases',
          'passReleases',
          'passed_release_count',
          'passedReleaseCount',
          'release_pass_count',
          'releasePassCount'
        ]),
        failed_releases: this.getNumberFromSources([metrics, record], ['failed_releases', 'failedReleases', 'failed_release_count', 'failedReleaseCount']),
        dsr_days_submitted: this.getNumberFromSources([metrics, dsrMetrics, record], ['dsr_days_submitted', 'dsrDaysSubmitted', 'dsr_submitted_days', 'dsrSubmittedDays', 'dsr_days', 'dsrDays', 'submitted_dsr_days', 'submittedDsrDays', 'submitted_days', 'submittedDays']),
        dsr_days_required: this.getNumberFromSources([metrics, record], ['dsr_days_required', 'dsrDaysRequired', 'required_dsr_days', 'requiredDsrDays', 'required_working_days', 'requiredWorkingDays', 'working_days', 'workingDays']),
        total_working_days: this.getNumberFromSources([metrics, record], ['total_working_days', 'totalWorkingDays']),
        dsr_on_time_days: this.getNumberFromSources([metrics, dsrMetrics, record], ['dsr_on_time_days', 'dsrOnTimeDays', 'on_time_dsr_days', 'onTimeDsrDays', 'on_time_days', 'onTimeDays']),
        dsr_late_days: this.getNumberFromSources([metrics, dsrMetrics, record], ['dsr_late_days', 'dsrLateDays', 'late_dsr_days', 'lateDsrDays', 'late_days', 'lateDays']),
        dsr_missing_days: this.getNumberFromSources([metrics, dsrMetrics, record], ['dsr_missing_days', 'dsrMissingDays', 'missing_dsr_days', 'missingDsrDays', 'missing_days', 'missingDays']),
        present_days: this.getNumberFromSources([metrics, record], ['present_days', 'presentDays']),
        absent_days: this.getNumberFromSources([metrics, record], ['absent_days', 'absentDays']),
        closed_dsr: this.getNumberFromSources([metrics, dsrMetrics, record], ['closed_dsr', 'closedDsr', 'closed_dsr_count', 'closedDsrCount']),
        self_tickets: this.getNumberFromSources([metrics, record], ['self_tickets', 'selfTickets', 'self_ticket_count', 'selfTicketCount']),
        closed_tickets_in_range: this.getNumberFromSources([metrics, record], ['closed_tickets_in_range', 'closedTicketsInRange']),
        department_max_model_count: this.getNumberFromSources([metrics, record], ['department_max_model_count', 'departmentMaxModelCount']),
        closed_self_tickets: this.getNumberFromSources([metrics, record], ['closed_self_tickets', 'closedSelfTickets']),
        department_max_self_tickets: this.getNumberFromSources([metrics, record], ['department_max_self_tickets', 'departmentMaxSelfTickets']),
        handled_clients: this.getNumberFromSources([metrics, record], ['handled_clients', 'handledClients', 'client_count', 'clientCount']),
        department_max_handled_clients: this.getNumberFromSources([metrics, record], ['department_max_handled_clients', 'departmentMaxHandledClients']),
        closed_tickets: this.getNumberFromSources([metrics, record], ['closed_tickets', 'closedTickets', 'completed_tickets', 'completedTickets']),
        pending_tickets: this.getNumberFromSources([metrics, record], ['pending_tickets', 'pendingTickets', 'open_tickets', 'openTickets'])
      }
    };
  }

  private extractWeightageRows(payload: unknown): PerformanceWeightageRow[] {
    const record = this.asRecord(payload);
    const directRows = this.getArrayByKeys(record, [
      'department_weightage_configuration',
      'departmentWeightageConfiguration',
      'weightage_configuration',
      'weightageConfiguration',
      'weightages',
      'weightage',
      'department_weightage',
      'departmentWeightage'
    ]);

    if (directRows.length) {
      return this.normalizeWeightageDisplayRows(
        directRows
          .map((row, index) => this.normalizeWeightageRow(row, index, ''))
          .filter((row): row is PerformanceWeightageRow => !!row)
      );
    }

    const objectValue = record?.['department_weightage_configuration']
      ?? record?.['departmentWeightageConfiguration']
      ?? record?.['weightage_configuration']
      ?? record?.['weightageConfiguration']
      ?? record?.['weights'];

    if (objectValue && typeof objectValue === 'object' && !Array.isArray(objectValue)) {
      return this.normalizeWeightageDisplayRows(
        Object.entries(objectValue as Record<string, unknown>)
          .map(([departmentName, value], index) => this.normalizeWeightageRow(value, index, departmentName))
          .filter((row): row is PerformanceWeightageRow => !!row)
      );
    }

    return [];
  }

  private extractWeightageRowsFromPerformanceRows(rows: PerformanceRow[]): PerformanceWeightageRow[] {
    const departmentRows = new Map<string, PerformanceWeightageRow>();

    rows.forEach(row => {
      const department = row.department_name?.trim();
      const departmentKey = this.normalizeLookupLabel(department);
      if (!department || department === '-' || !departmentKey) {
        return;
      }

      const weights = row.score_weights;
      const values = [weights.task, weights.release, weights.release_pass, weights.release_status, weights.issue, weights.ticket, weights.dsr, weights.quality, weights.client];
      if (values.every(value => value === null)) {
        return;
      }

      const existing = departmentRows.get(departmentKey) || {
        department, task: null, release: null, releasePass: null, releaseStatus: null,
        onTimeRelease: null, sqaProject: null, qcTimeline: null, issue: null,
        ticket: null, client: null, dsr: null, modelCount: null, quality: null,
        specialRule: '-', icon: 'ri-building-2-line'
      };

      departmentRows.set(departmentKey, {
        ...existing,
        task: existing.task ?? weights.task,
        release: existing.release ?? weights.release,
        releasePass: existing.releasePass ?? weights.release_pass,
        releaseStatus: existing.releaseStatus ?? weights.release_status,
        issue: existing.issue ?? weights.issue,
        ticket: existing.ticket ?? weights.ticket,
        dsr: existing.dsr ?? weights.dsr,
        quality: existing.quality ?? weights.quality,
        client: existing.client ?? weights.client
      });
    });

    return [...departmentRows.values()];
  }

  private normalizeWeightageRow(value: unknown, index: number, fallbackDepartment: string): PerformanceWeightageRow | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const department = this.getStringValue(record, [
      'department',
      'department_name',
      'departmentName',
      'category',
      'name',
      'title'
    ]) || fallbackDepartment || `Department ${index + 1}`;

    const releasePass = this.getWeightNumber(record, [
      'release_pass',
      'releasePass',
      'release_pass_score',
      'releasePassScore',
      'passed_release',
      'passedRelease',
      'passed_release_score',
      'passedReleaseScore',
      'release_pass_percent',
      'releasePassPercent',
      'release_pass_percentage',
      'releasePassPercentage'
    ]);
    const quality = this.getWeightNumber(record, ['quality', 'quality_score', 'qualityScore', 'quality_percent', 'qualityPercent', 'quality_percentage', 'qualityPercentage']);

    return {
      department,
      task: this.getWeightNumber(record, ['task', 'task_score', 'taskScore', 'task_percent', 'taskPercent', 'task_percentage', 'taskPercentage']),
      release: this.getWeightNumber(record, ['release', 'release_score', 'releaseScore', 'release_percent', 'releasePercent', 'release_percentage', 'releasePercentage']),
      releasePass,
      releaseStatus: this.getWeightNumber(record, [
        'release_status',
        'releaseStatus',
        'release_status_weight',
        'releaseStatusWeight'
      ]),
      onTimeRelease: this.getWeightNumber(record, [
        'on_time_release',
        'onTimeRelease',
        'ontime_release',
        'ontimeRelease',
        'on_time_release_weight',
        'onTimeReleaseWeight'
      ]),
      sqaProject: this.getWeightNumber(record, ['sqa_project', 'sqaProject', 'sqa_project_weight', 'sqaProjectWeight']),
      qcTimeline: this.getWeightNumber(record, ['qc_timeline', 'qcTimeline', 'qc_timeline_weight', 'qcTimelineWeight']),
      issue: this.getWeightNumber(record, ['issue', 'issue_score', 'issueScore', 'issue_percent', 'issuePercent', 'issue_percentage', 'issuePercentage']),
      ticket: this.getWeightNumber(record, ['ticket', 'ticket_score', 'ticketScore', 'ticket_percent', 'ticketPercent', 'ticket_percentage', 'ticketPercentage']),
      client: this.getWeightNumber(record, ['client', 'client_support', 'clientSupport', 'client_weight', 'clientWeight']),
      dsr: this.getWeightNumber(record, ['dsr', 'dsr_score', 'dsrScore', 'dsr_percent', 'dsrPercent', 'dsr_percentage', 'dsrPercentage']),
      modelCount: this.getWeightNumber(record, ['model_count', 'modelCount', 'model_count_weight', 'modelCountWeight']),
      quality,
      specialRule: this.getStringValue(record, ['special_rule', 'specialRule', 'rule', 'remarks', 'remark']) || '-',
      icon: this.getStringValue(record, ['icon']) || 'ri-building-2-line'
    };
  }

  private normalizeWeightageDisplayRows(rows: PerformanceWeightageRow[]): PerformanceWeightageRow[] {
    return rows
      .filter(row => this.normalizeLookupLabel(row.department) !== 'default')
      .map(row => ({
        ...row,
        department: row.department.replace(/\s*\/\s*default\s*$/i, '').trim()
      }));
  }

  private extractSummary(payload: unknown, rows: PerformanceRow[], notEligibleRows: PerformanceRow[]): PerformanceSummary {
    const record = this.asRecord(payload);
    const summaryRecord = this.asRecord(record?.['summary'])
      || this.asRecord(record?.['summary_overview'])
      || this.asRecord(record?.['summaryOverview'])
      || this.asRecord(record?.['overview'])
      || record
      || {};
    const totalFromApi = this.getNumericOrCount(summaryRecord, [
      'total_employees_evaluated',
      'totalEmployeesEvaluated',
      'total_employees',
      'totalEmployees',
      'employee_count',
      'employeeCount',
      'total'
    ]);
    const eligibleFromApi = this.getNumericOrCount(summaryRecord, [
      'eligible_employees',
      'eligibleEmployees',
      'eligible_count',
      'eligibleCount'
    ]);
    const notEligibleFromApi = this.getNumericOrCount(summaryRecord, [
      'not_eligible_employees',
      'notEligibleEmployees',
      'not_eligible_count',
      'notEligibleCount',
      'ineligible_employees',
      'ineligibleEmployees',
      'ineligible_count',
      'ineligibleCount'
    ]);
    const totalEmployeesEvaluated = totalFromApi ?? rows.length;
    const eligibleEmployees = eligibleFromApi ?? rows.filter(row => row.eligible !== false).length;
    const notEligibleEmployees = notEligibleFromApi ?? (notEligibleRows.length || Math.max(totalEmployeesEvaluated - eligibleEmployees, 0));
    const percentageFromApi = this.getNumberFromSources([summaryRecord], [
      'eligibility_percentage',
      'eligibilityPercentage',
      'eligible_percentage',
      'eligiblePercentage'
    ]);
    const eligibilityPercentage = percentageFromApi ?? (totalEmployeesEvaluated > 0
      ? Number(((eligibleEmployees / totalEmployeesEvaluated) * 100).toFixed(2))
      : 0);

    return {
      totalEmployeesEvaluated,
      eligibleEmployees,
      notEligibleEmployees,
      eligibilityPercentage
    };
  }

  private buildSummaryTiles(summary: PerformanceSummary): SummaryTile[] {
    return [
      {
        icon: 'ri-team-line',
        label: 'Total Employees Evaluated',
        value: summary.totalEmployeesEvaluated,
        tone: 'blue'
      },
      {
        icon: 'ri-checkbox-circle-line',
        label: 'Eligible Employees',
        value: summary.eligibleEmployees,
        tone: 'green'
      },
      {
        icon: 'ri-close-circle-line',
        label: 'Not Eligible Employees',
        value: summary.notEligibleEmployees,
        tone: 'red'
      },
      {
        icon: 'ri-pie-chart-2-line',
        label: 'Eligibility Percentage',
        value: `${this.formatScore(summary.eligibilityPercentage)}%`,
        tone: 'violet'
      }
    ];
  }

  private buildScoreItem(
    key: PerformanceMetricKey,
    label: string,
    weight: number | null,
    score: number | null,
    tone: ScoreTone
  ): ScoreBreakdownItem {
    return {
      key,
      label,
      weight,
      score,
      valueLabel: this.formatScore(score),
      percentage: this.toPercent(score),
      tone
    };
  }

  private buildPerformanceTableExportSections(): PerformanceTableExportSection[] {
    const sections: PerformanceTableExportSection[] = [
      {
        title: 'Department Weightage Configuration',
        sheetName: 'Weightage Configuration',
        summary: [
          ['Total Records', this.filteredWeightageRows.length]
        ],
        headers: this.displayedWeightageColumns.map(column => column.title),
        rows: this.filteredWeightageRows.map(row =>
          this.displayedWeightageColumns.map(column => this.getWeightageValue(row, column.key))
        ),
        color: [67, 56, 202]
      },
      {
        title: 'Eligible Employees',
        sheetName: 'Eligible Employees',
        summary: [
          ['Total Eligible Employees', this.getEligibleExportRows().length]
        ],
        headers: this.buildEligibleEmployeeExportHeaders(),
        rows: this.buildEligibleEmployeeExportRows(),
        color: [8, 115, 66]
      },
      {
        title: `Overall Top Winners (Top ${this.top})`,
        sheetName: 'Overall Top Winners',
        summary: [
          ['Total Winners', this.overallTopWinners.length]
        ],
        headers: ['Top', 'Employee ID', 'Employee Name', 'Department', 'Eligibility', 'Final Score', 'DSR Score'],
        rows: this.overallTopWinners.map((row, index) => [
          index + 1,
          row.employee_id || '-',
          row.employee_name,
          row.department_name,
          this.getEligibilityLabel(row),
          this.formatScore(row.final_score),
          this.formatScore(row.dsr_score)
        ]),
        color: [29, 78, 216]
      }
    ];

    if (this.notEligibleRows.length) {
      sections.push({
        title: 'Not Eligible Employees',
        sheetName: 'Not Eligible Employees',
        summary: [
          ['Total Not Eligible Employees', this.filteredNotEligibleRows.length]
        ],
        headers: this.buildNotEligibleEmployeeExportHeaders(),
        rows: this.buildNotEligibleEmployeeExportRows(),
        color: [220, 38, 38]
      });
    }

    return sections;
  }

  private buildEligibleEmployeeExportHeaders(): string[] {
    return [
      'S/NO',
      'Employee ID',
      'Employee Name',
      'Department',
      'Eligibility',
      'Performance',
      'Final Score',
      'DSR Score',
      'Task Score',
      'Release Score',
      'Release Pass Score',
      'Issue Score',
      'Ticket Score',
      'Quality Score',
      'Work Volume',
      'Tasks Assigned',
      'Tasks Completed',
      'Issues Assigned',
      'Tickets Assigned',
      'DSR Days',
      'From Date',
      'To Date'
    ];
  }

  private buildEligibleEmployeeExportRows(): any[][] {
    return this.getEligibleExportRows().map((row, index) => [
      index + 1,
      row.employee_id || '-',
      row.employee_name,
      row.department_name,
      this.getEligibilityLabel(row),
      row.performance || '-',
      this.formatScore(row.final_score),
      this.formatScore(row.dsr_score),
      this.formatScore(row.task_score),
      this.formatScore(row.release_score),
      this.formatScore(row.release_pass_score),
      this.formatScore(row.issue_score),
      this.formatScore(row.ticket_score),
      this.formatScore(row.quality_score),
      this.formatMetricNumber(row.metrics.total_work_volume),
      this.formatMetricNumber(row.metrics.assigned_tasks),
      this.formatMetricNumber(row.metrics.completed_tasks),
      this.formatMetricNumber(row.metrics.assigned_issues),
      this.formatMetricNumber(row.metrics.assigned_tickets),
      this.getDsrDaysLabel(row),
      row.fromdate || '-',
      row.todate || '-'
    ]);
  }

  private getEligibleExportRows(): PerformanceRow[] {
    return this.sortRowsByFinalScore(this.rows.filter(row => row.eligible !== false));
  }

  private buildNotEligibleEmployeeExportHeaders(): string[] {
    return [
      'S/NO',
      'Employee ID',
      'Employee Name',
      'Department',
      'Eligibility',
      'Eligibility Reasons',
      'Final Score',
      'Calculated Weighted Score',
      'Task Score',
      'Release Score',
      'Release Pass Score',
      'Release Status Score',
      'Issue Score',
      'Ticket Score',
      'DSR Score',
      'Quality Score',
      'Client Score',
      'Task Weight',
      'Release Weight',
      'Release Pass Weight',
      'Release Status Weight',
      'Issue Weight',
      'Ticket Weight',
      'DSR Weight',
      'Quality Weight',
      'Client Weight',
      'Total Work Volume',
      'Tasks Assigned',
      'Tasks Completed',
      'Issues Assigned',
      'Tickets Assigned',
      'Self Tickets',
      'Closed Tickets',
      'Pending Tickets',
      'Handled Clients',
      'Support Ticket Count',
      'Model Count',
      'Total Releases',
      'Passed Releases',
      'Failed Releases',
      'On-Time Releases',
      'Required Working Days',
      'DSR Submitted Days',
      'DSR On-Time Days',
      'DSR Late Days',
      'From Date',
      'To Date'
    ];
  }

  private buildNotEligibleEmployeeExportRows(): any[][] {
    return this.filteredNotEligibleRows.map((row, index) => [
      index + 1,
      row.employee_id || '-',
      row.employee_name,
      row.department_name,
      this.getEligibilityLabel(row),
      this.getEligibilityReason(row),
      this.formatScore(row.final_score),
      this.formatScore(this.getCalculatedFinalScore(row)),
      this.formatScore(row.task_score),
      this.formatScore(row.release_score),
      this.formatScore(row.release_pass_score),
      this.formatScore(row.release_status_score),
      this.formatScore(row.issue_score),
      this.formatScore(row.ticket_score),
      this.formatScore(row.dsr_score),
      this.formatScore(row.quality_score),
      this.formatScore(row.client_score),
      this.formatWeight(row.score_weights.task),
      this.formatWeight(row.score_weights.release),
      this.formatWeight(row.score_weights.release_pass),
      this.formatWeight(row.score_weights.release_status),
      this.formatWeight(row.score_weights.issue),
      this.formatWeight(row.score_weights.ticket),
      this.formatWeight(row.score_weights.dsr),
      this.formatWeight(row.score_weights.quality),
      this.formatWeight(row.score_weights.client),
      this.formatMetricNumber(row.metrics.total_work_volume),
      this.formatMetricNumber(row.metrics.assigned_tasks),
      this.formatMetricNumber(row.metrics.completed_tasks),
      this.formatMetricNumber(row.metrics.assigned_issues),
      this.formatMetricNumber(row.metrics.assigned_tickets),
      this.formatMetricNumber(row.metrics.self_tickets),
      this.formatMetricNumber(row.metrics.closed_tickets),
      this.formatMetricNumber(row.metrics.pending_tickets),
      this.formatMetricNumber(row.metrics.handled_clients),
      this.formatMetricNumber(row.metrics.support_ticket_count),
      this.formatMetricNumber(row.metrics.model_count),
      this.formatMetricNumber(row.metrics.total_releases),
      this.formatMetricNumber(row.metrics.passed_releases),
      this.formatMetricNumber(row.metrics.failed_releases),
      this.formatMetricNumber(row.metrics.on_time_releases),
      this.formatMetricNumber(row.metrics.dsr_days_required),
      this.formatMetricNumber(row.metrics.dsr_days_submitted),
      this.formatMetricNumber(row.metrics.dsr_on_time_days),
      this.formatMetricNumber(row.metrics.dsr_late_days),
      row.fromdate || '-',
      row.todate || '-'
    ]);
  }

  private hasTableExportRows(sections: PerformanceTableExportSection[]): boolean {
    return sections.some(section => section.rows.length > 0);
  }

  private getSummaryNumericValue(label: string): number {
    return this.toNullableNumber(this.summaryTiles.find(tile => tile.label === label)?.value) ?? 0;
  }

  private getExportGeneratedBy(): string {
    return `${this.storageService.getEmpName() || this.storageService.getUsername() || 'System User'}`;
  }

  private drawPdfHeader(doc: any): number {
    doc.setFillColor(12, 44, 116);
    doc.roundedRect(10, 8, 400, 28, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(18);
    doc.text('PERFORMANCE TABLE REPORT', 20, 20);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`Department: ${this.selectedDepartmentName} | Date Range: ${this.reportPeriodLabel}`, 20, 27);
    return 44;
  }

  private addPdfTable(
    doc: any,
    title: string,
    headers: string[],
    body: any[][],
    startY: number,
    color: [number, number, number]
  ): number {
    let y = this.ensurePdfSpace(doc, startY, 24);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(title, 14, y);
    y += 4;

    (doc as any).autoTable({
      head: [headers],
      body: body.length ? body : [[{ content: 'No data available', colSpan: headers.length, styles: { halign: 'center' } }]],
      startY: y,
      theme: 'grid',
      styles: {
        fontSize: headers.length > 12 ? 6.2 : 7.5,
        cellPadding: headers.length > 12 ? 1.2 : 1.8,
        overflow: 'linebreak',
        valign: 'middle',
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240]
      },
      headStyles: {
        fillColor: color,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { left: 14, right: 14 }
    });

    return ((doc as any).lastAutoTable?.finalY ?? y + 10) + 8;
  }

  private ensurePdfSpace(doc: any, startY: number, requiredHeight: number): number {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (startY + requiredHeight > pageHeight - 12) {
      doc.addPage();
      return 16;
    }

    return startY;
  }

  private getWeightageForDepartment(departmentName: string): PerformanceWeightageRow | null {
    const target = this.normalizeLookupLabel(departmentName);
    if (!target) {
      return this.weightageRows[0] || null;
    }

    const exact = this.weightageRows.find(row => this.normalizeLookupLabel(row.department) === target);
    if (exact) {
      return exact;
    }

    return this.weightageRows.find(row => {
      const department = this.normalizeLookupLabel(row.department);
      return department.includes(target) || target.includes(department);
    }) || this.weightageRows.find(row => {
      const targetKind = this.getDepartmentPerformanceKind(departmentName);
      const candidateKind = this.getDepartmentPerformanceKind(row.department);
      return targetKind !== 'default' && candidateKind === targetKind;
    }) || null;
  }

  private groupRowsByDepartment(rows: PerformanceRow[]): WinnerGroup[] {
    const grouped = new Map<string, PerformanceRow[]>();
    rows.forEach(row => {
      const departmentName = row.department_name || this.getSelectedDepartmentName();
      grouped.set(departmentName, [...(grouped.get(departmentName) || []), row]);
    });

    return Array.from(grouped.entries()).map(([departmentName, groupRows]) => ({
      departmentName,
      rows: groupRows
    }));
  }

  private sortRowsByFinalScore(rows: PerformanceRow[]): PerformanceRow[] {
    return [...rows].sort((first, second) => {
      const firstScore = first.final_score ?? Number.NEGATIVE_INFINITY;
      const secondScore = second.final_score ?? Number.NEGATIVE_INFINITY;
      return secondScore - firstScore;
    });
  }

  private mergeRows(rows: PerformanceRow[]): PerformanceRow[] {
    const seen = new Set<string>();
    const merged: PerformanceRow[] = [];

    rows.forEach(row => {
      const key = this.getRowMergeKey(row);
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      merged.push(row);
    });

    return merged;
  }

  private getRowMergeKey(row: PerformanceRow): string {
    return [
      row.employee_id || row.employee_name,
      row.department_name,
      row.fromdate,
      row.todate
    ].join('|').toLowerCase();
  }

  private unwrapPayload(response: unknown): unknown {
    const record = this.asRecord(response);
    if (!record) {
      return response;
    }

    for (const key of ['data', 'result', 'response', 'payload']) {
      const candidate = record[key];
      if (candidate !== null && candidate !== undefined) {
        return candidate;
      }
    }

    return response;
  }

  private normalizeDepartments(response: unknown): DepartmentOption[] {
    const departments = this.extractArray(response, ['data', 'result', 'results', 'departments', 'department_list', 'list']);
    const normalized = departments
      .map(item => this.normalizeDepartment(item))
      .filter((department): department is DepartmentOption => !!department);
    const seen = new Set<string>();

    return normalized.filter(department => {
      const key = `${department.id}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private applyDepartmentAccessRestriction(departments: DepartmentOption[]): DepartmentOption[] {
    if (!this.isManagerPerformanceScope) {
      return departments;
    }

    const managerDepartmentValues = this.getLoggedInDepartmentValues();
    const matchedDepartments = departments.filter(department =>
      this.departmentMatchesValues(department, managerDepartmentValues)
    );

    if (matchedDepartments.length) {
      return matchedDepartments.slice(0, 1);
    }

    const fallbackDepartment = this.buildLoggedInDepartmentFallbackOption();
    return fallbackDepartment ? [fallbackDepartment] : [];
  }

  private applyDepartmentSearch(): void {
    const searchValue = this.departmentSearchTerm.trim().toLowerCase();
    this.filteredDepartments = searchValue
      ? this.departments.filter(department => department.department_name.toLowerCase().includes(searchValue))
      : [...this.departments];
  }

  private normalizeDepartment(item: unknown): DepartmentOption | null {
    const record = this.asRecord(item);
    if (!record) {
      return null;
    }

    const id = this.getValue(record, ['id', 'department_id', 'departmentId', 'departmentid', 'dept_id', 'deptId', 'deptid']);

    if (id === null || id === undefined || `${id}`.trim() === '') {
      return null;
    }

    const name = this.getStringValue(record, ['department_name', 'departmentName', 'dept_name', 'deptName', 'name', 'title', 'label']);

    return {
      id: typeof id === 'number' ? id : `${id}`,
      department_name: name || `Department ${id}`
    };
  }

  private selectStoredDepartment(): void {
    if (!this.departments.length) {
      this.selectedDepartmentId = null;
      return;
    }

    if (this.isManagerPerformanceScope) {
      this.selectedDepartmentId = this.departments[0].id;
      return;
    }

    if (this.selectedDepartmentId !== null) {
      return;
    }

    const user = this.asRecord(this.storageService.getUser()) || {};
    const storedDepartmentId = this.getValue(user, ['department_id', 'departmentId', 'departmentid', 'dept_id', 'deptId', 'deptid']);
    const storedDepartmentName = this.storageService.getDept()
      || this.getStringValue(user, ['department_name', 'departmentName', 'department', 'dept_name', 'deptName']);

    const matchedById = this.departments.find(department => this.valuesMatch(department.id, storedDepartmentId));
    const matchedByName = this.departments.find(department => this.valuesMatch(department.department_name, storedDepartmentName));
    const selected = matchedById || matchedByName || this.departments[0];
    this.selectedDepartmentId = selected.id;
  }

  private getLoggedInDepartmentValues(): unknown[] {
    const user = this.asRecord(this.storageService.getUser()) || {};
    const values: unknown[] = [this.storageService.getDept()];
    const departmentKeys = [
      'department',
      'dept',
      'team',
      'department_id',
      'departmentId',
      'departmentid',
      'dept_id',
      'deptId',
      'deptid',
      'department_name',
      'departmentName',
      'dept_name',
      'deptName',
      'team_name',
      'teamName'
    ];

    departmentKeys.forEach(key => {
      values.push(user[key]);
      values.push(...this.collectDepartmentValues(user[key]));
    });

    return values.filter(value => value !== null && value !== undefined && `${value}`.trim() !== '');
  }

  private collectDepartmentValues(value: unknown, depth = 0): unknown[] {
    if (value === null || value === undefined || depth > 2) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap(item => this.collectDepartmentValues(item, depth + 1));
    }

    if (typeof value !== 'object') {
      return [`${value}`.trim()].filter(Boolean);
    }

    const record = this.asRecord(value);
    if (!record) {
      return [];
    }

    const values: unknown[] = [];
    [
      'id',
      'department_id',
      'departmentId',
      'departmentid',
      'dept_id',
      'deptId',
      'deptid',
      'department_name',
      'departmentName',
      'dept_name',
      'deptName',
      'team_name',
      'teamName',
      'name',
      'title',
      'label'
    ].forEach(key => values.push(record[key]));

    ['department', 'dept', 'team'].forEach(key => {
      values.push(...this.collectDepartmentValues(record[key], depth + 1));
    });

    return values.filter(item => item !== null && item !== undefined && `${item}`.trim() !== '');
  }

  private departmentMatchesValues(department: DepartmentOption, values: unknown[]): boolean {
    const exactValues = [department.id, department.department_name];
    if (values.some(value => exactValues.some(optionValue => this.valuesMatch(optionValue, value)))) {
      return true;
    }

    const departmentName = this.normalizeLookupLabel(department.department_name);
    return values.some(value => {
      const valueLabel = this.normalizeLookupLabel(`${value ?? ''}`);
      return valueLabel.length > 1
        && departmentName.length > 1
        && (departmentName.includes(valueLabel) || valueLabel.includes(departmentName));
    });
  }

  private buildLoggedInDepartmentFallbackOption(): DepartmentOption | null {
    const user = this.asRecord(this.storageService.getUser()) || {};
    const department = this.getValue(user, ['department', 'dept', 'team']);
    const departmentValues = this.collectDepartmentValues(department);
    const id = this.getValue(user, ['department_id', 'departmentId', 'departmentid', 'dept_id', 'deptId', 'deptid'])
      ?? departmentValues.find(value => this.toNullableNumber(value) !== null);
    const name = this.storageService.getDept()
      || this.getStringValue(user, ['department_name', 'departmentName', 'dept_name', 'deptName', 'team_name', 'teamName'])
      || departmentValues.find(value => this.toNullableNumber(value) === null);
    const fallbackId = id ?? name;

    if (fallbackId === null || fallbackId === undefined || `${fallbackId}`.trim() === '' || !name) {
      return null;
    }

    return {
      id: typeof fallbackId === 'number' ? fallbackId : `${fallbackId}`,
      department_name: `${name}`.trim()
    };
  }

  private setDefaultDateRange(): void {
    const today = new Date();
    this.fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    this.toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  }

  private getPerformanceStatus(score: number): PerformanceStatus {
    if (score >= 90) return 'Outstanding';
    if (score >= 80) return 'Excellent';
    if (score >= 70) return 'Very Good';
    if (score >= 60) return 'Good';
    return 'Needs Improvement';
  }

  private getEmployeeName(record: Record<string, unknown>): string {
    const directName = this.getStringValue(record, [
      'employee_name',
      'employeeName',
      'emp_name',
      'empName',
      'name',
      'username',
      'user_name'
    ]);

    if (directName) {
      return directName;
    }

    return [
      this.getStringValue(record, ['firstname', 'first_name', 'firstName']),
      this.getStringValue(record, ['lastname', 'last_name', 'lastName'])
    ].filter(Boolean).join(' ').trim();
  }

  private buildRowUid(employeeId: string, employeeName: string, departmentName: string, index: number, fromdate: string, todate: string): string {
    return [
      employeeId || employeeName || `employee-${index}`,
      departmentName || 'department',
      fromdate,
      todate,
      index
    ].join('|');
  }

  private resolveDepartmentGroupName(departmentName: string, record: Record<string, unknown> | null): string {
    return this.getStringValue(record, ['department_name', 'departmentName', 'department', 'name', 'title'])
      || departmentName
      || this.getSelectedDepartmentName();
  }

  private getArrayByKeys(source: Record<string, unknown> | null | undefined, keys: string[]): unknown[] {
    if (!source) {
      return [];
    }

    for (const key of keys) {
      const candidate = source[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  private extractArray(response: unknown, keys: string[]): unknown[] {
    if (Array.isArray(response)) {
      return response;
    }

    const record = this.asRecord(response);
    if (!record) {
      return response === null || response === undefined ? [] : [response];
    }

    for (const key of keys) {
      const candidate = record[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        return value;
      }
    }

    return [];
  }

  private getValue(source: Record<string, unknown> | null | undefined, keys: string[]): unknown {
    if (!source) {
      return null;
    }

    for (const key of keys) {
      const value = source[key];
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }

    return null;
  }

  private getStringValue(source: Record<string, unknown> | null | undefined, keys: string[]): string {
    const value = this.getValue(source, keys);
    return value === null || value === undefined ? '' : `${value}`.trim();
  }

  private getStringArrayValue(source: Record<string, unknown> | null | undefined, keys: string[]): string[] {
    const value = this.getValue(source, keys);
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(item => item !== null && item !== undefined && `${item}`.trim() !== '')
      .map(item => `${item}`.trim());
  }

  private getNumberFromSources(sources: Array<Record<string, unknown> | null | undefined>, keys: string[]): number | null {
    for (const source of sources) {
      const value = this.getValue(source, keys);
      const numberValue = this.toNullableNumber(value);
      if (numberValue !== null) {
        return numberValue;
      }
    }

    return null;
  }

  private getWeightNumber(source: Record<string, unknown>, keys: string[]): number | null {
    const value = this.getValue(source, keys);
    if (value === '-' || value === null || value === undefined || value === '') {
      return null;
    }

    return this.toNullableNumber(value);
  }

  private getNumericOrCount(source: Record<string, unknown> | null | undefined, keys: string[]): number | null {
    const value = this.getValue(source, keys);
    if (Array.isArray(value)) {
      return value.length;
    }

    return this.toNullableNumber(value);
  }

  private getBooleanValue(source: Record<string, unknown> | null | undefined, keys: string[]): boolean | null {
    const value = this.getValue(source, keys);
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value === 1 ? true : value === 0 ? false : null;
    }

    const normalized = `${value}`.trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'eligible', 'pass', 'passed'].includes(normalized)) {
      return true;
    }

    if (['false', 'no', 'n', '0', 'not eligible', 'ineligible', 'fail', 'failed'].includes(normalized)) {
      return false;
    }

    if (normalized.includes('not eligible') || normalized.includes('ineligible')) {
      return false;
    }

    if (normalized.includes('eligible')) {
      return true;
    }

    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numericValue = typeof value === 'number'
      ? value
      : Number(`${value}`.replace(/[% ,]/g, '').trim());

    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private toPercent(value: number | null): number {
    if (value === null || !Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.min(100, value));
  }

  private valuesMatch(first: unknown, second: unknown): boolean {
    if (first === null || first === undefined || second === null || second === undefined) {
      return false;
    }

    return `${first}`.trim().toLowerCase() === `${second}`.trim().toLowerCase();
  }

  private isValidDate(value: Date): boolean {
    return value instanceof Date && !Number.isNaN(value.getTime());
  }

  private formatDateToYMD(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  private getSelectedDepartmentName(): string {
    return this.departments.find(department => this.valuesMatch(department.id, this.selectedDepartmentId))?.department_name || '-';
  }

  private normalizeLookupLabel(value: string): string {
    return `${value || ''}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  private normalizeTableSearch(value: unknown): string {
    return `${value ?? ''}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private buildExportFileName(extension: 'xlsx' | 'pdf'): string {
    const fromDate = this.fromDate ? this.formatDateToYMD(this.fromDate) : 'from';
    const toDate = this.toDate ? this.formatDateToYMD(this.toDate) : 'to';
    return `KPI_ELIGIBILITY_REPORT_${fromDate}_to_${toDate}.${extension}`;
  }
}
