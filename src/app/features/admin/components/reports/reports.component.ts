import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, forkJoin, from, Observable, of, Subscription } from 'rxjs';
import { catchError, finalize, map, mergeMap, takeLast, toArray } from 'rxjs/operators';
import { AuthService } from 'src/app/_core/services/auth.service';
import { ExcelService, TableWorkbookExcelSection } from 'src/app/_core/services/excel.service';
import { PdfService, TableReportPdfSection } from 'src/app/_core/services/pdf.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import { getReleaseDayStatus } from 'src/app/_core/utils/release-day-status.util';
import { AttendanceReportTone, attendanceStatusTone, attendanceTimeTone, attendanceWorkHoursTone, isMissingAttendanceValue } from 'src/app/_core/utils/attendance-report.util';
import { DateRangeChange } from 'src/app/_shared/components/date-range-filter/date-range-filter.component';

declare const Tabulator: any;

type ReportKind = 'dsr-ticket' | 'attendance' | 'not-send-dsr' | 'employee' | 'release' | 'task';
interface ReportCard { id: ReportKind; title: string; description: string; icon: string; }
interface ReportDetailLine { label: string; value: string; }

function dsrTicketDetails(row: any): ReportDetailLine[] {
  const isTicket = row?.record_type === 'Ticket';
  const labels: Record<string, string> = {
    task: 'Task', subtask: 'Sub task', comments: 'Comments', ticketname: 'Ticket name',
    ticketcode: 'Ticket code', description: 'Description', reasonofissue: 'Reason of Issue', solution: 'Solution'
  };
  const parsed: ReportDetailLine[] = [];
  const indices = new Map<string, number>();
  const pattern = /^\s*(Task|Sub\s*task|Comments|Ticket\s+name|Ticket\s+code|Description|Reason\s+of\s+Issue|Solution)\s*:\s*(.*)$/i;
  const source = isTicket ? row?.ticket_details ?? row?.ticketDetails : row?.dsr_details ?? row?.dsrDetails;

  `${source ?? ''}`.split(/\r?\n/).forEach(line => {
    const match = line.match(pattern);
    if (match) {
      const key = match[1].replace(/\s+/g, '').toLowerCase();
      const index = indices.get(key);
      const value = match[2].trim();
      if (index !== undefined) {
        if (value) parsed[index].value += `${parsed[index].value ? '\n' : ''}${value}`;
      } else {
        indices.set(key, parsed.length);
        parsed.push({ label: labels[key], value });
      }
      return;
    }
    if (parsed.length && line.trim()) {
      const previous = parsed[parsed.length - 1];
      previous.value += `${previous.value ? '\n' : ''}${line.trim()}`;
    }
  });

  const fallback: Array<[string, any]> = isTicket
    ? [
      ['comments', row?.comments ?? row?.client_comments ?? row?.clientComments],
      ['ticketname', row?.ticket_name ?? row?.ticketName],
      ['ticketcode', row?.code ?? row?.ticket_code ?? row?.ticketCode ?? row?.ticket_id ?? row?.ticketId],
      ['description', row?.description],
      ['reasonofissue', row?.reason_f_issue ?? row?.reasonFIssue ?? row?.reason_for_issue],
      ['solution', row?.solution]
    ]
    : [
      ['task', row?.task ?? row?.sub_task],
      ['subtask', row?.sub_task],
      ['comments', row?.comments]
    ];
  fallback.forEach(([key, value]) => {
    if (indices.has(key) || value === null || value === undefined || `${value}`.trim() === '') return;
    indices.set(key, parsed.length);
    parsed.push({ label: labels[key], value: `${value}`.trim() });
  });
  return parsed.filter(line => line.value.trim() !== '');
}

@Component({
  selector: 'app-reports-hub',
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss']
})
export class ReportsHubComponent implements OnInit, OnDestroy, AfterViewInit {
  readonly attendanceMonths = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  readonly attendanceYears = Array.from({ length: 11 }, (_, index) => new Date().getFullYear() - 5 + index);
  readonly cards: ReportCard[] = [
    { id: 'dsr-ticket', title: 'DSR / Ticket Report', description: 'Employee DSR and ticket activity by department.', icon: 'ri-file-list-3-line' },
    { id: 'attendance', title: 'Attendance Report', description: 'Employee attendance for the selected period.', icon: 'ri-calendar-check-line' },
    { id: 'not-send-dsr', title: 'Not Send DSR Report', description: 'Tasks without a submitted daily status report.', icon: 'ri-time-line' },
    { id: 'employee', title: 'Employee Report', description: 'Employee directory and department details.', icon: 'ri-team-line' },
    { id: 'release', title: 'Project Release Report', description: 'Project releases and their current status.', icon: 'ri-rocket-line' },
    { id: 'task', title: 'Task Report ', description: 'Task activity grouped by employee.', icon: 'ri-task-line' }
  ];
  readonly pageSizes = [10, 25, 50, 100];
  readonly allEmployeesValue = '__all_employees__';
  reportType: ReportKind | null = null;
  reportTitle = '';
  employees: any[] = [];
  employeeOptionsLoading = false;
  releaseProjects: any[] = [];
  selectedEmployeeId: string | null = null;
  employeeSearchTerm = '';
  selectedProjectId = '0';
  projectSearchTerm = '';
  attendanceMonth = new Date().toLocaleString('en-US', { month: 'long' });
  attendanceYear = new Date().getFullYear();
  private loadedAttendanceMonth = this.attendanceMonth;
  private loadedAttendanceYear = this.attendanceYear;
  attendanceMonthSearchTerm = '';
  attendanceYearSearchTerm = '';
  rows: any[] = [];
  columns: Array<{ key: string; label: string }> = [];
  employeeStatusFilter: 'all' | 'active' | 'inactive' = 'active';
  searchTerm = '';
  sortKey = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  readonly pageSize = 10;
  fromDate = this.monthStart();
  toDate = this.today();
  dateRangeStart: Date | null = this.parseDate(this.fromDate);
  dateRangeEnd: Date | null = this.parseDate(this.toDate);
  loading = false;
  excelExporting = false;
  pdfExporting = false;
  errorMessage = '';
  private routeSubscription?: Subscription;
  private employeeOptionsSubscription?: Subscription;
  private loadSubscription?: Subscription;
  private releaseFilterOptionsLoaded = false;
  employeeOptionsLoaded = false;
  private table: any;
  private tableHost?: HTMLElement;
  private tableCheckInterval: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private resetPageAfterDataLoad = false;

