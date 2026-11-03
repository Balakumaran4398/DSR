import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from 'src/app/_core/services/auth.service';
import { ExcelService } from 'src/app/_core/services/excel.service';
import { PdfService } from 'src/app/_core/services/pdf.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { AttendanceDocComponent } from '../team/attendance-doc/attendance-doc.component';
import { attachStandardTabulatorPagination } from 'src/app/_core/utils/tabulator-pagination.util';
import {
  AttendanceReportTone,
  attendanceDurationInMinutes,
  attendanceStatusTone,
  attendanceTimeTone,
  attendanceWorkHoursTone,
  isMissingAttendanceValue
} from 'src/app/_core/utils/attendance-report.util';
declare const Tabulator: any;

interface AttendanceRecord {
  date: string;
  day: string;
  shift: string;
  shiftTime: string;
  thumbTime: string;
  inTime: string;
  outTime: string;
  workHours: string;
  extraHours: string;
  status: string;
  thumbStatus: string;
  leaveName: string;
  isHoliday: boolean;
  raw: any;
}

interface AttendanceReport {
  employee: any;
  period: string;
  fromDate: string;
  toDate: string;
  records: AttendanceRecord[];
  summary: { totalRecords: number; present: number; leave: number; weekOff: number; absent: number; other: number; extraHours: string };
}

@Component({
  selector: 'app-attendance',
  templateUrl: './attendance.component.html',
  styleUrls: ['./attendance.component.scss']
})
export class AttendanceComponent implements OnInit, OnDestroy {
  readonly months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  readonly years: number[];
  readonly canSelectEmployee: boolean;
  @ViewChild('tableDiv') tableDiv?: ElementRef<HTMLDivElement>;
  @ViewChild('paginationDiv') paginationDiv?: ElementRef<HTMLDivElement>;
  private table: any;

