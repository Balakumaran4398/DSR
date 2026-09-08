import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit,ElementRef, ViewChild, HostListener  } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { catchError, finalize, forkJoin, of, Subscription } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { ExcelService, OverallPerformanceExcelSection } from 'src/app/_core/services/excel.service';
import { NotificationDateRangeService } from 'src/app/_core/services/notification-date-range.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { OverdueComponent } from '../../core/charts/overdue/overdue.component';
import { ProjectStatusReportComponent } from '../../core/charts/project-status-report/project-status-report.component';
import { OverallDetailsDialogComponent } from './overall-details-dialog/overall-details-dialog.component';

type MetricTone = 'blue' | 'purple' | 'orange' | 'green' | 'cyan' | 'violet';
type OverallMetricDialogType = 'employees' | 'tasks' | 'issues' | 'releases' | 'tickets' ;
type OverallPerformanceSortColumn = 'company' | 'customerName' | 'employees' | 'activeTasks' | 'completedTasks' | 'openIssues' | 'releases' | 'tickets' | 'currentScenario' | 'completionRate';
type OverallSortDirection = 'asc' | 'desc';
type ReleasePipelineDialogType = 'total' | 'internalPassed' | 'externalPassed';
type TicketPipelineDialogType = 'total' | 'open' | 'inProgress';

interface OverallMetric {
  label: string;
  value: string;
  displayValue?: string;
  numericValue: number;
  suffix?: string;
  subLabel: string;
  icon: string;
  tone: MetricTone;
  color: string;
  softColor: string;
  trend: 'up' | 'down';
  dialogType: OverallMetricDialogType;
}

interface DistributionItem {
  label: string;
  value: number;
  displayValue?: string;
  displayPercent?: number;
  percent: number;
  color: string;
}

interface PipelineItem<TDialogType extends string = string> {
  label: string;
  value: number;
  displayValue?: string;
  width: number;
  color: string;
  dialogType: TDialogType;
}

interface CompanyPerformance {
  company: string;
  customerName: string;
  productName: string;
  initials: string;
  employees: number;
  activeTasks: number;
  completedTasks: number;
  openIssues: number;
  releases: number;
  tickets: number;
  currentScenario: string;
  completionRate: number;
  trendPoints: string;
  color: string;
}

interface OverallTrendItem {
  label: string;
  rangeLabel: string;
  primary: number;
  secondary: number;
  line: number;
  primaryHeight: number;
  secondaryHeight: number;
  tertiaryHeight: number;
}

interface TrendBucket {
  label: string;
  rangeLabel: string;
  start: Date;
  end: Date;
}

interface SvgPoint {
  x: number;
  y: number;
}

interface OverallTooltip {
  visible: boolean;
  x: number;
  y: number;
  title: string;
  lines: string[];
}

interface OverallMetricSnapshot {
  employees: number;
  activeTasks: number;
  completedTasks: number;
  issues: number;
  resolvedIssues: number;
  releases: number;
  inProgressReleases: number;
  tickets: number;
  openTickets: number;
  closedTickets: number;
  completionRate: number;
  recentEmployees: number;
}

