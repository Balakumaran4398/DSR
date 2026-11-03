import { Component, ElementRef, HostListener, OnInit, Optional, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { Employee } from '../projects/project-info/release-manager/release-manager.component';
import { finalize } from 'rxjs';
import { PdfService } from 'src/app/_core/services/pdf.service';
import { ExcelService } from 'src/app/_core/services/excel.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
interface Task {
  id: number;
  subtaskid: number;
  employee_name: string;
  project_title: string;
  version: string;
  date: string;
  start_date: string;
  end_date: string;
  task: string;
  sub_task: string;
  comments: string;
  completion_percentage: number;
  worked_hours: string;
  isdelete: boolean;
  createddate: string;
  updateddate: string;
}

declare const Tabulator: any;
declare const luxon: any;
@Component({
  selector: 'app-task-overview',
  templateUrl: './task-overview.component.html',
  styleUrls: ['./task-overview.component.scss']
})
export class TaskOverviewComponent implements OnInit {
  @ViewChild('taskList') taskList!: ElementRef<HTMLDivElement>;
  @ViewChildren('taskItem') taskItems!: QueryList<ElementRef<HTMLDivElement>>;
  empId: any = 0
  myControl = new FormControl<string | Employee | number>('');
  filteredEmployees: Employee[] = [];
  employeeSearchText = '';
  viewMode: 'card' | 'table' = 'card';

  constructor(private authService: AuthService, private storageService: StorageService, private pdfService: PdfService, private excelService: ExcelService, private route: ActivatedRoute, @Optional() private toasterService?: ToasterService) {
    this.empId = storageService.getEmpId();
    this.getEmployeeList();
  }
  employees: any[] = []
  mobileView = false;
  // Filter States
  searchTerm: string = '';
  filterStartDate: Date | null = null;
  filterEndDate: Date | null = null;
  filteredTasks: any[] = [];

  // Updated Data with JSON structure
  tasks: Task[] = [];
  selectedTask: Task | null = null;
  @ViewChild('taskTableDiv', { static: false }) taskTableDiv!: ElementRef;
  taskTable: any;
  taskData: any[] = [];
  taskLoading = false;
  pdfExporting = false;
  excelExporting = false;
  ngOnInit() {
    // const today = new Date();

    // this.filterStartDate = new Date(today);
    // this.filterStartDate.setDate(today.getDate() - 1);

    // this.filterEndDate = new Date(today);
    // this.filterEndDate.setDate(today.getDate() - 1);

    this.checkViewport();
    window.addEventListener('resize', () => this.checkViewport());

    this.applyNavigationDateRange();
    this.filterTask();

  }


  // // Getter to filter tasks dynamically
  // get filteredTasks(): Task[] {
  //   return this.tasks.filter(task => {
  //     // 1. Text Search Filter (Name)
  //     const matchesName = this.searchTerm
  //       ? task.employee_name.toLowerCase().includes(this.searchTerm.toLowerCase())
  //       : true;

  //     // // 2. Date Range Filter (Using 'date' field)
  //     // let matchesDate = true;
  //     // if (this.filterStartDate && this.filterEndDate) {
  //     //   const taskDate = new Date(task.date);
  //     //   taskDate.setHours(0, 0, 0, 0);

  //     //   const startDate = new Date(this.filterStartDate);
  //     //   startDate.setHours(0, 0, 0, 0);

  //     //   const endDate = new Date(this.filterEndDate);
  //     //   endDate.setHours(0, 0, 0, 0);

  //     //   matchesDate = taskDate.getTime() >= startDate.getTime() && taskDate.getTime() <= endDate.getTime();
  //     // }

  //     return matchesName;
  //   });
  // }

  resetFilters() {
    this.searchTerm = '';
    this.clearSelection();
    this.filterEndDate = null;
    this.filterStartDate = null;
    this.ngOnInit();
  }

  checkViewport() {
    this.mobileView = window.innerWidth < 950;
    // Auto select first task if switching to desktop and nothing is selected
    if (!this.mobileView && !this.selectedTask && this.tasks.length > 0) {
      this.selectedTask = this.tasks[0];
    }
  }

  selectTask(task: Task) {
    this.selectedTask = task;
  }

  deselectTask() {
    this.selectedTask = null;
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    const target = event.target as HTMLElement;

    // Do NOT hijack arrow keys while typing
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

    event.preventDefault();

    const list = this.tasks;
    if (!list.length) return;

    const currentIndex = this.selectedTask
      ? list.findIndex(t => t.id === this.selectedTask!.id)
      : -1;

    let newIndex = currentIndex;

    if (event.key === 'ArrowDown') {
      newIndex = currentIndex < list.length - 1 ? currentIndex + 1 : 0;
    }

    if (event.key === 'ArrowUp') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : list.length - 1;
    }

    if (newIndex !== currentIndex) {
      this.selectTask(list[newIndex]);

      // Ensure visibility after DOM update
      setTimeout(() => this.scrollToSelectedTask());
    }
  }

  filterTask() {
    this.taskLoading = true;
    this.setTaskTableInlineLoading(true, 'Loading tasks...');
    this.authService
      .getDsrOverviewByEmpIdNdFromToDateNdUserId(
        this.selectedEmployee.id,
        this.formatDateToYMD(this.filterStartDate),
        this.formatDateToYMD(this.filterEndDate),
        this.empId
      )
      .pipe(finalize(() => {
        this.taskLoading = false;
        this.setTaskTableInlineLoading(false);
      }))
      .subscribe({
        next: (res: any) => {
          this.tasks = res || [];
          this.taskData = [...this.tasks];
          if (this.taskTable) {
            this.taskTable.setData(this.taskData);
          }
          this.selectedTask = this.tasks.length > 0 ? this.tasks[0] : null;
        },
        error: () => {
          this.tasks = [];
          this.taskData = [];
          if (this.taskTable) {
            this.taskTable.setData(this.taskData);
          }
          this.selectedTask = null;
        }
      });
  }


  scrollToSelectedTask() {
    if (!this.selectedTask || !this.taskItems?.length) return;

    const index = this.tasks.findIndex(
      t => t.id === this.selectedTask?.id
    );

    const itemEl = this.taskItems.get(index);
    const listEl = this.taskList.nativeElement;

    if (!itemEl) return;

    const item = itemEl.nativeElement;

    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;

    const listScrollTop = listEl.scrollTop;
    const listHeight = listEl.clientHeight;
    const listBottom = listScrollTop + listHeight;

    // Scroll only if out of view
    if (itemTop < listScrollTop) {
      listEl.scrollTop = itemTop;
    } else if (itemBottom > listBottom) {
      listEl.scrollTop = itemBottom - listHeight;
    }
    item.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });

  }

  formatDateToYMD(date: Date | string | null): string {
    if (!date) return 'null';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private applyNavigationDateRange(): void {
    const params = this.route.snapshot.queryParamMap;
    const startDate = params.get('fromdate') || params.get('startDate');
    const endDate = params.get('todate') || params.get('endDate');
    const parsedStartDate = this.parseDateLocal(startDate);
    const parsedEndDate = this.parseDateLocal(endDate);

    if (!parsedStartDate || !parsedEndDate) {
      return;
    }

    this.filterStartDate = parsedStartDate;
    this.filterEndDate = parsedEndDate;
  }

  private parseDateLocal(value: string | null): Date | null {
    if (!value) return null;

    const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (ymdMatch) {
      const [, year, month, day] = ymdMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }


  clearSelection(): void {
    this.myControl.setValue('');
    this.selectedEmployee = {};
    this.selectedEmployee = { id: 0 };
    this.filterTask();
  }
  getEmployeeList() {
    this.authService.getEmployeeList().subscribe((res: any) => {
      this.employees = Array.isArray(res) ? res : [];
      this.filteredEmployees = [...this.employees];
    })
  }
  selectedEmployee: any = { id: 0, employee_name: 'All Employee' };
  onEmployeeSelection(emp: any) {
    this.selectedEmployee = emp === 0 ? { id: 0, employee_name: 'All Employee' } : emp;
    this.searchTerm = emp === 0 ? '' : (emp?.employee_name ?? '');
    this.filterTask();
  }

  filterEmployees(event: Event): void {
    this.employeeSearchText = (event.target as HTMLInputElement).value;
    const query = this.employeeSearchText.trim().toLowerCase();
    this.filteredEmployees = query
      ? this.employees.filter((employee: any) => `${employee?.employee_name ?? ''}`.toLowerCase().includes(query))
      : [...this.employees];
  }

  onEmployeeSelectOpened(opened: boolean): void {
    if (!opened) return;
    this.employeeSearchText = '';
    this.filteredEmployees = [...this.employees];
  }

  get hasEmployeeSelection(): boolean {
    const value = this.myControl.value;
    return value !== null && value !== '';
  }
  generateDSRPdf() {
    if (this.pdfExporting || !this.canDownloadPdf) return;

    this.pdfExporting = true;
    this.loadDsrExportRows('pdf', (rows, fromDate, toDate, selectedEmployee) => {
      const employee = selectedEmployee?.id === 0
        ? { ...selectedEmployee, employee_name: 'All Employee' }
        : selectedEmployee;
      try {
        this.pdfService.generatePDF(employee, fromDate, toDate, rows);
      } catch (error) {
        console.error('PDF generation failed', error);
        this.toasterService?.error('Unable to generate the DSR PDF.');
      } finally {
        this.pdfExporting = false;
      }
    });
  }

  generateDSRExcel(): void {
    if (this.excelExporting || !this.canDownloadPdf) return;

    this.excelExporting = true;
    this.loadDsrExportRows('excel', (rows, fromDate, toDate, selectedEmployee) => {
      try {
      const employeeName = selectedEmployee?.id === 0
        ? 'All Employee'
        : selectedEmployee?.employee_name || 'Employee';
      this.excelService.generateDsrCalendarExcel(
        employeeName,
        fromDate,
        toDate,
        rows
      );
      } catch (error) {
        console.error('Excel generation failed', error);
        this.toasterService?.error('Unable to generate the DSR Excel file.');
      } finally {
        this.excelExporting = false;
      }
    });
  }

  private loadDsrExportRows(format: 'pdf' | 'excel', onSuccess: (rows: any[], fromDate: Date, toDate: Date, selectedEmployee: any) => void): void {
    const selectedEmployee = { ...(this.selectedEmployee || {}) };
    const exportFromDate = this.filterStartDate ? new Date(this.filterStartDate) : null;
    const exportToDate = this.filterEndDate ? new Date(this.filterEndDate) : null;
    const employeeId = Number(selectedEmployee?.id);
    const userId = Number(this.empId);
    if (!Number.isFinite(employeeId) || !Number.isFinite(userId) || !exportFromDate || !exportToDate) {
      if (format === 'pdf') this.pdfExporting = false;
      else this.excelExporting = false;
      this.toasterService?.error('Select an employee and date range before exporting.');
      return;
    }

    this.authService.getDsrOverviewListByEmpIdNdFromToDateNdUserId(
      employeeId,
      this.formatDateToYMD(exportFromDate),
      this.formatDateToYMD(exportToDate),
      userId
    ).pipe(finalize(() => {
      if (format === 'pdf') this.pdfExporting = false;
      else this.excelExporting = false;
    })).subscribe({
      next: (response: any) => {
        const source = Array.isArray(response)
          ? response
          : response?.data ?? response?.rows ?? response?.result ?? response?.results ?? response?.list ?? [];
        onSuccess(this.getCalendarReportRows(Array.isArray(source) ? source : [], exportFromDate, exportToDate, selectedEmployee), exportFromDate, exportToDate, selectedEmployee);
      },
      error: (error: any) => {
        console.error('DSR export list request failed', error);
        this.toasterService?.error(error?.error?.message || 'Unable to load DSR report data.');
      }
    });
  }

  private getCalendarReportRows(
    sourceRows: any[] = this.taskData,
    fromDate: Date | null = this.filterStartDate,
    toDate: Date | null = this.filterEndDate,
    selectedEmployee: any = this.selectedEmployee
  ): any[] {
    if (!fromDate || !toDate) return [];

    const grouped = new Map<string, any[]>();
    for (const item of sourceRows) {
      const date = this.parseCalendarDate(item?.date ?? item?.work_date ?? item?.workDate ?? item?.attendance_date ?? item?.holiday_date ?? item?.holidayDate ?? item?.leave_date ?? item?.leaveDate);
      if (!date) continue;

      const dateKey = this.formatDateToYMD(date);
      const rows = grouped.get(dateKey) || [];
      rows.push(item);
      grouped.set(dateKey, rows);
    }

    const rows: any[] = [];
    const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());

    for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateKey = this.formatDateToYMD(date);
      const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
      const dateItems = grouped.get(dateKey) || [];
      const isFutureDate = date > new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

      if (!dateItems.length) {
        const isSunday = date.getDay() === 0;
        const isFutureWorkingDay = isFutureDate && !isSunday;
        rows.push({
          date: this.formatCalendarDate(date),
          day: isSunday ? '' : weekday,
          employee_name: selectedEmployee?.id === 0 ? 'All Employee' : selectedEmployee?.employee_name || '-',
          project_title: isSunday ? 'Sunday' : '', version: '', start_date: '', end_date: '',
          task: isSunday || isFutureWorkingDay ? '' : 'No DSR Entered',
          sub_task: '', worked_hours: '', completion_percentage: '', comments: '',
          statusText: isFutureWorkingDay ? '-' : isSunday ? 'Week Off' : 'Absent',
          isWeekOff: isSunday,
          isSunday,
          isFuture: isFutureWorkingDay,
          isHoliday: false,
          holiday_name: ''
        });
        continue;
      }

      dateItems.forEach(item => {
        const status = `${item?.statusText ?? item?.status_text ?? item?.attendance_status ?? item?.day_status ?? item?.status ?? item?.record_type ?? item?.recordType ?? item?.type ?? ''}`.trim();
        const holidayObjectName = this.getCalendarRecordLabel(item?.holiday, ['name', 'title', 'holiday_name', 'holidayName']);
        const holidayValue = typeof item?.holiday === 'string' ? item.holiday.trim() : holidayObjectName;
        const holidayName = this.getCalendarRecordLabel(item, ['holiday_name', 'holidayName', 'holiday_title', 'holidayTitle', 'festival_name', 'festivalName']) || holidayValue;
        const leaveObjectName = this.getCalendarRecordLabel(item?.leave, ['name', 'title', 'leave_name', 'leaveName', 'leave_type', 'leaveType']);
        const leaveName = this.getCalendarRecordLabel(item, ['leave_name', 'leaveName', 'leave_type', 'leaveType', 'leave_reason', 'leaveReason']) || leaveObjectName;
        const normalizedStatus = status.toLowerCase();
        const workLabel = this.getCalendarRecordLabel(item, ['task', 'sub_task', 'subTask']);
        const isSunday = date.getDay() === 0;
        const explicitlyWeekOff = normalizedStatus.includes('week off') || normalizedStatus.includes('weekoff') || normalizedStatus.includes('weekly off') || normalizedStatus === 'sunday';
        const isWeekOff = explicitlyWeekOff || isSunday;
        const isHoliday = !isWeekOff && (normalizedStatus.includes('holiday') || !!holidayName || /^holiday\b/i.test(workLabel) || item?.is_holiday === true || item?.isHoliday === true);
        const leaveActivity = ['task', 'sub_task', 'subTask'].map(key => `${item?.[key] ?? ''}`.trim()).find(value => /^leave(?:\b|\s|[-:])/i.test(value)) || '';
        const isLeave = !isHoliday && !isWeekOff && (normalizedStatus.includes('leave') || !!leaveName || !!leaveActivity || item?.is_leave === true || item?.isLeave === true);
        const isFutureWorkingDay = isFutureDate && !isHoliday && !isWeekOff && !isLeave;
        const taskValue = this.getCalendarRecordLabel(item, ['task', 'task_name', 'taskName', 'sub_task', 'subTask', 'subtask_name', 'subtaskName']);
        const hasDsr = [taskValue, this.getCalendarRecordLabel(item, ['project_title', 'project_name', 'projectName']), this.getCalendarRecordLabel(item, ['worked_hours', 'workedHours', 'hours'])]
          .some(value => !!value && !/^(?:-|--|null|undefined|working day|no dsr entered|not dsr entered|absent|holiday|week off|weekly off|sunday|0 hours?)$/i.test(value))
          || item?.subtaskid !== null && item?.subtaskid !== undefined
          || item?.sub_task_id !== null && item?.sub_task_id !== undefined;
        const isWorkingDayMarker = normalizedStatus === 'working day' || normalizedStatus === 'workingday' || normalizedStatus === 'working';
        const holidayActivity = this.getCalendarRecordLabel(item, ['sub_task', 'subTask', 'task', 'comments']);
        const inferredHolidayName = holidayName || (isHoliday ? holidayActivity.replace(/^holiday\s*[-:]?\s*/i, '') : '');
        const eventName = isWeekOff
          ? holidayName || 'Week Off'
          : isLeave
          ? leaveName || leaveActivity || status || 'Leave'
          : isHoliday
            ? inferredHolidayName || status || 'Holiday'
            : '';
        const eventLabel = eventName.replace(/^(holiday|leave)\s*[-:]?\s*/i, '').trim();
        const taskLabel = isWeekOff
          ? 'Week Off'
          : isHoliday
          ? `Holiday - ${eventLabel || 'Holiday'}`
          : isLeave
            ? `Leave - ${eventLabel || 'Leave'}`
            : isSunday
              ? 'Week Off'
              : item?.task ?? item?.sub_task ?? item?.subTask ?? '-';
        const statusText = isHoliday
          ? 'Holiday'
          : isWeekOff
            ? 'Week Off'
            : isLeave
              ? 'Leave'
              : normalizedStatus === 'absent' || (isWorkingDayMarker && !hasDsr) || (!status && !hasDsr)
                ? 'Absent'
                : isWorkingDayMarker
                  ? 'Present'
                  : status || 'Present';
        if (isFutureWorkingDay) {
          rows.push({
            ...item,
            date: this.formatCalendarDate(date),
            day: item?.day || item?.day_name || item?.dayName || weekday,
            employee_name: item?.employee_name ?? item?.employeeName ?? item?.emp_name ?? (selectedEmployee?.id === 0 ? 'All Employee' : selectedEmployee?.employee_name || '-'),
            project_title: '', version: '', start_date: '', end_date: '', task: '', sub_task: '',
            worked_hours: '', completion_percentage: '', comments: '', holiday_name: '',
            statusText: '-', isHoliday: false, isWeekOff: false, isSunday: false, isFuture: true
          });
          return;
        }
        rows.push({
          ...item,
          date: this.formatCalendarDate(date),
          day: isSunday ? '' : item?.day || item?.day_name || item?.dayName || weekday,
          employee_name: item?.employee_name ?? item?.employeeName ?? item?.emp_name ?? (selectedEmployee?.id === 0 ? 'All Employee' : selectedEmployee?.employee_name || '-'),
          project_title: item?.project_title ?? item?.project_name ?? item?.projectName ?? '-',
          version: item?.version ?? item?.version_name ?? item?.versionName ?? '-',
          start_date: item?.start_date ?? item?.startDate ?? '-',
          end_date: item?.end_date ?? item?.endDate ?? '-',
          task: taskLabel,
          sub_task: item?.sub_task ?? item?.subTask ?? item?.subtask_name ?? item?.subtaskName ?? '-',
          worked_hours: item?.worked_hours ?? item?.workedHours ?? item?.hours ?? '-',
          completion_percentage: item?.completion_percentage ?? item?.completionPercentage ?? item?.progress ?? '-',
          comments: item?.comments ?? item?.remarks ?? '-',
          holiday_name: inferredHolidayName,
          statusText,
          isHoliday,
          isWeekOff: statusText === 'Week Off',
          isSunday: isSunday && isWeekOff
        });
      });
    }

    return rows;
  }

  private parseCalendarDate(value: any): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const text = `${value ?? ''}`.trim();
    if (!text) return null;

    const ymdMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(text);
    const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(text);
    if (ymdMatch) return new Date(Number(ymdMatch[1]), Number(ymdMatch[2]) - 1, Number(ymdMatch[3]));
    if (dmyMatch) return new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  private formatCalendarDate(date: Date): string {
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  }

  private getCalendarRecordLabel(record: any, keys: string[]): string {
    for (const key of keys) {
      const value = record?.[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }
  private getDateRangeLabel(): string {
    if (!this.filterStartDate || !this.filterEndDate) return '';

    const start = this.filterStartDate;
    const end = this.filterEndDate;

    const sameDay =
      start.getDate() === end.getDate() &&
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear();

    const sameMonthYear =
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear();

    // 1️⃣ Same exact date
    if (sameDay) {
      return start.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    }

    // 2️⃣ Same month & year
    if (sameMonthYear) {
      return `${start.getDate()}–${end.getDate()} ${start.toLocaleString('en-US', {
        month: 'long',
        year: 'numeric'
      })}`;
    }

    const startLabel = start.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const endLabel = end.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    // 3️⃣ Different month / year
    return `${startLabel} – ${endLabel}`;
  }

  get canDownloadPdf(): boolean {
    const hasEmployeeSelection = this.myControl.value === 0 || !!this.myControl.value;

    return (
      hasEmployeeSelection &&
      this.filterStartDate !== null &&
      this.filterEndDate !== null &&
      this.filterStartDate <= this.filterEndDate
    );
  }


  openTableView() {
    this.viewMode = 'table';
    setTimeout(() => {
      if (!this.taskTableDiv) return;

      if (this.taskTable) {
        this.taskTable.destroy();
        this.taskTable = null;
      }

      this.initializeTaskTable();
    }, 0);

  }

  openCardView() {
    this.viewMode = 'card';
    this.setTaskTableInlineLoading(false);
  }
  onSearch(event: any) {
    const value = event.target.value?.toLowerCase().trim();

    if (!this.taskTable) return;

    if (!value) {
      this.taskTable.clearFilter();
      return;
    }

    this.taskTable.setFilter((data: any) => {
      return (
        data.employee_name?.toLowerCase().includes(value) ||
        data.project_title?.toLowerCase().includes(value) ||
        data.version?.toLowerCase().includes(value) ||
        data.start_date?.toLowerCase().includes(value) ||
        data.end_date?.toLowerCase().includes(value) ||
        data.task?.toLowerCase().includes(value) ||
        data.date?.toLowerCase().includes(value) ||
        data.worked_hours?.toString().includes(value) ||
        data.completion_percentage?.toString().includes(value)
      );
    });
  }


  initializeTaskTable() {
    this.taskTable = new Tabulator(this.taskTableDiv.nativeElement, {
      data: this.taskData,
      layout: "fitColumns",
      pagination: "local",
      paginationSize: 10,
      paginationCounter: "rows",
      paginationSizeSelector: [10, 25, 50, 100],
      movableColumns: true,
      placeholder: "<div class='py-10 text-slate-500'>No tasks available</div>",
      columns: [

        {
          title: "Employee",
          field: "employee_name",
          minWidth: 180,
          formatter: (cell: any) =>
            `<span class="font-semibold text-slate-800">
              ${cell.getValue() || '-'}
            </span>`
        },

        {
          title: "Project",
          field: "project_title",
          minWidth: 150,
          formatter: (cell: any) =>
            `<span class="text-slate-600">
              ${cell.getValue() || '-'}
            </span>`
        },

        {
          title: "Version",
          field: "version",
          width: 110,
          formatter: (cell: any) =>
            `<span class="text-slate-600">
              ${cell.getValue() || '-'} </span>`
        },
         {
          title: "Task",
          field: "task",
          minWidth: 220,
          formatter: (cell: any) =>
            `<span class="text-slate-600">
              ${cell.getValue() || '-'}
              ${cell.getValue() || '-'}
            </span>`
        },
 {
          title: "Start Date",
          field: "start_date",
          width: 130,
          formatter: (cell: any) =>
            `<span class="text-slate-500">
              ${cell.getValue() || '-'}
            </span>`
        },

        {
          title: "End Date",
          field: "end_date",
          width: 130,
          formatter: (cell: any) =>
            `<span class="text-slate-500">
              ${cell.getValue() || '-'}
            </span>`
        },
        {
          title: "Date",
          field: "date",
          width: 130,
          formatter: (cell: any) =>
            `<span class="text-slate-500">
              ${cell.getValue() || '-'}
            </span>`
        },

        {
          title: "Hours",
          field: "worked_hours",
          width: 100,
          formatter: (cell: any) =>
            `<span class="text-slate-600">
              ${cell.getValue() || 0} hrs
            </span>`
        },

        {
          title: "Progress",
          field: "completion_percentage",
          formatter: (cell: any) => {
            const value = cell.getValue() || 0;

            return `
              <div class="flex items-center gap-3">
                <div class="w-28 bg-slate-200 rounded-full h-2">
                  <div class="h-2 rounded-full transition-all duration-300"
                       style="width:${value}%; background-color: var(--text-active);">
                  </div>
                </div>
                <span class="text-xs font-semibold text-slate-700">
                  ${value}%
                </span>
              </div>
            `;
          }
        }
      ],
    });
    if (this.taskLoading) {
      this.setTaskTableInlineLoading(true, 'Loading tasks...');
    }
    attachTabulatorPaginationPersistence(this.taskTable, buildTabulatorPaginationKey('task-overview-table'));
  }

  private setTaskTableInlineLoading(loading: boolean, label = 'Loading data...'): void {
    const host = this.taskTableDiv?.nativeElement as HTMLElement | undefined;
    if (!host) return;

    let loader = host.querySelector<HTMLElement>(':scope > .app-table-inline-loader');
    if (!loading) {
      loader?.remove();
      return;
    }

    if (!loader) {
      loader = document.createElement('div');
      loader.className = 'app-table-inline-loader';
      host.appendChild(loader);
    }

    loader.innerHTML = `
      <div class="app-local-loading">
        <i class="ri-loader-4-line app-spin"></i>
        <span>${label}</span>
      </div>
    `;
  }
}