  month = new Date().toLocaleString('en-US', { month: 'long' });
  year = new Date().getFullYear();
  employeeId: string | number | null;
  employees: any[] = [];
  filteredEmployees: any[] = [];
  selectedEmployee: any = null;
  snapshotEmployee: any = null;
  private snapshotRequestId = 0;
  records: AttendanceRecord[] = [];
  loading = false;
  hasFetched = false;
  errorMessage = '';
  employeeListMessage = '';
  employeeSearchTerm = '';
  monthSearchTerm = '';
  yearSearchTerm = '';

  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private pdfService: PdfService,
    private excelService: ExcelService,
    private toasterService: ToasterService,
    private dialog: MatDialog
  ) {
    const roles = this.storageService.roles;
    this.canSelectEmployee = roles.isAdmin || roles.isManager;
    this.employeeId = roles.isManager || !this.canSelectEmployee ? this.storageService.getEmpId() : null;
    this.years = Array.from({ length: 11 }, (_, index) => new Date().getFullYear() - 5 + index);
  }

  ngOnInit(): void {
    if (this.canSelectEmployee) {
      this.loadEmployees();
    }
    if (this.employeeId && (!this.isAdmin || this.selectedEmployee)) {
      this.fetchAttendance();
    }
  }

  ngOnDestroy(): void {
    this.destroyTable();
  }

  get isAdmin(): boolean {
    return this.storageService.roles.isAdmin;
  }

  get isManager(): boolean {
    return this.storageService.roles.isManager;
  }

  get reportEmployee(): any {
    return this.snapshotEmployee || this.selectedEmployee || this.storageService.getUser() || {};
  }

  get snapshotFields(): Array<{ label: string; value: string }> {
    const employee = this.reportEmployee || {};
    return [
      { label: 'Employee', value: this.employeeName },
      { label: 'Employee code', value: this.snapshotValue(employee.attendanceid) },
      { label: 'Department', value: this.snapshotValue(employee.department_name, employee.departmentName, employee.department, this.storageService.getDept()) },
      // { label: 'Designation', value: this.snapshotValue(employee.designation, employee.designation_name, employee.designationName) },
      { label: 'Role', value: this.formatRole(this.snapshotValue(employee.role, employee.role_name, employee.roleName)) },
      { label: 'Email', value: this.snapshotValue(employee.email, employee.email_id, employee.emailId) },
      { label: 'Mobile', value: this.snapshotValue(employee.mobile, employee.mobile_number, employee.mobileNumber, employee.phone, employee.phone_number) }
    ];
  }

  get employeeName(): string {
    return this.reportEmployee?.employee_name || this.reportEmployee?.name ||
      `${this.reportEmployee?.firstname || ''} ${this.reportEmployee?.lastname || ''}`.trim() || 'Employee';
  }

  get loginName(): string {
    const user = this.storageService.getUser();
    return this.storageService.getEmpName() || user?.name || user?.username || 'User';
  }

  get loginId(): string {
    return this.storageService.getEmpId() || '--';
  }

  get loginRoleLabel(): string {
    return this.isAdmin ? 'Admin' : this.storageService.roles.isManager ? 'Manager' : 'Employee';
  }

  get departmentName(): string {
    return this.reportEmployee?.department_name || this.reportEmployee?.departmentName ||
      this.reportEmployee?.department || this.storageService.getDept() || '--';
  }

  get managerDepartmentUnavailable(): boolean {
    return this.storageService.roles.isManager && !`${this.storageService.getDept() || ''}`.trim();
  }

  openAttendanceUpload(): void {
    if (!this.isAdmin) return;
    const dialogRef = this.dialog.open(AttendanceDocComponent, {
      width: 'min(640px, calc(100vw - 24px))',
      maxWidth: '640px',
      maxHeight: 'calc(100vh - 24px)',
      autoFocus: 'dialog',
      restoreFocus: true,
      panelClass: 'attendance-upload-dialog-panel',
      backdropClass: 'attendance-upload-dialog-backdrop'
    });
    dialogRef.afterClosed().subscribe((result: { uploaded?: boolean } | undefined) => {
      if (result?.uploaded && this.hasFetched && this.selectedEmployee) {
        this.fetchAttendance();
      }
    });
  }

  get hasEmployeeSelection(): boolean {
    const id = this.canSelectEmployee
      ? (this.getEmployeeId(this.selectedEmployee) || (this.isManager ? this.storageService.getEmpId() : null))
      : this.storageService.getEmpId();
    return id !== null && id !== undefined && `${id}`.trim() !== '';
  }

  get filteredMonths(): string[] {
    const term = this.monthSearchTerm.trim().toLowerCase();
    return this.months.filter(month => month.toLowerCase().includes(term));
  }

  get filteredYears(): number[] {
    const term = this.yearSearchTerm.trim();
    return this.years.filter(year => !term || `${year}`.includes(term));
  }

  get summary(): AttendanceReport['summary'] {
    const counts = { present: 0, leave: 0, weekOff: 0, absent: 0, other: 0 };
    this.records.forEach(row => {
      // Use the same normalized Status value and semantic classifier as the table chip.
      switch (attendanceStatusTone(row.status)) {
        case 'present': counts.present++; break;
        case 'leave': counts.leave++; break;
        case 'week-off':
        case 'holiday': counts.weekOff++; break;
        case 'absent': counts.absent++; break;
        default:
          if (this.isSunday(row.day)) counts.weekOff++;
          else counts.other++;
          break;
      }
    });
    const extraMinutes = this.records.reduce((total, row) => total + this.durationInMinutes(row.extraHours), 0);
    return {
      totalRecords: this.records.length,
      ...counts,
      extraHours: this.formatMinutes(extraMinutes)
    };
  }

  get totalWorkHours(): string {
    return this.formatMinutes(this.records.reduce((total, row) => total + this.durationInMinutes(row.workHours), 0));
  }

  loadEmployees(): void {
    this.employeeListMessage = '';
    if (!this.isAdmin && this.managerDepartmentUnavailable) {
      this.employees = [];
      this.filteredEmployees = [];
      this.employeeListMessage = 'Your department is not available, so employee attendance cannot be selected.';
      return;
    }

    const employeeRequest = this.isAdmin
      ? this.authService.getEmployeeList()
      : this.authService.getUsersAll(this.storageService.getEmpId());

    employeeRequest.subscribe({
      next: (response: any) => {
        const list = Array.isArray(response) ? response
          : Array.isArray(response?.data) ? response.data
            : Array.isArray(response?.employees) ? response.employees : [];
        const employeesWithId = list.filter((employee: any) => this.getEmployeeId(employee) !== null && this.getEmployeeId(employee) !== '');
        this.employees = this.isAdmin ? employeesWithId : employeesWithId.filter((employee: any) => this.sameDepartment(employee));
        if (!this.employees.length) {
          this.employeeListMessage = this.isAdmin
            ? 'No employees are available.'
            : `No employees are available in ${this.storageService.getDept()}.`;
        }
        this.filteredEmployees = [...this.employees];
      },
      error: () => {
        this.employeeListMessage = 'Unable to load the employee list. Try again later.';
        this.toasterService.error('Unable to load the employee list.');
      }
    });
  }


  onEmployeeChange(value: string | number): void {
    const selectedId = String(value);

    this.selectedEmployee =
      this.employees.find(employee =>
        String(this.getEmployeeId(employee)) === selectedId
      ) || null;

    this.employeeId = this.selectedEmployee
      ? this.getEmployeeId(this.selectedEmployee)
      : null;
    this.snapshotEmployee = null;
    this.snapshotRequestId++;
    this.records = [];
    this.hasFetched = false;
    this.errorMessage = '';
    this.destroyTable();
  }
  employeeOptionLabel(employee: any): string {
    return employee?.employee_name || employee?.name ||
      `${employee?.firstname || ''} ${employee?.lastname || ''}`.trim() || 'Employee';
  }

  employeeOptionId(employee: any): string | number | null {
    return this.getEmployeeId(employee);
  }
  filterEmployees(event: Event): void {
    const searchTerm = (event.target as HTMLInputElement).value
      .trim()
      .toLowerCase();

    this.employeeSearchTerm = searchTerm;

    this.filteredEmployees = this.employees.filter(employee => {
      const name = this.employeeOptionLabel(employee).toLowerCase();
      const id = String(this.employeeOptionId(employee) ?? '').toLowerCase();

      return name.includes(searchTerm) || id.includes(searchTerm);
    });
  }
  filterMonths(event: Event): void {
    this.monthSearchTerm = (event.target as HTMLInputElement).value || '';
  }

  filterYears(event: Event): void {
    this.yearSearchTerm = (event.target as HTMLInputElement).value || '';
  }

  onEmployeeSelectOpened(opened: boolean): void {
    if (opened) this.employeeSearchTerm = '';
  }

  onMonthSelectOpened(opened: boolean): void {
    if (opened) this.monthSearchTerm = '';
  }

  onYearSelectOpened(opened: boolean): void {
    if (opened) this.yearSearchTerm = '';
  }

  fetchAttendance(): void {
    const targetId = this.canSelectEmployee
      ? (this.getEmployeeId(this.selectedEmployee) || (this.isManager ? this.storageService.getEmpId() : null))
      : this.storageService.getEmpId();
    if (targetId === null || targetId === undefined || `${targetId}`.trim() === '' || !this.month || !this.year) {
      this.errorMessage = 'Select an employee, month and year to fetch attendance.';
      return;
    }
    this.employeeId = targetId;

    this.loading = true;
    this.hasFetched = true;
    this.errorMessage = '';
    this.records = [];
    this.destroyTable();
    this.loadSnapshotEmployee(targetId);
    this.authService.getattendancedetails(targetId, this.month, this.year).subscribe({
      next: (response: any) => {
        const rows = Array.isArray(response) ? response : response?.data || response?.attendance || response?.records || [];
        this.records = rows.map((item: any) => this.normalizeRecord(item));
        if (this.records.length && !this.selectedEmployee) {
          this.selectedEmployee = { ...this.storageService.getUser(), employee_name: this.records[0].raw?.employeeName || this.storageService.getEmpName() };
        }
        this.loading = false;
        if (this.records.length) setTimeout(() => this.initializeAttendanceTable());
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Attendance could not be loaded. Please try again.';
        this.toasterService.error(this.errorMessage);
      }
    });
  }

  private loadSnapshotEmployee(targetId: string | number): void {
    const requestId = ++this.snapshotRequestId;
    this.snapshotEmployee = null;
    this.authService.getUsersAll(this.storageService.getEmpId()).subscribe({
      next: (response: any) => {
        if (requestId !== this.snapshotRequestId) return;
        const employees = this.extractEmployeeRows(response);
        const selected = employees.find(employee => String(this.getEmployeeId(employee)) === String(targetId));
        if (selected) this.snapshotEmployee = selected;
      },
      error: () => {
        // Keep the selected employee data as a useful fallback when the directory is unavailable.
      }
    });
  }

  private extractEmployeeRows(response: any): any[] {
    if (Array.isArray(response)) return response;
    for (const key of ['data', 'employees', 'users', 'employee_list', 'employeeList', 'details']) {
      if (Array.isArray(response?.[key])) return response[key];
    }
    return response && typeof response === 'object' ? [response] : [];
  }

  private snapshotValue(...values: any[]): string {
    const value = values.find(candidate => candidate !== null && candidate !== undefined && candidate !== '');
    return value === undefined ? '--' : this.formatSnapshotValue(value);
  }

  private formatRole(role: string): string {
    const normalizedRole = role.trim().toLowerCase();
    const roleLabels: Record<string, string> = {
      role_manager: 'Manager',
      role_employee: 'Employee',
      role_admin: 'Admin'
    };
    return roleLabels[normalizedRole] || role;
  }

  private formatSnapshotValue(value: any): string {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  exportPdf(): void {
    if (!this.records.length) return;
    this.pdfService.generateMonthlyAttendancePDF(this.buildReport());
  }

  exportExcel(): void {
    if (!this.records.length) return;
    this.excelService.generateMonthlyAttendanceExcel(this.buildReport());
  }

  formatPeriod(): string {
    return `${this.month} ${this.year}`;
  }

  private initializeAttendanceTable(): void {
    if (!this.tableDiv?.nativeElement?.isConnected || typeof Tabulator === 'undefined') return;
    this.destroyTable();
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.records,
      layout: 'fitColumns',
      responsiveLayout: false,
      height: '600px',
      pagination: 'local',
      paginationElement: this.paginationDiv?.nativeElement,
      paginationSize: 10,
      paginationCounter: 'rows',
      paginationSizeSelector: [10, 25, 50, 100],
      movableColumns: true,
      placeholder: 'No attendance records found.',
      rowFormatter: (row: any) => this.formatAttendanceRow(row),
      initialSort: [{ column: 'date', dir: 'asc' }],
      headerSortElement: (_column: any, direction: string) => {
        if (direction === 'asc') return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (direction === 'desc') return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },
      columns: [
        { title: 'Date', field: 'date', minWidth: 140, sorter: 'date', variableHeight: true },
        { title: 'Day', field: 'day', minWidth: 120 },
        { title: 'Thumb time', field: 'thumbTime', minWidth: 300, variableHeight: true },
        { title: 'Shift', field: 'shift', minWidth: 145 },
        {
          title: 'In', field: 'inTime', minWidth: 115, hozAlign: 'center',
          formatter: (cell: any) => this.createValueBadge(cell.getValue(), this.classifyInTime(cell.getValue()))
        },
        {
          title: 'Out', field: 'outTime', minWidth: 115, hozAlign: 'center',
          formatter: (cell: any) => this.createValueBadge(cell.getValue(), this.classifyOutTime(cell.getValue()))
        },
        {
          title: 'Work Hrs', field: 'workHours', minWidth: 125, hozAlign: 'center',
          formatter: (cell: any) => this.createValueBadge(cell.getValue(), this.classifyWorkHours(cell.getValue()))
        },
        {
          title: 'Extra Hrs', field: 'extraHours', minWidth: 125, hozAlign: 'center',
          formatter: (cell: any) => this.createValueBadge(cell.getValue(), 'extra')
        },
        {
          title: 'Thumb Status', field: 'thumbStatus', minWidth: 150, hozAlign: 'center',
          formatter: (cell: any) => this.createStatusChip(cell.getValue())
        },
        {
          title: 'Status', field: 'status', minWidth: 150, hozAlign: 'center',
          formatter: (cell: any) => this.createStatusChip(cell.getValue())
        },

      ]
    });
    this.table.on('columnResized', () => this.refreshHolidayOverlays());
    attachStandardTabulatorPagination(this.table, undefined, this.paginationDiv?.nativeElement);
    const formatPaginationAfterSharedRender = () => setTimeout(() => this.formatAttendancePagination());
    this.table.on('tableBuilt', formatPaginationAfterSharedRender);
    this.table.on('pageLoaded', formatPaginationAfterSharedRender);
    this.table.on('pageSizeChanged', formatPaginationAfterSharedRender);
    this.table.on('tableBuilt', () => {
      this.formatAttendancePagination();
      this.refreshHolidayOverlays();
    });
    this.table.on('pageLoaded', () => {
      this.formatAttendancePagination();
      this.refreshHolidayOverlays();
    });
    this.table.on('pageSizeChanged', () => this.formatAttendancePagination());
    setTimeout(() => this.formatAttendancePagination());
  }

  private formatAttendanceRow(row: any): void {
    const rowElement = row?.getElement?.() as HTMLElement | undefined;
    if (!rowElement) return;

    rowElement.querySelector('.attendance-holiday-name-overlay')?.remove();
    rowElement.classList.remove('attendance-holiday-row');

    const cells = row.getCells?.() || [];
    cells.forEach((cell: any) => {
      const cellElement = cell?.getElement?.() as HTMLElement | undefined;
      cellElement?.classList.remove('attendance-holiday-cell');
      if (cellElement) cellElement.style.visibility = '';
    });

    const record = row.getData?.();
    if (!record?.isHoliday) return;

    const firstMiddleCell = cells.find((cell: any) => cell?.getField?.() === 'thumbTime')?.getElement?.() as HTMLElement | undefined;
    const lastMiddleCell = cells.find((cell: any) => cell?.getField?.() === 'thumbStatus')?.getElement?.() as HTMLElement | undefined;
    if (!firstMiddleCell || !lastMiddleCell) return;

    rowElement.classList.add('attendance-holiday-row');
    const middleFields = new Set(['thumbTime', 'shift', 'inTime', 'outTime', 'workHours', 'extraHours', 'thumbStatus']);
    cells.forEach((cell: any) => {
      if (!middleFields.has(cell?.getField?.())) return;
      const cellElement = cell?.getElement?.() as HTMLElement | undefined;
      if (!cellElement) return;
      cellElement.classList.add('attendance-holiday-cell');
      cellElement.style.visibility = 'hidden';
    });

    const rowBounds = rowElement.getBoundingClientRect();
    const firstBounds = firstMiddleCell.getBoundingClientRect();
    const lastBounds = lastMiddleCell.getBoundingClientRect();
    const holidayLabel = document.createElement('div');
    holidayLabel.className = 'attendance-holiday-name-overlay';
    holidayLabel.setAttribute('aria-label', `Holiday: ${record.leaveName || 'Holiday'}`);
    holidayLabel.textContent = record.leaveName || 'Holiday';
    holidayLabel.style.left = `${firstBounds.left - rowBounds.left}px`;
    holidayLabel.style.width = `${lastBounds.right - firstBounds.left}px`;
    rowElement.appendChild(holidayLabel);
  }

  private refreshHolidayOverlays(): void {
    requestAnimationFrame(() => {
      this.table?.getRows?.().forEach((row: any) => this.formatAttendanceRow(row));
    });
  }

  private formatAttendancePagination(): void {
    const host = this.paginationDiv?.nativeElement;
    if (!host) return;
    const labels: { [page: string]: string } = { first: 'First', prev: 'Previous', next: 'Next', last: 'Last' };
    Object.keys(labels).forEach(page => {
      const button = host.querySelector<HTMLElement>(`.tabulator-page[data-page="${page}"]`);
      if (!button) return;
      button.textContent = labels[page];
      button.setAttribute('aria-label', labels[page]);
      button.setAttribute('title', labels[page]);
    });
    const previousGroup = host.querySelector<HTMLElement>('.tabulator-page[data-page-group="prev"]');
    if (previousGroup) {
      previousGroup.textContent = 'Previous';
      previousGroup.setAttribute('aria-label', 'Show the previous five pages');
      previousGroup.setAttribute('title', 'Show the previous five pages');
    }
    const nextGroup = host.querySelector<HTMLElement>('.tabulator-page[data-page-group="next"]');
    if (nextGroup) {
      nextGroup.textContent = 'Next';
      nextGroup.setAttribute('aria-label', 'Show the next five pages');
      nextGroup.setAttribute('title', 'Show the next five pages');
    }
    host.querySelector<HTMLSelectElement>('.tabulator-page-size')?.setAttribute('aria-label', 'Rows per page');
  }

  private createStatusChip(value: any): HTMLElement {
    const status = `${value || '--'}`;
    const statusTone = attendanceStatusTone(status);
    const chip = document.createElement('span');
    chip.className = `attendance-status-chip attendance-status-chip--${statusTone}`;
    chip.textContent = status;
    return chip;
  }

  private createValueBadge(value: any, tone: AttendanceReportTone | null): HTMLElement | string {
    const label = `${value ?? ''}`.trim();
    if (isMissingAttendanceValue(label)) return '--';
    const badge = document.createElement('span');
    badge.className = `attendance-value-badge${tone ? ` attendance-value-badge--${tone}` : ''}`;
    badge.textContent = label;
    return badge;
  }

  private classifyInTime(value: any): AttendanceReportTone | null {
    return attendanceTimeTone('inTime', value);
  }

  private classifyOutTime(value: any): AttendanceReportTone | null {
    return attendanceTimeTone('outTime', value);
  }

  private classifyWorkHours(value: any): AttendanceReportTone | null {
    return attendanceWorkHoursTone(value);
  }

  private destroyTable(): void {
    const table = this.table;
    this.table = null;
    try {
      table?.destroy?.();
    } catch {
      // The view may already have removed the Tabulator host.
    }
  }

  private buildReport(): AttendanceReport {
    const monthNumber = this.months.indexOf(this.month) + 1;
    const monthStart = `${this.year}-${String(monthNumber).padStart(2, '0')}-01`;
    const monthEnd = `${this.year}-${String(monthNumber).padStart(2, '0')}-${new Date(this.year, monthNumber, 0).getDate()}`;
    return {
      employee: {
        ...this.reportEmployee,
        employee_id: this.getEmployeeId(this.reportEmployee) || this.employeeId,
        employee_name: this.employeeName,
        department_name: this.departmentName
      },
      period: this.formatPeriod(), fromDate: monthStart, toDate: monthEnd, records: this.records, summary: this.summary
    };
  }

  private normalizeRecord(item: any): AttendanceRecord {
    const value = (...keys: string[]) => {
      for (const key of keys) {
        if (item?.[key] !== undefined && item?.[key] !== null && `${item[key]}`.trim() !== '') return `${item[key]}`;
      }
      return '--';
    };
    const rawDate = value('attendanceDate', 'attendance_date', 'date');
    const date = this.formatAttendanceDate(rawDate);
    const responseDay = value('day', 'dayName', 'attendanceDay');
    const day = responseDay === '--' && date !== '--'
      ? new Date(rawDate).toLocaleDateString('en-US', { weekday: 'long' })
      : responseDay;
    const allTimes = value('alltime', 'allTime', 'all_time', 'punchTimes', 'punch_times');
    const punchTimes = this.parsePunchTimes(allTimes);
    const shiftIn = value('shift_in_time');
    const shiftOut = value('shift_out_time');
    const shiftTime = shiftIn !== '--' || shiftOut !== '--'
      ? `${shiftIn} – ${shiftOut}`
      : value('shiftTime', 'shift_time', 'shiftTiming', 'shifttiming', 'shift_timing', 'shift_time_display');
    const thumbDetails = Array.isArray(item?.thumb_details)
      ? item.thumb_details.map((time: any) => `${time ?? ''}`.trim()).filter((time: string) => !!time).join(' · ')
      : value('thumb_details');
    const responseStatus = value('leave_status', 'status', 'attendanceStatus', 'attendance_status', 'status_name');
    const status = (isMissingAttendanceValue(responseStatus) || attendanceStatusTone(responseStatus) === 'default') && this.isSunday(day)
      ? 'Week Off'
      : responseStatus;
    const isHoliday = attendanceStatusTone(responseStatus) === 'holiday';
    const leaveName = value('leave_name', 'leaveName');
    return {
      date,
      day,
      shift: value('shift', 'shiftName', 'shiftname', 'shift_name'),
      shiftTime,
      thumbTime: thumbDetails || '--',
      inTime: this.firstValue(value('in_time', 'checkIn', 'check_in'), punchTimes[0]),
      outTime: this.firstValue(value('out_time', 'checkOut', 'check_out'), punchTimes[1]),
      workHours: value('working_hours', 'workedhoursdash', 'workedHours', 'workHours', 'workingHours', 'worked_hours'),
      extraHours: value('extra_hours', 'extraHours', 'extrahours', 'extrahoursdash', 'overtime'),
      thumbStatus: value('thump_status'),
      status,
      leaveName: leaveName === '--' ? '' : leaveName,
      isHoliday,
      raw: item
    };
  }

  private isSunday(day: string): boolean {
    const normalizedDay = `${day || ''}`.trim().toLowerCase();
    return normalizedDay === 'sun' || normalizedDay === 'sunday';
  }

  private firstValue(primary: string, fallback: string): string {
    return primary !== '--' ? primary : fallback;
  }

  private parsePunchTimes(value: string): [string, string] {
    if (!value || value === '--') return ['--', '--'];
    const parts = value.split(/\s*(?:,|\||;|\s+-\s+)\s*/).map(part => part.trim()).filter(Boolean);
    return parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0] || '--', '--'];
  }

  private formatAttendanceDate(value: string): string {
    const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    const date = isoDate
      ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
      : new Date(value);
    if (!value || value === '--' || Number.isNaN(date.getTime())) return value || '--';
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  private sameDepartment(employee: any): boolean {
    const managerDepartment = `${this.storageService.getDept() || ''}`.trim().toLowerCase();
    if (!managerDepartment) return false;
    const department = `${employee?.department_name ?? employee?.departmentName ?? employee?.department ?? ''}`.trim().toLowerCase();
    return department === managerDepartment;
  }

  private getEmployeeId(employee: any): string | number | null {
    const id = [employee?.employee_id, employee?.employeeid, employee?.employeeId,
    employee?.emp_id, employee?.empId, employee?.empid, employee?.id]
      .find(value => value !== null && value !== undefined && `${value}`.trim() !== '');
    return id === undefined ? null : id;
  }

  private durationInMinutes(value: string): number {
    return attendanceDurationInMinutes(value);
  }

  private formatMinutes(minutes: number): string {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
}