  @ViewChild('tableDiv') set tableDiv(ref: ElementRef<HTMLElement> | undefined) {
    this.tableHost = ref?.nativeElement;
    if (!this.tableHost) this.destroyTable();
    else this.refreshTable();
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private storage: StorageService,
    private excel: ExcelService,
    private pdf: PdfService,
    private toaster: ToasterService
  ) {}

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const selected = params.get('reportType') as ReportKind | null;
      this.reportType = this.cards.some(card => card.id === selected) ? selected : null;
      this.reportTitle = this.cards.find(card => card.id === this.reportType)?.title || '';
      this.searchTerm = '';
      this.employeeStatusFilter = 'active';
      this.employeeSearchTerm = '';
      this.projectSearchTerm = '';
      this.selectedProjectId = '0';
      this.releaseProjects = [];
      this.releaseFilterOptionsLoaded = false;
      this.attendanceMonth = new Date().toLocaleString('en-US', { month: 'long' });
      this.attendanceYear = new Date().getFullYear();
      this.loadedAttendanceMonth = this.attendanceMonth;
      this.loadedAttendanceYear = this.attendanceYear;
      this.attendanceMonthSearchTerm = '';
      this.attendanceYearSearchTerm = '';
      this.employeeOptionsSubscription?.unsubscribe();
      this.employeeOptionsLoading = false;
      this.employeeOptionsLoaded = false;
      this.selectedEmployeeId = this.storage.roles?.isAdmin
        ? (this.reportType === 'dsr-ticket' ? null : this.allEmployeesValue)
        : this.currentEmployeeId();
      this.employees = [];
      this.resetPageAfterDataLoad = false;
      this.table?.clearFilter(true);
      this.rows = [];
      this.columns = [];
      this.errorMessage = '';
      this.destroyTable();
      if (this.reportType === 'dsr-ticket' && this.canSelectAllEmployees) {
        this.loadAdminDsrTicketEmployeeOptions();
      } else if (this.reportType) {
        this.loadReport();
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.table && !this.tableCheckInterval) {
      this.tableCheckInterval = setInterval(() => {
        if (this.destroyed) return;
        if (typeof Tabulator !== 'undefined' && this.tableHost && this.columns.length) {
          this.stopTableCheck();
          this.refreshTable();
        }
      }, 50);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopTableCheck();
    this.destroyTable();
    this.routeSubscription?.unsubscribe();
    this.employeeOptionsSubscription?.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  openReport(card: ReportCard): void {
    this.router.navigate(['/main/reports', card.id]);
  }

  backToReports(): void {
    this.router.navigate(['/main/reports']);
  }

  onDateRangeChange(range: DateRangeChange): void {
    const fromDate = this.formatDate(range.startDate);
    const toDate = this.formatDate(range.endDate);
    if (fromDate === this.fromDate && toDate === this.toDate) return;
    if (fromDate > toDate) {
      this.errorMessage = 'Choose a valid date range.';
      return;
    }
    this.dateRangeStart = range.startDate;
    this.dateRangeEnd = range.endDate;
    this.fromDate = fromDate;
    this.toDate = toDate;
    this.errorMessage = '';
    if (this.table) void Promise.resolve(this.table.setPage(1)).catch(() => undefined);
    if (this.reportType && this.reportType !== 'employee') this.loadReport();
  }

  get showEmployeeFilter(): boolean {
    return ['dsr-ticket', 'attendance', 'not-send-dsr', 'task', 'release'].includes(this.reportType || '');
  }

  get filteredReleaseProjects(): any[] {
    const term = this.projectSearchTerm.trim().toLowerCase();
    return this.releaseProjects.filter(project => {
      const projectId = this.releaseProjectId(project);
      const name = this.releaseProjectName(project).toLowerCase();
      return !!projectId && (!term || name.includes(term) || projectId.toLowerCase().includes(term));
    });
  }

  get selectedReleaseProjectName(): string {
    if (!this.selectedProjectId || this.selectedProjectId === '0') return 'All Projects';
    const selected = this.releaseProjects.find(project => this.releaseProjectId(project) === this.selectedProjectId);
    return selected ? this.releaseProjectName(selected) : 'All Projects';
  }

  get filteredAttendanceMonths(): string[] {
    const term = this.attendanceMonthSearchTerm.trim().toLowerCase();
    return this.attendanceMonths.filter(month => month.toLowerCase().includes(term));
  }

  get filteredAttendanceYears(): number[] {
    const term = this.attendanceYearSearchTerm.trim();
    return this.attendanceYears.filter(year => !term || `${year}`.includes(term));
  }

  get showAttendancePeriodFilters(): boolean {
    return this.reportType === 'attendance';
  }

  get canSelectAllEmployees(): boolean {
    return !!this.storage.roles?.isAdmin;
  }

  get showAllEmployeesOption(): boolean {
    return this.canSelectAllEmployees && this.reportType !== 'dsr-ticket';
  }

  get requiresAdminDsrTicketSelection(): boolean {
    return this.reportType === 'dsr-ticket' && this.canSelectAllEmployees && !this.selectedEmployeeId;
  }

  get selectedEmployeeName(): string {
    if (this.requiresAdminDsrTicketSelection) return 'Select Employee';
    if (this.selectedEmployeeId === this.allEmployeesValue && this.canSelectAllEmployees) return 'All Employees';
    const selected = this.employees.find(employee => this.reportEmployeeId(employee) === this.selectedEmployeeId);
    return this.employeeName(selected) || this.storage.getEmpName() || 'Select employee';
  }

  get attendanceHeading(): string {
    return `${this.selectedEmployeeName} · ${this.loadedAttendanceMonth} ${this.loadedAttendanceYear}`;
  }

  get filteredReportEmployees(): any[] {
    const term = this.employeeSearchTerm.trim().toLowerCase();
    const options = this.reportEmployeeOptions;
    return term ? options.filter(employee => this.employeeName(employee).toLowerCase().includes(term)) : options;
  }

  private get reportEmployeeOptions(): any[] {
    return this.employees.filter(employee => !!this.reportEmployeeId(employee));
  }

  onReportEmployeeSelection(employeeId: string | null): void {
    if (employeeId === this.selectedEmployeeId) return;
    this.selectedEmployeeId = employeeId || null;
    this.errorMessage = '';
    if (this.reportType === 'attendance') {
      this.fetchAttendanceReport();
      return;
    }
    this.resetPageAfterDataLoad = true;
    if (this.table) void Promise.resolve(this.table.setPage(1)).catch(() => undefined);
    if (this.reportType === 'dsr-ticket' && this.canSelectAllEmployees) {
      this.employeeOptionsSubscription?.unsubscribe();
      this.loadSubscription?.unsubscribe();
      this.loadAdminDsrTicketReport();
      return;
    }
    this.loadReport();
  }

  onReportEmployeeSelectOpened(opened: boolean): void {
    if (!opened) return;
    this.employeeSearchTerm = '';
  }

  private loadAdminDsrTicketEmployeeOptions(): void {
    if (this.employeeOptionsLoaded || this.employeeOptionsLoading) return;
    this.employeeOptionsLoading = true;
    this.errorMessage = '';
    this.employeeOptionsSubscription?.unsubscribe();
    this.employeeOptionsSubscription = this.employeeOptionsForScope().pipe(
      map(response => this.scopeEmployeesToRole(this.extractRows(response, ['employees', 'users', 'data', 'details', 'result', 'results']))),
      finalize(() => this.employeeOptionsLoading = false)
    ).subscribe({
      next: employees => {
        this.employees = employees;
        this.employeeOptionsLoaded = true;
      },
      error: () => {
        this.errorMessage = 'Unable to load employees for this report.';
      }
    });
  }

  onReportProjectSelection(projectId: string | null): void {
    const nextProjectId = projectId || '0';
    if (nextProjectId === this.selectedProjectId) return;
    this.selectedProjectId = nextProjectId;
    this.errorMessage = '';
    this.resetPageAfterDataLoad = true;
    if (this.table) void Promise.resolve(this.table.setPage(1)).catch(() => undefined);
    this.loadReport();
  }

  onReportProjectSelectOpened(opened: boolean): void {
    if (opened) this.projectSearchTerm = '';
  }

  releaseProjectId(project: any): string {
    const value = project?.id ?? project?.project_id ?? project?.projectId ?? project?.projectid;
    return value === null || value === undefined ? '' : `${value}`;
  }

  releaseProjectName(project: any): string {
    const name = `${project?.project_title ?? project?.project_name ?? project?.projectName ?? project?.name ?? ''}`.trim();
    return name || this.releaseProjectId(project);
  }

  onAttendanceMonthSelectOpened(opened: boolean): void {
    if (opened) this.attendanceMonthSearchTerm = '';
  }

  onAttendanceYearSelectOpened(opened: boolean): void {
    if (opened) this.attendanceYearSearchTerm = '';
  }

  onAttendanceMonthSelection(month: string): void {
    if (month === this.attendanceMonth) return;
    this.attendanceMonth = month;
    this.fetchAttendanceReport();
  }

  onAttendanceYearSelection(year: number): void {
    if (year === this.attendanceYear) return;
    this.attendanceYear = year;
    this.fetchAttendanceReport();
  }

  fetchAttendanceReport(): void {
    const employeeId = this.attendanceEmployeeId();
    const monthNumber = this.attendanceMonths.indexOf(this.attendanceMonth) + 1;
    if (employeeId === null) {
      this.errorMessage = 'You do not have access to view attendance for this employee.';
      return;
    }
    if (monthNumber < 1 || !this.attendanceYear) {
      this.errorMessage = 'Select a valid month and year.';
      return;
    }

    this.loadedAttendanceMonth = this.attendanceMonth;
    this.loadedAttendanceYear = this.attendanceYear;
    this.errorMessage = '';
    this.loadSubscription?.unsubscribe();
    this.loading = true;
    this.resetPageAfterDataLoad = true;
    this.rows = [];
    this.destroyTable();
    this.loadSubscription = this.auth.getattendancedetails(employeeId, this.attendanceMonth, this.attendanceYear).pipe(
      map((response: any) => this.extractRows(response, this.responseKeys('attendance')).map(row => {
        const employee = this.attendanceEmployeeForRow(row, employeeId);
        return this.normalizeRow(row, employee, 'attendance');
      })),
      catchError(() => {
        this.errorMessage = 'Unable to load attendance records.';
        return of([]);
      }),
      finalize(() => this.loading = false)
    ).subscribe(rows => {
      this.rows = rows;
      this.columns = this.columnsFor('attendance');
      this.setSortDefault();
    });
  }

  private attendanceEmployeeId(): string | number | null {
    if (this.storage.roles?.isAdmin) {
      if (this.selectedEmployeeId === this.allEmployeesValue) return 0;
      return this.employees.some(employee => this.reportEmployeeId(employee) === this.selectedEmployeeId)
        ? this.selectedEmployeeId
        : null;
    }
    if (this.storage.roles?.isManager) {
      return this.employees.some(employee => this.reportEmployeeId(employee) === this.selectedEmployeeId)
        ? this.selectedEmployeeId
        : null;
    }
    const employeeId = this.currentEmployeeId();
    return employeeId && employeeId === this.selectedEmployeeId ? employeeId : null;
  }

  private attendanceEmployeeForRow(row: any, requestEmployeeId: string | number): any {
    const rowEmployeeId = `${row?.employee_id ?? row?.employeeId ?? row?.employeeid ?? row?.emp_id ?? row?.empId ?? ''}`;
    if (rowEmployeeId) {
      const matchedEmployee = this.employees.find(employee => this.reportEmployeeId(employee) === rowEmployeeId);
      if (matchedEmployee) return matchedEmployee;
    }
    if (`${requestEmployeeId}` !== '0') {
      return this.employees.find(employee => this.reportEmployeeId(employee) === `${requestEmployeeId}`)
        || this.currentEmployeeOption()
        || row;
    }
    return row;
  }

  reportEmployeeId(employee: any): string {
    const value = employee?.employee_id ?? employee?.employeeId ?? employee?.employeeid ?? employee?.emp_id
      ?? employee?.empId ?? employee?.empid ?? employee?.id;
    return value === null || value === undefined ? '' : `${value}`;
  }

  private explicitEmployeeId(row: any): string {
    const value = row?.employee_id ?? row?.employeeId ?? row?.employeeid ?? row?.emp_id ?? row?.empId ?? row?.empid;
    return value === null || value === undefined || `${value}`.trim() === '' ? '' : `${value}`;
  }

  employeeName(employee: any): string {
    const fullName = `${employee?.firstname ?? employee?.first_name ?? employee?.firstName ?? ''} ${employee?.lastname ?? employee?.last_name ?? employee?.lastName ?? ''}`.trim();
    return `${employee?.employee_name ?? employee?.employeeName ?? employee?.name ?? fullName ?? ''}`.trim();
  }

  get filteredRows(): any[] {
    const term = this.searchTerm.trim().toLowerCase();
    const filtered = this.rows.filter(row => this.matchesEmployeeStatus(row)
      && this.matchesSelectedReleaseEmployee(row)
      && (!term || this.columns.some(column => `${this.value(row, column.key)}`.toLowerCase().includes(term))));
    if (!this.sortKey) return filtered;
    return [...filtered].sort((left, right) => {
      const a = `${this.value(left, this.sortKey) ?? ''}`.toLowerCase();
      const b = `${this.value(right, this.sortKey) ?? ''}`.toLowerCase();
      const result = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      return this.sortDirection === 'asc' ? result : -result;
    });
  }

  value(row: any, key: string): any {
    if (this.reportType === 'dsr-ticket') {
      if (row?.record_type !== 'Ticket' && ['company_name', 'code', 'product_name'].includes(key)) return '';
      if (key === 'product_name' && row?.record_type !== 'Ticket' && this.departmentId(row) !== 6) return '';
    }
    const value = row?.[key];
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return value.name || value.title || JSON.stringify(value);
    return value;
  }

  private releaseStatusClass(status: any): string {
    const normalizedStatus = `${status ?? ''}`.trim().toLowerCase().replace(/[-_\s]+/g, '-');
    if (['active', 'on-track', 'approved', 'pass', 'invoiced', 'open', 'released'].includes(normalizedStatus)) return 'release-status--success';
    if (['in-progress', 'in-review', 'in-testing', 'planning'].includes(normalizedStatus)) return 'release-status--progress';
    if (['on-hold', 'to-be-tested', 'upcoming-release'].includes(normalizedStatus)) return 'release-status--warning';
    if (['delayed', 'cancelled', 'rejected', 'failed', 'closed'].includes(normalizedStatus)) return 'release-status--danger';
    return 'release-status--muted';
  }

  private taskStatusTone(status: any): string {
    const normalizedStatus = `${status ?? ''}`.trim().toLowerCase().replace(/[_\s]+/g, '-');
    if (['active', 'on-track', 'approved', 'completed', 'invoiced', 'open', 'pass', 'passed'].includes(normalizedStatus)) return 'success';
    if (['in-progress', 'in-review', 'in-testing', 'planning'].includes(normalizedStatus)) return 'progress';
    if (['on-hold', 'to-be-tested', 'upcoming-release'].includes(normalizedStatus)) return 'warning';
    if (['delayed', 'cancelled', 'canceled', 'rejected', 'closed', 'failed'].includes(normalizedStatus)) return 'danger';
    return 'muted';
  }

  changeSearch(value: string): void {
    this.searchTerm = value;
    this.applyTableSearch(true);
  }

  setEmployeeStatusFilter(status: 'all' | 'active' | 'inactive'): void {
    if (this.employeeStatusFilter === status) return;
    this.employeeStatusFilter = status;
    this.applyTableSearch(true);
  }

  private matchesEmployeeStatus(row: any): boolean {
    if (this.reportType !== 'employee') return true;
    if (this.employeeStatusFilter === 'all') return true;
    return `${row?.isactive ?? ''}`.trim().toLowerCase() === this.employeeStatusFilter;
  }

  async exportExcel(): Promise<void> {
    if (this.excelExporting || this.pdfExporting) return;
    if (this.reportType === 'release') {
      await this.exportReleaseReport('excel');
      return;
    }
    if (this.reportType === 'attendance') {
      await this.exportAttendanceReport('excel');
      return;
    }
    const model = this.exportModel();
    if (!model.rows.length) { this.toaster.error('No matching records available for Excel export.'); return; }
    this.excelExporting = true;
    try {
      const taskColumnIndex = this.columns.findIndex(column => column.key === 'task');
      const section: TableWorkbookExcelSection = {
        title: this.exportTitle, reportTitle: this.exportTitle, scopeLabel: this.exportScopeLabel, scopeName: this.exportScopeName,
        metadataLayout: this.reportType === 'not-send-dsr' ? 'compact-two-column' : 'standard',
        headers: this.columns.map(column => column.label),
        rows: model.rows.map(row => this.columns.map(column => this.exportCellValue(row, column.key))),
        richTextCells: this.reportType === 'dsr-ticket' && taskColumnIndex >= 0
          ? model.rows.flatMap((row, rowIndex) => {
            const lines = dsrTicketDetails(row);
            return lines.length ? [{ rowIndex, columnIndex: taskColumnIndex, lines }] : [];
          }) : undefined,
        statusColorMode: this.reportType === 'dsr-ticket' ? 'presence' : undefined,
        statusColorTones: this.reportType === 'dsr-ticket'
          ? model.rows.map(row => this.dsrTicketStatusColorTone(row)) : undefined,
        columnWidths: this.reportType === 'not-send-dsr' ? [22, 60] : this.getExcelColumnWidths(model.rows)
      };
      this.excel.generateTableWorkbookExcel({
        workbookTitle: this.exportTitle, author: this.generatedBy, fromDate: this.exportFromDate, toDate: this.exportToDate,
        scopeLabel: this.exportScopeLabel, scopeName: this.exportScopeName, exportedAt: new Date().toLocaleString(),
        filename: `${this.filenameBase()}.xlsx`
      }, [section]);
      this.toaster.success('Excel report downloaded successfully.');
    } catch (error) {
      console.error('Report Excel export failed', error);
      this.toaster.error('Unable to generate the Excel report.');
    } finally { this.excelExporting = false; }
  }

  async exportPdf(): Promise<void> {
    if (this.excelExporting || this.pdfExporting) return;
    if (this.reportType === 'release') {
      await this.exportReleaseReport('pdf');
      return;
    }
    if (this.reportType === 'attendance') {
      await this.exportAttendanceReport('pdf');
      return;
    }
    const model = this.exportModel();
    if (!model.rows.length) { this.toaster.error('No matching records available for PDF export.'); return; }
    this.pdfExporting = true;
    try {
      const taskColumnIndex = this.columns.findIndex(column => column.key === 'task');
      const section: TableReportPdfSection = {
        title: this.exportTitle, reportTitle: this.exportTitle, scopeLabel: this.exportScopeLabel, scopeName: this.exportScopeName,
        headers: this.columns.map(column => column.label),
        rows: model.rows.map(row => this.columns.map(column => this.exportCellValue(row, column.key))),
        richTextCells: this.reportType === 'dsr-ticket' && taskColumnIndex >= 0
          ? model.rows.flatMap((row, rowIndex) => {
            const lines = dsrTicketDetails(row);
            return lines.length ? [{ rowIndex, columnIndex: taskColumnIndex, lines }] : [];
          }) : undefined,
        statusColorMode: this.reportType === 'dsr-ticket' ? 'presence' : undefined,
        statusColorTones: this.reportType === 'dsr-ticket'
          ? model.rows.map(row => this.dsrTicketStatusColorTone(row)) : undefined,
        tableFontSize: ['dsr-ticket', 'not-send-dsr', 'employee', 'task'].includes(this.reportType || '') ? 11 : 9,
        columnStyles: this.reportType === 'not-send-dsr'
          ? this.columns.reduce((styles, _column, index) => {
            styles[index] = { halign: 'center' };
            return styles;
          }, {} as Record<number, { halign: 'center' }>)
          : this.reportType === 'dsr-ticket'
            ? this.columns.reduce((styles, column, index) => {
              if (column.key === 'task') styles[index] = { cellWidth: 130 };
              if (column.key === 'employee_name') styles[index] = { cellWidth: 38 };
              return styles;
            }, {} as Record<number, { cellWidth: number }>)
            : undefined,
        statusStyle: this.reportType === 'task' || this.reportType === 'employee' || this.reportType === 'dsr-ticket' ? 'text' : 'cell'
      };
      this.pdf.generateTableReportPdf({
        reportTitle: this.exportTitle, author: this.generatedBy, fromDate: this.exportFromDate, toDate: this.exportToDate,
        scopeLabel: this.exportScopeLabel, scopeName: this.exportScopeName, exportedAt: new Date().toLocaleString(),
        filename: `${this.filenameBase()}.pdf`, searchContext: this.searchTerm || 'All records'
      }, [section]);
      this.toaster.success('PDF report downloaded successfully.');
    } catch (error) {
      console.error('Report PDF export failed', error);
      this.toaster.error('Unable to generate the PDF report.');
    } finally { this.pdfExporting = false; }
  }

  private async exportAttendanceReport(format: 'excel' | 'pdf'): Promise<void> {
    const records = this.filteredRows;
    if (!records.length) { this.toaster.error(`No matching records available for ${format.toUpperCase()} export.`); return; }
    const busy = () => format === 'excel' ? this.excelExporting : this.pdfExporting;
    if (busy()) return;
    if (format === 'excel') this.excelExporting = true;
    else this.pdfExporting = true;
    try {
      const summary = records.reduce((result: any, row: any) => {
        const tone = attendanceStatusTone(row.status);
        if (tone === 'present') result.present++;
        else if (tone === 'leave') result.leave++;
        else if (tone === 'week-off' || tone === 'holiday') result.weekOff++;
        else if (tone === 'absent') result.absent++;
        return result;
      }, { present: 0, leave: 0, weekOff: 0, absent: 0 });
      const report = {
        employee: this.isAdminAllEmployeesSelection
          ? { employee_name: 'All Employees', isAllEmployees: true }
          : { ...(this.employees.find(item => this.reportEmployeeId(item) === this.selectedEmployeeId) || this.currentEmployeeOption() || {}), employee_name: this.selectedEmployeeName },
        period: `${this.loadedAttendanceMonth} ${this.loadedAttendanceYear}`,
        fromDate: this.exportFromDate,
        toDate: this.exportToDate,
        records,
        summary,
        includeEmployeeColumn: this.isAdminAllEmployeesSelection,
        reportTitle: this.exportTitle,
        scopeName: this.exportScopeName,
        filename: `${this.filenameBase()}.${format === 'excel' ? 'xlsx' : 'pdf'}`
      };
      if (format === 'excel') this.excel.generateMonthlyAttendanceExcel(report);
      else this.pdf.generateMonthlyAttendancePDF(report);
      this.toaster.success(`${format.toUpperCase()} report downloaded successfully.`);
    } catch (error) {
      console.error(`Attendance ${format.toUpperCase()} export failed`, error);
      this.toaster.error(`Unable to generate the ${format.toUpperCase()} attendance report.`);
    } finally {
      if (format === 'excel') this.excelExporting = false;
      else this.pdfExporting = false;
    }
  }

  private get generatedBy(): string {
    const user = this.storage.getUser() || {};
    return user.employee_name || user.name || user.username || 'Application User';
  }

  private get exportScopeName(): string {
    return this.isAdminAllEmployeesSelection ? 'All Employees' : this.selectedEmployeeName;
  }

  private get exportScopeLabel(): string {
    return this.isAdminAllEmployeesSelection ? 'Employees' : 'Employee';
  }

  private get exportTitle(): string {
    const title = this.reportType === 'task'
      ? 'Task Report'
      : this.reportTitle;
    return `${title} — [ ${this.exportScopeName} ]`;
  }

  private get exportFromDate(): string {
    if (this.reportType !== 'attendance') return this.fromDate;
    const monthNumber = this.attendanceMonths.indexOf(this.loadedAttendanceMonth) + 1;
    return `${this.loadedAttendanceYear}-${`${monthNumber}`.padStart(2, '0')}-01`;
  }

  private get exportToDate(): string {
    if (this.reportType !== 'attendance') return this.toDate;
    const monthNumber = this.attendanceMonths.indexOf(this.loadedAttendanceMonth) + 1;
    const lastDay = new Date(this.loadedAttendanceYear, monthNumber, 0).getDate();
    return `${this.loadedAttendanceYear}-${`${monthNumber}`.padStart(2, '0')}-${lastDay}`;
  }

  private currentEmployeeId(): string | null {
    const user = this.storage.getUser() || {};
    const id = this.storage.getEmpId() ?? user.employee_id ?? user.employeeId ?? user.employeeid ?? user.emp_id ?? user.id;
    return id === null || id === undefined || `${id}`.trim() === '' ? null : `${id}`;
  }

  private currentEmployeeOption(): any | null {
    const user = this.storage.getUser() || {};
    const id = this.currentEmployeeId();
    if (!id) return null;
    return {
      ...user,
      employee_id: id,
      employee_name: this.storage.getEmpName() || this.employeeName(user) || id,
      department_id: user.department_id ?? user.departmentId ?? user.dept_id ?? user.deptId,
      department_name: user.department_name ?? user.departmentName ?? user.department ?? this.storage.getDept()
    };
  }

  private employeeOptionsForScope(): Observable<any[]> {
    const roles = this.storage.roles;
    if (roles?.isAdmin) {
      if (this.reportType === 'dsr-ticket') {
        return this.auth.getUsersAll(1).pipe(map(response =>
          this.extractRows(response, ['employees', 'users', 'data', 'details', 'result', 'results'])));
      }
      return this.auth.getEmployeeList().pipe(map(response =>
        this.extractRows(response, ['employees', 'users', 'data', 'details', 'result', 'results'])));
    }
    if (roles?.isManager) {
      const employeeId = this.currentEmployeeId();
      if (!employeeId) return of([]);
      return this.auth.getUsersAll(employeeId).pipe(map(response => {
        const employees = this.extractRows(response, ['employees', 'users', 'data', 'details', 'result', 'results']);
        const currentEmployee = this.currentEmployeeOption();
        if (currentEmployee && !employees.some(employee => this.reportEmployeeId(employee) === employeeId)) {
          employees.unshift(currentEmployee);
        }
        return employees;
      }));
    }
    const currentEmployee = this.currentEmployeeOption();
    return of(currentEmployee ? [currentEmployee] : []);
  }

  private scopeEmployeesToRole(employees: any[]): any[] {
    const roles = this.storage.roles;
    const currentEmployee = this.currentEmployeeOption();
    if (roles?.isAdmin) return this.uniqueEmployees(employees);

    if (roles?.isManager) {
      const ownDepartmentId = this.departmentId(currentEmployee);
      const ownDepartmentName = this.normalizeDepartmentName(
        currentEmployee?.department_name ?? currentEmployee?.departmentName ?? currentEmployee?.department ?? this.storage.getDept()
      );
      const scoped = employees.filter(employee => {
        const employeeDepartmentId = this.departmentId(employee);
        if (ownDepartmentId && employeeDepartmentId) return ownDepartmentId === employeeDepartmentId;
        const employeeDepartmentName = this.normalizeDepartmentName(
          employee?.department_name ?? employee?.departmentName ?? employee?.department
        );
        return !!ownDepartmentName && employeeDepartmentName === ownDepartmentName;
      });
      if (currentEmployee) scoped.unshift(currentEmployee);
      return this.uniqueEmployees(scoped);
    }

    if (!currentEmployee) return [];
    const ownId = this.reportEmployeeId(currentEmployee);
    const ownRecord = employees.find(employee => this.reportEmployeeId(employee) === ownId);
    return [ownRecord || currentEmployee];
  }

  private uniqueEmployees(employees: any[]): any[] {
    const seen = new Set<string>();
    return employees.filter(employee => {
      const id = this.reportEmployeeId(employee);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  private normalizeDepartmentName(value: any): string {
    return `${value ?? ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private loadReport(): void {
    if (!this.reportType) return;
    if (this.reportType === 'employee') {
      this.employeeOptionsSubscription?.unsubscribe();
      this.loadSubscription?.unsubscribe();
      this.loading = true;
      this.loadSubscription = this.auth.getUsersAll(1).pipe(
        catchError(() => { this.errorMessage = 'Unable to load employee records.'; return of([]); }),
        finalize(() => this.loading = false)
      ).subscribe(response => {
        this.rows = this.extractRows(response, ['employees', 'users', 'data', 'details', 'result', 'results'])
          .map(employee => this.normalizeRow(employee, employee, 'employee'));
        this.columns = this.columnsFor('employee'); this.setSortDefault();
      });
      return;
    }

    this.errorMessage = '';
    this.employeeOptionsSubscription?.unsubscribe();
    this.loadSubscription?.unsubscribe();
    if (this.reportType === 'dsr-ticket' && this.canSelectAllEmployees) {
      this.loadAdminDsrTicketReport();
      return;
    }
    this.loading = true;
    if (this.reportType === 'release') {
      this.loadReleaseFilterOptions();
      return;
    }
    if (this.reportType === 'attendance') {
      this.columns = this.columnsFor('attendance');
      this.employeeOptionsSubscription = this.employeeOptionsForScope().pipe(
        catchError(() => of([]))
      ).subscribe(response => {
        this.employees = this.scopeEmployeesToRole(this.extractRows(response, ['employees', 'users', 'data', 'details', 'result', 'results']));
        this.fetchAttendanceReport();
      });
      return;
    }
    this.employeeOptionsSubscription = this.employeeOptionsForScope().pipe(
      catchError(() => { this.errorMessage = 'Unable to load employees for this report.'; this.loading = false; return of([]); })
    ).subscribe(response => {
      this.employees = this.scopeEmployeesToRole(this.extractRows(response, ['employees', 'users', 'data', 'details', 'result', 'results']));
      let employees = this.employees;
      if (this.selectedEmployeeId !== this.allEmployeesValue) {
        employees = employees.filter(employee => this.reportEmployeeId(employee) === this.selectedEmployeeId);
      }
      if (this.isAdminAllEmployeesSelection && this.reportType === 'dsr-ticket') {
        const reportEmployees = this.employees.filter(employee =>
          [1, 2, 3, 4, 6, 11].includes(this.departmentId(employee))
        );
        const employeeRequests = from(reportEmployees).pipe(
          mergeMap(employee => this.requestForEmployee(employee).pipe(
            takeLast(1),
            map((result: any) => this.dsrTicketRows(result, employee)),
            catchError(() => of([]))
          ), 6),
          toArray(),
          map(results => ([] as any[]).concat(...results)),
          finalize(() => this.loading = false)
        );
        this.loadSubscription = employeeRequests.subscribe(rows => {
          this.rows = rows;
          this.columns = this.columnsFor('dsr-ticket');
          this.setSortDefault();
        });
        return;
      }
      if (this.isAdminAllEmployeesSelection && (this.reportType === 'task' || this.reportType === 'not-send-dsr')) {
        const kind = this.reportType;
        this.loadSubscription = this.requestForAllEmployees().pipe(
          map((result: any) => this.extractRows(result, this.responseKeys(kind))
            .map(row => {
              const responseEmployeeId = kind === 'task'
                ? this.explicitEmployeeId(row)
                : this.reportEmployeeId(row);
              const employee = responseEmployeeId
                ? this.employees.find(option => this.reportEmployeeId(option) === responseEmployeeId)
                : null;
              return this.normalizeRow(row, employee || row, kind);
            })),
          catchError(() => of([])),
          finalize(() => this.loading = false)
        ).subscribe((rows: any[]) => {
          this.rows = rows;
          this.columns = this.columnsFor(kind);
          this.setSortDefault();
        });
        return;
      }
      if (!employees.length) {
        this.rows = []; this.columns = this.columnsFor(this.reportType as ReportKind); this.setSortDefault();
        this.loading = false;
        return;
      }
      this.loading = true;
      this.loadSubscription = from(employees).pipe(mergeMap(employee => this.requestForEmployee(employee).pipe(
        takeLast(1),
        map((result: any) => {
          const kind = this.reportType as ReportKind;
          const rows = kind === 'dsr-ticket'
            ? this.dsrTicketRows(result, employee)
            : this.extractRows(result, this.responseKeys(kind));
          return rows.filter(row => {
            const responseEmployeeId = kind === 'task' ? this.explicitEmployeeId(row) : this.reportEmployeeId(row);
            return !responseEmployeeId || responseEmployeeId === this.reportEmployeeId(employee);
          }).map(row => kind === 'dsr-ticket' ? row : this.normalizeRow(row, employee, kind));
        }),
        catchError(() => of([]))
      ), 6), toArray(), finalize(() => this.loading = false)).subscribe(results => {
        this.rows = ([] as any[]).concat(...results);
        this.columns = this.columnsFor(this.reportType as ReportKind);
        this.setSortDefault();
      });
    });
  }

  private loadAdminDsrTicketReport(): void {
    const employee = this.employees.find(option => this.reportEmployeeId(option) === this.selectedEmployeeId);
    if (!employee) {
      this.rows = [];
      this.columns = [];
      this.loading = false;
      return;
    }

    this.loading = true;
    this.loadSubscription = this.requestForEmployee(employee).pipe(
      takeLast(1),
      map((result: any) => this.dsrTicketRows(result, employee)),
      catchError(() => {
        this.errorMessage = 'Unable to load report data.';
        return of([]);
      }),
      finalize(() => this.loading = false)
    ).subscribe((rows: any[]) => {
      this.rows = rows;
      this.columns = this.columnsFor('dsr-ticket');
      this.setSortDefault();
    });
  }

  private requestForEmployee(employee: any): any {
    const id = Number(this.reportEmployeeId(employee));
    const userId = Number(this.storage.getUserId() || 0);
    const payload = { employee_id: Number(this.storage.getEmpId() || 0), selected_emp_id: id, fromdate: this.fromDate, todate: this.toDate };
    switch (this.reportType) {
      case 'dsr-ticket':
        return this.auth.getDsrTicketList(
          Number(this.storage.getEmpId() || 0), userId, this.fromDate, this.toDate, id
        );
      case 'not-send-dsr': return this.auth.getNotsendTasks({ ...payload, selected_employee_id: id });
      case 'task': return this.auth.getTaskOverviewByEmp(payload);
      default: return of([]);
    }
  }

  private get isAdminAllEmployeesSelection(): boolean {
    return this.canSelectAllEmployees && this.selectedEmployeeId === this.allEmployeesValue;
  }

  private requestForAllEmployees(): any {
    const payload = {
      employee_id: Number(this.storage.getEmpId() || 0),
      selected_emp_id: 0,
      fromdate: this.fromDate,
      todate: this.toDate
    };
    if (this.reportType === 'task') return this.auth.getTaskOverviewByEmp(payload);
    if (this.reportType === 'not-send-dsr') {
      return this.auth.getNotsendTasks({
        employee_id: payload.employee_id,
        selected_employee_id: 0,
        fromdate: payload.fromdate,
        todate: payload.todate
      });
    }
    return of([]);
  }

  private loadReleaseFilterOptions(): void {
    if (this.releaseFilterOptionsLoaded) {
      this.fetchDepartmentReleases();
      return;
    }

    const viewerEmployeeId = Number(this.storage.getEmpId() || 0);
    this.employeeOptionsSubscription = forkJoin({
      employees: this.employeeOptionsForScope().pipe(catchError(() => of([]))),
      projects: this.auth.getAllProjectsByEmployeeId(viewerEmployeeId).pipe(catchError(() => of([])))
    }).subscribe(({ employees, projects }: any) => {
      this.employees = this.scopeEmployeesToRole(
        this.extractRows(employees, ['employees', 'users', 'data', 'details', 'result', 'results'])
      );
      this.releaseProjects = this.extractRows(projects, ['projects', 'project_list', 'projectList', 'data', 'details', 'result', 'results']);
      this.releaseFilterOptionsLoaded = true;
      this.fetchDepartmentReleases();
    });
  }

  private releaseOverviewPayload(): any {
    const selectedEmployeeId = this.selectedEmployeeId && this.selectedEmployeeId !== this.allEmployeesValue
      ? Number(this.selectedEmployeeId)
      : 0;
    return {
      employee_id: Number(this.storage.getEmpId() || 0),
      selected_emp_id: selectedEmployeeId,
      projectid: Number(this.selectedProjectId || 0),
      fromdate: this.fromDate,
      todate: this.toDate,
      department_id: 0
    };
  }

  private fetchDepartmentReleases(): void {
    this.errorMessage = '';
    this.loadSubscription = this.auth.getReleaseOverviewByEmp(this.releaseOverviewPayload()).pipe(
      map((result: any) => this.extractRows(result, this.responseKeys('release')).map(row => this.normalizeRow(row, row, 'release'))),
      catchError(() => { this.errorMessage = 'Unable to load release overview.'; return of([]); }),
      finalize(() => this.loading = false)
    ).subscribe(rows => {
      this.rows = rows;
      this.columns = this.columnsFor('release'); this.setSortDefault();
    });
  }

  private async exportReleaseReport(format: 'excel' | 'pdf'): Promise<void> {
    if (format === 'excel') this.excelExporting = true;
    else this.pdfExporting = true;
    try {
      const response = await firstValueFrom(this.auth.getReleaseOverviewListByEmp(this.releaseOverviewPayload()));
      const rows = this.extractRows(response, this.responseKeys('release'))
        .map(row => this.normalizeRow(row, row, 'release'))
        .filter(row => this.matchesSelectedReleaseEmployee(row) && this.matchesSearch(row));
      if (!rows.length) {
        this.toaster.error(`No matching release records available for ${format.toUpperCase()} export.`);
        return;
      }
      const filters = {
        generatedBy: this.generatedBy,
        filteredEmployee: this.exportScopeName,
        reportTitle: this.exportTitle,
        filename: `${this.filenameBase()}.${format === 'excel' ? 'xlsx' : 'pdf'}`,
        filteredProject: this.selectedReleaseProjectName,
        releaseType: 'All',
        department: 'All Departments',
        managerName: 'All Managers',
        departmentWiseReleaseReport: false,
        departmentSections: []
      };
      if (format === 'excel') {
        this.excel.generateReleaseOverviewExcel(filters, this.fromDate, this.toDate, rows);
        this.toaster.success('Excel release report downloaded successfully.');
      } else {
        this.pdf.generateReleaseOverviewPDF(filters, this.fromDate, this.toDate, rows, 'download');
        this.toaster.success('PDF release report downloaded successfully.');
      }
    } catch (error) {
      console.error(`Release report ${format.toUpperCase()} export failed`, error);
      this.toaster.error(`Unable to generate the ${format.toUpperCase()} release report.`);
    } finally {
      if (format === 'excel') this.excelExporting = false;
      else this.pdfExporting = false;
    }
  }

  private matchesSearch(row: any): boolean {
    const term = this.searchTerm.trim().toLowerCase();
    return !term || this.columns.some(column =>
      `${this.value(row, column.key)}`.toLowerCase().includes(term));
  }

  private matchesSelectedReleaseEmployee(row: any): boolean {
    if (this.reportType !== 'release' || !this.selectedEmployeeId
      || this.selectedEmployeeId === this.allEmployeesValue) return true;

    const selectedEmployee = this.employees.find(employee =>
      this.reportEmployeeId(employee) === this.selectedEmployeeId)
      || (this.selectedEmployeeId === this.currentEmployeeId() ? this.currentEmployeeOption() : null);
    const selectedKeys = this.releaseEmployeeKeys({
      employee_id: this.selectedEmployeeId,
      employee_name: this.employeeName(selectedEmployee) || this.selectedEmployeeName
    });
    if (!selectedKeys.size) return true;

    const rowKeys = this.releaseEmployeeKeys(row);
    if (!rowKeys.size) return true;
    for (const key of rowKeys) {
      if (selectedKeys.has(key)) return true;
    }
    return false;
  }

  private releaseEmployeeKeys(row: any): Set<string> {
    if (!row || typeof row !== 'object') return new Set<string>();
    const values = [
      row.employee_id, row.employeeId, row.employeeid, row.emp_id, row.empId, row.empid,
      row.user_id, row.userId, row.userid,
      row.employee_name, row.employeeName, row._releaseEmployeeName, row.emp_name, row.empName,
      row.manager_name, row.managerName, row.manager, row.team_lead_name, row.teamLeadName,
      row.assigned_manager, row.assignedManager, row.manager_id, row.managerId,
      row.assigned_to, row.assignedTo, row.assigned_to_id, row.assignedToId,
      row.assigned_to_name, row.assignedToName, row.assignee_to, row.assigneeTo,
      row.assignee_to_id, row.assigneeToId, row.assignee_to_name, row.assigneeToName,
      row.assignee_to_employee_name, row.assigneeToEmployeeName,
      row.assigned_from, row.assignedFrom, row.assigned_from_id, row.assignedFromId,
      row.assigned_from_name, row.assignedFromName, row.assignee_from, row.assigneeFrom,
      row.assignee_from_id, row.assigneeFromId, row.assignee_from_name, row.assigneeFromName,
      row.assignee_from_employee_name, row.assigneeFromEmployeeName,
      row.released_by, row.releasedBy, row.released_by_id, row.releasedById,
      row.released_by_name, row.releasedByName, row.tested_by, row.testedBy,
      row.tested_by_id, row.testedById, row.tested_by_name, row.testedByName,
      row.createdby, row.created_by, row.createdBy, row.created_by_name, row.createdByName,
      row.updatedby, row.updated_by, row.updatedBy
    ];
    const nested = [row.employee, row.employeeDetails, row.assigned_to_employee, row.assignedToEmployee,
      row.assigned_from_employee, row.assignedFromEmployee, row.released_by_employee,
      row.releasedByEmployee, row.tested_by_employee, row.testedByEmployee];
    nested.forEach(employee => {
      if (!employee || typeof employee !== 'object') return;
      values.push(employee.employee_id, employee.employeeId, employee.employeeid, employee.emp_id,
        employee.empId, employee.empid, employee.user_id, employee.userId, employee.id,
        employee.employee_name, employee.employeeName, employee.name);
    });
    const normalizeValue = (value: any): string => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') {
        value = value.employee_name ?? value.employeeName ?? value.name
          ?? `${value.firstname ?? value.first_name ?? ''} ${value.lastname ?? value.last_name ?? ''}`;
      }
      return `${value}`.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
    };
    return new Set(values.map(normalizeValue).filter(Boolean));
  }

  private exportModel(): { rows: any[] } { return { rows: this.filteredRows }; }

  private dsrTicketStatusColorTone(row: any): 'week-off' | 'holiday' | 'leave' | 'regular' {
    const status = `${row?.status ?? ''}`.trim().toLowerCase();
    if (status === 'weekly off') return 'week-off';
    const holidayValue = row?.holiday;
    if (holidayValue === true || holidayValue === 1
      || ['true', '1'].includes(`${holidayValue ?? ''}`.trim().toLowerCase())
      || status.includes('holiday')) return 'holiday';
    return status.includes('leave') ? 'leave' : 'regular';
  }
  private exportCellValue(row: any, key: string): any {
    if (this.reportType === 'dsr-ticket' && key === 'task') {
      const lines = dsrTicketDetails(row);
      return lines.length ? lines.map(line => `${line.label}: ${line.value}`).join('\n') : '—';
    }
    return this.value(row, key);
  }
  private getExcelColumnWidths(rows: any[]): number[] {
    return this.columns.map(column => {
      const longestValue = rows.reduce((longest, row) =>
        Math.max(longest, `${this.exportCellValue(row, column.key)}`.length), column.label.length);
      const minimum = this.reportType === 'dsr-ticket' && column.key === 'task' ? 60 : 18;
      return Math.min(80, Math.max(minimum, longestValue + 3));
    });
  }

  private filenameBase(): string { return `${this.exportTitle}_${this.exportFromDate}_${this.exportToDate}`.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, ''); }
  private setSortDefault(): void {
    this.sortKey = this.columns[0]?.key || '';
    this.sortDirection = 'asc';
    this.refreshTable();
  }

  private refreshTable(): void {
    if (this.destroyed || !this.tableHost || !this.columns.length) return;
    if (typeof Tabulator === 'undefined') {
      if (!this.tableCheckInterval) {
        this.tableCheckInterval = setInterval(() => {
          if (this.destroyed) return;
          if (typeof Tabulator !== 'undefined' && this.tableHost && this.columns.length) {
            this.stopTableCheck();
            this.refreshTable();
          }
        }, 50);
      }
      return;
    }

    this.tableHost.classList.toggle('report-tabulator--centered', this.reportType === 'not-send-dsr');

    if (this.table) {
      const currentTable = this.table;
      void Promise.resolve(currentTable.setData(this.rows)).then(() => {
        if (this.table !== currentTable) return;
        if (this.sortKey) currentTable.setSort([{ column: this.sortKey, dir: this.sortDirection }]);
        this.finishTableDataRefresh(currentTable);
      }).catch(() => undefined);
      return;
    }

    const component = this;
    this.table = new Tabulator(this.tableHost, {
      data: this.rows,
      layout: 'fitColumns',
      autoResize: true,
      responsiveLayout: false,
      pagination: 'local',
      paginationSize: this.pageSize,
      paginationCounter: 'rows',
      paginationSizeSelector: this.pageSizes,
      placeholder: 'No matching report records.',
      maxHeight: '800px',
      movableColumns: true,
      rowFormatter: (row: any) => component.formatAttendanceHolidayRow(row),
      headerSortElement: (_column: any, direction: string) => {
        if (direction === 'asc') return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (direction === 'desc') return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },
      initialSort: this.sortKey ? [{ column: this.sortKey, dir: this.sortDirection }] : [],
      columns: this.columns.map((column, index) => ({
        title: column.label,
        field: column.key,
        minWidth: component.reportType === 'dsr-ticket' && column.key === 'task'
          ? 500
          : component.reportType === 'attendance'
            ? ({ date: 150, day: 130, employee_name: 180, thumbTime: 280, shift: 160, inTime: 130, outTime: 130, workHours: 145, extraHours: 145, thumbStatus: 170, status: 170 } as Record<string, number>)[column.key] || 150
            : 160,
        frozen: index === 0,
        hozAlign: component.reportType === 'not-send-dsr'
          || (component.reportType === 'release' && column.key === 'status')
          || (component.reportType === 'attendance' && ['inTime', 'outTime', 'workHours', 'extraHours', 'thumbStatus', 'status'].includes(column.key))
          ? 'center' : undefined,
        headerHozAlign: component.reportType === 'not-send-dsr'
          || (component.reportType === 'release' && column.key === 'status')
          || (component.reportType === 'attendance' && ['inTime', 'outTime', 'workHours', 'extraHours', 'thumbStatus', 'status'].includes(column.key))
          ? 'center' : undefined,
        headerSort: true,
        sorter: (left: any, right: any) => `${left ?? ''}`.localeCompare(`${right ?? ''}`, undefined, {
          numeric: true,
          sensitivity: 'base'
        }),
        formatter: (cell: any) => {
          const row = cell.getRow().getData();
          if (component.reportType === 'dsr-ticket' && column.key === 'task') {
            const visibleDetails = dsrTicketDetails(row);
            if (!visibleDetails.length) return '—';
            const list = document.createElement('div');
            list.className = 'report-ticket-details';
            visibleDetails.forEach(({ label, value }) => {
              const line = document.createElement('div');
              line.className = 'report-ticket-details__line';
              const title = document.createElement('strong');
              title.textContent = `${label}: `;
              const text = document.createElement('span');
              text.textContent = `${value}`;
              line.append(title, text);
              list.appendChild(line);
            });
            return list;
          }
          if (component.reportType === 'dsr-ticket' && column.key === 'status') {
            const status = `${cell.getValue() ?? ''}`.trim();
            if (!status || status === '—' || status === '-') return '—';
            const normalizedStatus = status.toLowerCase();
            const rowHoliday = row?.holiday === true || row?.holiday === 1
              || ['true', '1'].includes(`${row?.holiday ?? ''}`.trim().toLowerCase());
            const tone = normalizedStatus === 'weekly off' ? 'week-off'
              : rowHoliday || normalizedStatus.includes('holiday') ? 'holiday'
              : normalizedStatus.includes('leave') ? 'leave' : 'regular';
            const badge = document.createElement('span');
            badge.className = `report-dsr-status report-dsr-status--${tone}`;
            badge.textContent = status;
            return badge;
          }
          if (component.reportType === 'attendance') {
            const value = cell.getValue();
            if (['inTime', 'outTime', 'workHours', 'extraHours'].includes(column.key)) {
              const tone: AttendanceReportTone | null = column.key === 'inTime' ? attendanceTimeTone('inTime', value)
                : column.key === 'outTime' ? attendanceTimeTone('outTime', value)
                : column.key === 'workHours' ? attendanceWorkHoursTone(value)
                : isMissingAttendanceValue(value) ? null : 'extra';
              if (isMissingAttendanceValue(value)) return '—';
              const badge = document.createElement('span');
              badge.className = `attendance-value-badge${tone ? ` attendance-value-badge--${tone}` : ''}`;
              badge.textContent = `${value}`;
              return badge;
            }
            if (column.key === 'status' || column.key === 'thumbStatus') {
              const chip = document.createElement('span');
              const label = `${value ?? '—'}`;
              chip.className = `attendance-status-chip attendance-status-chip--${attendanceStatusTone(label)}`;
              chip.textContent = label;
              return chip;
            }
          }
          if (component.reportType === 'release' && column.key === 'overdue') {
            const overdue = getReleaseDayStatus(row);
            if (overdue.tone === 'none') return '—';
            const tone = overdue.tone === 'red' ? 'danger'
              : overdue.tone === 'green' ? 'success'
              : overdue.tone === 'blue' ? 'info' : 'warning';
            const pill = document.createElement('span');
            pill.className = `release-date-pill release-date-pill--${tone}`;
            pill.textContent = overdue.text;
            return pill;
          }
          if (component.reportType === 'release' && column.key === 'status') {
            const status = getReleaseDayStatus(row).status;
            if (!status || status === '-') return '—';
            const pill = document.createElement('span');
            pill.className = `release-status-pill ${component.releaseStatusClass(status)}`;
            pill.textContent = status;
            return pill;
          }
          if (component.reportType === 'task' && column.key === 'status') {
            const status = `${cell.getValue() ?? ''}`.trim();
            if (!status || status === '—' || status === '-') return '—';
            const pill = document.createElement('span');
            pill.className = `task-status-pill task-status-pill--${component.taskStatusTone(status)}`;
            pill.textContent = status;
            return pill;
          }
          if (component.reportType === 'employee' && column.key === 'isactive') {
            const status = `${component.value(row, column.key) ?? ''}`.trim();
            const content = document.createElement('span');
            content.className = status.toLowerCase() === 'active'
              ? 'employee-status-text employee-status-text--active'
              : status.toLowerCase() === 'inactive'
                ? 'employee-status-text employee-status-text--inactive'
                : 'employee-status-text';
            content.textContent = status || '—';
            return content;
          }
          const content = document.createElement('span');
          content.textContent = `${component.value(row, column.key)}`;
          return content;
        }
      }))
    });
    this.table.on('dataSorted', (sorters: Array<{ field: string; dir: 'asc' | 'desc' }>) => {
      const activeSort = sorters?.[0];
      if (activeSort) {
        this.sortKey = activeSort.field;
        this.sortDirection = activeSort.dir;
      }
    });
    attachTabulatorPaginationPersistence(
      this.table,
      buildTabulatorPaginationKey(`reports-table:${this.reportType}`)
    );
    if (this.reportType === 'attendance') {
      const formatPagination = () => setTimeout(() => this.formatAttendancePagination());
      this.table.on('tableBuilt', formatPagination);
      this.table.on('pageLoaded', formatPagination);
      this.table.on('pageSizeChanged', formatPagination);
      formatPagination();
    }
    this.finishTableDataRefresh(this.table);
  }

  private formatAttendancePagination(): void {
    if (this.reportType !== 'attendance' || !this.tableHost) return;
    const pagination = this.tableHost.querySelector<HTMLElement>('.tabulator-footer');
    if (!pagination) return;
    const previous = pagination.querySelector<HTMLElement>('.tabulator-page[data-page-group="prev"]');
    if (previous) {
      previous.textContent = 'Previous';
      previous.title = 'Show the previous five pages';
      previous.setAttribute('aria-label', 'Show the previous five pages');
    }
    const next = pagination.querySelector<HTMLElement>('.tabulator-page[data-page-group="next"]');
    if (next) {
      next.textContent = 'Next';
      next.title = 'Show the next five pages';
      next.setAttribute('aria-label', 'Show the next five pages');
    }
    pagination.querySelector<HTMLSelectElement>('.tabulator-page-size')?.setAttribute('aria-label', 'Rows per page');
  }

  private formatAttendanceHolidayRow(row: any): void {
    if (this.reportType !== 'attendance') return;
    const element = row?.getElement?.() as HTMLElement | undefined;
    if (!element) return;
    element.querySelector('.attendance-holiday-name-overlay')?.remove();
    element.classList.remove('attendance-holiday-row');
    const cells = row.getCells?.() || [];
    cells.forEach((cell: any) => {
      const cellElement = cell?.getElement?.() as HTMLElement | undefined;
      cellElement?.classList.remove('attendance-holiday-cell');
      if (cellElement) cellElement.style.visibility = '';
    });
    const record = row.getData?.();
    if (!record?.isHoliday) return;
    const first = cells.find((cell: any) => cell?.getField?.() === 'thumbTime')?.getElement?.() as HTMLElement | undefined;
    const last = cells.find((cell: any) => cell?.getField?.() === 'thumbStatus')?.getElement?.() as HTMLElement | undefined;
    if (!first || !last) return;
    const middle = new Set(['thumbTime', 'shift', 'inTime', 'outTime', 'workHours', 'extraHours', 'thumbStatus']);
    cells.forEach((cell: any) => {
      if (!middle.has(cell?.getField?.())) return;
      const cellElement = cell?.getElement?.() as HTMLElement | undefined;
      if (!cellElement) return;
      cellElement.classList.add('attendance-holiday-cell');
      cellElement.style.visibility = 'hidden';
    });
    const rowBounds = element.getBoundingClientRect();
    const firstBounds = first.getBoundingClientRect();
    const lastBounds = last.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'attendance-holiday-name-overlay';
    overlay.textContent = record.leaveName || 'Holiday';
    overlay.style.left = `${firstBounds.left - rowBounds.left}px`;
    overlay.style.width = `${lastBounds.right - firstBounds.left}px`;
    element.appendChild(overlay);
  }

  private finishTableDataRefresh(table: any): void {
    if (!this.resetPageAfterDataLoad) {
      this.applyTableSearch(false);
      return;
    }
    this.resetPageAfterDataLoad = false;
    void Promise.resolve(table.setPage(1)).then(() => {
      if (this.table === table) this.applyTableSearch(false);
    }).catch(() => undefined);
  }

  private applyTableSearch(resetPage: boolean): void {
    if (!this.table) return;
    const term = this.searchTerm.trim().toLowerCase();
    if (term || this.reportType === 'employee' || this.reportType === 'release') {
      this.table.setFilter((row: any) => this.matchesEmployeeStatus(row)
        && this.matchesSelectedReleaseEmployee(row)
        && (!term || this.columns.some(column => `${this.value(row, column.key)}`.toLowerCase().includes(term))));
    } else {
      this.table.clearFilter(true);
    }
    if (resetPage) void Promise.resolve(this.table.setPage(1)).catch(() => undefined);
  }

  private destroyTable(): void {
    const table = this.table;
    this.table = null;
    try { table?.destroy?.(); } catch { /* ignore cleanup errors */ }
  }

  private stopTableCheck(): void {
    if (this.tableCheckInterval) clearInterval(this.tableCheckInterval);
    this.tableCheckInterval = null;
  }

  private departmentId(row: any): number {
    const raw = row?.department_id ?? row?.departmentId ?? row?.dept_id ?? row?.deptId ?? row?.department?.id;
    if (Number.isFinite(Number(raw))) return Number(raw);
    const label = `${row?.department_name ?? row?.departmentName ?? row?.department ?? ''}`.toLowerCase();
    if (label.includes('hardware')) return 4;
    if (label.includes('headend') || label.includes('head end')) return 6;
    if (label.includes('ridapps')) return 1;
    if (label.includes('software')) return 2;
    if (label.includes('sqa')) return 3;
    if (label.includes('account')) return 11;
    return 0;
  }

  private extractRows(response: any, keys: string[]): any[] {
    if (Array.isArray(response)) return response;
    for (const key of keys) if (Array.isArray(response?.[key])) return response[key];
    return response && typeof response === 'object' ? [response] : [];
  }

  private dsrTicketRows(response: any, employee: any): any[] {
    const payload = response && !Array.isArray(response) && response.data
      && !Array.isArray(response.data) && typeof response.data === 'object'
      ? response.data
      : response;
    const groups = this.extractRows(payload, ['data', 'details', 'result', 'results', 'list']);
    return groups.flatMap(group => {
      const dsrs = Array.isArray(group?.dsrs) ? group.dsrs : [];
      const tickets = Array.isArray(group?.tickets) ? group.tickets : [];
      const rows: Array<{ record: any; recordType: 'DSR' | 'Ticket' }> = [
        ...dsrs.map((record: any) => ({ record, recordType: 'DSR' as const })),
        ...tickets.map((record: any) => ({ record, recordType: 'Ticket' as const }))
      ];

      if (!rows.length && (Array.isArray(group?.dsrs) || Array.isArray(group?.tickets))) {
        const date = group?.date ?? group?.dsr_date ?? group?.dsrDate
          ?? group?.created_date ?? group?.created_at ?? group?.ticket_date;
        return date !== null && date !== undefined && `${date}`.trim() !== ''
          ? [this.normalizeRow({
            ...group,
            date,
            employee_id: group?.employee_id ?? group?.employeeId ?? group?.emp_id ?? this.reportEmployeeId(employee),
            employee_name: group?.employee_name ?? group?.employeeName ?? this.employeeName(employee)
          }, employee, 'dsr-ticket')]
          : [];
      }

      if (!rows.length) {
        return [this.normalizeRow(group, employee, 'dsr-ticket')];
      }

      return rows.map(({ record, recordType }) => {
        const row = {
          ...group,
          ...record,
          record_type: recordType,
          date: record?.date ?? group?.date ?? record?.created_date ?? record?.created_at,
          employee_id: record?.employee_id ?? record?.employeeId ?? record?.emp_id ?? record?.assigned_to
            ?? group?.employee_id ?? this.reportEmployeeId(employee),
          employee_name: record?.employee_name ?? record?.employeeName ?? record?.assigned_to_name
            ?? group?.employee_name ?? this.employeeName(employee),
          department_id: record?.department_id ?? record?.departmentId ?? record?.dept_id
            ?? group?.department_id ?? this.departmentId(employee)
        };
        return this.normalizeRow(row, employee, 'dsr-ticket');
      });
    });
  }

  private normalizeRow(row: any, employee: any, kind: ReportKind): any {
    const first = (...values: any[]) => values.find(value => value !== null && value !== undefined && value !== '');
    const employeeName = first(row?.employee_name, row?.employeeName, row?.name,
      `${employee?.firstname || employee?.first_name || ''} ${employee?.lastname || employee?.last_name || ''}`.trim(), employee?.name);
    const departmentName = first(row?.department_name, row?.departmentName, row?.department,
      employee?.department_name, employee?.departmentName, employee?.department);
    const common = {
      ...row,
      employee_name: employeeName || '—',
      department_name: departmentName || '—',
      department_id: first(row?.department_id, row?.departmentId, row?.dept_id, row?.deptId, employee?.department_id, employee?.departmentId)
    };
    if (kind === 'employee') return {
      ...row,
      employee_id: first(row?.employee_id, row?.employeeId, row?.emp_id, row?.id),
      employee_name: employeeName || '—',
      email: first(row?.email, row?.email_id, row?.emailId, row?.official_email, row?.company_email),
      phone: first(row?.phone, row?.phone_number, row?.mobile, row?.mobile_number),
      department_name: departmentName || '—',
      designation: first(row?.designation, row?.designation_name, row?.position, row?.role),
      isactive: this.employeeActiveStatus(first(row?.isactive, row?.is_active))
    };
    if (kind === 'dsr-ticket') {
      const departmentId = this.departmentId(row) || this.departmentId(employee);
      const isTicket = row?.record_type === 'Ticket' || [4, 6].includes(departmentId);
      const leaveStatus = `${row?.leave_status ?? ''}`.trim();
      const holidayName = `${row?.holiday_name ?? row?.holidayName ?? ''}`.trim();
      const weekOffValue = row?.week_off ?? row?.weekOff;
      const isWeekOff = weekOffValue === true || weekOffValue === 1
        || `${weekOffValue ?? ''}`.trim().toLowerCase() === 'true';
      const holidayValue = row?.holiday;
      const isHoliday = holidayValue === true || holidayValue === 1
        || ['true', '1'].includes(`${holidayValue ?? ''}`.trim().toLowerCase());
      const reportDate = `${row?.date ?? row?.created_date ?? row?.created_at ?? row?.ticket_date ?? ''}`.trim();
      const parsedReportDate = this.attendanceDate(reportDate);
      const isSunday = parsedReportDate?.getDay() === 0;
      const isSundayWeeklyOff = isSunday && !isHoliday;
      const status = isWeekOff || isSundayWeeklyOff
        ? 'Weekly Off'
        : isHoliday && holidayName ? holidayName
          : leaveStatus || '—';
      const employeeDisplayName = isTicket
        ? first(row?.assigned_to_name, row?.assignedToName, employee?.employee_name, employee?.employeeName,
          row?.assigned_from_name, row?.assignedFromName,
          `${employee?.firstname || employee?.first_name || ''} ${employee?.lastname || employee?.last_name || ''}`.trim(), employee?.name)
        : first(row?.employee_name, row?.employeeName, row?.name, employeeName);
      return {
        ...common,
        employee_name: employeeDisplayName || '—',
        company_name: isTicket ? first(row?.company_name, row?.companyName, row?.client_name, row?.clientName, row?.client) || '' : '',
        code: isTicket ? first(row?.code, row?.ticket_code, row?.ticketCode, row?.ticket_id, row?.ticketId, row?.ticketid, row?.id) || '' : '',
        product_name: isTicket ? first(row?.product_name, row?.productName) || '' : '',
        project_name: isTicket ? '' : first(row?.project_name, row?.projectName, row?.project_title, row?.projectTitle) || '',
        record_type: isTicket ? 'Ticket' : 'DSR',
        date: first(row?.date, row?.created_date, row?.created_at, row?.ticket_date),
        task: isTicket
          ? first(row?.ticket_details, row?.ticketDetails, row?.ticket_name, row?.ticketName, row?.task, row?.subject, row?.title, row?.description) || ''
          : first(row?.dsr_details, row?.dsrDetails, row?.task, row?.sub_task, row?.subject, row?.title, row?.description),
        worked_hours: first(row?.worked_hours, row?.hours, row?.duration),
        status
      };
    }
    if (kind === 'attendance') {
      const rawDate = `${first(row?.attendanceDate, row?.attendance_date, row?.date) || ''}`;
      const parsedDate = this.attendanceDate(rawDate);
      const day = `${first(row?.day, row?.dayName, row?.attendanceDay) || (parsedDate ? parsedDate.toLocaleDateString('en-US', { weekday: 'long' }) : '—')}`;
      const punches = this.attendancePunchTimes(row);
      const thumbValue = first(row?.thumb_details, row?.thumbDetails, row?.thumb_time, row?.thumbTime);
      const thumbTime = Array.isArray(thumbValue) ? thumbValue.map(value => `${value ?? ''}`.trim()).filter(Boolean).join(' · ')
        : `${thumbValue ?? ''}`.trim() || `${first(row?.alltime, row?.allTime, row?.all_time, row?.punchTimes, row?.punch_times) || '—'}`;
      const responseStatus = `${first(row?.leave_status, row?.status, row?.attendanceStatus, row?.attendance_status, row?.status_name) || '—'}`;
      const isHoliday = attendanceStatusTone(responseStatus) === 'holiday';
      const leaveName = `${first(row?.leave_name, row?.leaveName) ?? ''}`.trim();
      const baseStatus = (isMissingAttendanceValue(responseStatus) || attendanceStatusTone(responseStatus) === 'default') && day.toLowerCase().startsWith('sun') ? 'Week Off' : responseStatus;
      const status = isHoliday && leaveName ? `${baseStatus} — ${leaveName}` : baseStatus;
      const shiftIn = first(row?.shift_in_time, row?.shiftInTime);
      const shiftOut = first(row?.shift_out_time, row?.shiftOutTime);
      const shiftTime = shiftIn || shiftOut ? `${shiftIn || '—'} – ${shiftOut || '—'}` : first(row?.shiftTime, row?.shift_time, row?.shiftTiming, row?.shift_timing);
      return {
        ...common,
        employee_name: first(row?.employee_name, row?.employeeName, row?.employee, employeeName) || '—',
        date: parsedDate ? parsedDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : rawDate || '—',
        day,
        thumbTime: thumbTime || '—',
        shift: first(row?.shift, row?.shiftName, row?.shiftname, row?.shift_name, shiftTime) || '—',
        inTime: first(row?.in_time, row?.inTime, row?.checkIn, row?.check_in, row?.punch_in, punches[0]) || '—',
        outTime: first(row?.out_time, row?.outTime, row?.checkOut, row?.check_out, row?.punch_out, punches[1]) || '—',
        workHours: first(row?.working_hours, row?.workedhoursdash, row?.workedHours, row?.workHours, row?.workingHours, row?.work_hours, row?.total_hours) || '—',
        extraHours: first(row?.extra_hours, row?.extraHours, row?.extrahours, row?.extrahoursdash, row?.overtime) || '—',
        thumbStatus: first(row?.thump_status, row?.thumb_status, row?.thumbStatus) || '—',
        status,
        leaveName,
        isHoliday
      };
    }
    if (kind === 'not-send-dsr') return {
      ...common,
      date: first(row?.date, row?.task_date, row?.created_date),
      project_title: first(row?.project_title, row?.project_name),
      task_name: first(row?.task_name, row?.sub_task, row?.task, row?.title),
      status: first(row?.status, row?.task_status)
    };
    if (kind === 'task') return {
      ...common,
      assigned_from_name: first(
        row?.assigned_from_name, row?.assignedFromName, row?.owner_name, row?.ownerName,
        row?.employee_name, row?.employeeName, row?.emp_name, row?.empName,
        employee === row ? undefined : employee?.employee_name,
        employee === row ? undefined : employee?.employeeName,
        employee === row ? undefined : `${employee?.firstname || employee?.first_name || ''} ${employee?.lastname || employee?.last_name || ''}`.trim(),
        employee === row ? undefined : employee?.name
      ) || '',
      task_name: first(row?.task_name, row?.task, row?.sub_task, row?.title, row?.subject),
      project_name: first(row?.project_name, row?.project_title),
      fromdate: first(row?.fromdate, row?.start_date, row?.date),
      todate: first(row?.todate, row?.end_date),
      status: (() => {
        const status = first(row?.status, row?.task_status, row?.status_name, row?.task_status_name);
        return status && typeof status === 'object'
          ? first(status.status, status.status_name, status.name, status.label, status.value)
          : status;
      })()
    };
    return {
      ...common,
      _releaseEmployeeName: first(row?.employee_name, row?.employeeName, row?.emp_name, row?.empName),
      project_name: first(row?.project_name, row?.project_title, row?.projectName),
      title: first(row?.title, row?.release_title, row?.release_name),
      version: first(row?.version, row?.release_version),
      manager_name: first(row?.manager_name, row?.managerName, row?.manager, row?.team_lead_name),
      assignee_from_name: first(row?.assignee_from_name, row?.assigned_from_name, row?.assignedFromName, row?.worked_by_name, row?.released_by_name),
      tested_by_name: first(row?.tested_by_name, row?.assigned_to_name, row?.assignee_to_name, row?.assignedToName, row?.assigneeToName, row?.tested_by),
      planned_date: first(row?.planned_date, row?.planned_release_date),
      released_date: first(row?.released_date, row?.release_date),
      overdue: first(row?.overdue, row?.overdue_date) || getReleaseDayStatus(row).text,
      qc_testing_start_date: first(row?.qc_testing_start_date, row?.qcTestingStartDate, row?.to_be_tested_date, row?.toBeTestedDate),
      qc_testing_end_date: first(row?.qc_testing_end_date, row?.qcTestingEndDate, row?.tested_date),
      qc_released_date: first(row?.qc_released_date, row?.qc_release_date, row?.qcReleaseDate, row?.closed_date),
      status: first(row?.status, row?.release_status),
      release_type: first(row?.release_type, row?.releaseType),
      remarks: first(row?.remarks, row?.reject_reason, row?.rejection_reason),
      company_name: first(row?.company_name, row?.client_name, row?.client)
    };
  }

  private employeeActiveStatus(value: any): any {
    const normalized = `${value ?? ''}`.trim().toLowerCase();
    if (value === true || value === 1 || ['true', '1', 'active'].includes(normalized)) return 'Active';
    return 'Inactive';
  }

  private responseKeys(kind: ReportKind): string[] {
    if (kind === 'dsr-ticket') return ['tickets', 'ticket_list', 'ticketList', 'dsr_list', 'dsrList', 'dsr_overview_list', 'data', 'rows', 'result', 'results', 'list'];
    if (kind === 'attendance') return ['attendance', 'attendance_list', 'attendanceList', 'data', 'rows', 'result', 'results', 'list'];
    if (kind === 'not-send-dsr') return ['not_send_dsr', 'notSendDsr', 'tasks', 'task_list', 'data', 'rows', 'result', 'results', 'list'];
    if (kind === 'release') return ['release_list', 'releaseList', 'releaseoverviewList', 'releaseOverviewList', 'release_overview_list', 'total_release_list', 'releases', 'data', 'details', 'result', 'results'];
    return ['tasks', 'task_list', 'taskList', 'data', 'rows', 'result', 'results', 'list'];
  }

  private columnsFor(kind: ReportKind): Array<{ key: string; label: string }> {
    if (kind === 'dsr-ticket') {
      const departmentColumns: Array<[string, string]> = this.storage.roles?.isAdmin
        ? [
          ['company_name', 'Client Name'], ['code', 'Code'],
          ['product_name', 'Product Name'], ['project_name', 'Project Name']
        ]
        : this.showTicketDetailsColumns
          ? [
            ['company_name', 'Client Name'], ['code', 'Code'],
            ...(this.showHeadendProductColumn ? [['product_name', 'Product Name'] as [string, string]] : [])
          ]
          : [['project_name', 'Project Name']];
      const dsrTicketColumns: Array<[string, string]> = [
        ['record_type', 'Type'], ['date', 'Date'],
        ...(!this.storage.roles?.isAdmin ? [['employee_name', 'Employee'] as [string, string]] : []),
        ...departmentColumns, ['task', 'Task / Ticket'], ['worked_hours', 'Worked Hours'], ['status', 'Status']
      ];
      return dsrTicketColumns.map(([key, label]) => ({ key, label }));
    }
    if (kind === 'attendance') {
      const attendanceColumns: Array<{ key: string; label: string }> = [
        { key: 'date', label: 'Date' }, { key: 'day', label: 'Day' }
      ];
      if (this.isAdminAllEmployeesSelection) attendanceColumns.push({ key: 'employee_name', label: 'Employee' });
      attendanceColumns.push(
        { key: 'thumbTime', label: 'Thumb Time' }, { key: 'shift', label: 'Shift' },
        { key: 'inTime', label: 'In' }, { key: 'outTime', label: 'Out' },
        { key: 'workHours', label: 'Work Hrs' }, { key: 'extraHours', label: 'Extra Hrs' },
        { key: 'thumbStatus', label: 'Thumb Status' }, { key: 'status', label: 'Status' }
      );
      return attendanceColumns;
    }
    const columns: Record<ReportKind, Array<[string, string]>> = {
      'dsr-ticket': [],
      attendance: [],
      'not-send-dsr': [['date', 'Date'], ['employee_name', 'Employee']],
      employee: [ ['employee_name', 'Employee Name'], ['email', 'Email'], ['phone', 'Phone'], ['department_name', 'Department'], ['designation', 'Designation'], ['attendanceid', 'Attendance No'], ['joining_date', 'Joining Date'], ['date_of_birth', 'Date Of Birth'],['isactive','Status']],
      release: [['project_name', 'Project'], ['title', 'Title'], ['version', 'Version'], ['manager_name', 'Manager / TL'], ['assignee_from_name', 'Worked / Released By'], ['planned_date', 'Planned Date'], ['released_date', 'Released Date'], ['overdue', 'Overdue'], ['tested_by_name', 'Tested By'], ['qc_testing_start_date', 'QC Testing Start Date'], ['qc_testing_end_date', 'QC Testing End Date'], ['qc_released_date', 'QC Release Date'], ['status', 'Status'], ['release_type', 'Release Type'], ['remarks', 'Remarks'], ['company_name', 'Client']],
      task: [['assigned_from_name', 'Employee'],  ['project_name', 'Project'], ['task_name', 'Task'], ['status', 'Status'], ['fromdate', 'Start Date'], ['todate', 'End Date']]
    };
    return columns[kind].map(([key, label]) => ({ key, label }));
  }

  private get showTicketDetailsColumns(): boolean {
    if (this.isAdminAllEmployeesSelection) {
      return this.rows.some(row => row?.record_type === 'Ticket' || [4, 6].includes(this.departmentId(row)));
    }

    const selectedEmployee = this.employees.find(employee =>
      this.reportEmployeeId(employee) === this.selectedEmployeeId)
      || (this.selectedEmployeeId === this.currentEmployeeId() ? this.currentEmployeeOption() : null);
    const selectedDepartmentId = this.departmentId(selectedEmployee);
    if ([4, 6].includes(selectedDepartmentId)) return true;
    if (selectedDepartmentId) return false;
    return this.rows.some(row => row?.record_type === 'Ticket' || [4, 6].includes(this.departmentId(row)));
  }

  private get showHeadendProductColumn(): boolean {
    if (this.isAdminAllEmployeesSelection) {
      return this.rows.some(row => row?.record_type === 'Ticket' && this.departmentId(row) === 6);
    }

    const selectedEmployee = this.employees.find(employee =>
      this.reportEmployeeId(employee) === this.selectedEmployeeId)
      || (this.selectedEmployeeId === this.currentEmployeeId() ? this.currentEmployeeOption() : null);
    if (this.departmentId(selectedEmployee) === 6) return true;
    if (selectedEmployee && this.departmentId(selectedEmployee)) return false;
    return this.rows.some(row => row?.record_type === 'Ticket' && this.departmentId(row) === 6);
  }

  private monthStart(): string {
    const now = new Date();
    return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-01`;
  }
  private today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
  }

  private parseDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private attendancePunchTimes(row: any): [string, string] {
    const punches = row?.alltime ?? row?.allTime ?? row?.all_time ?? row?.punchTimes ?? row?.punch_times;
    if (punches === null || punches === undefined || `${punches}`.trim() === '') return ['', ''];
    const values = `${punches}`.split(/\s*(?:,|\||;|\s+-\s+)\s*/).map(value => value.trim()).filter(Boolean);
    return [values[0] || '', values.length > 1 ? values[values.length - 1] : ''];
  }

  private attendanceDate(value: string): Date | null {
    if (!value) return null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    const date = iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private formatDate(value: Date): string {
    return `${value.getFullYear()}-${`${value.getMonth() + 1}`.padStart(2, '0')}-${`${value.getDate()}`.padStart(2, '0')}`;
  }
}