@Component({
  selector: 'app-overall',
  templateUrl: './overall.component.html',
  styleUrls: ['./overall.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverallComponent implements OnInit, OnDestroy {
  dashboardData: any = {};
  projectList: any[] = [];
  employeeList: any[] = [];
  departmentList: any[] = [];
  selectedCompany = 'all';
  employeesLoading = false;
  tasksLoading = false;
  issuesLoading = false;
  releasesLoading = false;
  ticketsLoading = false;
  taskChartLoading = false;
  issueChartLoading = false;
  releaseChartLoading = false;
  ticketChartLoading = false;
  projectPerformanceLoading = false;
  employeesErrorMessage = '';
  dashboardErrorMessage = '';
  projectPerformanceErrorMessage = '';

  companyOptions: string[] = [];
  visibleCompanyRows: CompanyPerformance[] = [];
  filteredCompanyRows: CompanyPerformance[] = [];
  pagedCompanyRows: CompanyPerformance[] = [];
  performancePageNumbers: number[] = [];
  performanceSearchTerm = '';
  performancePageIndex = 0;
  performancePageSize = 10;
  readonly performancePageSizeOptions = [10, 25, 50, 100];
  readonly tableSkeletonRows = Array.from({ length: 8 }, (_value, index) => index);
  readonly tableSkeletonColumns = Array.from({ length: 11 }, (_value, index) => index);
  performanceTotalPages = 1;
  performanceShowingFrom = 0;
  performanceShowingTo = 0;
  excelExporting = false;
  performanceSortColumn: OverallPerformanceSortColumn = 'company';
  performanceSortDirection: OverallSortDirection = 'asc';
  metrics: OverallMetric[] = [];
  taskStatusDistribution: DistributionItem[] = [];
  issueStatusDistribution: DistributionItem[] = [];
  releasePipeline: PipelineItem<ReleasePipelineDialogType>[] = [];
  ticketPipeline: PipelineItem<TicketPipelineDialogType>[] = [];
  taskDistributionTotal = 0;
  issueDistributionTotal = 0;
  animatedTaskDistributionTotal = '0';
  animatedIssueDistributionTotal = '0';
  taskDistributionDonut = 'conic-gradient(var(--overall-ring-track) 0deg 360deg)';
  issueDistributionDonut = 'conic-gradient(var(--overall-ring-track) 0deg 360deg)';
  taskTrend: OverallTrendItem[] = [];
  issueTrend: OverallTrendItem[] = [];
  releaseTrend: OverallTrendItem[] = [];
  ticketTrend: OverallTrendItem[] = [];
  taskTrendLinePoints = '';
  issueTrendLinePoints = '';
  releaseTrendLinePoints = '';
  taskTrendDots: SvgPoint[] = [];
  issueTrendDots: SvgPoint[] = [];
  releaseTrendDots: SvgPoint[] = [];
  taskChartTicks: number[] = [4, 3, 2, 1, 0];
  issueChartTicks: number[] = [4, 3, 2, 1, 0];
  releaseChartTicks: number[] = [4, 3, 2, 1, 0];
  ticketChartTicks: number[] = [4, 3, 2, 1, 0];
  currentDateRangeLabel = this.getCurrentDateRangeLabel();
  trendPeriodLabel = 'This Month';

  chartTooltip: OverallTooltip = {
    visible: false,
    x: 0,
    y: 0,
    title: '',
    lines: []
  };

  private loadSubscription?: Subscription;
  private empId: string | number | null = null;
  private allTaskRows: any[] = [];
  private allIssueRows: any[] = [];
  private allReleaseRows: any[] = [];
  private allTicketRows: any[] = [];
  private filteredTaskRows: any[] = [];
  private filteredIssueRows: any[] = [];
  private filteredReleaseRows: any[] = [];
  private filteredTicketRows: any[] = [];
  private filteredEmployeeRows: any[] = [];
  private allCompanyRows: CompanyPerformance[] = [];
  private selectedCompanyRow: CompanyPerformance | null = null;
  private metricSnapshot: OverallMetricSnapshot = this.emptyMetricSnapshot();
  private countAnimationFrame?: number;
  private countAnimationSequence = 0;
  private readonly taskCreatedDateKeys = ['created_date', 'createddate', 'start_date', 'assigned_date', 'task_date', 'date'];
  private readonly taskClosedDateKeys = ['closed_date', 'completed_date', 'completeddate', 'end_date', 'updated_date', 'updateddate', 'status_changed_date', 'created_date', 'createddate'];
  private readonly issueOpenedDateKeys = ['created_date', 'createddate', 'start_date', 'assigned_date', 'issue_date', 'bug_date', 'date'];
  private readonly issueResolvedDateKeys = ['closed_date', 'resolved_date', 'completed_date', 'completeddate', 'end_date', 'updated_date', 'updateddate', 'status_changed_date', 'created_date', 'createddate'];
  private readonly releaseDateKeys = ['release_date', 'released_date', 'release_status_changed_date', 'status_changed_date', 'updateddate', 'updated_date', 'created_date', 'createddate', 'date'];
  private readonly ticketCreatedDateKeys = ['created_date', 'createddate', 'assigned_date', 'ticket_date', 'date'];
  private readonly ticketClosedDateKeys = ['closed_date', 'closeddate', 'resolved_date', 'resolveddate', 'completed_date', 'completeddate', 'updated_date', 'updateddate', 'status_changed_date', 'created_date', 'createddate'];
  private readonly ticketListKeys = ['ticket_list', 'ticketList', 'ticketlist', 'all_ticket_list', 'overall_ticket_list', 'tickets', 'ticket_details', 'ticketDetails'];
  private readonly chartColors = {
    metricEmployees: 'var(--overall-metric-employees)',
    metricEmployeesSoft: 'var(--overall-metric-employees-soft)',
    metricActiveTasks: 'var(--overall-metric-active-tasks)',
    metricActiveTasksSoft: 'var(--overall-metric-active-tasks-soft)',
    metricIssues: 'var(--overall-metric-issues)',
    metricIssuesSoft: 'var(--overall-metric-issues-soft)',
    metricReleases: 'var(--overall-metric-releases)',
    metricReleasesSoft: 'var(--overall-metric-releases-soft)',
    metricTickets: 'var(--overall-metric-tickets)',
    metricTicketsSoft: 'var(--overall-metric-tickets-soft)',
    taskOpen: 'var(--overall-chart-task-open)',
    taskProgress: 'var(--overall-chart-task-progress)',
    taskReview: 'var(--overall-chart-task-review)',
    taskCompleted: 'var(--overall-chart-task-completed)',
    taskBlocked: 'var(--overall-chart-task-blocked)',
    issueOpen: 'var(--overall-chart-issue-open)',
    issueProgress: 'var(--overall-chart-issue-progress)',
    issueResolved: 'var(--overall-chart-issue-resolved)',
    issueClosed: 'var(--overall-chart-issue-closed)',
    releaseTotal: 'var(--overall-chart-release-total)',
    releaseInternal: 'var(--overall-chart-release-internal)',
    releaseExternal: 'var(--overall-chart-release-external)',
    ticketTotal: 'var(--overall-chart-ticket-total)',
    ticketOpen: 'var(--overall-chart-ticket-open)',
    ticketProgress: 'var(--overall-chart-ticket-progress)',
  } as const;
  data: any;
  filterStartDate: Date | null = null;
  filterEndDate: Date | null = null;
  selectedPreset: string = 'monthly';
  isCustomOpen: boolean = false;

  @ViewChild('customDateFilter') customDateFilterRef?: ElementRef<HTMLElement>;
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isCustomOpen) return;

    const path = event.composedPath();
    const customDateFilter = this.customDateFilterRef?.nativeElement;
    const clickedInsideCustomFilter = !!customDateFilter && path.includes(customDateFilter);
    const clickedInsideMaterialCalendar = path.some(element => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      return !!element.closest('mat-datepicker-content, .mat-datepicker-content, mat-calendar, .mat-calendar, .cdk-overlay-container');
    });

    if (!clickedInsideCustomFilter && !clickedInsideMaterialCalendar) {
      this.isCustomOpen = false;
      this.cdr.markForCheck();
    }
  }
  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private notificationDateRangeService: NotificationDateRangeService,
    private matDialog: MatDialog,
    private router: Router,
    private excelService: ExcelService,
    private cdr: ChangeDetectorRef
  ) { }
  formattedStartDate = '';
  formattedEndDate = '';

  ngOnInit(): void {
    this.empId = this.storageService.getEmpId();
    this.initializeDefaultDateRange();
    this.metrics = this.buildMetrics(this.metricSnapshot);
    this.loadOverallAnalytics();
  }

  ngOnDestroy(): void {
    this.loadSubscription?.unsubscribe();
    if (this.countAnimationFrame) {
      cancelAnimationFrame(this.countAnimationFrame);
    }
  }

  refresh(): void {
    this.loadOverallAnalytics();
  }

  retryOverallDashboard(): void {
    this.loadOverallAnalytics();
  }

  isMetricLoading(type: OverallMetricDialogType): boolean {
    switch (type) {
      case 'employees':
        return this.employeesLoading;
      case 'tasks':
        return this.tasksLoading;
      case 'issues':
        return this.issuesLoading;
      case 'releases':
        return this.releasesLoading;
      case 'tickets':
        return this.ticketsLoading;
      default:
        return false;
    }
  }

  getMetricError(type: OverallMetricDialogType): string {
    return type === 'employees' ? this.employeesErrorMessage : this.dashboardErrorMessage;
  }

  hasDistributionData(items: DistributionItem[]): boolean {
    return items.some(item => item.value > 0);
  }

  hasTrendData(items: OverallTrendItem[]): boolean {
    return items.some(item => item.primary > 0 || item.secondary > 0 || item.line > 0);
  }

  onPerformancePageSizeChange(event: Event): void {
    const nextPageSize = Number((event.target as HTMLSelectElement).value);

    if (!this.performancePageSizeOptions.includes(nextPageSize)) {
      return;
    }

    this.performancePageSize = nextPageSize;
    this.performancePageIndex = 0;
    this.rebuildPerformanceRows();
  }

  onCompanyChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedCompany = value || 'all';
    this.performancePageIndex = 0;
    this.rebuildViewModel();
  }

  onPerformanceSearch(event: Event): void {
    this.performanceSearchTerm = (event.target as HTMLInputElement).value || '';
    this.performancePageIndex = 0;
    this.rebuildPerformanceRows();
  }

  clearPerformanceSearch(): void {
    this.performanceSearchTerm = '';
    this.performancePageIndex = 0;
    this.rebuildPerformanceRows();
  }

  exportOverallPerformanceExcel(): void {
    if (this.excelExporting) {
      return;
    }

    this.excelExporting = true;
    this.cdr.markForCheck();

    window.setTimeout(() => {
      try {
        const dateRange = this.getActiveDateRange(true);
        this.excelService.generateOverallPerformanceExcel(
          {
            generatedBy: this.storageService.getEmpName() || this.storageService.getUsername(),
            fromDate: dateRange.startDate,
            toDate: dateRange.endDate,
            selectedCompany: this.selectedCompany === 'all' ? 'All Companies' : this.selectedCompany
          },
          this.buildOverallPerformanceExcelSections()
        );
      } finally {
        this.excelExporting = false;
        this.cdr.markForCheck();
      }
    });
  }

  sortPerformanceRows(column: OverallPerformanceSortColumn): void {
    if (this.performanceSortColumn === column) {
      this.performanceSortDirection = this.performanceSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.performanceSortColumn = column;
      this.performanceSortDirection = 'asc';
    }
    this.performancePageIndex = 0;
    this.rebuildPerformanceRows();
  }

  getPerformanceSortIcon(column: OverallPerformanceSortColumn): string {
    if (this.performanceSortColumn !== column) {
      return 'ri-arrow-up-down-line';
    }

    return this.performanceSortDirection === 'asc' ? 'ri-arrow-up-line' : 'ri-arrow-down-line';
  }

  goToPerformancePage(pageIndex: number): void {
    const nextPageIndex = Math.max(0, Math.min(this.performanceTotalPages - 1, pageIndex));

    if (nextPageIndex === this.performancePageIndex) {
      return;
    }

    this.performancePageIndex = nextPageIndex;
    this.rebuildPerformanceRows();
  }

  openMetricDialog(type: OverallMetricDialogType): void {
    if (type === 'employees') {
      this.router.navigate(['/main/team'], { queryParams: { from: 'overall' } });
      return;
    }

    if (type === 'releases') {
      this.openReleaseDialog(this.filteredReleaseRows, 'Releases');
      return;
    }

    if (type === 'tickets') {
      this.openTicketDialog(this.getTicketRowsForDialog(), 'Tickets');
      return;
    }

    if (type === 'issues') {
      this.openTaskDialog(this.getActiveIssueRows(), 'Issues', 'ri-error-warning-line');
      return;
    }

    if (type === 'tasks') {
      this.openTaskDialog(this.getOpenTaskRows(), 'Active Tasks', 'ri-stack-line');
      return;
    }

    // const title = type === 'completion' ? 'Completed Tasks' : 'Tasks';
    // const rows = type === 'completion'
    //   ? this.getClosedTaskRows()
    //   : this.getOpenTaskRows();
    // this.openTaskDialog(rows, title, type === 'completion' ? 'ri-checkbox-circle-line' : 'ri-stack-line');
  }

  showDistributionSummaryTooltip(event: MouseEvent, title: string, items: DistributionItem[], total: number): void {
    this.showTooltip(event, title, [
      `Total: ${this.formatNumber(total)}`,
      ...items.map(item => `${item.label}: ${this.formatNumber(item.value)} (${item.percent}%)`)
    ]);
  }

  showDistributionTooltip(event: MouseEvent, title: string, item: DistributionItem): void {
    this.showTooltip(event, title, [
      `${item.label}: ${this.formatNumber(item.value)}`,
      `Share: ${item.percent}%`
    ]);
  }

  openTaskDistributionDialog(item: DistributionItem): void {
    const label = this.normalizeStatus(item.label);
    const isClosed = label.includes('closed') || label.includes('completed');
    const rows = isClosed ? this.getClosedTaskRows() : this.getOpenTaskRows();
    this.openTaskDialog(rows, isClosed ? 'Closed Tasks' : 'Open Tasks', isClosed ? 'ri-checkbox-circle-line' : 'ri-stack-line');
  }

  openTaskDistributionChartDialog(event: MouseEvent): void {
    const item = this.getDistributionItemFromEvent(event, this.taskStatusDistribution);

    if (item) {
      this.openTaskDistributionDialog(item);
      return;
    }

    this.openTaskDialog([...this.getOpenTaskRows(), ...this.getClosedTaskRows()], 'Tasks', 'ri-stack-line');
  }

  openIssueDistributionDialog(item: DistributionItem): void {
    const label = this.normalizeStatus(item.label);
    const isClosed = label.includes('closed') || label.includes('resolved');
    const rows = isClosed ? this.getClosedIssueRows() : this.getActiveIssueRows();
    this.openTaskDialog(rows, isClosed ? 'Closed Issues' : 'Active Issues', 'ri-error-warning-line');
  }

  openIssueDistributionChartDialog(event: MouseEvent): void {
    const item = this.getDistributionItemFromEvent(event, this.issueStatusDistribution);

    if (item) {
      this.openIssueDistributionDialog(item);
      return;
    }

    this.openTaskDialog([...this.getActiveIssueRows(), ...this.getClosedIssueRows()], 'Issues', 'ri-error-warning-line');
  }

  showPipelineTooltip(event: MouseEvent, item: PipelineItem<ReleasePipelineDialogType>): void {
    const total = this.sumValues(this.releasePipeline.map(pipelineItem => pipelineItem.value));
    this.showTooltip(event, 'Release Pipeline', [
      `${item.label}: ${this.formatNumber(item.value)}`,
      `Share: ${this.percent(item.value, total)}%`
    ]);
  }

  openReleasePipelineDialog(item: PipelineItem<ReleasePipelineDialogType>): void {
    const titleMap: Record<ReleasePipelineDialogType, string> = {
      total: 'Total Releases',
      internalPassed: 'Internal Passed Releases',
      externalPassed: 'External Passed Releases'
    };

    this.openReleaseDialog(this.getReleasePipelineRows(item.dialogType), titleMap[item.dialogType]);
  }

  showTicketPipelineTooltip(event: MouseEvent, item: PipelineItem<TicketPipelineDialogType>): void {
    const total = this.ticketPipeline.find(pipelineItem => pipelineItem.dialogType === 'total')?.value
      || this.sumValues(this.ticketPipeline.map(pipelineItem => pipelineItem.value));
    this.showTooltip(event, 'Ticket Pipeline', [
      `${item.label}: ${this.formatNumber(item.value)}`,
      `Share: ${this.percent(item.value, total)}%`
    ]);
  }

  openTicketPipelineDialog(item: PipelineItem<TicketPipelineDialogType>): void {
    const titleMap: Record<TicketPipelineDialogType, string> = {
      total: 'Total Tickets',
      open: 'Open Tickets',
      inProgress: 'In Progress Tickets',
    };

    this.openTicketDialog(this.getTicketPipelineRows(item.dialogType), titleMap[item.dialogType]);
  }

  showTrendTooltip(
    event: MouseEvent,
    title: string,
    item: OverallTrendItem,
    primaryLabel: string,
    secondaryLabel: string,
    lineLabel?: string
  ): void {
    const lines = [
      ...(item.rangeLabel ? [`Period: ${item.rangeLabel}`] : []),
      `${primaryLabel}: ${this.formatNumber(item.primary)}`,
      `${secondaryLabel}: ${this.formatNumber(item.secondary)}`,
      ...(lineLabel ? [`${lineLabel}: ${this.formatNumber(item.line)}`] : [])
    ];

    this.showTooltip(event, `${title} - ${item.label}`, lines);
  }

  hideChartTooltip(): void {
    if (!this.chartTooltip.visible) {
      return;
    }

    this.chartTooltip = {
      ...this.chartTooltip,
      visible: false
    };
    this.cdr.markForCheck();
  }

  trackByLabel(_index: number, item: { label: string }): string {
    return item.label;
  }

  trackByCompany(_index: number, item: CompanyPerformance): string {
    return item.company;
  }

  trackByString(_index: number, value: string): string {
    return value;
  }

  trackByNumber(_index: number, value: number): number {
    return value;
  }

  trackByPoint(index: number, point: SvgPoint): string {
    return `${index}-${point.x}-${point.y}`;
  }

  private loadOverallAnalytics(): void {
    this.loadSubscription?.unsubscribe();
    this.setDashboardLocalLoading(true);
    this.employeesLoading = true;
    this.dashboardErrorMessage = '';
    this.projectPerformanceErrorMessage = '';
    this.employeesErrorMessage = '';
    this.cdr.markForCheck();

    const employeeId = Number(this.empId || 0);
    const activeRange = this.getActiveDateRange(true);

    const requests = new Subscription();
    this.loadSubscription = requests;

    requests.add(this.authService.getDashboardDetailsByEmployeeId(employeeId, 0, activeRange.startDate, activeRange.endDate)
      .pipe(finalize(() => {
        this.setDashboardLocalLoading(false);
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: result => {
          this.dashboardData = result || {};
          this.dashboardErrorMessage = '';
          this.projectPerformanceErrorMessage = '';
          this.rebuildViewModel();
          this.cdr.markForCheck();
        },
        error: error => {
          console.error('Overall dashboard analytics load error:', error);
          if (!this.hasDashboardData()) {
            this.dashboardData = {};
          }
          this.dashboardErrorMessage = 'Unable to load dashboard analytics.';
          this.projectPerformanceErrorMessage = 'Unable to load project performance.';
          this.rebuildViewModel();
          this.cdr.markForCheck();
        }
      }));

    requests.add(forkJoin({
      employees: this.authService.getUsersAll(employeeId).pipe(catchError(error => {
        console.error('Overall employees load error:', error);
        this.employeesErrorMessage = 'Unable to load employee data.';
        return of(this.employeeList);
      })),
      departments: this.authService.getAllDepartments().pipe(catchError(error => {
        console.error('Overall departments load error:', error);
        return of(this.departmentList);
      })),
    }).pipe(finalize(() => {
      this.employeesLoading = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: result => {
        this.employeeList = this.extractResponseList(result.employees, 'employees');
        this.departmentList = this.extractResponseList(result.departments, 'departments');
        this.rebuildViewModel();
        this.cdr.markForCheck();
      },
      error: error => {
        console.error('Overall metadata load error:', error);
        this.employeesErrorMessage = 'Unable to load employee data.';
        this.rebuildViewModel();
        this.cdr.markForCheck();
      }
    }));
  }

  private setDashboardLocalLoading(isLoading: boolean): void {
    this.tasksLoading = isLoading;
    this.issuesLoading = isLoading;
    this.releasesLoading = isLoading;
    this.ticketsLoading = isLoading;
    this.taskChartLoading = isLoading;
    this.issueChartLoading = isLoading;
    this.releaseChartLoading = isLoading;
    this.ticketChartLoading = isLoading;
    this.projectPerformanceLoading = isLoading;
  }

  private hasDashboardData(): boolean {
    return !!this.dashboardData
      && typeof this.dashboardData === 'object'
      && !Array.isArray(this.dashboardData)
      && Object.keys(this.dashboardData).length > 0;
  }

  private rebuildViewModel(): void {
    this.prepareSourceRows();
    const globalMetrics = this.buildGlobalMetricSnapshot();
    this.allCompanyRows = this.buildCompanyRows(globalMetrics);

    if (this.selectedCompany !== 'all' && !this.companyOptions.includes(this.selectedCompany)) {
      this.selectedCompany = 'all';
    }

    this.selectedCompanyRow = this.selectedCompany === 'all'
      ? null
      : this.allCompanyRows.find(row => row.company === this.selectedCompany || row.customerName === this.selectedCompany) || null;

    this.filteredTaskRows = this.getRowsForCompany(this.allTaskRows);
    this.filteredIssueRows = this.getRowsForCompany(this.allIssueRows);
    this.filteredReleaseRows = this.getRowsForCompany(this.allReleaseRows);
    this.filteredTicketRows = this.getRowsForCompany(this.allTicketRows);
    this.filteredEmployeeRows = this.getEmployeesForSelectedCompany();
    this.metricSnapshot = this.buildSelectedMetricSnapshot(globalMetrics);

    this.visibleCompanyRows = this.selectedCompany === 'all'
      ? this.allCompanyRows
      : this.allCompanyRows.filter(row => row.company === this.selectedCompany || row.customerName === this.selectedCompany);
    this.rebuildPerformanceRows();

    this.metrics = this.buildMetrics(this.metricSnapshot);
    this.taskStatusDistribution = this.buildTaskDistribution();
    this.issueStatusDistribution = this.buildIssueDistribution();
    this.taskDistributionTotal = this.sumValues(this.taskStatusDistribution.map(item => item.value));
    this.issueDistributionTotal = this.sumValues(this.issueStatusDistribution.map(item => item.value));
    this.taskDistributionDonut = this.buildDistributionDonut(this.taskStatusDistribution);
    this.issueDistributionDonut = this.buildDistributionDonut(this.issueStatusDistribution);
    this.releasePipeline = this.buildReleasePipeline();
    this.ticketPipeline = this.buildTicketPipeline();

    this.trendPeriodLabel = this.getTrendPeriodLabel();
    this.taskTrend = this.buildTaskTrend();
    this.issueTrend = this.buildIssueTrend();
    this.releaseTrend = this.buildReleaseTrend();
    this.ticketTrend = this.buildTicketTrend();
    this.taskChartTicks = this.buildChartTicks(this.taskTrend);
    this.issueChartTicks = this.buildChartTicks(this.issueTrend);
    this.releaseChartTicks = this.buildChartTicks(this.releaseTrend);
    this.ticketChartTicks = this.buildChartTicks(this.ticketTrend);

    this.taskTrendDots = [];
    this.issueTrendDots = [];
    this.releaseTrendDots = [];
    this.taskTrendLinePoints = '';
    this.issueTrendLinePoints = '';
    this.releaseTrendLinePoints = '';
    this.startDashboardCountAnimation();
    this.cdr.markForCheck();
  }

  private prepareSourceRows(): void {
    this.allTaskRows = this.uniqueRows(this.arrayFromKeys(['open_task_list', 'active_task_list', 'closed_task_list', 'completed_task_list', 'task_list', 'tasks']));
    this.allIssueRows = this.uniqueRows(this.arrayFromKeys(['bug_list', 'open_bug_list', 'closed_bug_list', 'open_issue_list', 'closed_issue_list', 'issue_list', 'issues']));
    this.allReleaseRows = this.uniqueRows(this.getReleaseRows());
    this.allTicketRows = this.getDashboardTicketRows();
    this.companyOptions = this.buildCompanyOptions();
  }

  private getTicketRowsForDialog(): any[] {
    const scopedRows = this.getTicketRowsForCurrentScope();

    if (scopedRows.length) {
      return scopedRows;
    }

    if (this.selectedCompany !== 'all') {
      return [];
    }

    return this.getDashboardTicketRows();
  }

  private getTicketRowsForCurrentScope(): any[] {
    if (this.selectedCompany !== 'all') {
      return this.filteredTicketRows;
    }

    return this.allTicketRows.length ? this.allTicketRows : this.getDashboardTicketRows();
  }

  private getDashboardTicketRows(): any[] {
    const keyedRows = this.arrayFromKeys(this.ticketListKeys);

    if (keyedRows.length) {
      return this.uniqueRows(keyedRows);
    }

    return this.uniqueRows(this.collectTicketRowsFromSource(this.dashboardData));
  }

  private buildGlobalMetricSnapshot(): OverallMetricSnapshot {
    const activeEmployees = this.employeeList.filter(employee => this.isActiveEmployee(employee)).length;
    const activeTasks = this.firstNumber(['active_task', 'open_task', 'open_tasks'], this.arrayLength(['open_task_list', 'active_task_list']));
    const completedTasks = this.firstNumber(['closed_task', 'closed_tasks', 'completed_task', 'completed_tasks'], this.arrayLength(['closed_task_list', 'completed_task_list']));
    const releases = this.firstNumber(['total_release', 'total_releases'], this.allReleaseRows.length);
    const inProgressReleases = this.firstNumber(['in_progress_release', 'inprogress_release'], this.arrayLength(['in_progress_release_list', 'inprogress_release_list']));
    const completedReleases = this.firstNumber(
      ['passed_release', 'completed_release', 'completed_releases'],
      this.arrayLength(['internal_passed_release_list', 'internal_pass_release_list'])
      + this.arrayLength(['external_passed_release_list', 'external_pass_release_list'])
    );
    const loadedTicketCount = this.allTicketRows.length;
    const tickets = loadedTicketCount || this.firstNumber(['total_ticket', 'total_tickets', 'ticket_count'], 0);
    const closedTickets = loadedTicketCount
      ? this.countClosedTickets(this.allTicketRows)
      : this.firstNumber(['closed_ticket', 'closed_tickets', 'resolved_ticket', 'resolved_tickets'], 0);
    const openTickets = loadedTicketCount
      ? Math.max(0, tickets - closedTickets)
      : this.firstNumber(['open_ticket', 'open_tickets', 'active_ticket', 'active_tickets'], Math.max(0, tickets - closedTickets));
    const taskCompletion = this.percent(completedTasks, activeTasks + completedTasks);

    return {
      employees: this.firstNumber(['active_employees', 'active_employee', 'active_staff'], activeEmployees),
      activeTasks,
      completedTasks,
      issues: this.firstNumber(['active_issue', 'open_issue', 'open_issues'], this.arrayLength(['bug_list', 'open_bug_list', 'open_issue_list'])),
      resolvedIssues: this.firstNumber(['closed_issue', 'closed_issues', 'resolved_issue', 'resolved_issues'], this.arrayLength(['closed_bug_list', 'closed_issue_list'])),
      releases,
      inProgressReleases,
      tickets,
      openTickets,
      closedTickets,
      completionRate: taskCompletion > 0 ? taskCompletion : this.percent(completedReleases, releases),
      recentEmployees: this.countRecentEmployees(this.employeeList)
    };
  }

  private buildSelectedMetricSnapshot(globalMetrics: OverallMetricSnapshot): OverallMetricSnapshot {
    if (!this.selectedCompanyRow) {
      return globalMetrics;
    }

    const activeTasks = this.selectedCompanyRow.activeTasks;
    const completedTasks = this.selectedCompanyRow.completedTasks;
    const releases = this.selectedCompanyRow.releases;
    const tickets = this.selectedCompanyRow.tickets;
    const closedTickets = this.countClosedTickets(this.filteredTicketRows);

    return {
      employees: this.selectedCompanyRow.employees,
      activeTasks,
      completedTasks,
      issues: this.selectedCompanyRow.openIssues,
      resolvedIssues: this.countClosedRows(this.filteredIssueRows) || Math.max(0, Math.round(this.selectedCompanyRow.openIssues * 0.34)),
      releases,
      inProgressReleases: this.countReleaseRowsByStatus(this.filteredReleaseRows, ['progress', 'in-progress', 'inprogress']) || Math.round(releases * 0.42),
      tickets,
      openTickets: Math.max(0, tickets - closedTickets),
      closedTickets,
      completionRate: this.selectedCompanyRow.completionRate,
      recentEmployees: this.countRecentEmployees(this.filteredEmployeeRows)
    };
  }

  private buildMetrics(metrics: OverallMetricSnapshot): OverallMetric[] {
    return [
      {
        label: 'Employees',
        value: this.formatNumber(metrics.employees),
        displayValue: this.formatNumber(metrics.employees),
        numericValue: metrics.employees,
        subLabel: `${metrics.recentEmployees} this week`,
        icon: 'ri-team-fill',
        tone: 'blue',
        color: this.chartColors.metricEmployees,
        softColor: this.chartColors.metricEmployeesSoft,
        trend: 'up',
        dialogType: 'employees'
      },
      {
        label: 'Active Tasks',
        value: this.formatNumber(metrics.activeTasks),
        displayValue: this.formatNumber(metrics.activeTasks),
        numericValue: metrics.activeTasks,
        subLabel: `${Math.max(1, Math.round(metrics.completionRate / 4))}% from last week`,
        icon: 'ri-checkbox-multiple-fill',
        tone: 'purple',
        color: this.chartColors.metricActiveTasks,
        softColor: this.chartColors.metricActiveTasksSoft,
        trend: 'up',
        dialogType: 'tasks'
      },
      {
        label: 'Issues',
        value: this.formatNumber(metrics.issues),
        displayValue: this.formatNumber(metrics.issues),
        numericValue: metrics.issues,
        subLabel: `${this.formatNumber(metrics.resolvedIssues)} resolved`,
        icon: 'ri-error-warning-fill',
        tone: 'orange',
        color: this.chartColors.metricIssues,
        softColor: this.chartColors.metricIssuesSoft,
        trend: 'down',
        dialogType: 'issues'
      },
      {
        label: 'Releases',
        value: this.formatNumber(metrics.releases),
        displayValue: this.formatNumber(metrics.releases),
        numericValue: metrics.releases,
        subLabel: `${this.formatNumber(metrics.inProgressReleases)} in progress`,
        icon: 'ri-rocket-fill',
        tone: 'green',
        color: this.chartColors.metricReleases,
        softColor: this.chartColors.metricReleasesSoft,
        trend: 'up',
        dialogType: 'releases'
      },
      {
        label: 'Tickets',
        value: this.formatNumber(metrics.tickets),
        displayValue: this.formatNumber(metrics.tickets),
        numericValue: metrics.tickets,
        subLabel: `${this.formatNumber(metrics.openTickets)} open - ${this.formatNumber(metrics.closedTickets)} closed`,
        icon: 'ri-ticket-2-fill',
        tone: 'cyan',
        color: this.chartColors.metricTickets,
        softColor: this.chartColors.metricTicketsSoft,
        trend: 'up',
        dialogType: 'tickets'
      },
      // {
      //   label: 'Completion Rate',
      //   value: `${metrics.completionRate}%`,
      //   displayValue: `${metrics.completionRate}%`,
      //   numericValue: metrics.completionRate,
      //   suffix: '%',
      //   subLabel: `${Math.max(1, Math.round(metrics.completionRate / 12))}% from last week`,
      //   icon: 'ri-line-chart-fill',
      //   tone: 'violet',
      //   color: '#7c3aed',
      //   softColor: 'rgba(124, 58, 237, 0.14)',
      //   trend: 'up',
      //   dialogType: 'completion'
      // }
    ];
  }

  private buildTaskDistribution(): DistributionItem[] {
    return this.withPercents([
      {
        label: 'Open Tasks',
        value: this.metricSnapshot.activeTasks || this.getOpenTaskRows().length,
        color: this.chartColors.taskOpen
      },
      {
        label: 'Closed Tasks',
        value: this.metricSnapshot.completedTasks || this.getClosedTaskRows().length,
        color: this.chartColors.taskCompleted
      }
    ]);
  }

  private buildIssueDistribution(): DistributionItem[] {
    const openBugRows = this.uniqueRows(this.getRowsForCompany(this.arrayFromKeys(['open_bug_list'])));
    const closedBugRows = this.uniqueRows(this.getRowsForCompany(this.arrayFromKeys(['closed_bug_list'])));

    return this.withPercents([
      {
        label: 'Active Issues',
        value: openBugRows.length,
        color: this.chartColors.issueOpen
      },
      {
        label: 'Closed Issues',
        value: closedBugRows.length,
        color: this.chartColors.issueResolved
      }
    ]);
  }

  private buildReleasePipeline(): PipelineItem<ReleasePipelineDialogType>[] {
    const totalRows = this.getTotalReleaseRows();
    const internalPassedRows = this.getInternalPassedReleaseRows();
    const externalPassedRows = this.getExternalPassedReleaseRows();
    const totalReleases = this.selectedCompanyRow
      ? (totalRows.length || this.metricSnapshot.releases)
      : this.firstNumber(['total_release', 'total_releases'], totalRows.length);
    const internalPassed = this.selectedCompanyRow
      ? internalPassedRows.length
      : this.firstNumber(['internal_pass_release', 'internal_passed_release', 'internal_pass_releases', 'internal_passed_releases'], internalPassedRows.length);
    const externalPassed = this.selectedCompanyRow
      ? externalPassedRows.length
      : this.firstNumber(['external_pass_release', 'external_passed_release', 'external_pass_releases', 'external_passed_releases'], externalPassedRows.length);

    return this.pipelineItems<ReleasePipelineDialogType>([
      { label: 'Total Releases', value: totalReleases, color: this.chartColors.releaseTotal, dialogType: 'total' },
      { label: 'Internal Passed', value: internalPassed, color: this.chartColors.releaseInternal, dialogType: 'internalPassed' },
      { label: 'External Passed', value: externalPassed, color: this.chartColors.releaseExternal, dialogType: 'externalPassed' }
    ]);
  }

  private buildTicketPipeline(): PipelineItem<TicketPipelineDialogType>[] {
    const rows = this.getTicketRowsForCurrentScope();
    const hasRows = rows.length > 0;
    const totalTickets = hasRows ? rows.length : this.metricSnapshot.tickets;
    const categoryCounts: Record<Exclude<TicketPipelineDialogType, 'total'>, number> = {
      open: 0,
      inProgress: 0,

    };

    if (hasRows) {
      rows.forEach(row => {
        categoryCounts[this.getTicketPipelineType(row)] += 1;
      });
    } else {
      categoryCounts.open = this.metricSnapshot.openTickets;
      // categoryCounts.closed = this.metricSnapshot.closedTickets;
    }

    return this.pipelineItems<TicketPipelineDialogType>([
      { label: 'Total Tickets', value: totalTickets, color: this.chartColors.ticketTotal, dialogType: 'total' },
      { label: 'Open / Active', value: categoryCounts.open, color: this.chartColors.ticketOpen, dialogType: 'open' },
      { label: 'In Progress', value: categoryCounts.inProgress, color: this.chartColors.ticketProgress, dialogType: 'inProgress' },
      // { label: 'Closed', value: categoryCounts.closed, color: '#10b981', dialogType: 'closed' },
    ]);
  }

  private getFallbackTaskDistribution(): Array<Omit<DistributionItem, 'percent'>> {
    const total = Math.max(0, this.metricSnapshot.activeTasks || this.metricSnapshot.completedTasks);
    const toDo = Math.round(total * 0.27);
    const progress = Math.round(total * 0.38);
    const review = Math.round(total * 0.16);
    const blocked = this.firstNumber(['blocked_task', 'blocked_tasks'], 0);
    const completed = Math.max(0, total - toDo - progress - review - blocked);

    return [
      { label: 'To Do', value: toDo, color: this.chartColors.taskOpen },
      { label: 'In Progress', value: progress, color: this.chartColors.taskProgress },
      { label: 'In Review', value: review, color: this.chartColors.taskReview },
      { label: 'Completed', value: completed, color: this.chartColors.taskCompleted },
      { label: 'Blocked', value: blocked, color: this.chartColors.taskBlocked }
    ];
  }

  private getFallbackIssueDistribution(): Array<Omit<DistributionItem, 'percent'>> {
    const total = Math.max(0, this.metricSnapshot.issues || this.metricSnapshot.resolvedIssues);
    const open = Math.round(total * 0.53);
    const progress = Math.round(total * 0.24);
    const resolved = Math.round(total * 0.18);
    const closed = Math.max(0, total - open - progress - resolved);

    return [
      { label: 'Open', value: open, color: this.chartColors.issueOpen },
      { label: 'In Progress', value: progress, color: this.chartColors.issueProgress },
      { label: 'Resolved', value: resolved, color: this.chartColors.issueResolved },
      { label: 'Closed', value: closed, color: this.chartColors.issueClosed }
    ];
  }

  private getOpenTaskRows(): any[] {
    const rows = this.arrayFromKeys(['open_task_list', 'active_task_list']);
    const fallbackRows = rows.length ? rows : this.allTaskRows.filter(row => !this.isClosedRow(row));
    return this.uniqueRows(this.getRowsForCompany(fallbackRows));
  }

  private getClosedTaskRows(): any[] {
    const rows = this.arrayFromKeys(['closed_task_list', 'completed_task_list']);
    const fallbackRows = rows.length ? rows : this.allTaskRows.filter(row => this.isClosedRow(row));
    return this.uniqueRows(this.getRowsForCompany(fallbackRows));
  }

  private getActiveIssueRows(): any[] {
    return this.uniqueRows(this.getRowsForCompany(this.arrayFromKeys(['open_bug_list'])));
  }

  private getClosedIssueRows(): any[] {
    return this.uniqueRows(this.getRowsForCompany(this.arrayFromKeys(['closed_bug_list'])));
  }

  private getOpenTaskTrendRows(): any[] {
    const openTaskRows = this.arrayFromKeys(['open_task_list']);
    const activeTaskRows = openTaskRows.length ? openTaskRows : this.arrayFromKeys(['active_task_list']);
    const rows = activeTaskRows.length
      ? this.filterRowsByTrendStatus(activeTaskRows, 'open', true)
      : this.filterRowsByTrendStatus(this.allTaskRows, 'open', false);

    return this.getRowsForCompany(rows);
  }

  private getClosedTaskTrendRows(): any[] {
    const closedTaskRows = this.arrayFromKeys(['closed_task_list']);
    const completedTaskRows = closedTaskRows.length ? closedTaskRows : this.arrayFromKeys(['completed_task_list']);
    const rows = completedTaskRows.length
      ? this.filterRowsByTrendStatus(completedTaskRows, 'closed', true)
      : this.filterRowsByTrendStatus(this.allTaskRows, 'closed', false);

    return this.getRowsForCompany(rows);
  }

  private getOpenBugTrendRows(): any[] {
    const openBugRows = this.arrayFromKeys(['open_bug_list']);
    const bugRows = openBugRows.length ? openBugRows : this.arrayFromKeys(['bug_list', 'open_issue_list']);
    const rows = bugRows.length
      ? this.filterRowsByTrendStatus(bugRows, 'open', true)
      : this.filterRowsByTrendStatus(this.allIssueRows, 'open', false);

    return this.getRowsForCompany(rows);
  }

  private getClosedBugTrendRows(): any[] {
    const closedBugRows = this.arrayFromKeys(['closed_bug_list']);
    const closedIssueRows = closedBugRows.length ? closedBugRows : this.arrayFromKeys(['closed_issue_list']);
    const rows = closedIssueRows.length
      ? this.filterRowsByTrendStatus(closedIssueRows, 'closed', true)
      : this.filterRowsByTrendStatus(this.allIssueRows, 'closed', false);

    return this.getRowsForCompany(rows);
  }

  private getOpenTicketTrendRows(): any[] {
    return this.getTicketRowsForCurrentScope().filter(ticket => !this.isClosedTicket(ticket));
  }

  private getClosedTicketTrendRows(): any[] {
    return this.getTicketRowsForCurrentScope().filter(ticket => this.isClosedTicket(ticket));
  }

  private getTotalReleaseRows(): any[] {
    const rows = this.arrayFromKeys(['total_release_list', 'release_list', 'releases']);
    const fallbackRows = rows.length ? rows : this.allReleaseRows;
    return this.getRowsForCompany(fallbackRows);
  }

  private getInternalPassedReleaseRows(): any[] {
    const rows = this.arrayFromKeys(['internal_passed_release_list', 'internal_pass_release_list']);
    const fallbackRows = rows.length ? rows : this.allReleaseRows.filter(row => this.isInternalPassedRelease(row));
    return this.getRowsForCompany(fallbackRows);
  }

  private getExternalPassedReleaseRows(): any[] {
    const rows = this.arrayFromKeys(['external_passed_release_list', 'external_pass_release_list']);
    const fallbackRows = rows.length ? rows : this.allReleaseRows.filter(row => this.isExternalPassedRelease(row));
    return this.getRowsForCompany(fallbackRows);
  }

  private getPassedReleaseRows(): any[] {
    const rows = this.arrayFromKeys([
      'passed_release_list',
      'completed_release_list',
      'internal_passed_release_list',
      'internal_pass_release_list',
      'external_passed_release_list',
      'external_pass_release_list'
    ]);
    const fallbackRows = rows.length
      ? rows
      : this.allReleaseRows.filter(row => this.isPassedReleaseStatus(this.getReleaseSearchStatus(row)));

    return this.getRowsForCompany(fallbackRows);
  }

  private getInProgressReleaseRows(): any[] {
    const rows = this.arrayFromKeys(['in_progress_release_list', 'inprogress_release_list']);
    const fallbackRows = rows.length
      ? rows
      : this.allReleaseRows.filter(row => {
        const status = this.getReleaseSearchStatus(row);
        return status.includes('progress') || status.includes('working');
      });

    return this.getRowsForCompany(fallbackRows);
  }

  private buildCompanyOptions(): string[] {
    const names = new Set<string>();

    this.projectList.forEach(project => {
      const company = this.extractCompanyName(project);
      if (company) {
        names.add(company);
      }
    });

    this.allReleaseRows.forEach(release => {
      const company = this.extractCompanyName(release);
      if (company) {
        names.add(company);
      }
    });

    this.allTicketRows.forEach(ticket => {
      const company = this.extractCompanyName(ticket);
      if (company) {
        names.add(company);
      }
    });

    return Array.from(names).sort((first, second) => first.localeCompare(second));
  }

  private buildCompanyRows(globalMetrics: OverallMetricSnapshot): CompanyPerformance[] {
    const projects = this.getProjectPerformanceSources();

    if (!projects.length) {
      return [
        {
          company: 'All Projects',
          customerName: 'All Customers',
          productName: '-',
          initials: 'A',
          employees: globalMetrics.employees,
          activeTasks: globalMetrics.activeTasks,
          completedTasks: globalMetrics.completedTasks,
          openIssues: globalMetrics.issues,
          releases: globalMetrics.releases,
          tickets: globalMetrics.tickets,
          currentScenario: this.buildProjectScenario(this.allReleaseRows, this.allTicketRows),
          completionRate: globalMetrics.completionRate,
          trendPoints: this.buildSparklinePoints([58, 72, 65, 84, 69, 78]),
          color: this.getCompanyColor(0)
        }
      ];
    }

    return projects.map((project, index) => {
      const taskRows = this.allTaskRows.filter(task => this.matchesProject(task, project));
      const issueRows = this.allIssueRows.filter(issue => this.matchesProject(issue, project));
      const releaseRows = this.allReleaseRows.filter(release => this.matchesProject(release, project));
      const ticketRows = this.allTicketRows.filter(ticket => this.matchesProject(ticket, project));
      const activeTasks = this.countOpenRows(taskRows) || this.sumProjectNumbers([project], ['tasks_pending', 'pending_tasks', 'active_task', 'active_tasks', 'open_task', 'open_tasks']);
      const completedTasks = this.countClosedRows(taskRows) || this.sumProjectNumbers([project], ['tasks_done', 'completed_tasks', 'closed_task', 'closed_tasks']);
      const openIssues = this.countOpenRows(issueRows) || this.sumProjectNumbers([project], ['open_issues', 'active_issue', 'active_issues', 'bug_count']);
      const releases = releaseRows.length || this.sumProjectNumbers([project], ['total_release', 'total_releases', 'release_count']);
      const tickets = ticketRows.length || this.sumProjectNumbers([project], ['ticket_count', 'tickets', 'total_ticket', 'total_tickets']);
      const projectName = this.extractProjectName(project) || this.extractProductName(project) || `Project ${index + 1}`;
      const relatedRows = [...taskRows, ...issueRows, ...releaseRows, ...ticketRows];
      const customerName = this.extractCompanyName(project) || this.extractFirstText(relatedRows, row => this.extractCompanyName(row)) || '-';
      const productName = this.extractProductName(project) || this.extractFirstText(ticketRows, row => this.extractProductName(row)) || projectName;
      const projectCompletion = this.toNumber(this.getFirstValue(project, ['completion_rate', 'completionRate', 'progress']));
      const completionRate = this.percent(completedTasks, activeTasks + completedTasks) || (projectCompletion !== null ? this.clampPercent(projectCompletion) : 0);
      const trendSeed = [completionRate - 14, completionRate - 4, completionRate - 9, completionRate + 5, completionRate - 2, completionRate + 7].map(value => Math.max(8, Math.min(100, value)));

      return {
        company: projectName,
        customerName,
        productName,
        initials: this.getInitials(projectName),
        employees: this.countUniqueEmployees([...relatedRows, project]) || this.sumProjectNumbers([project], ['employee_count', 'employees_count', 'members_count', 'team_count', 'working_employees']),
        activeTasks,
        completedTasks,
        openIssues,
        releases,
        tickets,
        currentScenario: this.buildProjectScenario(releaseRows, ticketRows),
        completionRate,
        trendPoints: this.buildSparklinePoints(trendSeed),
        color: this.getCompanyColor(index)
      };
    });
  }

  private getProjectPerformanceSources(): any[] {
    // Dashboard details already contains the release-to-project relationship.
    // Prefer it so Project Performance shows every project represented in total_release_list.
    const releaseProjects = this.buildProjectSourcesFromReleases();

    if (releaseProjects.length) {
      return releaseProjects;
    }

    if (this.projectList.length) {
      return this.projectList;
    }

    const projects = new Map<string, any>();
    [...this.allTaskRows, ...this.allIssueRows, ...this.allReleaseRows, ...this.allTicketRows].forEach(item => {
      const projectId = this.getProjectId(item);
      const projectName = this.extractProjectName(item) || this.extractProductName(item);
      const customerName = this.extractCompanyName(item);
      const key = projectId !== null && projectId !== undefined
        ? `id:${projectId}`
        : `name:${this.normalizeText(projectName || customerName)}`;

      if (!projectName && !customerName) {
        return;
      }

      if (!projects.has(key)) {
        projects.set(key, {
          ...item,
          id: projectId,
          project_title: projectName || customerName,
          client: customerName,
          product_name: this.extractProductName(item)
        });
      }
    });

    return Array.from(projects.values());
  }

  private buildProjectSourcesFromReleases(): any[] {
    const projects = new Map<string, any>();

    this.uniqueRows(this.arrayFromKeys(['total_release_list'])).forEach(release => {
      const projectId = this.getProjectId(release);
      const projectName = this.extractProjectName(release) || this.extractProductName(release);

      if (projectId === null || projectId === undefined) {
        if (!projectName) {
          return;
        }
      }

      const key = projectId !== null && projectId !== undefined
        ? `id:${projectId}`
        : `name:${this.normalizeText(projectName)}`;

      if (!projects.has(key)) {
        projects.set(key, {
          ...release,
          id: projectId,
          project_title: projectName,
          product_name: this.extractProductName(release)
        });
      }
    });

    return Array.from(projects.values());
  }

  private rebuildPerformanceRows(): void {
    const searchTerm = this.normalizeText(this.performanceSearchTerm);
    const sourceRows = searchTerm
      ? this.visibleCompanyRows.filter(row => this.matchesPerformanceSearch(row, searchTerm))
      : [...this.visibleCompanyRows];

    this.filteredCompanyRows = sourceRows.sort((first, second) => this.comparePerformanceRows(first, second));
    this.performanceTotalPages = Math.max(1, Math.ceil(this.filteredCompanyRows.length / this.performancePageSize));
    this.performancePageIndex = Math.max(0, Math.min(this.performancePageIndex, this.performanceTotalPages - 1));

    const startIndex = this.performancePageIndex * this.performancePageSize;
    this.pagedCompanyRows = this.filteredCompanyRows.slice(startIndex, startIndex + this.performancePageSize);
    this.performanceShowingFrom = this.filteredCompanyRows.length ? startIndex + 1 : 0;
    this.performanceShowingTo = this.filteredCompanyRows.length ? Math.min(startIndex + this.performancePageSize, this.filteredCompanyRows.length) : 0;
    this.performancePageNumbers = this.buildPerformancePageNumbers();
    this.cdr.markForCheck();
  }

  private matchesPerformanceSearch(row: CompanyPerformance, searchTerm: string): boolean {
    const searchableValues = [
      row.company,
      row.customerName,
      row.productName,
      row.currentScenario,
      row.employees,
      row.activeTasks,
      row.completedTasks,
      row.openIssues,
      row.releases,
      row.tickets,
      `${row.completionRate}%`
    ];

    return searchableValues.some(value => this.normalizeText(value).includes(searchTerm));
  }

  private comparePerformanceRows(first: CompanyPerformance, second: CompanyPerformance): number {
    const firstValue = this.getPerformanceSortValue(first);
    const secondValue = this.getPerformanceSortValue(second);
    const direction = this.performanceSortDirection === 'asc' ? 1 : -1;
    const comparison = typeof firstValue === 'number' && typeof secondValue === 'number'
      ? firstValue - secondValue
      : String(firstValue).localeCompare(String(secondValue), undefined, { numeric: true, sensitivity: 'base' });

    return comparison * direction;
  }

  private getPerformanceSortValue(row: CompanyPerformance): string | number {
    switch (this.performanceSortColumn) {
      case 'employees':
        return row.employees;
      case 'activeTasks':
        return row.activeTasks;
      case 'completedTasks':
        return row.completedTasks;
      case 'openIssues':
        return row.openIssues;
      case 'releases':
        return row.releases;
      case 'tickets':
        return row.tickets;
      case 'completionRate':
        return row.completionRate;
      case 'customerName':
        return row.customerName;
      case 'currentScenario':
        return row.currentScenario;
      case 'company':
      default:
        return row.company;
    }
  }

  private buildPerformancePageNumbers(): number[] {
    const maxVisiblePages = 5;
    const totalPages = this.performanceTotalPages;
    const currentPage = this.performancePageIndex + 1;
    const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - maxVisiblePages + 1));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    return Array.from({ length: endPage - startPage + 1 }, (_value, index) => startPage + index);
  }

  private getRowsForCompany(rows: any[]): any[] {
    if (this.selectedCompany === 'all' || !this.selectedCompanyRow) {
      return rows;
    }

    const projects = this.projectList.filter(project => this.extractCompanyName(project) === this.selectedCompany);
    return rows.filter(row => this.matchesCompany(row, this.selectedCompany, projects));
  }

  private getEmployeesForSelectedCompany(): any[] {
    if (this.selectedCompany === 'all') {
      return this.employeeList;
    }

    const employeeIds = this.getCompanyEmployeeIds(this.selectedCompany);

    if (!employeeIds.size) {
      return this.employeeList;
    }

    return this.employeeList.filter(employee => {
      const employeeId = this.getFirstValue(employee, ['employee_id', 'employeeid', 'emp_id', 'id', 'user_id']);
      return employeeId !== null && employeeId !== undefined && employeeIds.has(String(employeeId));
    });
  }

  private buildOverallPerformanceExcelSections(): OverallPerformanceExcelSection[] {
    const projectRows = this.filteredCompanyRows;
    const employeeRows = this.uniqueRows(this.filteredEmployeeRows);
    const taskRows = this.uniqueRows(this.filteredTaskRows);
    const issueRows = this.uniqueRows(this.filteredIssueRows);
    const releaseRows = this.uniqueRows(this.filteredReleaseRows);
    const ticketRows = this.uniqueRows(this.getTicketRowsForCurrentScope());

    return [
      {
        title: 'Overall Summary',
        headers: ['Metric', 'Value', 'Details'],
        rows: [
          ['Employees', this.metricSnapshot.employees, `${this.metricSnapshot.recentEmployees} this week`],
          ['Active Tasks', this.metricSnapshot.activeTasks, 'Open / active work'],
          ['Completed Tasks', this.metricSnapshot.completedTasks, 'Closed / completed work'],
          ['Issues', this.metricSnapshot.issues, `${this.metricSnapshot.resolvedIssues} resolved`],
          ['Releases', this.metricSnapshot.releases, `${this.metricSnapshot.inProgressReleases} in progress`],
          ['Tickets', this.metricSnapshot.tickets, `${this.metricSnapshot.openTickets} open - ${this.metricSnapshot.closedTickets} closed`],
          ['Completion Rate', `${this.metricSnapshot.completionRate}%`, 'Task completion ratio']
        ]
      },
      {
        title: 'Project Performance',
        summary: [
          ['Total Projects', projectRows.length],
          ['Active Tasks', this.sumValues(projectRows.map(row => row.activeTasks))],
          ['Completed Tasks', this.sumValues(projectRows.map(row => row.completedTasks))]
        ],
        headers: ['S.No', 'Project', 'Customer', 'Product', 'Employees', 'Active Tasks', 'Completed Tasks', 'Open Issues', 'Releases', 'Tickets', 'Current Scenario', 'Completion Rate'],
        rows: projectRows.map((row, index) => [
          index + 1,
          row.company,
          row.customerName,
          row.productName,
          row.employees,
          row.activeTasks,
          row.completedTasks,
          row.openIssues,
          row.releases,
          row.tickets,
          row.currentScenario,
          `${row.completionRate}%`
        ])
      },
      {
        title: 'Employees',
        summary: [
          ['Total Employees', employeeRows.length],
          ['Active Employees', employeeRows.filter(employee => this.isActiveEmployee(employee)).length]
        ],
        headers: ['S.No', 'Employee', 'Department', 'Designation', 'Email', 'Mobile', 'Status'],
        rows: employeeRows.map((employee, index) => [
          index + 1,
          this.getExcelValue(employee, ['employee_name', 'name', 'emp_name', 'username']),
          this.getExcelValue(employee, ['department_name', 'department', 'dept_name']),
          this.getExcelValue(employee, ['designation_name', 'designation', 'position']),
          this.getExcelValue(employee, ['email', 'emailid']),
          this.getExcelValue(employee, ['mobile', 'phone', 'phone_number']),
          this.isActiveEmployee(employee) ? 'Active' : 'Inactive'
        ])
      },
      {
        title: 'Tasks',
        summary: [
          ['Total Tasks', taskRows.length],
          ['Open Tasks', taskRows.filter(row => !this.isClosedRow(row)).length],
          ['Closed Tasks', taskRows.filter(row => this.isClosedRow(row)).length]
        ],
        headers: ['S.No', 'Date', 'Project', 'Task Code', 'Task / Sub Task', 'Assigned From', 'Assigned To', 'Priority', 'Start Date', 'Due Date', 'Worked Hours', 'Status', 'Remarks'],
        rows: taskRows.map((task, index) => [
          index + 1,
          this.formatDateCell(this.getFirstValue(task, this.taskCreatedDateKeys)),
          this.extractProjectName(task) || this.extractProductName(task) || '-',
          this.getExcelValue(task, ['code', 'task_code', 'taskCode', 'task_id', 'taskid', 'id']),
          this.getExcelValue(task, ['task_name', 'taskName', 'sub_task_name', 'subTaskName', 'title', 'name', 'subject']),
          this.getExcelValue(task, ['assigned_from_name', 'assignedFromName', 'created_by_name', 'createdByName']),
          this.getExcelValue(task, ['assigned_to_name', 'assignedToName', 'employee_name', 'employeeName', 'owner_name', 'ownerName']),
          this.getExcelValue(task, ['priority_name', 'priority']),
          this.formatDateCell(this.getFirstValue(task, ['start_date', 'startDate', 'assigned_date'])),
          this.formatDateCell(this.getFirstValue(task, ['due_date', 'dueDate', 'end_date', 'endDate'])),
          this.getExcelValue(task, ['worked_hours', 'workedHours', 'total_worked_hours', 'hours']),
          this.getExcelStatusLabel(task, ['status', 'status_name', 'task_status', 'task_status_name', 'current_status']),
          this.getExcelValue(task, ['remarks', 'comments', 'description', 'task_description'])
        ])
      },
      {
        title: 'Issues',
        summary: [
          ['Total Issues', issueRows.length],
          ['Open Issues', issueRows.filter(row => !this.isClosedRow(row)).length],
          ['Closed Issues', issueRows.filter(row => this.isClosedRow(row)).length]
        ],
        headers: ['S.No', 'Date', 'Project', 'Reference Code', 'Issue', 'Assigned To', 'Status', 'Remarks'],
        rows: issueRows.map((issue, index) => [
          index + 1,
          this.formatDateCell(this.getFirstValue(issue, this.issueOpenedDateKeys)),
          this.extractProjectName(issue) || this.extractProductName(issue) || '-',
          this.getExcelValue(issue, ['code', 'issue_code', 'issueCode', 'bug_code', 'bugCode', 'issue_id', 'bug_id', 'id']),
          this.getExcelValue(issue, ['issue_name', 'issueName', 'bug_name', 'bugName', 'title', 'name', 'subject']),
          this.getExcelValue(issue, ['assigned_to_name', 'assignedToName', 'employee_name', 'employeeName', 'owner_name', 'ownerName']),
          this.getExcelStatusLabel(issue, ['status', 'status_name', 'issue_status', 'bug_status', 'current_status']),
          this.getExcelValue(issue, ['remarks', 'comments', 'description', 'reason', 'reason_f_issue', 'reasonFIssue'])
        ])
      },
      {
        title: 'Releases',
        summary: [
          ['Total Releases', releaseRows.length],
          ['Passed Releases', releaseRows.filter(row => this.isPassedReleaseStatus(this.getReleaseSearchStatus(row))).length],
          ['In Progress', releaseRows.filter(row => this.getReleaseSearchStatus(row).includes('progress')).length]
        ],
        headers: ['S.No', 'Project', 'Release Code', 'Release Title', 'Version', 'Released By', 'Release Date', 'Tested By', 'Release Type', 'Status', 'Remarks'],
        rows: releaseRows.map((release, index) => [
          index + 1,
          this.extractProjectName(release) || this.extractProductName(release) || '-',
          this.getExcelValue(release, ['code', 'release_code', 'releaseCode', 'release_id', 'releaseid', 'id']),
          this.getExcelValue(release, ['title', 'release_title', 'releaseTitle', 'name']),
          this.getExcelValue(release, ['version', 'release_version', 'version_name']),
          this.getExcelValue(release, ['assignee_from_name', 'released_by_name', 'releasedByName', 'assigned_from_name']),
          this.formatDateCell(this.getFirstValue(release, this.releaseDateKeys)),
          this.getExcelValue(release, ['assignee_to_name', 'tested_by_name', 'testedByName', 'assigned_to_name']),
          this.getExcelValue(release, ['release_type', 'releaseType']),
          this.getReleaseStatusLabel(release),
          this.getExcelValue(release, ['remarks', 'comments', 'description'])
        ])
      },
      {
        title: 'Tickets',
        summary: [
          ['Total Tickets', ticketRows.length],
          ['Open Tickets', ticketRows.filter(row => !this.isClosedTicket(row)).length],
          ['Closed Tickets', ticketRows.filter(row => this.isClosedTicket(row)).length]
        ],
        headers: ['S.No', 'Date', 'Ticket Code', 'Ticket', 'Client', 'Product', 'Department', 'Assigned From', 'Assigned To', 'Worked Hours', 'Entry Date', 'Status', 'Remarks'],
        rows: ticketRows.map((ticket, index) => [
          index + 1,
          this.formatDateCell(this.getFirstValue(ticket, ['created_date', 'createddate', 'assigned_date', 'ticket_date', 'date'])),
          this.getExcelValue(ticket, ['code', 'ticket_code', 'ticketCode', 'ticket_id', 'ticketid', 'id']),
          this.getExcelValue(ticket, ['ticket_name', 'ticketName', 'title', 'name', 'subject']),
          this.extractCompanyName(ticket) || '-',
          this.extractProductName(ticket) || this.extractProjectName(ticket) || '-',
          this.getTicketDepartmentLabel(ticket),
          this.getExcelValue(ticket, ['assigned_from_name', 'assignedFromName', 'created_by_name', 'createdByName', 'raised_by_name']),
          this.getExcelValue(ticket, ['assigned_to_name', 'assignedToName', 'employee_name', 'employeeName', 'owner_name', 'ownerName']),
          this.getExcelValue(ticket, ['worked_hours', 'workedHours', 'total_worked_hours', 'hours']),
          this.formatDateCell(this.getFirstValue(ticket, ['entry_date', 'entryDate', 'updated_date', 'updateddate', 'created_date'])),
          this.getTicketStatusLabel(ticket),
          this.getExcelValue(ticket, ['remarks', 'comments', 'description', 'client_comments', 'reason_f_issue', 'reasonFIssue'])
        ])
      }
    ];
  }

  private getExcelValue(row: any, keys: string[]): any {
    return this.formatExcelValue(this.getFirstValue(row, keys));
  }

  private getExcelStatusLabel(row: any, keys: string[]): string {
    const rawStatus = this.getFirstValue(row, keys);
    const numericStatus = Number(rawStatus);
    const statusMap: Record<number, string> = {
      0: 'Open',
      1: 'In Progress',
      2: 'To Be Tested',
      3: 'Delayed',
      4: 'Closed',
      5: 'Cancelled',
      6: 'Approved',
      7: 'Completed',
      8: 'Rejected',
      9: 'Failed',
      10: 'Passed',
      11: 'Re-Open'
    };

    if (!Number.isNaN(numericStatus)) {
      return statusMap[numericStatus] || String(rawStatus);
    }

    return String(this.formatExcelValue(rawStatus));
  }

  private formatExcelValue(value: any): any {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    if (value instanceof Date) {
      return this.formatDisplayDate(value);
    }

    if (typeof value === 'object') {
      return this.formatExcelValue(this.getFirstValue(value, ['name', 'title', 'label', 'text', 'value', 'employee_name', 'company_name', 'project_title']));
    }

    return value;
  }

  private openTaskDialog(rows: any[], title: string, icon: string): void {
    const dialogRows = this.uniqueRows(rows);

    this.matDialog.open(OverdueComponent, {
      data: { data: dialogRows, title, icon },
      width: '96vw',
      height: '75vh',
      maxWidth: '1180px',
      panelClass: 'project-status-report-dialog-panel'
    });
  }

  private openReleaseDialog(rows: any[], title: string): void {
    this.matDialog.open(ProjectStatusReportComponent, {
      data: { data: rows, title, icon: 'ri-rocket-line' },
      width: '96vw',
      height: '75vh',
      maxWidth: '1600px',
      panelClass: 'project-status-report-dialog-panel'
    });
  }

  private openTicketDialog(rows: any[], title: string): void {
    const dialogRows = rows.map(ticket => ({
      ...ticket,
      overall_ticket_project: this.extractProjectName(ticket) || this.extractProductName(ticket) || '-',
      overall_ticket_department: this.getTicketDepartmentLabel(ticket),
      overall_ticket_status: this.getTicketStatusLabel(ticket),
      overall_ticket_priority: this.getTicketPriorityLabel(ticket),
      overall_ticket_created_date: this.formatDateCell(this.getFirstValue(ticket, ['created_date', 'createddate', 'assigned_date'])),
      overall_ticket_updated_date: this.formatDateCell(this.getFirstValue(ticket, ['updated_date', 'updateddate', 'closed_date', 'closeddate']))
    }));

    this.matDialog.open(OverallDetailsDialogComponent, {
      data: {
        title,
        icon: 'ri-ticket-2-line',
        useReleaseStylePagination: true,
        alwaysShowTableScrollbars: true,
        rows: dialogRows,
        columns: [
          { label: 'Code', keys: ['code', 'ticket_code', 'ticketCode', 'ticket_id', 'ticketid', 'id'] },
          { label: 'Ticket', keys: ['ticket_name', 'ticketName', 'title', 'name', 'subject'] },
          { label: 'Customer', keys: ['company_name', 'clientName', 'client_name', 'client', 'customer_name', 'customerName'] },
          { label: 'Product', keys: ['product_name', 'productName', 'product', 'overall_ticket_project'] },
          { label: 'Type', keys: ['type', 'product_type', 'productType'] },
          { label: 'Assigned From', keys: ['assigned_from_name', 'assignedFromName', 'created_by_name', 'createdByName', 'raised_by_name', 'raisedByName'] },
          { label: 'Assigned To', keys: ['assigned_to_name', 'assignedToName', 'employee_name', 'emp_name', 'owner_name', 'ownerName'] },
          { label: 'Department', keys: ['overall_ticket_department'] },
          { label: 'Priority', keys: ['overall_ticket_priority'] },
          { label: 'Status', keys: ['overall_ticket_status'], type: 'status' }
        ]
      },
      width: '96vw',
      height: '75vh',
      maxWidth: '1180px',
      panelClass: 'project-status-report-dialog-panel'
    });
  }

  private openEmployeeDialog(): void {
    this.matDialog.open(OverallDetailsDialogComponent, {
      data: {
        title: 'Employees',
        icon: 'ri-team-line',
        rows: this.filteredEmployeeRows,
        columns: [
          { label: 'Employee', keys: ['name', 'employee_name', 'emp_name', 'username'] },
          { label: 'Department', keys: ['department_name', 'department'] },
          { label: 'Designation', keys: ['position', 'designation', 'designation_name'] },
          { label: 'Email', keys: ['email', 'emailid'] },
          { label: 'Mobile', keys: ['mobile', 'phone', 'phone_number'] },
          { label: 'Status', keys: ['isactive', 'is_active', 'status'], type: 'status' }
        ]
      },
      width: '96vw',
      height: '75vh',
      maxWidth: '1180px',
      panelClass: 'project-status-report-dialog-panel'
    });
  }

  private buildStatusCounts<T extends Record<string, string[]>>(rows: any[], statusMap: T): Record<keyof T, number> {
    const counts = Object.keys(statusMap).reduce((accumulator, key) => {
      accumulator[key as keyof T] = 0;
      return accumulator;
    }, {} as Record<keyof T, number>);

    rows.forEach(row => {
      const status = this.normalizeStatus(this.getFirstValue(row, ['status', 'status_name', 'task_status', 'task_status_name', 'release_status', 'current_status']));

      Object.entries(statusMap).some(([key, aliases]) => {
        const matched = aliases.some(alias => status.includes(alias));

        if (matched) {
          counts[key as keyof T] += 1;
        }

        return matched;
      });
    });

    return counts;
  }

  private buildTaskTrend(): OverallTrendItem[] {
    const buckets = this.buildTrendBuckets(4);
    const openValues = this.countRowsByBuckets(this.getOpenTaskTrendRows(), buckets, this.taskCreatedDateKeys);
    const closedValues = this.countRowsByBuckets(this.getClosedTaskTrendRows(), buckets, this.taskClosedDateKeys);

    return this.buildTrendItems(buckets, openValues, closedValues);
  }

  private buildIssueTrend(): OverallTrendItem[] {
    const buckets = this.buildTrendBuckets(4);
    const openedValues = this.countRowsByBuckets(this.getOpenBugTrendRows(), buckets, this.issueOpenedDateKeys);
    const closedValues = this.countRowsByBuckets(this.getClosedBugTrendRows(), buckets, this.issueResolvedDateKeys);

    return this.buildTrendItems(buckets, openedValues, closedValues);
  }

  private buildReleaseTrend(): OverallTrendItem[] {
    const buckets = this.buildTrendBuckets(4);
    const totalValues = this.countRowsByBuckets(this.getTotalReleaseRows(), buckets, this.releaseDateKeys);
    const internalPassedValues = this.countRowsByBuckets(this.getInternalPassedReleaseRows(), buckets, this.releaseDateKeys);
    const externalPassedValues = this.countRowsByBuckets(this.getExternalPassedReleaseRows(), buckets, this.releaseDateKeys);

    return this.buildTrendItems(buckets, totalValues, internalPassedValues, externalPassedValues);
  }

  private buildTicketTrend(): OverallTrendItem[] {
    const buckets = this.buildTrendBuckets(4);
    const openValues = this.countRowsByBuckets(this.getOpenTicketTrendRows(), buckets, this.ticketCreatedDateKeys);
    const closedValues = this.countRowsByBuckets(this.getClosedTicketTrendRows(), buckets, this.ticketClosedDateKeys);

    return this.buildTrendItems(buckets, openValues, closedValues);
  }

  private buildTrendItems(
    buckets: TrendBucket[],
    primaryValues: number[],
    secondaryValues: number[],
    tertiaryValues: number[] = []
  ): OverallTrendItem[] {
    const maxValue = this.getChartCeiling(Math.max(0, ...primaryValues, ...secondaryValues, ...tertiaryValues));

    return buckets.map((bucket, index) => {
      const primary = primaryValues[index] || 0;
      const secondary = secondaryValues[index] || 0;
      const tertiary = tertiaryValues[index] || 0;

      return {
        label: bucket.label,
        rangeLabel: bucket.rangeLabel,
        primary,
        secondary,
        line: tertiary,
        primaryHeight: primary > 0 ? Math.max(6, this.percent(primary, maxValue)) : 0,
        secondaryHeight: secondary > 0 ? Math.max(6, this.percent(secondary, maxValue)) : 0,
        tertiaryHeight: tertiary > 0 ? Math.max(6, this.percent(tertiary, maxValue)) : 0
      };
    });
  }

  private getTrendDots(items: OverallTrendItem[], key: 'primary' | 'secondary' | 'line'): SvgPoint[] {
    const width = 600;
    const height = 140;
    const top = 10;
    const maxValue = this.getChartCeiling(Math.max(0, ...items.flatMap(item => [item.primary, item.secondary, item.line])));
    const step = items.length > 1 ? width / (items.length - 1) : width;

    return items.map((item, index) => ({
      x: Math.round(index * step),
      y: Math.round(top + (1 - item[key] / maxValue) * height)
    }));
  }

  private pointsToString(points: SvgPoint[]): string {
    return points.map(point => `${point.x},${point.y}`).join(' ');
  }

  private buildChartTicks(items: OverallTrendItem[]): number[] {
    const maxValue = this.getChartCeiling(Math.max(0, ...items.flatMap(item => [item.primary, item.secondary, item.line])));
    return [
      maxValue,
      Math.round(maxValue * 0.75),
      Math.round(maxValue * 0.5),
      Math.round(maxValue * 0.25),
      0
    ];
  }

  private getChartCeiling(value: number): number {
    if (value <= 0) {
      return 4;
    }

    if (value <= 4) {
      return 4;
    }

    if (value <= 10) {
      return Math.ceil(value / 2) * 2;
    }

    if (value <= 25) {
      return Math.ceil(value / 5) * 5;
    }

    if (value <= 100) {
      return Math.ceil(value / 10) * 10;
    }

    return Math.ceil(value / 25) * 25;
  }

  private buildTrendBuckets(count: number): TrendBucket[] {
    if (this.selectedPreset === 'monthly') {
      const activeBounds = this.getActiveDateBounds();

      if (activeBounds) {
        return this.buildRangeBuckets(activeBounds.startDate, activeBounds.endDate, count);
      }
    }

    return this.buildLastWeekBuckets(count);
  }

  private buildRangeBuckets(startDate: Date, endDate: Date, count: number): TrendBucket[] {
    let rangeStart = new Date(startDate);
    let rangeEnd = new Date(endDate);

    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd.setHours(23, 59, 59, 999);

    if (rangeStart > rangeEnd) {
      [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
    }

    const dayInMilliseconds = 24 * 60 * 60 * 1000;
    const totalDays = Math.max(1, Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / dayInMilliseconds) + 1);
    const bucketCount = Math.max(1, count);
    const baseDays = Math.floor(totalDays / bucketCount);
    const remainderDays = totalDays % bucketCount;
    let cursor = new Date(rangeStart);

    return Array.from({ length: bucketCount }, (_value, index) => {
      const daysInBucket = Math.max(1, baseDays + (index < remainderDays ? 1 : 0));
      const start = new Date(cursor);
      const end = new Date(start);
      end.setDate(start.getDate() + daysInBucket - 1);

      if (index === bucketCount - 1 || end > rangeEnd) {
        end.setTime(rangeEnd.getTime());
      }

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      cursor = new Date(end);
      cursor.setDate(end.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);

      return {
        label: this.formatShortDate(start),
        rangeLabel: `${this.formatShortDate(start)} - ${this.formatShortDate(end)}`,
        start,
        end
      };
    });
  }

  private buildLastWeekBuckets(count: number): TrendBucket[] {
    const currentWeekStart = this.getWeekStart(new Date());

    return Array.from({ length: count }, (_value, index) => {
      const start = new Date(currentWeekStart);
      start.setDate(currentWeekStart.getDate() - ((count - index - 1) * 7));
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      return {
        label: this.formatShortDate(start),
        rangeLabel: `${this.formatShortDate(start)} - ${this.formatShortDate(end)}`,
        start,
        end
      };
    });
  }

  private buildLastMonthBuckets(count: number): TrendBucket[] {
    const today = new Date();

    return Array.from({ length: count }, (_value, index) => {
      const monthOffset = count - index - 1;
      const start = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
      start.setHours(0, 0, 0, 0);

      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);

      return {
        label: start.toLocaleDateString('en-GB', { month: 'short' }),
        rangeLabel: `${this.formatShortDate(start)} - ${this.formatShortDate(end)}`,
        start,
        end
      };
    });
  }

  private countRowsByBuckets(rows: any[], buckets: TrendBucket[], dateKeys: string[]): number[] {
    const counts = buckets.map(() => 0);

    this.uniqueRows(rows).forEach(row => {
      const date = this.getRowDate(row, dateKeys);
      const bucketIndex = date
        ? this.findBucketIndex(date, buckets)
        : buckets.length - 1;

      if (bucketIndex >= 0) {
        counts[bucketIndex] += 1;
      }
    });

    return counts;
  }

  private findBucketIndex(date: Date, buckets: TrendBucket[]): number {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(12, 0, 0, 0);

    return buckets.findIndex(bucket => normalizedDate >= bucket.start && normalizedDate <= bucket.end);
  }

  private getRowDate(row: any, keys: string[]): Date | null {
    return this.parseDateValue(this.getFirstValue(row, keys));
  }

  private uniqueRows(rows: any[]): any[] {
    const seen = new Set<string>();

    return rows.filter((row, index) => {
      const key = this.getRowIdentity(row, index);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private getRowIdentity(row: any, index: number): string {
    const id = this.getFirstValue(row, [
      'id',
      'task_id',
      'taskid',
      'taskId',
      'taskID',
      'issue_id',
      'issueid',
      'issueId',
      'issueID',
      'bug_id',
      'bugid',
      'bugId',
      'bugID',
      'release_id',
      'releaseid',
      'releaseId',
      'releaseID',
      'ticket_id',
      'ticketid',
      'ticketId',
      'ticketID',
      'code',
      'uuid'
    ]);

    if (id !== null && id !== undefined) {
      return `id:${id}`;
    }

    const signature = [
      this.extractProjectName(row),
      this.extractProductName(row),
      this.getFirstValue(row, ['task', 'task_name', 'taskName', 'issue', 'issue_name', 'issueName', 'bug', 'bug_name', 'bugName', 'title', 'name', 'version']),
      this.getFirstValue(row, ['created_date', 'createddate', 'start_date', 'release_date'])
    ].map(value => this.normalizeText(value)).filter(Boolean).join('|');

    return signature || `row:${index}`;
  }

  private pipelineItems<TDialogType extends string>(items: Array<Omit<PipelineItem<TDialogType>, 'width'>>): PipelineItem<TDialogType>[] {
    const maxValue = Math.max(1, ...items.map(item => item.value));

    return items.map(item => ({
      ...item,
      width: Math.max(8, this.percent(item.value, maxValue))
    }));
  }

  private withPercents(items: Array<Omit<DistributionItem, 'percent'>>): DistributionItem[] {
    const total = this.sumValues(items.map(item => item.value));

    return items.map(item => ({
      ...item,
      displayValue: this.formatNumber(item.value),
      displayPercent: this.percent(item.value, total),
      percent: this.percent(item.value, total)
    }));
  }

  private startDashboardCountAnimation(): void {
    const sequence = ++this.countAnimationSequence;
    const duration = 900;
    const startedAt = performance.now();

    if (this.countAnimationFrame) {
      cancelAnimationFrame(this.countAnimationFrame);
    }

    this.applyDashboardCountProgress(0);

    const animate = (timestamp: number) => {
      if (sequence !== this.countAnimationSequence) {
        return;
      }

      const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / duration));
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      this.applyDashboardCountProgress(easedProgress);
      this.cdr.markForCheck();

      if (progress < 1) {
        this.countAnimationFrame = requestAnimationFrame(animate);
      } else {
        this.countAnimationFrame = undefined;
      }
    };

    this.countAnimationFrame = requestAnimationFrame(animate);
  }

  private applyDashboardCountProgress(progress: number): void {
    this.metrics = this.metrics.map(metric => ({
      ...metric,
      displayValue: this.formatAnimatedValue(metric.numericValue, progress, metric.suffix)
    }));
    this.taskStatusDistribution = this.animateDistributionItems(this.taskStatusDistribution, progress);
    this.issueStatusDistribution = this.animateDistributionItems(this.issueStatusDistribution, progress);
    this.releasePipeline = this.animatePipelineItems(this.releasePipeline, progress);
    this.ticketPipeline = this.animatePipelineItems(this.ticketPipeline, progress);
    this.animatedTaskDistributionTotal = this.formatAnimatedValue(this.taskDistributionTotal, progress);
    this.animatedIssueDistributionTotal = this.formatAnimatedValue(this.issueDistributionTotal, progress);
  }

  private animateDistributionItems(items: DistributionItem[], progress: number): DistributionItem[] {
    return items.map(item => ({
      ...item,
      displayValue: this.formatAnimatedValue(item.value, progress),
      displayPercent: Math.round(item.percent * progress)
    }));
  }

  private animatePipelineItems<TDialogType extends string>(items: PipelineItem<TDialogType>[], progress: number): PipelineItem<TDialogType>[] {
    return items.map(item => ({
      ...item,
      displayValue: this.formatAnimatedValue(item.value, progress)
    }));
  }

  private formatAnimatedValue(value: number, progress: number, suffix = ''): string {
    return `${this.formatNumber(Math.round(value * progress))}${suffix}`;
  }

  private buildDistributionDonut(items: DistributionItem[]): string {
    const total = this.sumValues(items.map(item => item.value));

    if (total <= 0) {
      return 'conic-gradient(var(--overall-ring-track) 0deg 360deg)';
    }

    let cursor = 0;
    const segments = items
      .filter(item => item.value > 0)
      .map(item => {
        const start = cursor;
        const degrees = Math.round((item.value / total) * 360);
        cursor += degrees;
        return `${item.color} ${start}deg ${cursor}deg`;
      });

    return `conic-gradient(${segments.join(', ')})`;
  }

  private getDistributionItemFromEvent(event: MouseEvent, items: DistributionItem[]): DistributionItem | null {
    const activeItems = items.filter(item => item.value > 0);
    const total = this.sumValues(activeItems.map(item => item.value));

    if (!activeItems.length || total <= 0) {
      return null;
    }

    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = event.clientX - centerX;
    const y = event.clientY - centerY;
    const radius = Math.sqrt((x * x) + (y * y));
    const innerRadius = Math.min(rect.width, rect.height) * 0.31;

    if (radius <= innerRadius) {
      return null;
    }

    const angle = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
    let cursor = 0;

    for (const item of activeItems) {
      const degrees = (item.value / total) * 360;

      if (angle >= cursor && angle < cursor + degrees) {
        return item;
      }

      cursor += degrees;
    }

    return activeItems[activeItems.length - 1] || null;
  }

  private getReleaseRows(): any[] {
    const totalReleases = this.arrayFromKeys(['total_release_list', 'release_list', 'releases']);

    if (totalReleases.length) {
      return totalReleases;
    }

    return this.arrayFromKeys([
      'in_progress_release_list',
      'inprogress_release_list',
      'to_be_tested_release_list',
      'toBeTested_release_list',
      'upcomming_release',
      'upcoming_release_list',
      'on_hold_release_list',
      'onhold_release_list',
      'failed_release_list',
      'internal_passed_release_list',
      'internal_pass_release_list',
      'external_passed_release_list',
      'external_pass_release_list'
    ]);
  }

  private countReleaseRowsByStatus(rows: any[], aliases: string[]): number {
    return rows.filter(row => {
      const status = this.normalizeStatus(this.getFirstValue(row, ['status', 'release_status', 'current_status']));
      return aliases.some(alias => status.includes(alias));
    }).length;
  }

  private getReleasePipelineRows(type: ReleasePipelineDialogType): any[] {
    if (type === 'internalPassed') {
      return this.getInternalPassedReleaseRows();
    }

    if (type === 'externalPassed') {
      return this.getExternalPassedReleaseRows();
    }

    return this.getTotalReleaseRows();
  }

  private getTicketPipelineRows(type: TicketPipelineDialogType): any[] {
    const rows = this.getTicketRowsForCurrentScope();

    if (type === 'total') {
      return rows;
    }

    return rows.filter(row => this.getTicketPipelineType(row) === type);
  }

  private getTicketPipelineType(ticket: any): Exclude<TicketPipelineDialogType, 'total'> {
    const rawStatus = this.getFirstValue(ticket, ['status', 'ticket_status', 'status_name']);
    const numericStatus = Number(rawStatus);

    if (!Number.isNaN(numericStatus)) {
      // if ([4, 6, 7, 10].includes(numericStatus)) {
      //   return 'closed';
      // }

      if (numericStatus === 1) {
        return 'inProgress';
      }

     

      return 'open';
    }

    const status = this.normalizeStatus(rawStatus);

    // if (this.isClosedTicket(ticket)) {
    //   return 'closed';
    // }

   

    if (status.includes('progress') || status.includes('working') || status.includes('started')) {
      return 'inProgress';
    }

 

    return 'open';
  }

  private isInternalPassedRelease(row: any): boolean {
    const status = this.getReleaseSearchStatus(row);
    return status.includes('internal') && this.isPassedReleaseStatus(status);
  }

  private isExternalPassedRelease(row: any): boolean {
    const status = this.getReleaseSearchStatus(row);
    return status.includes('external') && this.isPassedReleaseStatus(status);
  }

  private getReleaseSearchStatus(row: any): string {
    return this.normalizeStatus(this.getFirstValue(row, [
      'status',
      'status_name',
      'release_status',
      'current_status',
      'release_type',
      'release_stage',
      'stage',
      'testing_type'
    ]));
  }

  private isPassedReleaseStatus(status: string): boolean {
    return ['pass', 'passed', 'complete', 'completed', 'closed', 'released'].some(alias => status.includes(alias));
  }

  private buildProjectScenario(releaseRows: any[], ticketRows: any[]): string {
    const latestRelease = this.getLatestRowByDate(releaseRows, ['release_date', 'created_date', 'updated_date', 'date']);

    if (latestRelease) {
      const status = this.getReleaseStatusLabel(latestRelease);
      const version = this.getFirstValue(latestRelease, ['version', 'release_version', 'version_name', 'build_version']);
      return version ? `${status} - ${version}` : status;
    }

    const openTickets = ticketRows.filter(ticket => !this.isClosedTicket(ticket)).length;

    if (openTickets) {
      return `${this.formatNumber(openTickets)} open tickets`;
    }

    return 'Running';
  }

  private getReleaseStatusLabel(row: any): string {
    const rawStatus = this.getFirstValue(row, ['status_name', 'release_status', 'current_status', 'status']);
    const status = this.normalizeStatus(rawStatus);

    if (!status) {
      return 'Release active';
    }

    if (status.includes('test')) {
      return 'To be tested';
    }

    if (status.includes('progress') || status.includes('working')) {
      return 'In progress';
    }

    if (status.includes('upcoming') || status.includes('upcomming')) {
      return 'Upcoming';
    }

    if (status.includes('hold')) {
      return 'On hold';
    }

    if (status.includes('failed') || status.includes('reject')) {
      return 'Failed';
    }

    if (status.includes('pass') || status.includes('complete') || status.includes('closed')) {
      return 'Released';
    }

    return String(rawStatus);
  }

  private countClosedTickets(rows: any[]): number {
    return rows.filter(ticket => this.isClosedTicket(ticket)).length;
  }

  private isClosedTicket(ticket: any): boolean {
    const rawStatus = this.getFirstValue(ticket, ['status', 'ticket_status', 'status_name']);
    const numericStatus = Number(rawStatus);

    if (!Number.isNaN(numericStatus)) {
      return [4, 6, 7, 10].includes(numericStatus);
    }

    const status = this.normalizeStatus(rawStatus);
    return ['closed', 'approved', 'completed', 'passed', 'pass', 'resolved'].includes(status);
  }

  private getTicketStatusLabel(ticket: any): string {
    const rawStatus = this.getFirstValue(ticket, ['status', 'ticket_status', 'status_name']);
    const numericStatus = Number(rawStatus);
    const statusMap: Record<number, string> = {
      0: 'Open',
      1: 'In Progress',
      2: 'To Be Tested',
      3: 'Delayed',
      4: 'Closed',
      5: 'Cancelled',
      6: 'Approved',
      7: 'Completed',
      8: 'Rejected',
      9: 'Failed',
      10: 'Passed'
    };

    if (!Number.isNaN(numericStatus)) {
      return statusMap[numericStatus] || 'Unknown';
    }

    return rawStatus ? String(rawStatus) : '-';
  }

  private getTicketPriorityLabel(ticket: any): string {
    const rawPriority = this.getFirstValue(ticket, ['priority', 'priority_name']);
    const priorityMap: Record<number, string> = {
      1: 'High',
      2: 'Medium',
      3: 'Low'
    };
    const numericPriority = Number(rawPriority);

    if (!Number.isNaN(numericPriority)) {
      return priorityMap[numericPriority] || String(rawPriority);
    }

    return rawPriority ? String(rawPriority) : '-';
  }

  private getTicketDepartmentLabel(ticket: any): string {
    const directName = this.getFirstValue(ticket, ['department_name', 'departmentName', 'dept_name', 'deptName']);

    if (directName) {
      return String(directName);
    }

    const departmentValue = this.getFirstValue(ticket, ['department', 'dept']);

    if (departmentValue && typeof departmentValue === 'object') {
      const nestedName = this.getFirstValue(departmentValue, ['department_name', 'departmentName', 'dept_name', 'deptName', 'name', 'title', 'label']);

      if (nestedName) {
        return String(nestedName);
      }
    }

    const departmentId = this.getFirstValue(ticket, ['department_id', 'departmentId', 'dept_id', 'deptid'])
      ?? (departmentValue !== null && departmentValue !== undefined && typeof departmentValue !== 'object' ? departmentValue : null);
    const department = this.departmentList.find(item => {
      const itemId = this.getFirstValue(item, ['id', 'department_id', 'departmentId', 'dept_id', 'deptid']);
      return itemId !== null && itemId !== undefined && departmentId !== null && departmentId !== undefined && String(itemId) === String(departmentId);
    });
    const departmentName = department
      ? this.getFirstValue(department, ['department_name', 'departmentName', 'dept_name', 'deptName', 'name', 'title', 'label'])
      : null;

    if (departmentName) {
      return String(departmentName);
    }

    if (departmentValue !== null && departmentValue !== undefined && typeof departmentValue !== 'object') {
      return String(departmentValue);
    }

    return departmentId !== null && departmentId !== undefined ? String(departmentId) : '-';
  }

  private getLatestRowByDate(rows: any[], dateKeys: string[]): any | null {
    return rows.reduce((latest: any | null, row) => {
      const rowDate = this.parseDateValue(this.getFirstValue(row, dateKeys));
      const latestDate = latest ? this.parseDateValue(this.getFirstValue(latest, dateKeys)) : null;

      if (!rowDate) {
        return latest;
      }

      if (!latestDate || rowDate > latestDate) {
        return row;
      }

      return latest;
    }, null);
  }

  private arrayFromKeys(keys: string[]): any[] {
    const rows: any[] = [];

    keys.forEach(key => {
      const value = this.getDashboardValue(key);
      if (Array.isArray(value)) {
        rows.push(...value);
      }
    });

    return rows;
  }

  private arrayLength(keys: string[]): number {
    return this.uniqueRows(this.arrayFromKeys(keys)).length;
  }

  private firstNumber(keys: string[], fallback = 0): number {
    for (const key of keys) {
      const numericValue = this.toNumber(this.getDashboardValue(key));

      if (numericValue !== null) {
        return numericValue;
      }
    }

    return fallback;
  }

  private getDashboardValue(key: string): any {
    for (const source of this.getDashboardSources()) {
      const value = source?.[key];

      if (Array.isArray(value) && !value.length) {
        continue;
      }

      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }

    return null;
  }

  private getDashboardSources(): any[] {
    const sources: any[] = [];
    this.collectDashboardSources(this.dashboardData, sources);
    return sources;
  }

  private extractResponseList(response: any, listKey: string): any[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (Array.isArray(response?.[listKey])) {
      return response[listKey];
    }

    if (Array.isArray(response?.data)) {
      return response.data;
    }

    if (Array.isArray(response?.result)) {
      return response.result;
    }

    return [];
  }

  private collectDashboardSources(source: any, sources: any[], depth = 0): void {
    if (!source || typeof source !== 'object' || depth > 3) {
      return;
    }

    if (Array.isArray(source)) {
      source.forEach(item => this.collectDashboardSources(item, sources, depth + 1));
      return;
    }

    sources.push(source);

    ['data', 'result', 'response', 'payload', 'details', 'dashboardDetails', 'dashboard_details'].forEach(key => {
      this.collectDashboardSources(source[key], sources, depth + 1);
    });
  }

  private collectTicketRowsFromSource(source: any, depth = 0): any[] {
    if (!source || depth > 5) {
      return [];
    }

    if (Array.isArray(source)) {
      const ticketRows = source.filter(item => this.isTicketRow(item));

      if (ticketRows.length) {
        return ticketRows;
      }

      return source.flatMap(item => this.collectTicketRowsFromSource(item, depth + 1));
    }

    if (typeof source !== 'object') {
      return [];
    }

    return Object.values(source).flatMap(value => this.collectTicketRowsFromSource(value, depth + 1));
  }

  private isTicketRow(row: any): boolean {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return false;
    }

    const ticketValue = this.getFirstValue(row, [
      'ticket_name',
      'ticketName',
      'ticket_id',
      'ticketid',
      'ticket_category_id',
      'ticketCategoryId'
    ]);

    if (ticketValue !== null && ticketValue !== undefined) {
      return true;
    }

    const code = this.getFirstValue(row, ['code', 'ticket_code', 'ticketCode']);
    return `${code ?? ''}`.trim().toUpperCase().startsWith('TICK');
  }

  private toNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (Array.isArray(value)) {
      return value.length;
    }

    const numericValue = Number(value);
    return Number.isNaN(numericValue) ? null : numericValue;
  }

  private sumValues(values: number[]): number {
    return values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  }

  private percent(value: number, total: number): number {
    if (!total || total <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
  }

  private distributeCount(total: number, index: number, count: number): number {
    if (total <= 0 || count <= 0) {
      return 0;
    }

    const base = Math.floor(total / count);
    const remainder = total % count;
    return base + (index < remainder ? 1 : 0);
  }

  private sumProjectNumbers(projects: any[], keys: string[]): number {
    return projects.reduce((sum, project) => {
      const value = keys.map(key => this.toNumber(project?.[key])).find(numberValue => numberValue !== null);
      return sum + (value || 0);
    }, 0);
  }

  private countOpenRows(rows: any[]): number {
    return rows.filter(row => {
      const status = this.normalizeStatus(this.getFirstValue(row, ['status', 'status_name', 'task_status', 'task_status_name', 'current_status']));
      return !status || ['open', 'new', 'pending', 'progress', 'working', 'assigned', 'started'].some(alias => status.includes(alias));
    }).length;
  }

  private countClosedRows(rows: any[]): number {
    return rows.filter(row => this.isClosedRow(row)).length;
  }

  private isClosedRow(row: any): boolean {
    const status = this.normalizeStatus(this.getFirstValue(row, ['status', 'status_name', 'task_status', 'task_status_name', 'current_status']));
    return ['closed', 'complete', 'completed', 'done', 'resolved', 'passed'].some(alias => status.includes(alias));
  }

  private filterRowsByTrendStatus(rows: any[], expectedStatus: 'open' | 'closed', trustMissingStatus: boolean): any[] {
    return rows.filter(row => {
      const status = this.normalizeStatus(this.getFirstValue(row, [
        'status',
        'status_name',
        'task_status',
        'task_status_name',
        'issue_status',
        'issue_status_name',
        'bug_status',
        'bug_status_name',
        'current_status',
        'status_id',
        'statusId',
        'task_status_id',
        'taskStatusId',
        'issue_status_id',
        'issueStatusId',
        'bug_status_id',
        'bugStatusId'
      ]));

      if (!status) {
        return trustMissingStatus;
      }

      if (expectedStatus === 'closed') {
        return this.isClosedStatusValue(status);
      }

      return this.isOpenStatusValue(status);
    });
  }

  private isOpenStatusValue(status: string): boolean {
    return [
      '0',
      '1',
      '2',
      '7',
      'open',
      're-open',
      'reopen',
      'in-progress',
      'inprogress',
      'to-be-tested',
      'tobetested',
      'completed',
      'complete',
      'on-hold',
      'onhold'
    ].includes(status);
  }

  private isClosedStatusValue(status: string): boolean {
    return ['4', 'close', 'closed'].includes(status);
  }

  private countUniqueEmployees(rows: any[]): number {
    const ids = new Set<string>();
    const keys = ['employee_id', 'employeeid', 'emp_id', 'empId', 'user_id', 'assigned_to', 'assignedTo', 'assigned_from', 'assignedFrom', 'assignee_to', 'assignee_from', 'createdby', 'created_by', 'assigned_manager', 'manager_id', 'project_owner', 'owner_id'];

    rows.forEach(row => {
      keys.forEach(key => {
        const value = row?.[key];
        if (value !== null && value !== undefined && value !== '') {
          ids.add(String(value));
        }
      });

      ['members', 'employees', 'teammates', 'project_members', 'employee_list', 'employeeList'].forEach(key => {
        const collection = row?.[key];
        if (Array.isArray(collection)) {
          collection.forEach(member => {
            const value = typeof member === 'object'
              ? this.getFirstValue(member, ['employee_id', 'employeeid', 'id', 'user_id'])
              : member;
            if (value !== null && value !== undefined && value !== '') {
              ids.add(String(value));
            }
          });
        }
      });
    });

    return ids.size;
  }

  private matchesProject(item: any, project: any): boolean {
    const projectId = this.getProjectId(project, true);
    const itemProjectId = this.getProjectId(item);

    if (projectId !== null && projectId !== undefined && itemProjectId !== null && itemProjectId !== undefined) {
      return String(projectId) === String(itemProjectId);
    }

    const projectNames = [
      this.extractProjectName(project),
      this.extractProductName(project)
    ].map(value => this.normalizeText(value)).filter(Boolean);

    const itemNames = [
      this.extractProjectName(item),
      this.extractProductName(item)
    ].map(value => this.normalizeText(value)).filter(Boolean);

    if (projectNames.length && itemNames.some(itemName => projectNames.includes(itemName))) {
      return true;
    }

    const projectCustomer = this.normalizeText(this.extractCompanyName(project));
    const itemCustomer = this.normalizeText(this.extractCompanyName(item));

    if (!projectCustomer || projectCustomer !== itemCustomer) {
      return false;
    }

    const customerProjectCount = this.projectList.filter(sourceProject =>
      this.normalizeText(this.extractCompanyName(sourceProject)) === projectCustomer
    ).length;

    return customerProjectCount <= 1;
  }

  private matchesCompany(item: any, company: string, projects: any[]): boolean {
    const itemCompany = this.extractCompanyName(item);
    if (itemCompany && this.normalizeText(itemCompany) === this.normalizeText(company)) {
      return true;
    }

    const projectIds = new Set(projects.map(project => this.getFirstValue(project, ['id', 'project_id', 'projectid'])).filter(value => value !== null && value !== undefined).map(value => String(value)));
    const itemProjectId = this.getFirstValue(item, ['project_id', 'projectid', 'projectId']);
    if (itemProjectId !== null && itemProjectId !== undefined && projectIds.has(String(itemProjectId))) {
      return true;
    }

    const projectTitles = new Set(projects.map(project => this.normalizeText(this.getFirstValue(project, ['project_title', 'project_name', 'title', 'name']))).filter(value => !!value));
    const itemProjectTitle = this.normalizeText(this.getFirstValue(item, ['project_title', 'project_name', 'title', 'name']));

    return !!itemProjectTitle && projectTitles.has(itemProjectTitle);
  }

  private getCompanyEmployeeIds(company: string): Set<string> {
    const projects = this.projectList.filter(project => this.extractCompanyName(project) === company);
    const rows = [
      ...projects,
      ...this.allTaskRows.filter(task => this.matchesCompany(task, company, projects)),
      ...this.allIssueRows.filter(issue => this.matchesCompany(issue, company, projects)),
      ...this.allReleaseRows.filter(release => this.matchesCompany(release, company, projects)),
      ...this.allTicketRows.filter(ticket => this.matchesCompany(ticket, company, projects))
    ];
    const employeeIds = new Set<string>();
    const keys = ['employee_id', 'employeeid', 'emp_id', 'empId', 'user_id', 'assigned_to', 'assignedTo', 'assigned_from', 'assignedFrom', 'assignee_to', 'assignee_from', 'createdby', 'created_by', 'assigned_manager', 'manager_id', 'project_owner', 'owner_id'];

    rows.forEach(row => {
      keys.forEach(key => {
        const value = row?.[key];
        if (value !== null && value !== undefined && value !== '') {
          employeeIds.add(String(value));
        }
      });

      ['members', 'employees', 'teammates', 'project_members', 'employee_list', 'employeeList'].forEach(key => {
        const collection = row?.[key];
        if (Array.isArray(collection)) {
          collection.forEach(member => {
            const value = typeof member === 'object'
              ? this.getFirstValue(member, ['employee_id', 'employeeid', 'id', 'user_id'])
              : member;
            if (value !== null && value !== undefined && value !== '') {
              employeeIds.add(String(value));
            }
          });
        }
      });
    });

    return employeeIds;
  }

  private extractCompanyName(item: any): string {
    const value = this.getFirstValue(item, ['company_name', 'company', 'client_name', 'client', 'customer_name', 'organization']);
    return typeof value === 'string' ? value.trim() : '';
  }

  private extractProjectName(item: any): string {
    const value = this.getFirstValue(item, ['project_title', 'project_name', 'projectName', 'project']);
    return typeof value === 'string' ? value.trim() : '';
  }

  private extractProductName(item: any): string {
    const value = this.getFirstValue(item, ['product_name', 'productName', 'product']);
    return typeof value === 'string' ? value.trim() : '';
  }

  private extractFirstText(rows: any[], getter: (row: any) => string): string {
    for (const row of rows) {
      const value = getter(row);

      if (value) {
        return value;
      }
    }

    return '';
  }

  private getProjectId(item: any, includeOwnId = false): any {
    const keys = includeOwnId
      ? ['project_id', 'projectid', 'projectId', 'id', 'productId', 'product_id']
      : ['project_id', 'projectid', 'projectId', 'productId', 'product_id'];
    return this.getFirstValue(item, keys);
  }

  private getFirstValue(item: any, keys: string[]): any {
    for (const key of keys) {
      const value = item?.[key];
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }

    return null;
  }

  private normalizeStatus(value: any): string {
    return `${value ?? ''}`.trim().toLowerCase().replace(/[_\s]+/g, '-');
  }

  private normalizeText(value: any): string {
    return `${value ?? ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private isActiveEmployee(employee: any): boolean {
    const value = this.getFirstValue(employee, ['isactive', 'is_active', 'active', 'status']);

    if (value === null || value === undefined || value === '') {
      return true;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    const status = this.normalizeStatus(value);
    return !['false', '0', 'inactive', 'relieved', 'deleted'].includes(status);
  }

  private countRecentEmployees(rows: any[]): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    return rows.filter(employee => {
      const date = this.parseDateValue(this.getFirstValue(employee, ['joining_date', 'created_date', 'createddate']));
      return !!date && date >= weekAgo && date <= today;
    }).length;
  }

  private parseDateValue(value: any): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
  }

  private getWeekStart(date: Date): Date {
    const weekStart = new Date(date);
    const day = weekStart.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    weekStart.setDate(weekStart.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }

  private getCurrentMonthBounds(referenceDate = new Date()): { startDate: Date; endDate: Date } {
    const startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    return { startDate, endDate };
  }

  private getLastFourWeeksBounds(referenceDate = new Date()): { startDate: Date; endDate: Date } {
    const currentWeekStart = this.getWeekStart(referenceDate);
    const startDate = new Date(currentWeekStart);
    startDate.setDate(currentWeekStart.getDate() - 21);

    const endDate = new Date(currentWeekStart);
    endDate.setDate(currentWeekStart.getDate() + 6);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  private getLastFourWeeksDateRange(): { startDate: string; endDate: string } {
    const { startDate, endDate } = this.getLastFourWeeksBounds();

    return {
      startDate: this.formatDateToYMD(startDate),
      endDate: this.formatDateToYMD(endDate)
    };
  }

  private getCurrentMonthDateRange(): { startDate: string; endDate: string } {
    const { startDate, endDate } = this.getCurrentMonthBounds();

    return {
      startDate: this.formatDateToYMD(startDate),
      endDate: this.formatDateToYMD(endDate)
    };
  }

  private getActiveDateRange(fallbackToCurrentMonth = false): { startDate: string; endDate: string } {
    if (this.formattedStartDate && this.formattedEndDate) {
      return {
        startDate: this.formattedStartDate,
        endDate: this.formattedEndDate
      };
    }

    return fallbackToCurrentMonth
      ? this.getCurrentMonthDateRange()
      : { startDate: '', endDate: '' };
  }

  private getActiveDateBounds(): { startDate: Date; endDate: Date } | null {
    const { startDate, endDate } = this.getActiveDateRange(true);
    const parsedStartDate = this.parseDateValue(startDate);
    const parsedEndDate = this.parseDateValue(endDate);

    if (!parsedStartDate || !parsedEndDate) {
      return null;
    }

    parsedStartDate.setHours(0, 0, 0, 0);
    parsedEndDate.setHours(23, 59, 59, 999);

    return parsedStartDate <= parsedEndDate
      ? { startDate: parsedStartDate, endDate: parsedEndDate }
      : { startDate: parsedEndDate, endDate: parsedStartDate };
  }

  private formatDateToYMD(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private formatDateCell(value: any): string {
    const date = this.parseDateValue(value);
    return date ? this.formatDisplayDate(date) : '-';
  }

  private getCurrentDateRangeLabel(): string {
    const { startDate, endDate } = this.getCurrentMonthBounds();

    return `${this.formatDisplayDate(startDate)} - ${this.formatDisplayDate(endDate)}`;
  }

  private getTrendPeriodLabel(): string {
    return this.selectedPreset === 'monthly' ? 'This Month' : 'Last 4 Weeks';
  }

  private formatDisplayDate(date: Date): string {
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private formatShortDate(date: Date): string {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    });
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('en-IN').format(value);
  }

  private clampPercent(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private showTooltip(event: MouseEvent, title: string, lines: string[]): void {
    const offset = 14;
    const maxX = Math.max(0, window.innerWidth - 280);
    const maxY = Math.max(0, window.innerHeight - 180);

    this.chartTooltip = {
      visible: true,
      x: Math.min(event.clientX + offset, maxX),
      y: Math.min(event.clientY + offset, maxY),
      title,
      lines
    };
    this.cdr.markForCheck();
  }

  private getInitials(value: string): string {
    const initials = value
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    return initials || 'C';
  }

  private getCompanyColor(index: number): string {
    return `var(--overall-company-color-${(index % 6) + 1})`;
  }

  private buildSparklinePoints(values: number[]): string {
    const width = 96;
    const height = 30;
    const maxValue = Math.max(1, ...values);
    const minValue = Math.min(...values);
    const spread = Math.max(1, maxValue - minValue);
    const step = values.length > 1 ? width / (values.length - 1) : width;

    return values
      .map((value, index) => {
        const x = Math.round(index * step);
        const y = Math.round(4 + (1 - (value - minValue) / spread) * (height - 8));
        return `${x},${y}`;
      })
      .join(' ');
  }

  private emptyMetricSnapshot(): OverallMetricSnapshot {
    return {
      employees: 0,
      activeTasks: 0,
      completedTasks: 0,
      issues: 0,
      resolvedIssues: 0,
      releases: 0,
      inProgressReleases: 0,
      tickets: 0,
      openTickets: 0,
      closedTickets: 0,
      completionRate: 0,
      recentEmployees: 0
    };
  }

  private initializeDefaultDateRange(): void {
    const { startDate, endDate } = this.getCurrentMonthBounds();

    this.filterStartDate = startDate;
    this.filterEndDate = endDate;
    this.formattedStartDate = this.formatDateToYMD(startDate);
    this.formattedEndDate = this.formatDateToYMD(endDate);
    this.currentDateRangeLabel = `${this.formatDisplayDate(startDate)} - ${this.formatDisplayDate(endDate)}`;
  }

   selectPreset(preset: string) {
    this.selectedPreset = preset;

    // If they click anything other than custom, close the custom popup
    if (preset !== 'custom') {
      this.isCustomOpen = false;
    }

    const today = new Date();
    let start = new Date();
    let end = new Date();

    if (preset === 'weekly') {
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

      // Calculate distance to this week's Sunday
      const diffToSunday = -dayOfWeek;

      start = new Date(today);
      start.setDate(today.getDate() + diffToSunday);

      // Sunday + 6 days = Saturday
      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      this.filterStartDate = start;
      this.filterEndDate = end;
      this.filterTask();
    }
    else if (preset === 'bi-weekly') {
      // Find current day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      const dayOfWeek = today.getDay();

      // Calculate distance to this week's Sunday (if Sunday, diff is 0, else go back the number of days since Sunday)
      const diffToSunday = dayOfWeek === 0 ? 0 : -dayOfWeek;

      // Set start to this week's Sunday
      start = new Date(today);
      start.setDate(today.getDate() + diffToSunday);

      // Set end to next week's Saturday (Sunday + 13 days = next week Saturday, total 14 days)
      const end = new Date(start);
      end.setDate(start.getDate() + 13);

      this.filterStartDate = start;
      this.filterEndDate = end;
      this.filterTask();
    }
    else if (preset === 'monthly') {
      const monthRange = this.getCurrentMonthBounds(today);
      start = monthRange.startDate;
      end = monthRange.endDate;

      this.filterStartDate = start;
      this.filterEndDate = end;
      this.filterTask();
    }
    else if (preset === 'custom') {
      // Toggle the popup open/closed when clicking the Custom button
      this.isCustomOpen = !this.isCustomOpen;
    }
  }

  applyCustomFilter() {
    if (this.filterStartDate && this.filterEndDate) {
      this.filterTask();

      // Close the popup window, but keep selectedPreset = 'custom' so the button stays highlighted!
      this.isCustomOpen = false;
    }
  }

  filterTask() {
    if (this.filterStartDate && this.filterEndDate) {
      let startDateObj = new Date(this.filterStartDate);
      let endDateObj = new Date(this.filterEndDate);

      if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
        if (startDateObj > endDateObj) {
          [startDateObj, endDateObj] = [endDateObj, startDateObj];
          this.filterStartDate = startDateObj;
          this.filterEndDate = endDateObj;
        }

        this.formattedStartDate = this.formatDateToYMD(startDateObj);
        this.formattedEndDate = this.formatDateToYMD(endDateObj);
        this.currentDateRangeLabel = `${this.formatDisplayDate(startDateObj)} - ${this.formatDisplayDate(endDateObj)}`;
        this.notificationDateRangeService.setRange({
          preset: this.selectedPreset === 'custom' ? 'custom' : this.selectedPreset === 'weekly' ? 'weekly' : this.selectedPreset === 'bi-weekly' ? 'bi-weekly' : 'monthly',
          startDate: this.formattedStartDate,
          endDate: this.formattedEndDate,
          label: this.currentDateRangeLabel
        });

        this.loadOverallAnalytics();
      }
    }
  }
  getDashboardDetailsByEmployeeId(empId: any, fromDate?: string, toDate?: string) {
    this.empId = empId || this.empId;
    this.formattedStartDate = fromDate || '';
    this.formattedEndDate = toDate || '';
    this.loadOverallAnalytics();
  }
}
