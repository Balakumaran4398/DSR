import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, finalize, map, Observable, startWith, Subscription } from 'rxjs';
import { AuthService, NotSendDsrDecision, NotSendDsrRequestPayload } from 'src/app/_core/services/auth.service';
import { DrawerAction, DrawerService, DrawerTaskCreateContext } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { DateRangeFilterComponent } from 'src/app/_shared/components/date-range-filter/date-range-filter.component';
import { attachStandardTabulatorPagination } from 'src/app/_core/utils/tabulator-pagination.util';
import { NotSendDsrDialogMode, NotSendDsrDialogResult, NotSendDsrRequestDialogComponent } from './not-send-dsr-request-dialog.component';
declare const Tabulator: any;
declare const luxon: any;
@Component({
  selector: 'app-not-send-dsr',
  templateUrl: './not-send-dsr.component.html',
  styleUrls: ['./not-send-dsr.component.scss']
})
export class NotSendDsrComponent {
  @Input() title = 'Tasks';
  @Input() btnText = "Task"
  @Input() titleDesc = 'Manage your tasks';
  @ViewChild('tableDiv') tableDiv!: ElementRef;
  @ViewChild(DateRangeFilterComponent)
  dateRangeFilter!: DateRangeFilterComponent;
  type: any = "requirement";
  selectedCount = 0;
  showBar = false;
  showMoveMenu = false;
  projectid: any = 0
  private table: any;
  private tableCheckInterval: any;
  private destroyed = false;
  private tableOps: Promise<void> = Promise.resolve();
  private tableBuiltPromise: Promise<void> = Promise.resolve();
  private resolveTableBuilt: (() => void) | null = null;
  tableData: any[] = [];
  selectTask: any
  empid: any = 0;
  canSelectEmployee = false;
  myControl = new FormControl<any>('');
  filteredOptions!: Observable<any[]>;
  startDate: any = null;
  endDate: any = null;
  selected_emp_id: number | null = null;
  notSentDsrLoading = false;
  readonly isAdmin: boolean;
  readonly isManager: boolean;
  readonly isEmployee: boolean;
  private pendingRequestIds = new Set<string>();
  private requestedHighlightId: string | null = null;
  private drawerActionSubscription?: Subscription;

  constructor(private authService: AuthService, private route: ActivatedRoute, private router: Router, private toasterService: ToasterService, private storageService: StorageService, private drawerService: DrawerService, private dialog: MatDialog) {
    this.empid = this.storageService.getEmpId();
    const roles = this.storageService.roles;
    this.isAdmin = !!roles?.isAdmin;
    this.isManager = !!roles?.isManager;
    this.isEmployee = !!roles?.isEmployee;
    this.canSelectEmployee = !!(roles?.isAdmin || roles?.isManager);
    // this.getNotsendTasksOverview();
    this.initializeDatesFromQueryParams();
    this.loadData({ target: { value: this.projectid } })
    this.drawerActionSubscription = this.drawerService.drawerAction$
      .pipe(filter(action => action.source === 'task' && !!action.payload?.not_send_dsr_request_id))
      .subscribe(action => this.handleAppliedTaskCreated(action));

  }

  // State using standard properties instead of Signals
  currentView: string = 'table';

  mainTabs: any[] = [
    {
      id: 'kanban',
      label: '',
      icon: 'ri-install-line',
      description: 'Project deployment history'
    },
    {
      id: 'table',
      label: '',
      icon: 'ri-add-line',
      description: 'Activity and tracking logs'
    }
  ];
  setActiveTab(id: string): void {
    this.currentView = id;
    if (this.currentView === 'table') {
      setTimeout(() => {
        if (this.destroyed) return;
        // this.getNotsendTasksOverview();
        if (this.table) {
          this.enqueueTableOp(() => this.table?.redraw?.(true), this.table);
        }
      }, 0);
    }
  }

  getNotsendTasksOverview() {
    if (this.destroyed) return;
    const selectedEmployeeId = this.selected_emp_id ?? '0';
    const payload = {
      employee_id: this.empid,
      selected_employee_id: selectedEmployeeId,
      fromdate: this.startDate,
      todate: this.endDate
    };

    this.notSentDsrLoading = true;
    this.authService.getNotsendTasks(payload)
      .pipe(finalize(() => {
        this.notSentDsrLoading = false;
      }))
      .subscribe({
        next: (res: any) => {
          const source = Array.isArray(res)
            ? res
            : (res?.data ?? res?.rows ?? (res?.date || res?.employee_name ? [res] : []));
          this.tableData = (Array.isArray(source) ? source : []).map((row: any) => ({
            ...row,
            employee_id: this.resolveEmployeeId(row),
            request_id: row?.request_id ?? row?.requestId ?? null,
            request_status: this.normalizeRequestStatus(row?.request_status ?? row?.status),
            requested_by: row?.requested_by ?? row?.requested_by_id ?? row?.requester_id ?? null,
            requested_by_role: this.normalizeRequesterRole(row?.requested_by_role ?? row?.requester_role)
          }));

          if (this.table) {
            this.safeReplaceData(this.table, this.tableData);
            this.highlightRequestedRow();
          }
        },
        error: (err: any) => {
          this.tableData = [];
          if (this.table) {
            this.safeReplaceData(this.table, this.tableData);
          }
          this.toasterService.error(err?.error?.message || 'Unable to load not sent DSR.');
        }
      });
  }

