import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, filter, finalize, map, Observable, of, startWith, Subscription } from 'rxjs';
import { AuthService, NotSendDsrDecision, NotSendDsrRequestPayload } from 'src/app/_core/services/auth.service';
import { DrawerAction, DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { NotificationNavigationService } from 'src/app/_core/services/notification-navigation.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { attachStandardTabulatorPagination } from 'src/app/_core/utils/tabulator-pagination.util';
import { getNotificationRecordDepartmentId } from 'src/app/_core/utils/notification-department.util';
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
  readonly allEmployeesValue = '__all_employees__';
  myControl = new FormControl<any>(this.allEmployeesValue);
  employeeFilterControl = new FormControl('');
  filteredEmployeeOptions: Observable<any[]> = of([]);
  startDate: any = null;
  endDate: any = null;
  selected_emp_id: number | null = null;
  private selectedEmployeeName: string | null = null;
  notSentDsrLoading = false;
  readonly isAdmin: boolean;
  readonly isManager: boolean;
  readonly isEmployee: boolean;
  private pendingRequestIds = new Set<string>();
  private requestedHighlightId: string | null = null;
  private requestedEmployeeId: string | null = null;
  private requestedEmployeeName: string | null = null;
  private requestedDate: string | null = null;
  private lastNotificationFetchKey: string | null = null;
  private navigationInitialized = false;
  private notSentDsrRequest?: Subscription;
  private notSentDsrRequestVersion = 0;
  private activeNotSentDsrRequestKey: string | null = null;
  private loadedNotSentDsrRequestKey: string | null = null;
  datesInitialized = false;
  private drawerActionSubscription?: Subscription;
  private navigationSubscription?: Subscription;

  constructor(private authService: AuthService, private route: ActivatedRoute, private router: Router, private toasterService: ToasterService, private storageService: StorageService, private drawerService: DrawerService, private dialog: MatDialog, private notificationNavigationService: NotificationNavigationService) {
    this.empid = this.storageService.getEmpId();
    const roles = this.storageService.roles;
    this.isAdmin = !!roles?.isAdmin;
    this.isManager = !!roles?.isManager;
    this.isEmployee = !!roles?.isEmployee;
    this.canSelectEmployee = !!(roles?.isAdmin || roles?.isManager);
    this.initializeDepartmentDefaultEmployee();
    // this.getNotsendTasksOverview();
    this.initializeDatesFromQueryParams();
    this.loadData({ target: { value: this.projectid } })
    this.drawerActionSubscription = this.drawerService.drawerAction$
      .pipe(filter(action =>
        (action.source === 'task' || action.source === 'ticket' || action.source === 'dsr')
        && !!action.payload?.not_send_dsr_request_id
      ))
      .subscribe(action => {
        if (action.source === 'ticket') {
          this.getNotsendTasksOverview(true);
          this.authService.refreshNotificationCount();
          return;
        }
        if (action.source === 'dsr') {
          this.handleAppliedDsr(action);
          return;
        }
        this.handleAppliedTaskCreated(action);
      });

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

  getNotsendTasksOverview(
    forceRefresh = false,
    options: { showPageLoading?: boolean; onComplete?: () => void } = {}
  ) {
    if (this.destroyed || !this.startDate || !this.endDate) {
      options.onComplete?.();
      return;
    }
    const selectedEmployeeId = this.selected_emp_id ?? '0';
    const payload = {
      employee_id: this.empid,
      selected_employee_id: selectedEmployeeId,
      fromdate: this.startDate,
      todate: this.endDate
    };
    const requestKey = this.buildNotSentDsrRequestKey(payload);

    if (!forceRefresh && requestKey === this.loadedNotSentDsrRequestKey) {
      this.highlightRequestedRow();
      return;
    }

    if (!forceRefresh && requestKey === this.activeNotSentDsrRequestKey) {
      return;
    }

    const requestVersion = ++this.notSentDsrRequestVersion;
    this.notSentDsrRequest?.unsubscribe();
    this.activeNotSentDsrRequestKey = requestKey;
    const showPageLoading = options.showPageLoading !== false;
    this.notSentDsrLoading = showPageLoading;
    if (showPageLoading) {
      // Never leave a previous employee's rows visible while the new filter is loading.
      this.tableData = [];
      if (this.table) this.safeReplaceData(this.table, this.tableData);
    }
    this.notSentDsrRequest = this.authService.getNotsendTasks(payload, forceRefresh)
      .pipe(finalize(() => {
        if (requestVersion === this.notSentDsrRequestVersion) {
          this.notSentDsrLoading = false;
          this.activeNotSentDsrRequestKey = null;
        }
        options.onComplete?.();
      }))
      .subscribe({
        next: (res: any) => {
          if (requestVersion !== this.notSentDsrRequestVersion) return;

          this.loadedNotSentDsrRequestKey = requestKey;
          const normalizedRows = this.extractNotSentDsrRows(res).map((row: any) => ({
            ...row,
            date: row?.date ?? row?.missing_date ?? row?.missingDate,
            employee_name: row?.employee_name ?? row?.employeeName ?? row?.emp_name ?? row?.empName ?? row?.name,
            employee_id: this.resolveEmployeeId(row),
            project_id: row?.project_id ?? row?.projectid ?? row?.projectId,
            request_id: row?.request_id ?? row?.requestId ?? null,
            request_reason: row?.request_reason || row?.requestReason || row?.reason || this.findExistingRequestReason(row),
            rejection_reason: row?.rejection_reason
              || row?.rejectionReason
              || row?.decision_reason
              || row?.decisionReason
              || row?.reject_reason
              || row?.remarks
              || this.findExistingRejectionReason(row),
            request_status: this.normalizeDsrRequestStatus(row),
            requested_by: row?.requested_by ?? row?.requested_by_id ?? row?.requester_id ?? null,
            requested_by_role: this.normalizeRequesterRole(row?.requested_by_role ?? row?.requester_role)
          }));
          const dateScopedRows = this.requestedDate
            ? normalizedRows.filter((row: any) => this.normalizeNotificationDate(row?.date) === this.requestedDate)
            : normalizedRows.filter((row: any) => {
              const rowDate = this.normalizeNotificationDate(row?.date);
              return !!rowDate && rowDate >= this.startDate && rowDate <= this.endDate;
            });
          if (this.selected_emp_id === null && !this.selectedEmployeeName) {
            this.tableData = dateScopedRows;
          } else if (this.selectedEmployeeName) {
            const normalizedSelectedName = this.normalizeEmployeeName(this.selectedEmployeeName);
            const nameMatches = dateScopedRows.filter((row: any) =>
              this.normalizeEmployeeName(row?.employee_name) === normalizedSelectedName
            );
            const distinctIds = new Set(nameMatches.map((row: any) => this.resolveEmployeeId(row)).filter((id: any) => id !== null));
            if (distinctIds.size > 1) {
              this.tableData = this.selected_emp_id === null
                ? []
                : nameMatches.filter((row: any) => this.resolveEmployeeId(row) === this.selected_emp_id);
            } else {
              this.tableData = nameMatches;
            }
          } else {
            this.tableData = dateScopedRows.filter((row: any) =>
              this.resolveEmployeeId(row) === this.selected_emp_id
            );
          }

          if (this.table) {
            this.safeReplaceData(this.table, this.tableData);
            this.highlightRequestedRow();
          }
        },
        error: (err: any) => {
          if (requestVersion !== this.notSentDsrRequestVersion) return;

          this.activeNotSentDsrRequestKey = null;
          if (this.loadedNotSentDsrRequestKey === requestKey) {
            this.loadedNotSentDsrRequestKey = null;
          }
          if (showPageLoading) {
            this.tableData = [];
            if (this.table) {
              this.safeReplaceData(this.table, this.tableData);
            }
          }
          this.toasterService.error(err?.error?.message || 'Unable to load not sent DSR.');
        }
      });
  }

  private buildNotSentDsrRequestKey(payload: any): string {
    return JSON.stringify([
      payload?.employee_id ?? '',
      payload?.selected_employee_id ?? '0',
      payload?.fromdate ?? '',
      payload?.todate ?? ''
    ]);
  }

  private extractNotSentDsrRows(response: any): any[] {
    if (Array.isArray(response)) return response;
    if (!response || typeof response !== 'object') return [];

    const listKeys = ['data', 'rows', 'results', 'result', 'list', 'records', 'tasks', 'not_send_dsr'];
    for (const key of listKeys) {
      const candidate = response[key];
      if (Array.isArray(candidate)) return candidate;
      if (candidate && typeof candidate === 'object') {
        const nestedRows = this.extractNotSentDsrRows(candidate);
        if (nestedRows.length) return nestedRows;
      }
    }

    return response.date || response.missing_date || response.employee_name || response.employee_id
      ? [response]
      : [];
  }

  private initializeDepartmentDefaultEmployee(): void {
    if (!this.isTicketDepartment()) return;

    const employeeId = Number(this.empid);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return;

    this.selected_emp_id = employeeId;
    this.selectedEmployeeName = this.storageService.getEmpName() || null;
    this.myControl.setValue({
      employee_id: employeeId,
      employee_name: this.selectedEmployeeName
    }, { emitEvent: false });
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




  }



  ngOnDestroy(): void {
    this.destroyed = true;
    this.drawerActionSubscription?.unsubscribe();
    this.navigationSubscription?.unsubscribe();
    this.notSentDsrRequest?.unsubscribe();

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
    this.highlightRequestedRow();

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
    const detail = row?.request_reason || row?.rejection_reason;
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
      return `<div class="dsr-actions">
        <button type="button" class="dsr-action dsr-action--request" data-action="request" ${disabled}>${loader || '<i class="ri-mail-send-line"></i>'} Request</button>
        ${status === 'REJECTED' ? this.reasonActionButton() : ''}
      </div>`;
    }

    if (status === 'APPROVED' && this.canApply(row)) {
      return `<div class="dsr-actions">
        <button type="button" class="dsr-action dsr-action--apply" data-action="apply" ${disabled}>${loader || '<i class="ri-add-circle-line"></i>'} Apply</button>
        ${this.reasonActionButton()}
      </div>`;
    }

    if (status === 'PENDING') {
      const requesterRole = this.normalizeRequesterRole(row?.requested_by_role);
      const reviewLabel = this.isOwnRow(row) && this.isOriginalRequester(row)
        ? (requesterRole === 'ROLE_MANAGER' ? 'Awaiting admin review' : 'Awaiting manager review')
        : 'Awaiting review';
      return `<span class="dsr-action-note"><i class="ri-time-line"></i> ${reviewLabel}</span>`;
    }
    if (status === 'APPLIED') {
      const addedLabel = this.isTicketDepartment() ? 'Ticket Added' : 'DSR Added';
      return `<div class="dsr-actions"><span class="dsr-action-note"><i class="ri-check-double-line"></i> ${addedLabel}</span>${this.reasonActionButton()}</div>`;
    }
    if (status === 'APPROVED' || status === 'REJECTED') return this.reasonActionButton();
    return '<span class="dsr-action-note">No action</span>';
  }

  handleRequestAction(event: Event, cell: any): void {
    event.stopPropagation();
    const button = (event.target as HTMLElement)?.closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled) return;
    const row = cell.getRow().getData();
    const action = button.dataset['action'];

    if (action === 'apply') {
      if (this.isTicketDepartment()) this.openApplySelfTicket(row);
      else this.openApplyTask(row);
      return;
    }
    if (action === 'view-reasons') {
      this.openReasonDialog(row);
      return;
    }
    if (action === 'request') this.openWorkflowDialog('request', row);
    if (action === 'approve') this.openWorkflowDialog('approve', row);
    if (action === 'reject') this.openWorkflowDialog('reject', row);
  }

  private openWorkflowDialog(mode: Exclude<NotSendDsrDialogMode, 'view'>, row: any): void {
    if ((mode === 'request' && !this.canRequest(row)) || (mode !== 'request' && !this.canReview(row))) return;

    const ref = this.dialog.open(NotSendDsrRequestDialogComponent, {
      panelClass: 'dsr-request-dialog-panel',
      width: '38rem',
      maxWidth: 'calc(100vw - 2rem)',
      autoFocus: mode !== 'approve',
      restoreFocus: true,
      disableClose: false,
      data: {
        mode,
        employeeName: row?.employee_name,
        date: row?.date,
        workType: this.getDialogWorkType(),
        existingReason: row?.request_reason
      }
    });

    ref.afterClosed().subscribe((result?: NotSendDsrDialogResult) => {
      if (!result?.confirmed) return;
      if (mode === 'request') this.submitRequest(row, result.reason || '');
      else this.submitDecision(row, mode === 'approve' ? 'APPROVED' : 'REJECTED', result.reason);
    });
  }

  private reasonActionButton(): string {
    return '<button type="button" class="dsr-action dsr-action--reason" data-action="view-reasons" aria-label="View request reasons" title="View reasons"><i class="ri-file-list-3-line"></i> View reasons</button>';
  }

  private openReasonDialog(row: any): void {
    this.dialog.open(NotSendDsrRequestDialogComponent, {
      panelClass: 'dsr-request-dialog-panel',
      width: '38rem',
      maxWidth: 'calc(100vw - 2rem)',
      autoFocus: false,
      restoreFocus: true,
      data: {
        mode: 'view',
        employeeName: row?.employee_name,
        date: row?.date,
        workType: this.getDialogWorkType(),
        requestReason: row?.request_reason ?? '',
        rejectionReason: row?.rejection_reason ?? ''
      }
    });
  }

  private findExistingRequestReason(row: any): string {
    const requestId = this.resolveRequestId(row);
    const existing = this.tableData?.find((candidate: any) => requestId !== null
      && this.resolveRequestId(candidate) === requestId)
      ?? this.tableData?.find((candidate: any) => this.resolveEmployeeId(candidate) === this.resolveEmployeeId(row)
        && this.normalizeNotificationDate(candidate?.date) === this.normalizeNotificationDate(row?.date));
    return existing?.request_reason ?? '';
  }

  private findExistingRejectionReason(row: any): string {
    const requestId = this.resolveRequestId(row);
    const existing = this.tableData?.find((candidate: any) => requestId !== null
      && this.resolveRequestId(candidate) === requestId)
      ?? this.tableData?.find((candidate: any) => this.resolveEmployeeId(candidate) === this.resolveEmployeeId(row)
        && this.normalizeNotificationDate(candidate?.date) === this.normalizeNotificationDate(row?.date));
    return existing?.rejection_reason
      || existing?.rejectionReason
      || existing?.decision_reason
      || existing?.decisionReason
      || existing?.reject_reason
      || existing?.remarks
      || '';
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
      reason: reason.trim(),
      work_type: this.isTicketDepartment() ? 'TICKET' : 'DSR'
    };
    this.setRowBusy(row, true);
    this.authService.createNotSendDsrRequest(payload)
      .subscribe({
        next: (res: any) => this.handleWorkflowSuccess(
          res?.message || 'Request sent for approval.',
          {
            ...row,
            request_reason: reason.trim()
          },
          'PENDING'
        ),
        error: (err: any) => {
          this.setRowBusy(row, false);
          this.toasterService.error(err?.error?.message || 'Unable to send the request.');
        }
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
      .subscribe({
        next: (res: any) => {
          this.handleWorkflowSuccess(
            res?.message || `Request ${decision.toLowerCase()}.`,
            {
              ...row,
              ...(decision === 'REJECTED' && rejectionReason ? { rejection_reason: rejectionReason } : {})
            },
            decision
          );
        },
        error: (err: any) => {
          this.setRowBusy(row, false);
          this.toasterService.error(err?.error?.message || `Unable to mark the request as ${decision.toLowerCase()}.`);
        }
      });
  }

  private openApplyTask(row: any): void {
    if (!this.canApply(row)) return;
    const employeeId = this.resolveEmployeeId(row);
    if (!employeeId || !row?.request_id) {
      this.toasterService.error('The approved request is missing its employee or request ID.');
      return;
    }
    this.drawerService.open('dsr', {
      entryMode: 'dsr-entries',
      employeeId,
      employeeName: row?.employee_name,
      project_id: row?.project_id ?? row?.projectid ?? row?.projectId,
      fixedDsrDate: row?.date,
      notSendDsrRequestId: row?.request_id
    });
  }

  private handleAppliedDsr(action: DrawerAction): void {
    const requestId = this.resolveRequestId(action.payload);
    const row = this.tableData.find(candidate => this.resolveRequestId(candidate) === requestId);
    if (row) this.updateWorkflowRowStatus(row, 'APPLIED');
    this.getNotsendTasksOverview(true, { showPageLoading: false });
    this.authService.refreshNotificationCount();
  }

  private handleWorkflowSuccess(message: string, row?: any, status?: NotSendDsrDecision | 'PENDING'): void {
    this.toasterService.success(message);
    if (row && status) this.updateWorkflowRowStatus(row, status);
    this.getNotsendTasksOverview(true, {
      showPageLoading: false,
      onComplete: row ? () => this.setRowBusy(row, false) : undefined
    });
    this.authService.refreshNotificationCount();
  }

  private updateWorkflowRowStatus(row: any, status: NotSendDsrDecision | 'PENDING' | 'APPLIED'): void {
    const requestId = this.resolveRequestId(row);
    const employeeId = this.resolveEmployeeId(row);
    const date = this.normalizeNotificationDate(row?.date);
    let updated = false;

    this.tableData = this.tableData.map(candidate => {
      const matchesRequest = requestId !== null && this.resolveRequestId(candidate) === requestId;
      const matchesEmployeeDate = employeeId !== null
        && this.resolveEmployeeId(candidate) === employeeId
        && date !== null
        && this.normalizeNotificationDate(candidate?.date) === date;
      if (!matchesRequest && !matchesEmployeeDate) return candidate;

      updated = true;
      return {
        ...candidate,
        request_id: row?.request_id ?? candidate?.request_id,
        request_status: status,
        request_reason: row?.request_reason ?? candidate?.request_reason,
        rejection_reason: row?.rejection_reason ?? candidate?.rejection_reason
      };
    });

    if (updated && this.table) {
      this.safeReplaceData(this.table, this.tableData);
      this.highlightRequestedRow();
    }
  }

  private handleAppliedTaskCreated(action: DrawerAction): void {
    this.getNotsendTasksOverview(true);

    const payload = action.payload ?? {};
    const projectId = payload?.project_id ?? payload?.projectid;
    const approvedDate = `${payload?.date ?? ''}`.trim();
    const taskId = this.resolveCreatedTaskId(payload);

    if (!projectId || !this.isValidWorkflowDate(approvedDate)) {
      this.toasterService.warning('The task was created, but its project or approved DSR date is missing.');
      return;
    }

    if (taskId) {
      this.finishCreatedDsrTask(payload, projectId, taskId, approvedDate);
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
          this.finishCreatedDsrTask(payload, projectId, null, approvedDate);
          return;
        }
        this.finishCreatedDsrTask(payload, projectId, matchedTaskId, approvedDate);
      },
      error: () => {
        this.toasterService.warning('The task was created, but it could not be highlighted automatically.');
        this.finishCreatedDsrTask(payload, projectId, null, approvedDate);
      }
    });
  }

  private finishCreatedDsrTask(payload: any, projectId: any, taskId: string | number | null, approvedDate: string): void {
    const returnContext = payload?.return_to_dsr_context;
    if (returnContext) {
      const selectedTaskId = taskId ?? payload?.task_id ?? payload?.taskid ?? null;
      if (!selectedTaskId) {
        this.toasterService.warning('The task was created, but its ID could not be resolved. Reopen the DSR form and select the task.');
        this.navigateToGeneratedTask(projectId, null, approvedDate, payload?.not_send_dsr_request_id);
        return;
      }

      this.drawerService.open('dsr', {
        ...returnContext,
        dsrDraft: null,
        id: selectedTaskId,
        taskid: selectedTaskId,
        task_id: selectedTaskId,
        selectedEntryId: selectedTaskId,
        generatedTaskId: selectedTaskId,
        project_id: projectId,
        fixedDsrDate: approvedDate,
        task: payload?.task ?? `Task #${selectedTaskId}`
      });
      return;
    }

    this.navigateToGeneratedTask(projectId, taskId, approvedDate, payload?.not_send_dsr_request_id);
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

  private isTicketDepartment(): boolean {
    const user = this.storageService?.getUser?.() || {};
    const rawDepartmentId = user?.department_id
      ?? user?.departmentId
      ?? user?.dept_id
      ?? user?.deptId
      ?? user?.department?.department_id
      ?? user?.department?.departmentId
      ?? user?.department?.dept_id
      ?? user?.department?.id
      ?? (typeof user?.department === 'number' || /^\d+$/.test(String(user?.department ?? '')) ? user.department : null);
    if (rawDepartmentId !== null && rawDepartmentId !== undefined && `${rawDepartmentId}`.trim() !== '') {
      const departmentId = Number(rawDepartmentId);
      if (Number.isFinite(departmentId)) return departmentId === 4 || departmentId === 6;
    }

    const departmentName = String(
      this.storageService?.getDept?.()
        ?? user?.department_name
        ?? user?.departmentName
        ?? user?.department?.department_name
        ?? user?.department?.departmentName
        ?? user?.department?.name
        ?? user?.dept_name
        ?? user?.deptName
        ?? (typeof user?.department === 'string' ? user.department : '')
        ?? ''
    ).toLowerCase().replace(/[^a-z]/g, '').replace(/^(department|dept)/, '').replace(/(department|dept)$/, '');
    return ['hardware', 'headend'].includes(departmentName);
  }

  private getDialogWorkType(): 'DSR' | 'Ticket' | undefined {
    const user = this.storageService?.getUser?.() || {};
    const rawDepartmentId = user?.department_id
      ?? user?.departmentId
      ?? user?.dept_id
      ?? user?.deptId
      ?? user?.department?.department_id
      ?? user?.department?.departmentId
      ?? user?.department?.dept_id
      ?? user?.department?.id
      ?? (typeof user?.department === 'number' || /^\d+$/.test(String(user?.department ?? '')) ? user.department : null);
    if (rawDepartmentId !== null && rawDepartmentId !== undefined && `${rawDepartmentId}`.trim() !== '') {
      const departmentId = Number(rawDepartmentId);
      if ([1, 2, 3, 11].includes(departmentId)) return 'DSR';
      if ([4, 6].includes(departmentId)) return 'Ticket';
      return undefined;
    }

    const departmentName = String(
      this.storageService?.getDept?.()
        ?? user?.department_name
        ?? user?.departmentName
        ?? user?.department?.department_name
        ?? user?.department?.departmentName
        ?? user?.department?.name
        ?? user?.dept_name
        ?? user?.deptName
        ?? (typeof user?.department === 'string' ? user.department : '')
        ?? ''
    ).toLowerCase().replace(/[^a-z]/g, '').replace(/^(department|dept)/, '').replace(/(department|dept)$/, '');
    if (['ridappssoftwaredevelopmentteam', 'sqa', 'accounts', 'account'].includes(departmentName)) return 'DSR';
    if (['hardware', 'headend'].includes(departmentName)) return 'Ticket';
    return undefined;
  }

  private normalizeDsrRequestStatus(row: any): string {
    const requestStatus = row?.request_status
      ?? row?.requestStatus
      ?? row?.request_status_name
      ?? row?.requestStatusName;
    if (requestStatus !== null && requestStatus !== undefined && `${requestStatus}`.trim() !== '') {
      const normalizedStatus = this.normalizeRequestStatus(requestStatus);
      if (normalizedStatus !== 'UNKNOWN' || !this.isTicketDepartment()) {
        return normalizedStatus;
      }
    }

    // Ticket-department rows may use `status` for DSR submission state,
    // rather than for the request workflow. Treat them as requestable until
    // the dedicated workflow status is supplied by the API.
    if (this.isTicketDepartment()) return 'NOT_REQUESTED';
    return this.normalizeRequestStatus(row?.status);
  }

  private openApplySelfTicket(row: any): void {
    if (!this.canApply(row)) return;
    const requestId = this.resolveRequestId(row);
    if (!requestId) {
      this.toasterService.error('The approved request is missing its request ID.');
      return;
    }
    this.drawerService.open('ticket', {
      mode: 'create',
      source: 'not-send-dsr',
      notSentDsrDate: row?.date ?? null,
      assigned_date: row?.date ?? null,
      not_send_dsr_request_id: requestId
    });
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
      ?? row?.employeeID
      ?? row?.emp_id
      ?? row?.empid
      ?? row?.empId
      ?? row?.empID;

    if (rawValue !== null && rawValue !== undefined && `${rawValue}`.trim() !== '') {
      const value = Number(rawValue);
      return Number.isFinite(value) && value > 0 ? value : null;
    }

    return this.resolveEmployeeIdByUniqueName(row?.employee_name ?? row?.employeeName ?? row?.emp_name ?? row?.empName ?? row?.name);
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
    if (busy) {
      this.pendingRequestIds.add(key);
      this.notSentDsrLoading = false;
    } else {
      this.pendingRequestIds.delete(key);
    }
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
  private employeeSelectList: any[] = [];
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

    //   return;
    // }

    this.authService.getEmployeeList().subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? res?.employees ?? []);
        this.employeeList = Array.isArray(list) ? list : [];
        this.employeeSelectList = this.getEmployeeOptionsForCurrentManager(this.employeeList);
        this.enrichRowsWithEmployeeIds();
        this.ownerIndexReady = true;
        this.rebuildOwnerIndex();
        this.refreshOwnerColumn();

        this.initializeEmployeeFilter();
      },
      error: (err: any) => {
        this.employeeList = [];
        this.employeeSelectList = [];
        this.ownerIndexReady = true;
        this.rebuildOwnerIndex();
        this.refreshOwnerColumn();
        this.toasterService.error(err?.error?.message ?? 'Unable to load employees');
      }
    });
  }
  onRangeChange(event: { startDate: Date; endDate: Date }) {
    if (!this.datesInitialized) return;

    const startDate = this.formatDateToYMD(event.startDate);
    const endDate = this.formatDateToYMD(event.endDate);
    if (startDate === this.startDate && endDate === this.endDate) return;

    this.startDate = startDate;
    this.endDate = endDate;
    this.requestedDate = null;
    this.requestedEmployeeId = null;
    this.requestedEmployeeName = null;
    this.requestedHighlightId = null;
    this.getNotsendTasksOverview(true);
  }


  formatDateToYMD(date: Date | string | null): string {
    if (!date) return 'null';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }
  private initializeEmployeeFilter(): void {
    this.filteredEmployeeOptions = this.employeeFilterControl.valueChanges.pipe(
      startWith(this.employeeFilterControl.value || ''),
      map((value: any) => this.filterEmployeeOptions(value))
    );
  }

  private filterEmployeeOptions(value: any): any[] {
    const filterValue = `${typeof value === 'string' ? value : ''}`.trim().toLowerCase();
    const employees = Array.isArray(this.employeeSelectList) ? this.employeeSelectList : [];

    return filterValue
      ? employees.filter((employee: any) =>
        `${employee?.employee_name ?? employee?.employeeName ?? employee?.name ?? ''}`.toLowerCase().includes(filterValue) ||
        `${employee?.email ?? ''}`.toLowerCase().includes(filterValue)
      )
      : [...employees];
  }

  onEmployeeSelectOpened(isOpen: boolean): void {
    if (isOpen) this.employeeFilterControl.setValue('', { emitEvent: true });
  }

  get selectedEmployeeLabel(): string {
    if (this.selected_emp_id === null || this.selected_emp_id === undefined) return 'All Employees';
    if (this.selectedEmployeeName) return this.selectedEmployeeName;
    const selected = this.employeeSelectList.find((employee: any) => this.getEmployeeId(employee) === this.selected_emp_id);
    return selected?.employee_name ?? selected?.employeeName ?? selected?.name ?? 'Selected Employee';
  }

  get hasEmployeeSelection(): boolean {
    return this.selected_emp_id !== null && this.selected_emp_id !== undefined;
  }

  compareEmployeeById = (first: any, second: any): boolean => {
    if (first === this.allEmployeesValue || second === this.allEmployeesValue) return first === second;
    const firstId = this.getEmployeeId(first);
    const secondId = this.getEmployeeId(second);
    if (firstId === null || secondId === null) return first === second;
    if (firstId !== secondId) return false;

    const firstName = this.normalizeEmployeeName(first?.employee_name ?? first?.employeeName ?? first?.name);
    const secondName = this.normalizeEmployeeName(second?.employee_name ?? second?.employeeName ?? second?.name);
    return !firstName || !secondName || firstName === secondName;
  };

  clearSelection(): void {
    this.myControl.setValue(this.allEmployeesValue);
    this.selected_emp_id = null;
    this.selectedEmployeeName = null;
    this.employeeFilterControl.setValue('', { emitEvent: true });
    this.getNotsendTasksOverview(true);
  }
  onEmployeeSelect(employee: any) {
    if (!employee || employee === this.allEmployeesValue) {
      this.selected_emp_id = null;
      this.selectedEmployeeName = null;
      this.myControl.setValue(this.allEmployeesValue, { emitEvent: false });
    } else {
      this.selected_emp_id = this.getEmployeeId(employee);
      this.selectedEmployeeName = `${employee?.employee_name ?? employee?.employeeName ?? employee?.name ?? ''}`.trim() || null;
      this.myControl.setValue(employee, { emitEvent: false });
    }
    this.getNotsendTasksOverview(true);
  }

  private getEmployeeOptionsForCurrentManager(employees: any[]): any[] {
    if (!this.isManager) return employees;
    const departmentId = getNotificationRecordDepartmentId(this.storageService.getUser(), employees)
      ?? Number(this.storageService.getDept());
    if (departmentId !== 8 && departmentId !== 11) return employees;
    return employees.filter(employee => getNotificationRecordDepartmentId(employee, employees) === departmentId);
  }

  private getEmployeeId(employee: any): number | null {
    if (!employee) return null;
    const raw = employee.employee_id
      ?? employee.employeeid
      ?? employee.employeeId
      ?? employee.employeeID
      ?? employee.empId
      ?? employee.empID
      ?? employee.emp_id
      ?? employee.empid
      ?? employee.user_id
      ?? employee.userId
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
    this.navigationSubscription = combineLatest([
      this.route.paramMap,
      this.route.queryParamMap,
      this.notificationNavigationService.context$
    ]).subscribe(([routeParams, queryParams]) => {
      const context = this.notificationNavigationService.consumePendingNavigationContext(
        'not-send-dsr'
      );
      if (this.navigationInitialized && !context) return;

      // Request IDs are placed in the URL for compatibility, but are only
      // meaningful together with the one-time notification navigation context.
      this.requestedHighlightId = context ? queryParams.get('requestId') : null;
      this.navigationInitialized = true;
      this.requestedEmployeeId = context?.targetId || null;
      this.requestedEmployeeName = context?.targetLabel || null;
      this.requestedDate = this.normalizeNotificationDate(context?.targetDate);

      const targetEmployeeId = context?.targetId || null;
      if (context) {
        this.currentView = 'table';
        this.selected_emp_id = null;
        this.selectedEmployeeName = null;
        this.myControl.setValue(this.allEmployeesValue);
        this.ensureNotificationTable();
      }

      const targetDate = this.normalizeNotificationDate(context?.targetDate);
      const isNotificationTarget = !!context && !!(targetEmployeeId || this.requestedHighlightId || targetDate);
      const queryStartDate = queryParams.get('startDate') || queryParams.get('fromdate');
      const queryEndDate = queryParams.get('endDate') || queryParams.get('todate');
      const isLegacyNotificationUrl = !context && !!queryParams.get('requestId');
      const explicitQueryStartDate = isLegacyNotificationUrl ? null : queryStartDate;
      const explicitQueryEndDate = isLegacyNotificationUrl ? null : queryEndDate;
      const startDate = targetDate
        || (isNotificationTarget ? context?.startDate : explicitQueryStartDate || context?.startDate)
        || explicitQueryStartDate;
      const endDate = targetDate
        || (isNotificationTarget ? context?.endDate : explicitQueryEndDate || context?.endDate)
        || explicitQueryEndDate;
      if (startDate && endDate) {
        this.startDate = startDate;
        this.endDate = endDate;
      } else {
        const week = this.getCurrentWeekRange();
        this.startDate = week.startDate;
        this.endDate = week.endDate;
      }

      this.datesInitialized = true;
      const notificationFetchKey = isNotificationTarget
        ? `${context.createdAt}|${this.requestedHighlightId ?? ''}|${targetEmployeeId ?? ''}|${targetDate ?? ''}`
        : null;
      const forceNotificationRefresh = !!notificationFetchKey
        && notificationFetchKey !== this.lastNotificationFetchKey;
      if (notificationFetchKey) this.lastNotificationFetchKey = notificationFetchKey;
      this.getNotsendTasksOverview(forceNotificationRefresh || !isNotificationTarget);
    });
  }

  private getCurrentWeekRange(): { startDate: string; endDate: string } {
    const today = new Date();
    const daysFromMonday = today.getDay() === 0 ? -6 : 1 - today.getDay();
    const start = new Date(today);
    start.setDate(today.getDate() + daysFromMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(0, 0, 0, 0);
    return {
      startDate: this.formatDateToYMD(start),
      endDate: this.formatDateToYMD(end)
    };
  }

  private ensureNotificationTable(): void {
    setTimeout(() => {
      if (this.destroyed || this.table || !this.tableDiv?.nativeElement?.isConnected) return;
      if (typeof Tabulator === 'undefined' || typeof luxon === 'undefined') return;
      this.initializeTable(this.tableDiv.nativeElement);
      this.highlightRequestedRow();
    }, 0);
  }

  private highlightRequestedRow(): void {
    const hasEmployeeTarget = !!(this.requestedEmployeeId || this.requestedEmployeeName);
    if ((!this.requestedHighlightId && (!hasEmployeeTarget || !this.requestedDate)) || !this.table) return;
    const tableRef = this.table;
    this.enqueueTableOp(() => {
      const rows = tableRef?.getRows?.() || [];
      rows.forEach((candidate: any) => candidate?.getElement?.().classList.remove('dsr-request-highlight'));

      const targetEmployee = `${this.requestedEmployeeId ?? ''}`.trim();
      const normalizedTargetName = this.normalizeEmployeeName(this.requestedEmployeeName);
      const datedRows = rows.filter((candidate: any) => {
        const data = candidate?.getData?.();
        const dateMatches = this.normalizeNotificationDate(data?.date ?? data?.missing_date ?? data?.missingDate)
          === this.normalizeNotificationDate(this.requestedDate);
        return this.requestedHighlightId
          ? `${data?.request_id ?? ''}` === this.requestedHighlightId
          : dateMatches;
      });

      let row: any;
      if (this.requestedHighlightId) {
        row = datedRows[0];
      } else if (normalizedTargetName) {
        const nameMatches = datedRows.filter((candidate: any) => {
          const data = candidate?.getData?.();
          return this.normalizeEmployeeName(
            data?.employee_name ?? data?.employeeName ?? data?.emp_name ?? data?.empName ?? data?.name
          ) === normalizedTargetName;
        });

        if (nameMatches.length === 1) {
          row = nameMatches[0];
        } else if (nameMatches.length > 1 && targetEmployee) {
          const idMatches = nameMatches.filter((candidate: any) =>
            `${this.resolveEmployeeId(candidate?.getData?.()) ?? ''}` === targetEmployee
          );
          if (idMatches.length === 1) row = idMatches[0];
        } else if (nameMatches.length === 0 && targetEmployee) {
          const idMatches = datedRows.filter((candidate: any) =>
            `${this.resolveEmployeeId(candidate?.getData?.()) ?? ''}` === targetEmployee
          );
          if (idMatches.length === 1) row = idMatches[0];
        }
      } else if (targetEmployee) {
        const idMatches = datedRows.filter((candidate: any) =>
          `${this.resolveEmployeeId(candidate?.getData?.()) ?? ''}` === targetEmployee
        );
        if (idMatches.length === 1) row = idMatches[0];
      }
      if (!row) return;

      const revealRow = typeof tableRef?.setPageToRow === 'function'
        ? Promise.resolve(tableRef.setPageToRow(row)).catch(() => undefined)
        : Promise.resolve();
      return revealRow.finally(() => {
        const element = row.getElement?.();
        row.select?.();
        element?.classList.add('dsr-request-highlight');
        row.scrollTo?.('center', false);
        element?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      });
    }, tableRef);
  }

  private normalizeNotificationDate(value: unknown): string | null {
    if (!value) return null;
    const raw = String(value).trim();
    const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (direct) return direct;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