  ngAfterViewInit() {
    this.tableCheckInterval = setInterval(() => {
      if (this.destroyed) return;
      if (!this.tableDiv?.nativeElement?.isConnected) return;
      if (typeof Tabulator !== 'undefined' && typeof luxon !== 'undefined' && this.tableDiv) {
        clearInterval(this.tableCheckInterval);
        this.tableCheckInterval = null;
        this.initializeTable(this.tableDiv.nativeElement);
        // this.getNotsendTasksOverview();

      }
    }, 50);




    setTimeout(() => {
      if (!this.dateRangeFilter) return;

      this.dateRangeFilter.startDate = new Date(this.startDate);
      this.dateRangeFilter.endDate = new Date(this.endDate);

      this.dateRangeFilter.tempStart = new Date(this.startDate);
      this.dateRangeFilter.tempEnd = new Date(this.endDate);
    }, 0);

  }



  ngOnDestroy(): void {
    this.destroyed = true;
    this.drawerActionSubscription?.unsubscribe();

    if (this.tableCheckInterval) {
      clearInterval(this.tableCheckInterval);
      this.tableCheckInterval = null;
    }

    const tableToDestroy = this.table;
    this.table = null;

    this.resolveTableBuilt?.();
    this.resolveTableBuilt = null;

    this.tableOps = this.tableOps.finally(() => {
      try {
        tableToDestroy?.destroy?.();
      } catch {
        // ignore
      }
    });



  }

  initializeTable(tableDiv?: any) {
    if (this.destroyed) return;

    this.resetTableBuilt();

    if (this.table) {
      const prev = this.table;
      this.table = null;
      this.tableOps = this.tableOps.finally(() => {
        try {
          prev?.destroy?.();
        } catch {
          // ignore
        }
      });
    }
    this.table = new Tabulator(tableDiv, {
      data: this.tableData,
      // fitColumns stretches columns to fill the available width (avoids empty space with few columns)
      layout: "fitColumns",
      pagination: "local",
      paginationSize: 10,
      paginationCounter: "rows",
      movableColumns: true,
      selectable: true,
      editTriggerEvent: "dblclick",
      paginationSizeSelector: [10, 25, 50, 100],
      placeholder: "No Data Found",
      headerSortElement: function (col: any, dir: any) {
        if (dir === "asc") return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === "desc") return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },

      // initialSort: [
      //   { column: "start_date", dir: "desc" },
      // ],

      columns: [
        {
          title: "ID",
          formatter: "rownum",
          width: 150,
          hozAlign: "center",
          headerSort: false
        },
        {
          title: "Date",
          field: "date",
          sorter: "date",
          width: 350,
          formatter: (cell: any) => {
            const value = cell.getValue();
            return value ? new Date(value).toLocaleDateString() : "";
          }
        },
        {
          title: "Employee Name",
          field: "employee_name",
          minWidth: 350,
          widthGrow: 3,
          formatter: (cell: any) => {
            const name = cell.getValue() || "-";

            const initials = name
              ? name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()
              : "--";

            return `
              <div class="flex items-center gap-2">
                <div class="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-600">
                  ${initials}
                </div>
                <span>${name}</span>
              </div>
            `;
          }
        },
        {
          title: "Status",
          field: "request_status",
          minWidth: 170,
          hozAlign: "center",
          formatter: (cell: any) => this.requestStatusFormatter(cell)
        },
        {
          title: "Request / Action",
          field: "request_id",
          minWidth: 260,
          headerSort: false,
          hozAlign: "center",
          formatter: (cell: any) => this.requestActionFormatter(cell),
          cellClick: (event: any, cell: any) => this.handleRequestAction(event, cell)
        }
      ]
    });


    try {
      const tableRef = this.table;
      tableRef?.on?.('tableBuilt', () => {
        if (this.table !== tableRef) return;
        this.resolveTableBuilt?.();
        this.resolveTableBuilt = null;
      });
    } catch {
      this.resolveTableBuilt?.();
      this.resolveTableBuilt = null;
    }

    // Fallback: unblock queued ops even if tableBuilt never fires.
    setTimeout(() => {
      this.resolveTableBuilt?.();
      this.resolveTableBuilt = null;
    }, 1000);
    attachStandardTabulatorPagination(this.table);

    this.table.on("rowSelectionChanged", (data: any[], rows: any[]) => {
      this.selectedCount = rows.length;
      this.showBar = this.selectedCount > 0;
      if (!this.showBar) this.showMoveMenu = false;
    });

    this.table.on('cellEdited', (cell: any) => {
      const rowData = cell.getRow().getData();
      console.log(rowData);

      // this.updateTask(rowData)
    });
  }

  requestStatusFormatter(cell: any): string {
    const row = cell.getRow().getData();
    const status = this.normalizeRequestStatus(row?.request_status);
    const config: Record<string, { label: string; css: string; icon: string }> = {
      NOT_REQUESTED: { label: 'Not requested', css: 'dsr-status--neutral', icon: 'ri-subtract-line' },
      PENDING: { label: 'Pending', css: 'dsr-status--pending', icon: 'ri-time-line' },
      APPROVED: { label: 'Approved', css: 'dsr-status--approved', icon: 'ri-checkbox-circle-line' },
      REJECTED: { label: 'Rejected', css: 'dsr-status--rejected', icon: 'ri-close-circle-line' },
      APPLIED: { label: 'Applied', css: 'dsr-status--applied', icon: 'ri-check-double-line' }
    };
    const item = config[status] || { label: 'Unknown', css: 'dsr-status--neutral', icon: 'ri-question-line' };
    const detail = status === 'REJECTED' ? row?.rejection_reason : row?.request_reason;
    return `<span class="dsr-status ${item.css}" title="${this.escapeHtml(detail || item.label)}"><i class="${item.icon}"></i>${item.label}</span>`;
  }

  requestActionFormatter(cell: any): string {
    const row = cell.getRow().getData();
    const status = this.normalizeRequestStatus(row?.request_status);
    const busy = this.isRowBusy(row);
    const disabled = busy ? 'disabled aria-disabled="true"' : '';
    const loader = busy ? '<i class="ri-loader-4-line dsr-action-spinner"></i>' : '';

    if (status === 'PENDING' && this.canReview(row)) {
      return `<div class="dsr-actions">
        <button type="button" class="dsr-action dsr-action--approve" data-action="approve" ${disabled}>${loader || '<i class="ri-check-line"></i>'} Approve</button>
        <button type="button" class="dsr-action dsr-action--reject" data-action="reject" ${disabled}><i class="ri-close-line"></i> Reject</button>
      </div>`;
    }

    if ((status === 'NOT_REQUESTED' || status === 'REJECTED') && this.canRequest(row)) {
      return `<button type="button" class="dsr-action dsr-action--request" data-action="request" ${disabled}>${loader || '<i class="ri-mail-send-line"></i>'} Request</button>`;
    }

    if (status === 'APPROVED' && this.canApply(row)) {
      return `<button type="button" class="dsr-action dsr-action--apply" data-action="apply" ${disabled}>${loader || '<i class="ri-add-circle-line"></i>'} Apply</button>`;
    }

    if (status === 'PENDING') {
      const requesterRole = this.normalizeRequesterRole(row?.requested_by_role);
      const reviewLabel = this.isOwnRow(row) && this.isOriginalRequester(row)
        ? (requesterRole === 'ROLE_MANAGER' ? 'Awaiting admin review' : 'Awaiting manager review')
        : 'Awaiting review';
      return `<span class="dsr-action-note"><i class="ri-time-line"></i> ${reviewLabel}</span>`;
    }
    if (status === 'APPLIED') return '<span class="dsr-action-note"><i class="ri-check-double-line"></i> Task added</span>';
    return '<span class="dsr-action-note">No action</span>';
  }

  handleRequestAction(event: Event, cell: any): void {
    event.stopPropagation();
    const button = (event.target as HTMLElement)?.closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled) return;
    const row = cell.getRow().getData();
    const action = button.dataset['action'];

    if (action === 'apply') {
      this.openApplyTask(row);
      return;
    }
    if (action === 'request') this.openWorkflowDialog('request', row);
    if (action === 'approve') this.openWorkflowDialog('approve', row);
    if (action === 'reject') this.openWorkflowDialog('reject', row);
  }

  private openWorkflowDialog(mode: NotSendDsrDialogMode, row: any): void {
    if ((mode === 'request' && !this.canRequest(row)) || (mode !== 'request' && !this.canReview(row))) return;

    const ref = this.dialog.open(NotSendDsrRequestDialogComponent, {
      panelClass: 'dsr-request-dialog-panel',
      autoFocus: mode !== 'approve',
      restoreFocus: true,
      disableClose: false,
      data: {
        mode,
        employeeName: row?.employee_name,
        date: row?.date,
        existingReason: row?.request_reason
      }
    });

    ref.afterClosed().subscribe((result?: NotSendDsrDialogResult) => {
      if (!result?.confirmed) return;
      if (mode === 'request') this.submitRequest(row, result.reason || '');
      else this.submitDecision(row, mode === 'approve' ? 'APPROVED' : 'REJECTED', result.reason);
    });
  }

  private submitRequest(row: any, reason: string): void {
    if (!this.canRequest(row)) return;
    const employeeId = this.resolveEmployeeId(row);
    if (!employeeId) {
      this.toasterService.error('Employee ID is missing from the Not Send DSR response.');
      return;
    }
    const payload: NotSendDsrRequestPayload = {
      employee_id: employeeId,
      date: row.date,
      reason: reason.trim()
    };
    this.setRowBusy(row, true);
    this.authService.createNotSendDsrRequest(payload)
      .pipe(finalize(() => this.setRowBusy(row, false)))
      .subscribe({
        next: (res: any) => this.handleWorkflowSuccess(res?.message || 'Request sent for approval.'),
        error: (err: any) => this.toasterService.error(err?.error?.message || 'Unable to send the request.')
      });
  }

  private submitDecision(row: any, decision: NotSendDsrDecision, reason?: string): void {
    if (!this.canReview(row)) return;
    const requestId = Number(row?.request_id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      this.toasterService.error('Request ID is missing from the Not Send DSR response.');
      return;
    }
    const rejectionReason = decision === 'REJECTED' ? `${reason ?? ''}`.trim() : '';
    this.setRowBusy(row, true);
    this.authService.decideNotSendDsrRequest(requestId, {
      status: decision,
      ...(rejectionReason ? { reason: rejectionReason } : {})
    })
      .pipe(finalize(() => this.setRowBusy(row, false)))
      .subscribe({
        next: (res: any) => this.handleWorkflowSuccess(res?.message || `Request ${decision.toLowerCase()}.`),
        error: (err: any) => this.toasterService.error(err?.error?.message || `Unable to mark the request as ${decision.toLowerCase()}.`)
      });
  }

  private openApplyTask(row: any): void {
    if (!this.canApply(row)) return;
    const employeeId = this.resolveEmployeeId(row);
    if (!employeeId || !row?.request_id) {
      this.toasterService.error('The approved request is missing its employee or request ID.');
      return;
    }
    const context: DrawerTaskCreateContext = {
      mode: 'create',
      employee_id: employeeId,
      employee_name: row?.employee_name,
      start_date: row?.date,
      end_date: row?.date,
      locked_fields: ['start_date', 'end_date'],
      not_send_dsr_request_id: row?.request_id
    };
    this.drawerService.open('task', context, 'requirement');
  }

  private handleWorkflowSuccess(message: string): void {
    this.toasterService.success(message);
    this.getNotsendTasksOverview();
    this.authService.refreshNotificationCount();
  }

  private handleAppliedTaskCreated(action: DrawerAction): void {
    this.getNotsendTasksOverview();

    const payload = action.payload ?? {};
    const projectId = payload?.project_id ?? payload?.projectid;
    const approvedDate = `${payload?.date ?? ''}`.trim();
    const taskId = this.resolveCreatedTaskId(payload);

    if (!projectId || !this.isValidWorkflowDate(approvedDate)) {
      this.toasterService.warning('The task was created, but its project or approved DSR date is missing.');
      return;
    }

    if (taskId) {
      this.navigateToGeneratedTask(projectId, taskId, approvedDate, payload?.not_send_dsr_request_id);
      return;
    }

    this.authService.getTasksByProjectIdNdEmployeeId(
      projectId,
      this.empid,
      0,
      payload?.task_type || 'requirement',
      approvedDate,
      approvedDate
    ).subscribe({
      next: (res: any) => {
        const rows = Array.isArray(res) ? res : (res?.data ?? res?.tasks ?? []);
        const matchedTask = this.findGeneratedTask(rows, payload);
        const matchedTaskId = this.resolveCreatedTaskId(matchedTask);
        if (!matchedTaskId) {
          this.toasterService.warning('The task was created, but it could not be highlighted automatically.');
          this.navigateToGeneratedTask(projectId, null, approvedDate, payload?.not_send_dsr_request_id);
          return;
        }
        this.navigateToGeneratedTask(projectId, matchedTaskId, approvedDate, payload?.not_send_dsr_request_id);
      },
      error: () => {
        this.toasterService.warning('The task was created, but it could not be highlighted automatically.');
        this.navigateToGeneratedTask(projectId, null, approvedDate, payload?.not_send_dsr_request_id);
      }
    });
  }

  private resolveCreatedTaskId(payload: any): string | number | null {
    const response = payload?.response;
    const candidates = [
      payload?.task_id,
      payload?.taskid,
      payload?.id,
      response?.task_id,
      response?.taskid,
      response?.id,
      response?.data?.task_id,
      response?.data?.taskid,
      response?.data?.id,
      response?.task?.task_id,
      response?.task?.taskid,
      response?.task?.id,
      response?.result?.task_id,
      response?.result?.taskid,
      response?.result?.id
    ];

    return candidates.find(value => value !== null && value !== undefined && `${value}`.trim() !== '') ?? null;
  }

  private findGeneratedTask(rows: any, payload: any): any | null {
    const list = Array.isArray(rows) ? rows : [];
    const requestId = `${payload?.not_send_dsr_request_id ?? ''}`;
    const exactRequestMatch = requestId
      ? list.find(row => `${row?.not_send_dsr_request_id ?? row?.request_id ?? ''}` === requestId)
      : null;
    if (exactRequestMatch) return exactRequestMatch;

    const matchingRows = list.filter(row => {
      const rowEmployeeId = row?.assigned_to ?? row?.employee_id ?? row?.employeeid;
      const rowDate = row?.start_date ?? row?.date;
      return `${row?.task ?? ''}`.trim() === `${payload?.task ?? ''}`.trim()
        && `${rowEmployeeId ?? ''}` === `${payload?.employee_id ?? ''}`
        && this.formatDateToYMD(rowDate) === `${payload?.date ?? ''}`;
    });

    return matchingRows.sort((first, second) => Number(second?.id ?? 0) - Number(first?.id ?? 0))[0] ?? null;
  }

  private navigateToGeneratedTask(projectId: any, taskId: any, approvedDate: string, requestId: any): void {
    sessionStorage.setItem('activeProjectTab', 'tasks');
    this.router.navigate(['/main/projects/project-content', projectId], {
      queryParams: {
        fromdate: approvedDate,
        todate: approvedDate,
        generatedTaskId: taskId || null,
        notSendDsrDate: approvedDate,
        notSendDsrRequestId: requestId || null
      }
    });
  }

  private isValidWorkflowDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    return !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
  }

  private normalizeRequestStatus(value: unknown): string {
    const rawStatus = `${value ?? ''}`.trim();
    if (!rawStatus) return 'NOT_REQUESTED';
    const status = rawStatus.toUpperCase().replace(/[\s-]+/g, '_');
    if (status === 'ACCEPTED') return 'APPROVED';
    return ['NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED', 'APPLIED'].includes(status) ? status : 'UNKNOWN';
  }

  private normalizeRequesterRole(value: unknown): string | null {
    const role = `${value ?? ''}`.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (role === 'EMPLOYEE' || role === 'ROLE_EMPLOYEE') return 'ROLE_EMPLOYEE';
    if (role === 'MANAGER' || role === 'ROLE_MANAGER') return 'ROLE_MANAGER';
    return null;
  }

  private isOwnRow(row: any): boolean {
    const employeeId = this.resolveEmployeeId(row);
    const loggedInEmployeeId = Number(this.empid);
    return !!employeeId && Number.isFinite(loggedInEmployeeId) && employeeId === loggedInEmployeeId;
  }

  private isOriginalRequester(row: any): boolean {
    const requesterId = this.resolveRequesterId(row);
    const loggedInEmployeeId = Number(this.empid);
    return requesterId !== null
      && Number.isFinite(loggedInEmployeeId)
      && requesterId === loggedInEmployeeId;
  }

  private canRequest(row: any): boolean {
    if (this.isAdmin || (!this.isManager && !this.isEmployee)) return false;
    const status = this.normalizeRequestStatus(row?.request_status);
    if (!this.isOwnRow(row) || !['NOT_REQUESTED', 'REJECTED'].includes(status)) return false;

    // A rejected request can only be resubmitted by its original requester.
    return status === 'NOT_REQUESTED'
      || (this.isOriginalRequester(row)
        && this.hasConsistentRequester(row)
        && this.hasExpectedRequesterRole(row));
  }

  private canReview(row: any): boolean {
    if (this.normalizeRequestStatus(row?.request_status) !== 'PENDING'
      || !this.resolveRequestId(row)
      || !this.hasConsistentRequester(row)
      || this.isOriginalRequester(row)) return false;

    const requesterRole = this.normalizeRequesterRole(row?.requested_by_role);
    if (this.isAdmin) return requesterRole === 'ROLE_MANAGER';
    return this.isManager && requesterRole === 'ROLE_EMPLOYEE';
  }

  private canApply(row: any): boolean {
    return !this.isAdmin
      && (this.isManager || this.isEmployee)
      && this.normalizeRequestStatus(row?.request_status) === 'APPROVED'
      && !!this.resolveRequestId(row)
      && this.isOwnRow(row)
      && this.isOriginalRequester(row)
      && this.hasConsistentRequester(row)
      && this.hasExpectedRequesterRole(row);
  }

  private resolveEmployeeId(row: any): number | null {
    // Normalize only explicit employee-ID fields. A generic row `id` may be a
    // request/record ID and must never be used to establish row ownership.
    const rawValue = row?.employee_id
      ?? row?.employeeid
      ?? row?.employeeId
      ?? row?.emp_id
      ?? row?.empid;

    if (rawValue !== null && rawValue !== undefined && `${rawValue}`.trim() !== '') {
      const value = Number(rawValue);
      return Number.isFinite(value) && value > 0 ? value : null;
    }

    return this.resolveEmployeeIdByUniqueName(row?.employee_name);
  }

  private resolveEmployeeIdByUniqueName(employeeName: unknown): number | null {
    const normalizedName = this.normalizeEmployeeName(employeeName);
    if (!normalizedName || !Array.isArray(this.employeeList)) return null;

    const matchingIds = new Set<number>();
    for (const employee of this.employeeList) {
      if (this.normalizeEmployeeName(employee?.employee_name ?? employee?.name) !== normalizedName) continue;
      const employeeId = this.getEmployeeId(employee);
      if (employeeId && employeeId > 0) matchingIds.add(employeeId);
    }

    return matchingIds.size === 1 ? [...matchingIds][0] : null;
  }

  private normalizeEmployeeName(value: unknown): string {
    return `${value ?? ''}`.trim().replace(/\s+/g, ' ').toLocaleUpperCase();
  }

  private enrichRowsWithEmployeeIds(): void {
    if (!Array.isArray(this.tableData) || !this.tableData.length) return;

    this.tableData = this.tableData.map(row => ({
      ...row,
      employee_id: this.resolveEmployeeId(row)
    }));

    if (this.table) this.safeReplaceData(this.table, this.tableData);
  }

  private resolveRequesterId(row: any): number | null {
    const value = Number(row?.requested_by);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private resolveRequestId(row: any): number | null {
    const value = Number(row?.request_id);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private hasConsistentRequester(row: any): boolean {
    const employeeId = this.resolveEmployeeId(row);
    const requesterId = this.resolveRequesterId(row);
    return employeeId !== null && requesterId !== null && employeeId === requesterId;
  }

  private hasExpectedRequesterRole(row: any): boolean {
    const requesterRole = this.normalizeRequesterRole(row?.requested_by_role);
    if (this.isManager) return requesterRole === 'ROLE_MANAGER';
    return this.isEmployee && requesterRole === 'ROLE_EMPLOYEE';
  }

  private rowActionKey(row: any): string {
    return `${row?.request_id || 'new'}:${this.resolveEmployeeId(row) || row?.employee_name}:${row?.date}`;
  }

  private isRowBusy(row: any): boolean {
    return this.pendingRequestIds.has(this.rowActionKey(row));
  }

  private setRowBusy(row: any, busy: boolean): void {
    const key = this.rowActionKey(row);
    busy ? this.pendingRequestIds.add(key) : this.pendingRequestIds.delete(key);
    try { this.table?.redraw?.(true); } catch { /* no-op */ }
  }

  private escapeHtml(value: unknown): string {
    return `${value ?? ''}`.replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character] || character));
  }


  actionFormatter(cell: any) {
    return `
      <div class="flex items-center justify-center gap-3 w-full h-full">
        <button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit" title="Edit">
          <i class="ri-pencil-line text-lg pointer-events-none"></i>
        </button>
        <button class="text-slate-400 hover:text-red-600 transition-colors btn-delete" title="Delete">
          <i class="ri-delete-bin-line text-lg pointer-events-none"></i>
        </button>
      </div>
    `;
  }

  handleActionClick(e: any, cell: any) {
    e.stopPropagation();
    const target = e.target.closest('button');
    if (!target) return;

    const row = cell.getRow();
    const data = row.getData();
    console.log(data);

    if (target.classList.contains('btn-edit')) {
      this.drawerService.open('task', data, 'requirement')
    } else if (target.classList.contains('btn-delete')) {
      if (confirm(`Are you sure you want to delete task ${data.taskcode}?`)) {
        row.delete();
      }
    }
  }
  descriptionFormatter(cell: any) {
    const value = cell.getValue() || "";

    return `
      <div class="flex items-center h-full">
        <span class="text-m text-slate-500  truncate max-w-full cursor-help" title="${value}">
          ${value || '-'}
        </span>
      </div>
    `;
  }
  priorityFormatter(cell: any) {
    const value = cell.getValue();
    let icon = "ri-subtract-line";
    let color = "text-gray-400";

    if (value === "High") { icon = "ri-arrow-up-double-line"; color = "text-red-500"; }
    else if (value === "Medium") { icon = "ri-arrow-up-s-line"; color = "text-amber-500"; }
    else if (value === "Low") { icon = "ri-arrow-down-s-line"; color = "text-blue-500"; }

    return `<div class="flex items-center gap-1.5 ${color} font-medium"><i class="${icon}"></i> ${value || '-'}</div>`;
  }

  typeFormatter(cell: any) {
    const value = (cell.getValue() || "").toLowerCase();
    if (value.includes("bug")) {
      return `<div class="flex items-center gap-1.5 text-red-600"><i class="ri-bug-line"></i> Bug</div>`;
    } else if (value.includes("req")) {
      return `<div class="flex items-center gap-1.5 text-blue-600"><i class="ri-file-list-line"></i> Req</div>`;
    }
    return value;
  }

  // --- Formatters ---
  statusFormatter(cell: any) {
    const value = cell.getValue(); // This will be true/false
    let classes = "";
    let dotColor = "";
    let label = "";

    if (value === true) {
      classes = "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/20";
      dotColor = "bg-emerald-500";
      label = "Active";
    } else {
      classes = "bg-red-50 text-red-700 border-red-200 ring-red-600/20"; // Changed inactive to red for visibility
      dotColor = "bg-red-500";
      label = "Inactive";
    }

    return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${classes}">
            <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
            ${label}
        </span>
    `;
  }




  onSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value.toLowerCase();

    if (value) {
      // Filter across ALL relevant fields from your data structure
      this.table.setFilter([
        [
          { field: "task", type: "like", value: value },
          { field: "status", type: "like", value: value },
          { field: "priority", type: "like", value: value },
          { title: "Owner", type: "like", value: value }
        ]
      ]);
    } else {
      this.table.clearFilter();
    }
  }

  // --- Actions ---

  cancelSelection() {
    this.table.deselectRow();
  }

  onDelete() {
    const rows = this.table.getSelectedRows();
    if (confirm(`Delete ${rows.length} users?`)) {
      rows.forEach((r: any) => r.delete());

    }
  }

  toggleMoveMenu(event: MouseEvent) {
    event.stopPropagation(); // Prevent window click from closing immediately
    this.showMoveMenu = !this.showMoveMenu;
  }

  moveTo(department: string) {
    const rows = this.table.getSelectedRows();
    rows.forEach((r: any) => r.update({ department: department }));

    this.showMoveMenu = false;
  }
  addMenber() {
    this.drawerService.open('task', "", 'requirement');
  }

  loadData(e: any) {
    // this.getProjects();
    // this.getPhasesByProjectId(e);
    // this.getStatusList();
    this.getEmployees();
  }

  projectList: any[] = [];
  employeeList: any[] = [];
  private ownerLookup: Record<string, string> = {};
  private ownerEditorValues: Array<{ label: string; value: any }> = [];
  private ownerIndexReady = false;
  phaseList: any[] = [];
  statusList: any[] = [];
  getProjects(callback?: Function) {
    this.authService.getAllProjectsByEmployeeId(this.empid).subscribe({
      next: (res: any) => {
        this.projectList = res
        // this.viewOptions = this.commonService.getFieldLabels(this.projectList);
        if (callback) callback();
      }
    });
  }
  getPhasesByProjectId(e: any) {
    console.log(e);
    this.authService.getPhaseByProjectId(e?.target?.value).subscribe({
      next: (res: any) => {
        this.phaseList = res
      }
    });
  }
  getStatusList() {
    this.authService.getStatusList().subscribe({
      next: (res: any) => {
        this.statusList = res;
      }
    });
  }

  getEmployees() {
    // if (!this.canSelectEmployee) {
    //   const currentEmpId = this.storageService.getEmpId();
    //   const currentEmpName = this.storageService.getEmpName();
    //   this.employeeList = currentEmpId
    //     ? [{ id: currentEmpId, employee_name: currentEmpName ?? 'Me' }]
    //     : [];

    //   this.ownerIndexReady = true;
    //   this.rebuildOwnerIndex();
    //   this.refreshOwnerColumn();

    //   this.filteredOptions = of([...this.employeeList]);
    //   return;
    // }

    this.authService.getEmployeeList().subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? res?.employees ?? []);
        this.employeeList = Array.isArray(list) ? list : [];
        this.enrichRowsWithEmployeeIds();
        this.ownerIndexReady = true;
        this.rebuildOwnerIndex();
        this.refreshOwnerColumn();

        this.filteredOptions = this.myControl.valueChanges.pipe(
          startWith(''),
          map((value: any) => {
            const name = typeof value === 'string' ? value : value?.employee_name || '';
            return name ? this._filter(name) : [...this.employeeList];
          })
        );
      },
      error: (err: any) => {
        this.employeeList = [];
        this.ownerIndexReady = true;
        this.rebuildOwnerIndex();
        this.refreshOwnerColumn();
        this.toasterService.error(err?.error?.message ?? 'Unable to load employees');
      }
    });
  }
  private ignoreFirstEmit = true;

  onRangeChange(event: { startDate: Date; endDate: Date }) {
    if (this.ignoreFirstEmit) {
      this.ignoreFirstEmit = false;
      return;
    }
    console.log(event.startDate, event.endDate);
    this.startDate = this.formatDateToYMD(event.startDate);
    this.endDate = this.formatDateToYMD(event.endDate);
    this.getNotsendTasksOverview();
  }


  formatDateToYMD(date: Date | string | null): string {
    if (!date) return 'null';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }
  private _filter(value: string): any[] {
    const filterValue = value.toLowerCase();
    return this.employeeList.filter((emp: any) =>
      emp.employee_name.toLowerCase().includes(filterValue)
    );
  }

  displayFn(employee: any): string {
    return employee && employee.employee_name
      ? employee.employee_name
      : '';
  }
  clearSelection(): void {
    this.myControl.setValue('');
    this.selected_emp_id = null;
    this.getNotsendTasksOverview();
  }
  onEmployeeSelect(employee: any) {
    this.selected_emp_id = this.getEmployeeId(employee);
    this.getNotsendTasksOverview();
  }

  private getEmployeeId(employee: any): number | null {
    if (!employee) return null;
    const raw = employee.employee_id
      ?? employee.employeeid
      ?? employee.employeeId
      ?? employee.emp_id
      ?? employee.empid
      ?? employee.id;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private rebuildOwnerIndex(): void {
    const list = Array.isArray(this.employeeList) ? this.employeeList : [];

    const nextLookup: Record<string, string> = {};
    const nextValues: Array<{ label: string; value: any }> = [];

    for (const emp of list) {
      if (!emp) continue;
      const name = emp.employee_name ?? emp.name ?? '';
      const value = emp.id ?? emp.employee_id ?? emp.employeeid;
      if (value === null || value === undefined) continue;

      const keys = [emp.id, emp.employee_id, emp.employeeid, value];
      for (const k of keys) {
        if (k === null || k === undefined) continue;
        nextLookup[String(k)] = name;
      }

      nextValues.push({ label: name || 'Unknown', value });
    }

    this.ownerLookup = nextLookup;
    this.ownerEditorValues = nextValues;
  }

  private refreshOwnerColumn(): void {
    if (!this.table) return;

    const tableRef = this.table;
    const values = this.ownerEditorValues;

    this.enqueueTableOp(() => {
      const definitionPatch = {
        editorParams: {
          values,
          autocomplete: true,
          listOnEmpty: true,
          clearable: true
        }
      };

      let updated = false;
      try {
        if (typeof tableRef.updateColumnDefinition === 'function') {
          tableRef.updateColumnDefinition('assigned_to', definitionPatch);
          updated = true;
        }
      } catch {
        // ignore
      }

      if (!updated) {
        try {
          const col = tableRef.getColumn?.('assigned_to');
          if (col && typeof col.updateDefinition === 'function') {
            col.updateDefinition(definitionPatch);
          }
        } catch {
          // ignore
        }
      }

      try {
        tableRef.redraw?.(true);
      } catch {
        // ignore
      }
    }, tableRef);
  }

  private resetTableBuilt(): void {
    this.tableBuiltPromise = new Promise<void>((resolve) => {
      this.resolveTableBuilt = resolve;
    });
  }

  private enqueueTableOp(action: () => any, tableRef?: any): void {
    const expectedTable = tableRef ?? this.table;
    const tableBuilt = this.tableBuiltPromise;

    this.tableOps = this.tableOps
      .finally(() => tableBuilt.catch(() => { }))
      .finally(() => {
        if (this.destroyed) return;
        if (!this.tableDiv?.nativeElement?.isConnected) return;
        if (expectedTable && this.table !== expectedTable) return;
        try {
          const result = action();
          return Promise.resolve(result).catch(() => { });
        } catch {
          return;
        }
      });
  }

  private safeReplaceData(table: any, data: any): void {
    if (this.destroyed) return;
    if (!this.tableDiv?.nativeElement?.isConnected) return;

    const normalized = Array.isArray(data) ? data : [];
    const tableRef = table;

    this.enqueueTableOp(() => {
      try {
        if (typeof tableRef?.replaceData === 'function') {
          return tableRef.replaceData(normalized);
        }
      } catch {
        // ignore
      }

      try {
        if (typeof tableRef?.setData === 'function') {
          return tableRef.setData(normalized);
        }
      } catch {
        // ignore
      }
    }, tableRef);
  }
  private initializeDatesFromQueryParams(): void {
    this.route.queryParams.subscribe(params => {
      this.requestedHighlightId = params['requestId'] ? `${params['requestId']}` : null;
      const startDate = params['startDate'] || params['fromdate'];
      const endDate = params['endDate'] || params['todate'];

      if (startDate && endDate) {
        this.startDate = startDate;
        this.endDate = endDate;
      } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        this.startDate = this.formatDateToYMD(yesterday);
        this.endDate = this.formatDateToYMD(yesterday);
      }

      console.log({
        startDate: this.startDate,
        endDate: this.endDate
      });

      this.getNotsendTasksOverview();
    });
  }

  private highlightRequestedRow(): void {
    if (!this.requestedHighlightId || !this.table) return;
    const requestId = this.requestedHighlightId;
    setTimeout(() => {
      try {
        const row = this.table?.getRows?.().find((candidate: any) => `${candidate?.getData?.()?.request_id ?? ''}` === requestId);
        if (!row) return;
        row.getElement?.().classList.add('dsr-request-highlight');
        row.scrollTo?.('center', false);
      } catch {
        // Notification highlighting is best-effort when Tabulator is rebuilding.
      }
    }, 50);
  }
}
