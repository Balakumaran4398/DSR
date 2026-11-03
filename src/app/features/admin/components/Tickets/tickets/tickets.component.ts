import { AfterViewInit, Component, ElementRef, HostListener, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { Subject, Subscription, takeLast, takeUntil } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { PdfService } from 'src/app/_core/services/pdf.service';
import { ExcelService, TableWorkbookExcelSection } from 'src/app/_core/services/excel.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { NotificationNavigationService } from 'src/app/_core/services/notification-navigation.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import { DateRangeChange } from 'src/app/_shared/components/date-range-filter/date-range-filter.component';
import { ActivatedRoute } from '@angular/router';
import Swal from 'sweetalert2';
declare const Tabulator: any;
@Component({
  selector: 'app-tickets',
  templateUrl: './tickets.component.html',
  styleUrls: ['./tickets.component.scss']
})
export class TicketsComponent implements AfterViewInit, OnChanges {

  @ViewChild('tableDiv') tableDiv!: ElementRef;
  @Input() isRaisedTickets = false;
  @Input() notificationTicketId: string | null = null;

  private table: any;
  private destroy$ = new Subject<void>();
  private ticketRequest?: Subscription;
  private ticketRequestVersion = 0;
  private activeTicketRangeKey = '';
  private hasRenderedTickets = false;
  private notificationTicketOpened = false;
  private notificationTicketTimer?: ReturnType<typeof setTimeout>;
  private tableCompactMode = false;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  canSelectDepartment = false;
  private tableRenderTimer?: ReturnType<typeof setTimeout>;
  canSelectEmployee = false;
  searchTerm: any = '';
  selectedStatus = '';
  selectedEmployeeId: any = '';
  selectedDepartmentId: any = '';
  employeeSearchTerm = '';
  departmentSearchTerm = '';
  tickets: any[] = [];
  allTickets: any[] = [];
  employees: any[] = [];
  filteredEmployees: any[] = [];
  departments: any[] = [];
  filteredDepartments: any[] = [];
  private apiEmployees: any[] = [];
  private ticketEmployees: any[] = [];
  private apiDepartments: any[] = [];
  private ticketDepartments: any[] = [];
  selectedCount = 0;
  showBar = false;
  showMoveMenu = false;
  role: any = '';
  empId: any = '';
  userId: any = '';
  initialStartDate: string | null = null;
  initialEndDate: string | null = null;
  startDate: string = '';
  endDate: string = '';
  private ticketRangePreset: string | null = null;
  statusList: any[] = [];
  statusEditorValues: Array<{ label: string; value: string }> = [];

  hasViewedPdf = false;
  ticketPdfExporting = false;
  ticketExcelExporting = false;

  isHardware: boolean = false;
  categories: any[] = [
    { id: 1, type: 'Production' },
    { id: 2, type: 'Service' },
    { id: 3, type: 'Ordinary' }
  ];
  private readonly statusBadgeStyles: Record<number, { text: string; cls: string }> = {
    0: { text: "Open", cls: "ticket-status--open" },
    1: { text: "In-Progress", cls: "ticket-status--progress" },
    2: { text: "To-be-Tested", cls: "ticket-status--testing" },
    3: { text: "Delayed", cls: "ticket-status--delayed" },
    4: { text: "Closed", cls: "ticket-status--closed" },
    5: { text: "Cancelled", cls: "ticket-status--danger" },
    6: { text: "Approved", cls: "ticket-status--success" },
    7: { text: "Completed", cls: "ticket-status--success" },
    8: { text: "Rejected", cls: "ticket-status--danger" },
    9: { text: "Failed", cls: "ticket-status--danger" },
    10: { text: "Passed", cls: "ticket-status--success" },
    11: { text: "Re-Open", cls: "ticket-status--reopen" },
  };

  constructor(
    private drawerService: DrawerService,
    private authService: AuthService,
    private toasterService: ToasterService,
    private storageService: StorageService,
    private pdfService: PdfService,
    private excelService: ExcelService,
    private router: ActivatedRoute,
    private notificationNavigationService: NotificationNavigationService = new NotificationNavigationService()
  ) {
    const roles = this.storageService.roles;
    this.isHardware = this.storageService.getDept() === 'Hardware';
    this.canSelectEmployee = !(roles?.isEmployee);
    this.canSelectDepartment = !!roles?.isAdmin;
  }

  ngOnInit() {
    this.role = this.storageService.getRoleNames()[0];
    this.userId = this.storageService.getUserId();
    this.empId = this.storageService.getEmpId();

    const notificationContext = this.notificationNavigationService.resolve('ticket', this.notificationTicketId);
    const notificationRange = notificationContext?.startDate && notificationContext?.endDate
      ? { startDate: notificationContext.startDate, endDate: notificationContext.endDate }
      : this.getNotificationDateRangeFromParams(this.router.snapshot.queryParams);
    if (notificationRange) {
      this.applyNotificationDateRange(notificationRange.startDate, notificationRange.endDate);
    } else {
      this.setDefaultDateRange();
    }

    this.listenForDrawerActions();
    this.getStatus();
    if (this.isRaisedTickets) {
      this.getEmployees();
    } else {
      this.getDepartments();
    }

    this.getAllTickets();

    this.router.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['from'] === 'notification') {
        const range = this.getNotificationDateRangeFromParams(params);
        if (range) {
          this.loadNotificationTickets(range.startDate, range.endDate);
        }
      }
    });
  }

  ngAfterViewInit(): void {
    this.renderTicketsToTable();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const ticketChange = changes['notificationTicketId'];
    if (!ticketChange || ticketChange.firstChange) return;

    this.notificationTicketOpened = false;
    const context = this.notificationNavigationService.resolve('ticket', this.notificationTicketId);
    if (context?.startDate && context?.endDate) {
      this.applyNotificationDateRange(context.startDate, context.endDate);
    }

    if (this.empId && this.userId) {
      this.getAllTickets();
    } else {
      this.scheduleNotificationTicketOpen();
    }
  }

  private setDefaultDateRange(): void {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startDate = new Date(today);
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    startDate.setDate(diff);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    this.startDate = this.formatDateToYMD(startDate);
    this.endDate = this.formatDateToYMD(endDate);
    this.initialStartDate = this.startDate;
    this.initialEndDate = this.endDate;
  }

  ngOnDestroy() {
    this.ticketRequest?.unsubscribe();
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }
    if (this.tableRenderTimer) {
      clearTimeout(this.tableRenderTimer);
    }
    if (this.notificationTicketTimer) {
      clearTimeout(this.notificationTicketTimer);
    }
    if (this.table) {
      this.table.destroy();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private listenForDrawerActions(): void {
    this.drawerService.drawerAction$
      .pipe(
        takeUntil(this.destroy$)
      )
      .subscribe((action: any) => {
        if (action?.source === 'ticket' && (action.action === 'created' || action.action === 'updated')) {
          setTimeout(() => {
            this.getAllTickets();
          }, 500);
        }
      });
  }

  getAllTickets() {
    const requestVersion = ++this.ticketRequestVersion;
    this.activeTicketRangeKey = this.buildTicketRangeKey(this.startDate, this.endDate);
    this.ticketRequest?.unsubscribe();

    this.ticketRequest = this.authService.getAllTickets(this.empId, this.userId, this.startDate, this.endDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any[]) => {
          if (requestVersion !== this.ticketRequestVersion) return;

          this.applyTicketResponse(res);
        },
        error: (err: any) => {
          if (requestVersion !== this.ticketRequestVersion) return;

          this.toasterService.error('Failed to load tickets');
          console.error('Error loading tickets:', err);
        },
        complete: () => {
          if (requestVersion === this.ticketRequestVersion) {
            this.ticketRequest = undefined;
          }
        }
      });
  }

  private loadNotificationTickets(startDate: string, endDate: string): void {
    const nextRangeKey = this.buildTicketRangeKey(startDate, endDate);
    if (this.activeTicketRangeKey === nextRangeKey && (this.ticketRequest || this.hasRenderedTickets)) {
      return;
    }

    this.applyNotificationDateRange(startDate, endDate);
    this.getAllTickets();
  }

  private applyNotificationDateRange(startDate: string, endDate: string): void {
    this.ticketRangePreset = null;
    this.startDate = startDate;
    this.endDate = endDate;
    this.initialStartDate = startDate;
    this.initialEndDate = endDate;
  }

  private getNotificationDateRangeFromParams(params: Record<string, any>): { startDate: string; endDate: string } | null {
    const fromNotification = params?.['from'] === 'notification';
    const startDate = params?.['startDate'] || params?.['fromdate'] || (fromNotification ? sessionStorage.getItem('notificationStartDate') : null);
    const endDate = params?.['endDate'] || params?.['todate'] || (fromNotification ? sessionStorage.getItem('notificationEndDate') : null);

    if (!this.isValidDateRangeValue(startDate) || !this.isValidDateRangeValue(endDate)) {
      return null;
    }

    return { startDate, endDate };
  }

  private isValidDateRangeValue(value: any): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.getTime());
  }

  private applyTicketResponse(response: any): void {
    const processedData = this.normalizeTicketRows(response);

    this.allTickets = this.isRaisedTickets
      ? processedData.filter(ticket => !this.isClosedTicketStatus(ticket?.status))
      : processedData;

    this.rebuildTicketFilterOptions();
    this.applyFilters(false);
    this.renderTicketsToTable();
    this.hasRenderedTickets = true;
    this.scheduleNotificationTicketOpen();
  }

  private normalizeTicketRows(response: any): any[] {
    const source = this.extractTicketRows(response);

    return (Array.isArray(source) ? source : [])
      .map(ticket => this.unwrapTicketRow(ticket))
      .map(ticket => this.normalizeTicketRow(ticket));
  }

  private unwrapTicketRow(ticket: any, depth = 0): any {
    if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket) || depth > 4) {
      return ticket;
    }

    const nestedKeys = [
      'ticket',
      'ticketData',
      'ticket_data',
      'details',
      'data',
      'result',
      'record',
      'row',
      'item',
      'entry',
      'value'
    ];

    for (const key of nestedKeys) {
      const nested = ticket?.[key];

      if (!nested || nested === ticket) {
        continue;
      }

      if (Array.isArray(nested)) {
        if (nested.length === 1) {
          return this.unwrapTicketRow(nested[0], depth + 1);
        }

        continue;
      }

      if (typeof nested === 'object' && this.looksLikeTicketRow(nested)) {
        return this.unwrapTicketRow(nested, depth + 1);
      }
    }

    return ticket;
  }

  private normalizeTicketRow(ticket: any): any {
    if (!ticket || typeof ticket !== 'object') {
      return {
        ticket_name: this.getDisplayValue(ticket)
      };
    }

    const rawStatus = this.firstPresent(
      ticket?.status_name,
      ticket?.statusName,
      ticket?.overall_ticket_status,
      ticket?.status,
      ticket?.status_id,
      ticket?.statusId,
      ticket?.ticket_status,
      ticket?.ticketStatus
    );

    return {
      ...ticket,
      code: this.firstPresent(ticket?.code, ticket?.ticket_code, ticket?.ticketCode, ticket?.ticket_id, ticket?.ticketId, ticket?.ticketid, ticket?.id) || '-',
      ticket_name: this.firstPresentDisplay(ticket?.ticket_name, ticket?.ticketName, ticket?.ticket_title, ticket?.ticketTitle, ticket?.ticket, ticket?.title, ticket?.subject, ticket?.name) || '-',
      company_name: this.firstPresentDisplay(ticket?.company_name, ticket?.companyName, ticket?.client_name, ticket?.clientName, ticket?.client, ticket?.customer_name, ticket?.customerName, ticket?.customer, ticket?.organization) || '-',
      product_name: this.firstPresentDisplay(ticket?.product_name, ticket?.productName, ticket?.product, ticket?.project_name, ticket?.projectName, ticket?.project_title, ticket?.projectTitle, ticket?.overall_ticket_project) || '-',
      type: this.firstPresentDisplay(ticket?.type, ticket?.ticket_type, ticket?.ticketType, ticket?.product_type, ticket?.productType) || '-',
      assigned_from_name: this.getAssignmentDisplayName(
        [ticket?.assigned_from_name, ticket?.assignedFromName, ticket?.assign_from_name, ticket?.assignFromName, ticket?.assignee_from_name, ticket?.assigneeFromName, ticket?.assigned_by_name, ticket?.assignedByName, ticket?.created_by_name, ticket?.createdByName, ticket?.raised_by_name, ticket?.raisedByName],
        this.firstPresent(ticket?.assigned_from, ticket?.assignedFrom, ticket?.assigned_from_id, ticket?.assignedFromId, ticket?.assign_from, ticket?.assignFrom, ticket?.assignee_from_id, ticket?.assigneeFromId)
      ),
      assigned_to_name: this.getAssignmentDisplayName(
        [ticket?.assigned_to_name, ticket?.assignedToName, ticket?.assign_to_name, ticket?.assignToName, ticket?.employee_name, ticket?.employeeName, ticket?.emp_name, ticket?.empName, ticket?.owner_name, ticket?.ownerName, ticket?.assignee_name, ticket?.assigneeName],
        this.firstPresent(ticket?.assigned_to, ticket?.assignedTo, ticket?.assigned_to_id, ticket?.assignedToId, ticket?.assign_to, ticket?.assignTo, ticket?.empId, ticket?.emp_id)
      ),
      department_name: this.firstPresentDisplay(ticket?.department_name, ticket?.departmentName, ticket?.dept_name, ticket?.deptName, ticket?.department, ticket?.dept, ticket?.overall_ticket_department) || '-',
      created_date: this.firstPresent(ticket?.created_date, ticket?.createdDate, ticket?.createddate, ticket?.assigned_date, ticket?.assignedDate, ticket?.ticket_date, ticket?.ticketDate, ticket?.date),
      description: this.firstPresentDisplay(ticket?.description, ticket?.ticket_details, ticket?.ticketDetails, ticket?.details, ticket?.work_details, ticket?.workDetails, ticket?.work_report, ticket?.workReport, ticket?.remarks, ticket?.comments) || '-',
      status: this.getStatusName(rawStatus),
      version: this.firstPresentDisplay(ticket?.version, ticket?.product_version, ticket?.productVersion) || '-'
    };
  }

  private getAssignmentDisplayName(nameCandidates: any[], employeeId: any): string {
    const explicitName = this.firstPresentDisplay(...nameCandidates);
    if (explicitName && `${explicitName}`.trim() !== '-') {
      return `${explicitName}`;
    }

    return this.findEmployeeName(employeeId) || '-';
  }

  private findEmployeeName(employeeId: any): string | null {
    if (employeeId === null || employeeId === undefined || `${employeeId}`.trim() === '') {
      return null;
    }

    const employee = [...this.apiEmployees, ...this.employees].find((candidate: any) => {
      const candidateIds = [
        candidate?.filter_id, candidate?.id, candidate?.employee_id,
        candidate?.employeeid, candidate?.emp_id, candidate?.empId,
        candidate?.user_id, candidate?.userId
      ].filter(value => value !== null && value !== undefined && `${value}`.trim() !== '');
      return candidateIds.some(id => this.isSameId(employeeId, id));
    });

    return employee
      ? this.firstPresentDisplay(employee?.employee_name, employee?.employeeName, employee?.name, `${employee?.firstname ?? ''} ${employee?.lastname ?? ''}`.trim())
      : null;
  }

  private extractTicketRows(response: any, depth = 0): any[] {
    if (depth > 5) {
      return [];
    }

    if (Array.isArray(response)) {
      const directRows = response.filter((item: any) => this.looksLikeTicketRow(item));
      if (directRows.length === response.length && response.length) {
        return response;
      }

      const collectedRows = response.flatMap((item: any) => this.extractTicketRows(item, depth + 1));
      return collectedRows.length ? collectedRows : response;
    }

    if (!response || typeof response !== 'object') {
      return [];
    }

    const preferredKeys = [
      'allTickets',
      'all_tickets',
      'tickets',
      'ticketList',
      'ticket_list',
      'ticketDetails',
      'ticket_details',
      'ticketData',
      'ticket_data',
      'ticketRows',
      'ticket_rows',
      'assignedTickets',
      'assigned_tickets',
      'raisedTickets',
      'raised_tickets',
      'overallTickets',
      'overall_tickets',
      'details',
      'data',
      'response',
      'result',
      'results',
      'rows',
      'list',
      'records',
      'items',
      'content',
      'payload'
    ];

    for (const key of preferredKeys) {
      if (!Object.prototype.hasOwnProperty.call(response, key)) {
        continue;
      }

      const rows = this.extractTicketRows(response[key], depth + 1);
      if (rows.length) {
        return rows;
      }
    }

    const collectedRows: any[] = [];
    for (const value of Object.values(response)) {
      const rows = this.extractTicketRows(value, depth + 1);
      if (rows.length) {
        collectedRows.push(...rows);
      }
    }

    if (this.looksLikeTicketRow(response)) {
      return [response];
    }

    const objectRows = Object.values(response).filter((value: any) => this.looksLikeTicketRow(value));
    if (objectRows.length) {
      return objectRows;
    }

    return collectedRows;
  }

  private looksLikeTicketRows(rows: any[]): boolean {
    if (!rows.length) {
      return true;
    }

    return rows.some((row: any) => row && typeof row === 'object' && !Array.isArray(row));
  }

  private looksLikeTicketRow(row: any): boolean {
    return !!row && typeof row === 'object' && [
      'ticket_name',
      'ticketName',
      'ticket_title',
      'ticketTitle',
      'ticket',
      'title',
      'subject',
      'code',
      'ticket_code',
      'ticketCode',
      'ticket_id',
      'description',
      'priority',
      'worked_hours',
      'client_comments',
      'solution',
      'department_name',
      'company_name',
      'companyName',
      'client_name',
      'clientName',
      'customer_name',
      'customerName',
      'assigned_to_name',
      'assignedToName',
      'assigned_from_name',
      'assignedFromName',
      'product_name',
      'productName',
      'created_date',
      'overall_ticket_status'
    ].some(key => Object.prototype.hasOwnProperty.call(row, key));
  }

  private isClosedTicketStatus(status: any): boolean {
    const numericValue = Number(status);
    const value = this.normalizeStatusKey(status);
    return numericValue === 4 || value === 'closed' || value === 'close';
  }


  onRangeChange(event: DateRangeChange): void {
    this.ticketRangePreset = event.preset || null;

    const nextStartDate = this.formatDateToYMD(event.startDate);
    const nextEndDate = this.formatDateToYMD(event.endDate);
    const nextRangeKey = this.buildTicketRangeKey(nextStartDate, nextEndDate);

    if (this.activeTicketRangeKey === nextRangeKey && (this.ticketRequest || this.hasRenderedTickets)) {
      return;
    }

    this.startDate = nextStartDate;
    this.endDate = nextEndDate;

    this.getAllTickets();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (!this.table) return;

    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }

    this.resizeTimer = setTimeout(() => {
      const compactMode = this.isCompactViewport();
      if (compactMode !== this.tableCompactMode) {
        this.initializeTable();
        return;
      }

      this.table.redraw(true);
    }, 150);
  }

  private renderTicketsToTable(): void {
    if (!this.tableDiv?.nativeElement) {
      return;
    }

    if (this.tableRenderTimer) {
      clearTimeout(this.tableRenderTimer);
    }

    if (!this.table) {
      this.tableRenderTimer = setTimeout(() => {
        if (!this.tableDiv?.nativeElement) return;
        this.initializeTable();
      }, 0);
      return;
    }

    this.tableRenderTimer = setTimeout(() => {
      this.syncTableData();
    }, 0);
  }

  private syncTableData(): void {
    if (!this.table) {
      return;
    }

    const nextData = [...this.tickets];
    const update = typeof this.table.setData === 'function'
      ? this.table.setData(nextData)
      : Promise.resolve();

    Promise.resolve(update)
      .catch(() => this.table?.setData?.(nextData))
      .finally(() => {
        if (!this.table) return;

        const renderedRows = typeof this.table.getRows === 'function'
          ? this.table.getRows()
          : [];

        if (nextData.length && Array.isArray(renderedRows) && renderedRows.length === 0) {
          this.initializeTable();
          return;
        }

        if (typeof this.table.setPage === 'function') {
          this.table.setPage(1);
        }

        requestAnimationFrame(() => {
          if (this.table) {
            this.table.redraw(true);
            this.scheduleNotificationTicketOpen();
          }
        });
      });
  }

  private scheduleNotificationTicketOpen(attempt = 0): void {
    if (!this.notificationTicketId || this.notificationTicketOpened) return;
    if (this.notificationTicketTimer) clearTimeout(this.notificationTicketTimer);

    this.notificationTicketTimer = setTimeout(() => {
      const ticket = this.tickets.find(item => this.matchesNotificationTicket(item));
      if (!ticket) {
        if (attempt < 8 && (this.ticketRequest || !this.hasRenderedTickets)) {
          this.scheduleNotificationTicketOpen(attempt + 1);
        }
        return;
      }

      const row = this.table?.getRows?.().find((candidate: any) => this.matchesNotificationTicket(candidate?.getData?.()));
      const revealRow = row && typeof this.table?.setPageToRow === 'function'
        ? Promise.resolve(this.table.setPageToRow(row)).catch(() => undefined)
        : Promise.resolve();

      revealRow.finally(() => {
        row?.select?.();
        row?.getElement?.().classList.add('notification-ticket-highlight');
        row?.scrollTo?.('center', false);
        this.notificationTicketOpened = true;
      });
    }, 75);
  }

  private matchesNotificationTicket(ticket: any): boolean {
    if (!ticket || !this.notificationTicketId) return false;
    const target = String(this.notificationTicketId).trim();
    return [ticket?.ticket_id, ticket?.ticketId, ticket?.ticketid, ticket?.id, ticket?.code]
      .some(value => value !== null && value !== undefined && String(value).trim() === target);
  }

  private buildTicketRangeKey(startDate: string, endDate: string): string {
    return [
      this.isRaisedTickets ? 'raised' : 'overall',
      this.empId ?? '',
      this.userId ?? '',
      startDate,
      endDate
    ].join('|');
  }

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.innerWidth < 768;
  }

  initializeTable() {
    if (this.table) {
      this.table.destroy();
    }
    this.tableCompactMode = this.isCompactViewport();
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.tickets,
      layout: "fitDataStretch",
      responsiveLayout: false,
      autoResize: true,
      pagination: "local",
      paginationSize: 10,
      paginationCounter: "rows",
      movableColumns: true,
      selectable: true,
      editTriggerEvent: "dblclick",
      paginationSizeSelector: [10, 25, 50, 100],
      placeholder: "No Tickets Found",
      columnDefaults: {
        headerWordWrap: true,
        resizable: true,
        tooltip: true,
        editable: (cell: any) => {
          const rowData = cell.getRow().getData();
          return this.canEditTicket(rowData);
        },
      },

      headerSortElement: function (col: any, dir: any) {
        if (dir === "asc")
          return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === "desc")
          return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },
      initialSort: [
        { column: "id", dir: "desc" }
      ],
      columns: [
        {
          title: "Code",
          field: "code",
          frozen: !this.tableCompactMode,
          minWidth: 190,
          widthGrow: 1.2,
          responsive: 0,
          tooltip: (_e: any, cell: any) => this.getDisplayValue(cell.getValue()),
          formatter: (cell: any) => {
            const row = cell.getRow().getData();
            const codeValue = this.getDisplayValue(row.code);
            const code = this.escapeHtml(codeValue);

            return `
              <div class="ticket-code-cell group" title="${code}">
                <div class="ticket-code-cell__text" title="${code}">
                  <span class="ticket-code-cell__value">${code}</span>
                </div>
                <div class="ticket-row-actions">
                  <button class="view-btn" title="View ${code}" aria-label="View ${code}">
                    <span class="text-[10px] font-semibold uppercase tracking-wide">View</span>
                    <i class="ri-eye-line text-xs"></i>
                  </button>
                </div>
              </div>
            `;
          },
          cellClick: (e: any, cell: any) => {
            const target = e.target.closest('.view-btn');
            if (target) {
              const rawData = cell.getRow().getData();
              this.openTicketDetailsDialog(rawData);
            }
          }
        },
        {
          title: "Ticket",
          field: "ticket_name",
          minWidth: 170,
          widthGrow: 1.4,
          responsive: 1,
          formatter: (cell: any) => this.formatTextCell(cell.getValue()),
        },
        ...(this.isHardware
          ? [{
            title: "Ticket Category",
            field: "ticket_category_id",
            minWidth: 160,
            widthGrow: 1,
            responsive: 3,
            formatter: (cell: any) => {
              const categoryId = Number(cell.getValue());
              const category = this.getTicketCategoryMeta(categoryId);
              if (!category) return '-';

              return `
                  <span class="ticket-category-pill ${category.cls}">
                    ${this.escapeHtml(category.text)}
                  </span>
                `;
            }
          }]
          : []),
        {
          title: "Client",
          field: "company_name",
          minWidth: 160,
          widthGrow: 1.2,
          responsive: 2,
          formatter: (cell: any) => this.formatTextCell(cell.getValue()),
        },
        ...(this.isHardware ? [
          {
            title: "Model",
            field: "stb_model",
            minWidth: 150,
            widthGrow: 1,
            responsive: 4,
            formatter: (cell: any) => this.formatTextCell(cell.getValue()),
          }
        ] : []),

        ...(this.isHardware ? [
          {
            title: "Model Code",
            field: "stb_version",
            minWidth: 150,
            widthGrow: 1,
            responsive: 4,
            formatter: (cell: any) => this.formatTextCell(cell.getValue()),
          }
        ] : []),

        ...(this.isHardware ? [
          {
            title: "Count",
            field: "count",
            minWidth: 150,
            widthGrow: 1,
            responsive: 4,
            formatter: (cell: any) => this.formatTextCell(cell.getValue()),
          }
        ] : []),

        ...(this.isHardware ? [
          {
            title: "Product",
            field: "product_name",
            minWidth: 150,
            widthGrow: 1,
            responsive: 4,
            formatter: (cell: any) => this.formatTextCell(cell.getValue()),
          }
        ] : []),

        ...(this.isHardware ? [
          {
            title: "Product Version",
            field: "version",
            minWidth: 140,
            widthGrow: 0.8,
            responsive: 5,
            formatter: (cell: any) => this.formatTextCell(cell.getValue()),
          }
        ] : []),

        ...(this.isHardware ? [
          {
            title: "Product Type",
            field: "type",
            minWidth: 140,
            widthGrow: 0.8,
            responsive: 5,
            formatter: (cell: any) => this.formatTextCell(cell.getValue()),
          }
        ] : []),
        {
          title: "Assigned From",
          field: "assigned_from_name",
          minWidth: 150,
          widthGrow: 1,
          responsive: 3,
          formatter: (cell: any) => this.formatTextCell(cell.getValue()),
        },
        {
          title: "Assigned to",
          field: "assigned_to_name",
          minWidth: 150,
          widthGrow: 1,
          responsive: 3,
          formatter: (cell: any) => this.formatTextCell(cell.getValue()),
        },
        ...(!this.isRaisedTickets
          ? [{
            title: "Department",
            field: "department_name",
            minWidth: 150,
            widthGrow: 1,
            responsive: 4,
            formatter: (cell: any) => {
              const value = cell.getValue() || "-";
              return `<span class="text-sm font-medium text-slate-700">${this.escapeHtml(value)}</span>`;
            }
          }]
          : []),
        {
          title: "Status",
          field: "status",
          minWidth: 200,
          widthGrow: 0.7,
          responsive: 1,
          hozAlign: "left",
          editor: "list",
          editorParams: (cell: any) => this.getStatusEditorParams(cell),
          tooltip: (_e: any, cell: any) => this.getStatusBadgeMeta(cell.getValue()).text,
          formatter: (cell: any) => {
            const s = this.getStatusBadgeMeta(cell.getValue());
            const statusText = this.escapeHtml(s.text);
            return `
      <span class="ticket-status-pill ${s.cls}" title="${statusText}">
        ${statusText}
      </span>
    `;
          }
        },
        {
          title: "Created Date",
          field: "created_date",
          minWidth: 135,
          widthGrow: 0.8,
          responsive: 2,
          formatter: (cell: any) => {
            if (!cell.getValue()) return "-";
            return new Date(cell.getValue()).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric"
            });
          }
        },
        {
          title: "Description",
          field: "description",
          minWidth: 220,
          widthGrow: 2,
          responsive: 6,
          formatter: (cell: any) => {
            const value = this.escapeHtml(cell.getValue() || "");
            return `
              <div class="flex items-center h-full">
                <span class="text-m text-black truncate max-w-full cursor-help" title="${value}">
                  ${value || '-'}
                </span>
              </div>
            `;
          }
        },
        ...(this.shouldShowActionsColumn()
          ? [{
            title: "Actions",
            field: "actions",
            minWidth: 96,
            widthGrow: 0.4,
            frozen: !this.tableCompactMode,
            responsive: 0,
            headerSort: false,
            hozAlign: "center",
            cssClass: "sticky-col-right",
            formatter: (cell: any) => {
              const rowData = cell.getRow().getData();
              if (!this.canEditTicket(rowData)) {
                return '';
              }

              return `
            <div class="flex items-center justify-center gap-3 w-full h-full">
              <button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit" title="Edit">
                <i class="ri-pencil-line text-lg pointer-events-none"></i>
              </button>
                 </div>
          `;
            },
            cellClick: (e: any, cell: any) => {
              this.handleActionClick(e, cell);
            }
          }]
          : [])
      ],
    });

    attachTabulatorPaginationPersistence(
      this.table,
      buildTabulatorPaginationKey(`ticket-table:${this.isRaisedTickets ? 'raised' : 'overall'}`)
    );
    this.table.on('cellEdited', (cell: any) => {
      if (cell.getField() !== 'status') return;

      const rowData = cell.getRow().getData();
      const loggedInEmpId = this.storageService.getEmpId();
      const isAdmin = this.storageService.roles?.isAdmin;
      const assignedFrom = this.getAssignedFromId(rowData);
      const assignedTo = this.getAssignedToId(rowData);

      const isAssignedFromUser = this.isSameId(loggedInEmpId, assignedFrom);
      const isAssignedToUser = this.isSameId(loggedInEmpId, assignedTo);
      const sameAssigneeAndAssigner = this.isSameId(assignedFrom, assignedTo);

      if (!this.canEditTicket(rowData)) {
        this.toasterService.error("You are Not Allowed.");
        cell.restoreOldValue();
        return;
      }

      const canSetClosed = isAdmin || isAssignedFromUser || sameAssigneeAndAssigner;
      const isClosedStatus = this.isClosedTicketStatus(rowData.status);

      if (isClosedStatus && !canSetClosed) {
        this.toasterService.error("Only the ticket's assigner can close it.");
        cell.restoreOldValue();
        return;
      }

      this.updateTicketStatus(rowData, cell);
    });
  }

  private formatTextCell(value: any): string {
    const displayValue = this.getDisplayValue(value);
    const escapedValue = this.escapeHtml(displayValue);

    return `
      <div class="ticket-table-cell-text" title="${escapedValue}">
        ${escapedValue}
      </div>
    `;
  }

  private formatResponsiveCollapse(data: any[]): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ticket-responsive-details';

    (Array.isArray(data) ? data : [])
      .filter((item: any) => item?.title)
      .forEach((item: any) => {
        const detail = document.createElement('div');
        detail.className = 'ticket-responsive-detail';

        const label = document.createElement('span');
        label.textContent = this.stripHtml(item.title);

        const value = document.createElement('strong');
        value.textContent = this.formatResponsiveDetailValue(item);

        detail.appendChild(label);
        detail.appendChild(value);
        container.appendChild(detail);
      });

    return container;
  }

  private formatResponsiveDetailValue(item: any): string {
    const field = item?.field;
    const value = item?.value;

    if (field === 'status') {
      return this.getStatusBadgeMeta(value).text;
    }

    if (field === 'ticket_category_id') {
      return this.getTicketCategoryMeta(Number(value))?.text || '-';
    }

    if (field === 'created_date') {
      return this.formatDate(value);
    }

    return this.getDisplayValue(this.stripHtml(value));
  }

  private getDisplayValue(value: any): string {
    const scalarValue = this.toDisplayScalar(value);
    const displayValue = scalarValue === null ? '' : `${scalarValue}`.trim();
    return displayValue || '-';
  }

  private getStatusBadgeMeta(value: any): { text: string; cls: string } {
    const resolvedStatus = this.getStatusName(value);
    const numericValue = this.getStatusNumericValue(resolvedStatus);
    if (numericValue !== null && this.statusBadgeStyles[numericValue]) {
      return this.statusBadgeStyles[numericValue];
    }

    const textValue = `${resolvedStatus ?? ''}`.trim();
    const normalizedTextValue = this.normalizeStatusKey(textValue);
    const namedStatusStyles: Record<string, { text: string; cls: string }> = {
      open: this.statusBadgeStyles[0],
      inprogress: this.statusBadgeStyles[1],
      tobetested: this.statusBadgeStyles[2],
      delayed: this.statusBadgeStyles[3],
      close: this.statusBadgeStyles[4],
      closed: this.statusBadgeStyles[4],
      cancelled: this.statusBadgeStyles[5],
      canceled: this.statusBadgeStyles[5],
      approved: this.statusBadgeStyles[6],
      completed: this.statusBadgeStyles[7],
      rejected: this.statusBadgeStyles[8],
      failed: this.statusBadgeStyles[9],
      pass: this.statusBadgeStyles[10],
      passed: this.statusBadgeStyles[10],
      reopen: this.statusBadgeStyles[11],
      reopened: this.statusBadgeStyles[11]
    };

    return namedStatusStyles[normalizedTextValue] ?? {
      text: textValue || "-",
      cls: "ticket-status--unknown"
    };
  }

  private getStatusName(value: any): any {
    if (value === null || value === undefined || `${value}`.trim() === '') {
      return value;
    }

    const normalizedValue = `${value}`.trim().toLowerCase().replace(/[^a-z]/g, '');
    const byName = this.statusList.find((status: any) =>
      `${status?.name ?? ''}`.trim().toLowerCase().replace(/[^a-z]/g, '') === normalizedValue
    );
    if (byName) {
      return byName.name;
    }

    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      const byId = this.statusList.find((status: any) => Number(status?.id) === numericValue);
      if (byId) {
        return byId.name;
      }
    }

    return value;
  }

  private statusesMatch(first: any, second: any): boolean {
    const firstName = `${this.getStatusName(first) ?? ''}`.trim().toLowerCase().replace(/[^a-z]/g, '');
    const secondName = `${this.getStatusName(second) ?? ''}`.trim().toLowerCase().replace(/[^a-z]/g, '');

    if (firstName && secondName && firstName === secondName) {
      return true;
    }

    const firstId = Number(first);
    const secondId = Number(second);
    return Number.isFinite(firstId) && Number.isFinite(secondId) && firstId === secondId;
  }

  private getStatusNumericValue(value: any): number | null {
    if (value === null || value === undefined || `${value}`.trim() === '') {
      return null;
    }

    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const normalizedValue = this.normalizeStatusKey(value);
    const matchedStatus = this.statusList.find((status: any) =>
      this.normalizeStatusKey(status?.name) === normalizedValue
    );
    if (matchedStatus && Number.isFinite(Number(matchedStatus.id))) {
      return Number(matchedStatus.id);
    }

    const matchedStyle = Object.entries(this.statusBadgeStyles).find(([, status]) =>
      this.normalizeStatusKey(status.text) === normalizedValue
    );

    return matchedStyle ? Number(matchedStyle[0]) : null;
  }

  private normalizeStatusKey(value: any): string {
    return `${this.getStatusName(value) ?? ''}`.trim().toLowerCase().replace(/[^a-z]/g, '');
  }

  private isReOpenTicketStatus(status: any): boolean {
    const numericValue = Number(status);
    const statusKey = this.normalizeStatusKey(status);
    return numericValue === 11 || statusKey === 'reopen' || statusKey === 'reopened';
  }

  private getStatusDialogMeta(value: any): { text: string; color: string; bg: string } {
    const badge = this.getStatusBadgeMeta(value);
    const normalizedStatus = this.normalizeStatusKey(badge.text);
    const styles: Record<string, { color: string; bg: string }> = {
      open: { color: "#db2777", bg: "#fce7f3" },
      inprogress: { color: "#2563eb", bg: "#dbeafe" },
      tobetested: { color: "#d97706", bg: "#fef3c7" },
      delayed: { color: "#7c3aed", bg: "#ede9fe" },
      close: { color: "#475569", bg: "#f1f5f9" },
      closed: { color: "#475569", bg: "#f1f5f9" },
      cancelled: { color: "#fa2323", bg: "#fadad1" },
      canceled: { color: "#fa2323", bg: "#fadad1" },
      approved: { color: "#059669", bg: "#cbfec7" },
      completed: { color: "#059669", bg: "#cbfec7" },
      rejected: { color: "#fa2323", bg: "#fadad1" },
      failed: { color: "#fa2323", bg: "#fadad1" },
      pass: { color: "#059669", bg: "#cbfec7" },
      passed: { color: "#059669", bg: "#cbfec7" },
      reopen: { color: "#0891b2", bg: "#cffafe" },
      reopened: { color: "#0891b2", bg: "#cffafe" }
    };

    const style = styles[normalizedStatus] ?? { color: "#64748b", bg: "#f1f5f9" };

    return {
      text: badge.text || "-",
      ...style
    };
  }

  private getTicketCategoryMeta(categoryId: number): { text: string; cls: string } | null {
    const category = this.categories.find(f => Number(f.id) === categoryId);
    if (!category) {
      return null;
    }

    const styles: Record<string, string> = {
      Production: 'ticket-category--production',
      Service: 'ticket-category--service',
      Ordinary: 'ticket-category--ordinary'
    };

    return {
      text: String(category.type),
      cls: styles[category.type] || 'ticket-category--unknown'
    };
  }

  private stripHtml(value: any): string {
    const text = value === null || value === undefined ? '' : `${value}`;
    if (!text.includes('<')) {
      return text;
    }

    const div = document.createElement('div');
    div.innerHTML = text;
    return div.textContent || div.innerText || '';
  }

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value.trim();
    this.applyFilters();
  }

  onEmployeeFilterChange(value: any): void {
    this.selectedEmployeeId = value || '';
    this.applyFilters();
  }

  onDepartmentFilterChange(value: any): void {
    if (!this.canSelectDepartment) return;

    this.selectedDepartmentId = value || '';
    this.selectedEmployeeId = '';
    this.employeeSearchTerm = '';
    this.apiEmployees = [];
    this.ticketEmployees = this.getScopedTicketEmployeeOptions();
    this.refreshEmployeeOptions();
    this.applyFilters();
    this.getEmployees(this.getSelectedDepartmentApiId());
  }

  clearEmployeeFilter(): void {
    this.selectedEmployeeId = '';
    this.employeeSearchTerm = '';
    this.applyEmployeeSearch();
    this.applyFilters();
  }

  clearDepartmentFilter(): void {
    this.selectedDepartmentId = '';
    this.departmentSearchTerm = '';
    this.applyDepartmentSearch();
    this.applyFilters();
  }

  filterEmployees(event: Event): void {
    this.employeeSearchTerm = (event.target as HTMLInputElement).value || '';
    this.applyEmployeeSearch();
  }

  filterDepartments(event: Event): void {
    this.departmentSearchTerm = (event.target as HTMLInputElement).value || '';
    this.applyDepartmentSearch();
  }

  onEmployeeSelectOpened(opened: boolean): void {
    if (!opened) return;
    this.employeeSearchTerm = '';
    this.applyEmployeeSearch();
  }

  onDepartmentSelectOpened(opened: boolean): void {
    if (!opened) return;
    this.departmentSearchTerm = '';
    this.applyDepartmentSearch();
  }

  private applyFilters(updateTable = true): void {
    this.tickets = this.filterTicketRows(this.allTickets);

    if (updateTable && this.table) {
      this.syncTableData();
    }
  }

  private getEmployees(departmentId: any = ''): void {
    const request = !this.isRaisedTickets && departmentId !== null && departmentId !== undefined && `${departmentId}`.trim() !== ''
      ? this.authService.getEmployeeListByDepartment(departmentId)
      : this.authService.getEmployeeList();
    request
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const list = Array.isArray(res) ? res : (res?.data ?? res?.employees ?? []);
          this.apiEmployees = this.normalizeEmployeeOptions(list);
          this.allTickets = this.allTickets.map((ticket: any) => this.normalizeTicketRow(ticket));
          if (!this.isRaisedTickets && !this.canSelectEmployee) {
            this.ensureLoggedInEmployeeOption();
          }
          this.refreshEmployeeOptions();
        },
        error: () => {
          this.apiEmployees = [];
          this.refreshEmployeeOptions();
        }
      });
  }

  private getDepartments(): void {
    this.authService.getAllDepartments()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const list = Array.isArray(res) ? res : (res?.data ?? res?.departments ?? []);
          this.apiDepartments = this.normalizeDepartmentOptions(list);
          this.refreshDepartmentOptions();
          this.selectDefaultDepartment();
          this.ticketEmployees = this.getScopedTicketEmployeeOptions();
          this.getEmployees(this.getSelectedDepartmentApiId());
        },
        error: () => {
          this.apiDepartments = [];
          this.refreshDepartmentOptions();
        }
      });
  }

  private rebuildTicketFilterOptions(): void {
    this.ticketDepartments = this.getTicketDepartmentOptions(this.allTickets);
    this.refreshDepartmentOptions();
    if (!this.isRaisedTickets) {
      this.selectDefaultDepartment();
    }
    this.ticketEmployees = this.isRaisedTickets
      ? this.getTicketEmployeeOptions(this.allTickets)
      : this.getScopedTicketEmployeeOptions();
    this.refreshEmployeeOptions();
  }

  private refreshEmployeeOptions(): void {
    this.employees = this.mergeOptions(
      [...this.apiEmployees, ...this.ticketEmployees],
      (item: any) => item.filter_id || item.employee_name
    );

    if (!this.isRaisedTickets && !this.canSelectEmployee) {
      this.selectLoggedInEmployee();
    }

    this.applyEmployeeSearch();

    if (this.selectedEmployeeId && !this.employees.some((emp: any) => this.isSameId(emp.filter_id, this.selectedEmployeeId))) {
      this.selectedEmployeeId = '';
    }

    if (!this.isRaisedTickets) {
      this.applyFilters();
    }
  }

  private refreshDepartmentOptions(): void {
    const mergedDepartments = this.mergeOptions(
      [...this.apiDepartments, ...this.ticketDepartments],
      (item: any) => item.filter_id || item.department_name
    );
    this.departments = !this.isRaisedTickets && !this.canSelectDepartment ? this.getLoggedInDepartments(mergedDepartments) : mergedDepartments;
    this.applyDepartmentSearch();

    if (this.selectedDepartmentId && !this.departments.some((dept: any) => this.isSameId(dept.filter_id, this.selectedDepartmentId))) {
      this.selectedDepartmentId = '';
      this.applyFilters();
    }
  }

  private selectDefaultDepartment(): void {
    if (this.isRaisedTickets || this.canSelectDepartment || this.selectedDepartmentId || !this.departments.length) {
      return;
    }

    const storedValues = this.getLoggedInDepartmentValues();
    const selected = this.departments.find((department: any) =>
      this.normalizeFilterKeys([
        department?.filter_id,
        department?.id,
        department?.department_id,
        department?.departmentId,
        department?.dept_id,
        department?.deptid,
        department?.department_name,
        department?.departmentName,
        department?.name
      ]).some(key => storedValues.includes(key))
    ) || (this.canSelectDepartment ? null : this.departments[0]);

    this.selectedDepartmentId = selected?.filter_id || '';
  }

  private getLoggedInDepartments(departments: any[]): any[] {
    const storedValues = this.getLoggedInDepartmentValues();
    const matches = departments.filter((department: any) =>
      this.normalizeFilterKeys([
        department?.filter_id,
        department?.id,
        department?.department_id,
        department?.departmentId,
        department?.dept_id,
        department?.deptid,
        department?.department_name,
        department?.departmentName,
        department?.name
      ]).some(key => storedValues.includes(key))
    );

    if (matches.length) {
      return matches.slice(0, 1);
    }

    const user = this.storageService.getUser() || {};
    const id = this.firstPresent(
      user?.department_id,
      user?.departmentId,
      user?.departmentid,
      user?.dept_id,
      user?.deptId,
      user?.deptid
    );
    const name = this.firstPresent(
      this.storageService.getDept(),
      user?.department_name,
      user?.departmentName,
      user?.department,
      user?.dept_name,
      user?.deptName
    );
    const filterId = this.firstPresent(id, name);

    return filterId && name
      ? [{ filter_id: String(filterId), id, department_name: String(name) }]
      : [];
  }

  private getLoggedInDepartmentValues(): string[] {
    const user = this.storageService.getUser() || {};

    return this.normalizeFilterKeys([
      user?.department_id,
      user?.departmentId,
      user?.departmentid,
      user?.dept_id,
      user?.deptId,
      user?.deptid,
      this.storageService.getDept(),
      user?.department_name,
      user?.departmentName,
      user?.department,
      user?.dept_name,
      user?.deptName
    ]);
  }

  private ensureLoggedInEmployeeOption(): void {
    const user = this.storageService.getUser() || {};
    const employeeId = this.firstPresent(
      this.empId,
      user?.employee_id,
      user?.employeeId,
      user?.employeeid,
      user?.emp_id
    );
    const employeeName = this.firstPresent(
      this.storageService.getEmpName(),
      user?.employee_name,
      user?.employeeName,
      user?.name,
      `${user?.firstname ?? ''} ${user?.lastname ?? ''}`.trim()
    );

    if (!employeeId || !employeeName) {
      return;
    }

    const employeeKeys = this.normalizeFilterKeys([employeeId, employeeName]);
    const exists = this.apiEmployees.some((employee: any) =>
      this.normalizeFilterKeys([
        employee?.filter_id,
        employee?.id,
        employee?.employee_id,
        employee?.emp_id,
        employee?.employee_name
      ]).some(key => employeeKeys.includes(key))
    );

    if (!exists) {
      this.apiEmployees.push({
        filter_id: String(employeeId),
        id: employeeId,
        employee_id: employeeId,
        employee_name: String(employeeName)
      });
    }
  }

  private selectLoggedInEmployee(): void {
    const user = this.storageService.getUser() || {};
    const storedValues = this.normalizeFilterKeys([
      this.empId,
      user?.employee_id,
      user?.employeeId,
      user?.employeeid,
      user?.emp_id,
      this.storageService.getEmpName(),
      user?.employee_name,
      user?.employeeName,
      user?.name
    ]);
    const selected = this.employees.find((employee: any) =>
      this.normalizeFilterKeys([
        employee?.filter_id,
        employee?.id,
        employee?.employee_id,
        employee?.employeeid,
        employee?.emp_id,
        employee?.employee_name,
        employee?.name
      ]).some(key => storedValues.includes(key))
    );

    this.selectedEmployeeId = selected?.filter_id || this.empId || '';
  }

  private getScopedTicketEmployeeOptions(): any[] {
    const scopedTickets = !this.selectedDepartmentId
      ? this.allTickets
      : this.allTickets.filter((ticket: any) => this.ticketMatchesDepartment(ticket));

    return this.getTicketEmployeeOptions(scopedTickets);
  }

  private applyEmployeeSearch(): void {
    const value = this.employeeSearchTerm.trim().toLowerCase();
    this.filteredEmployees = value
      ? this.employees.filter((employee: any) => `${employee?.employee_name ?? ''}`.toLowerCase().includes(value))
      : [...this.employees];
  }

  private applyDepartmentSearch(): void {
    const value = this.departmentSearchTerm.trim().toLowerCase();
    this.filteredDepartments = value
      ? this.departments.filter((department: any) => `${department?.department_name ?? ''}`.toLowerCase().includes(value))
      : [...this.departments];
  }

  private normalizeEmployeeOptions(list: any[]): any[] {
    return (Array.isArray(list) ? list : [])
      .map((employee: any) => {
        const id = this.firstPresent(employee?.id, employee?.employee_id, employee?.employeeid, employee?.emp_id, employee?.empId);
        const fullName = `${employee?.firstname ?? ''} ${employee?.lastname ?? ''}`.trim();
        const name = this.firstPresent(employee?.employee_name, employee?.name, fullName);
        const filterId = this.firstPresent(id, name);

        return filterId && name
          ? { ...employee, filter_id: String(filterId), employee_name: String(name) }
          : null;
      })
      .filter(Boolean);
  }

  private normalizeDepartmentOptions(list: any[]): any[] {
    return (Array.isArray(list) ? list : [])
      .map((department: any) => {
        const id = this.firstPresent(department?.id, department?.department_id, department?.departmentId, department?.dept_id, department?.deptid);
        const name = this.firstPresent(department?.department_name, department?.departmentName, department?.dept_name, department?.deptName, department?.name);
        const filterId = this.firstPresent(id, name);

        return filterId && name
          ? { ...department, filter_id: String(filterId), department_name: String(name) }
          : null;
      })
      .filter(Boolean);
  }

  private getTicketEmployeeOptions(tickets: any[]): any[] {
    const options: any[] = [];

    for (const ticket of tickets) {
      const assignedToId = this.firstPresent(ticket?.assigned_to, ticket?.assignedTo, ticket?.assigned_to_id, ticket?.assignedToId, ticket?.empId, ticket?.emp_id);
      const assignedToName = this.firstPresent(ticket?.assigned_to_name, ticket?.assignedToName, ticket?.employee_name);
      const assignedFromId = this.firstPresent(ticket?.assigned_from, ticket?.assignedFrom, ticket?.assigned_from_id, ticket?.assignedFromId);
      const assignedFromName = this.firstPresent(ticket?.assigned_from_name, ticket?.assignedFromName);

      if (assignedToName) {
        options.push({ filter_id: String(this.firstPresent(assignedToId, assignedToName)), employee_name: String(assignedToName) });
      }

      if (assignedFromName) {
        options.push({ filter_id: String(this.firstPresent(assignedFromId, assignedFromName)), employee_name: String(assignedFromName) });
      }
    }

    return options;
  }

  private getTicketDepartmentOptions(tickets: any[]): any[] {
    return tickets
      .map((ticket: any) => {
        const id = this.firstPresent(ticket?.department, ticket?.department_id, ticket?.departmentId, ticket?.dept_id, ticket?.deptid);
        const name = this.firstPresent(ticket?.department_name, ticket?.departmentName, ticket?.dept_name, ticket?.deptName);
        const filterId = this.firstPresent(id, name);

        return filterId && name
          ? { filter_id: String(filterId), department_name: String(name) }
          : null;
      })
      .filter(Boolean);
  }

  private mergeOptions(list: any[], keyResolver: (item: any) => any): any[] {
    const seen = new Set<string>();
    const merged: any[] = [];

    for (const item of list) {
      const key = `${keyResolver(item) ?? ''}`.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }

    return merged.sort((a: any, b: any) => {
      const first = `${a?.employee_name ?? a?.department_name ?? ''}`.toLowerCase();
      const second = `${b?.employee_name ?? b?.department_name ?? ''}`.toLowerCase();
      return first.localeCompare(second);
    });
  }

  private ticketMatchesEmployee(ticket: any): boolean {
    if (!this.selectedEmployeeId) return true;

    const selectedEmployee = this.employees.find((employee: any) => this.isSameId(employee?.filter_id, this.selectedEmployeeId));
    const selectedKeys = this.normalizeFilterKeys([
      this.selectedEmployeeId,
      selectedEmployee?.filter_id,
      selectedEmployee?.id,
      selectedEmployee?.employee_id,
      selectedEmployee?.employeeid,
      selectedEmployee?.emp_id,
      selectedEmployee?.empId,
      selectedEmployee?.employee_name,
      selectedEmployee?.name
    ]);

    const ticketKeys = this.normalizeFilterKeys([
      ticket?.assigned_to,
      ticket?.assignedTo,
      ticket?.assigned_to_id,
      ticket?.assignedToId,
      ticket?.empId,
      ticket?.emp_id,
      ticket?.assigned_to_name,
      ticket?.assignedToName,
      ticket?.employee_name,
      ticket?.assigned_from,
      ticket?.assignedFrom,
      ticket?.assigned_from_id,
      ticket?.assignedFromId,
      ticket?.assigned_from_name,
      ticket?.assignedFromName
    ]);

    return selectedKeys.some((key) => ticketKeys.includes(key));
  }

  private ticketMatchesDepartment(ticket: any): boolean {
    if (!this.selectedDepartmentId) return true;

    const selectedDepartment = this.departments.find((department: any) => this.isSameId(department?.filter_id, this.selectedDepartmentId));
    const selectedKeys = this.normalizeFilterKeys([
      this.selectedDepartmentId,
      selectedDepartment?.filter_id,
      selectedDepartment?.id,
      selectedDepartment?.department_id,
      selectedDepartment?.departmentId,
      selectedDepartment?.dept_id,
      selectedDepartment?.deptid,
      selectedDepartment?.department_name,
      selectedDepartment?.departmentName,
      selectedDepartment?.dept_name,
      selectedDepartment?.deptName,
      selectedDepartment?.name
    ]);

    const ticketKeys = this.normalizeFilterKeys([
      ticket?.department,
      ticket?.department_id,
      ticket?.departmentId,
      ticket?.dept_id,
      ticket?.deptid,
      ticket?.department_name,
      ticket?.departmentName,
      ticket?.dept_name,
      ticket?.deptName
    ]);

    if (selectedKeys.some((key) => ticketKeys.includes(key))) {
      return true;
    }

    // Some overall-ticket API rows omit department fields. For managers, use
    // membership of either assignment in the already department-scoped employee
    // list so those department tickets are not discarded.
    if (this.storageService.roles?.isManager) {
      const assignedEmployeeIds = [
        ticket?.assigned_to, ticket?.assignedTo, ticket?.assigned_to_id,
        ticket?.assignedToId, ticket?.empId, ticket?.emp_id,
        ticket?.assigned_from, ticket?.assignedFrom, ticket?.assigned_from_id,
        ticket?.assignedFromId, ticket?.assign_from, ticket?.assignFrom
      ].filter(value => value !== null && value !== undefined && `${value}`.trim() !== '');

      return this.apiEmployees.some((employee: any) => {
        const employeeIds = [
          employee?.filter_id, employee?.id, employee?.employee_id,
          employee?.employeeid, employee?.emp_id, employee?.empId,
          employee?.user_id, employee?.userId
        ].filter(value => value !== null && value !== undefined && `${value}`.trim() !== '');
        return assignedEmployeeIds.some(ticketId =>
          employeeIds.some(employeeId => this.isSameId(ticketId, employeeId))
        );
      });
    }

    return false;
  }

  private normalizeFilterKeys(values: any[]): string[] {
    return values
      .filter(value => value !== null && value !== undefined && `${value}`.trim() !== '')
      .map(value => `${value}`.trim().toLowerCase());
  }

  openTicket(type: any) {
    this.drawerService.open(type);
  }

  formatDateToYMD(date: Date | string | null): string {
    if (!date) return 'null';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }

  get canDownloadPdf(): boolean {
    return this.hasValidTicketReportDateRange();
  }

  generateTicketsPdf(): void {
    if (!this.hasValidTicketReportDateRange()) {
      this.toasterService.error('Please select a date range first');
      return;
    }

    if (this.ticketPdfExporting || this.ticketExcelExporting) {
      return;
    }

    this.ticketPdfExporting = true;
    const exportRange = this.resolveTicketExportRange();
    const filters = this.getTicketExportFilters('pdf', exportRange);

    this.loadFilteredTicketExportRows(
      exportRange,
      (source: any[]) => {
        if (!source.length) {
          this.ticketPdfExporting = false;
          this.toasterService.error('No ticket data found for PDF');
          return;
        }

        try {
          this.pdfService.generateTicketsPDF(
            filters,
            exportRange.startDate,
            exportRange.endDate,
            source,
            'download'
          );
          this.toasterService.success('PDF downloaded successfully');
        } catch (error) {
          console.error('Ticket PDF generation error:', error);
          this.toasterService.error('Failed to generate PDF');
        } finally {
          this.ticketPdfExporting = false;
        }
      },
      (error: any) => {
        console.error('Ticket export list error:', error);
        this.ticketPdfExporting = false;
        this.toasterService.error('Failed to load ticket report data');
      }
    );
  }

  generateTicketsExcel(): void {
    if (!this.hasValidTicketReportDateRange()) {
      this.toasterService.error('Please select a date range first');
      return;
    }

    if (this.ticketExcelExporting || this.ticketPdfExporting) {
      return;
    }

    this.ticketExcelExporting = true;
    const exportRange = {
      startDate: this.startDate,
      endDate: this.endDate,
      monthlySummary: false,
      monthLabel: ''
    };
    const filters = this.getTicketExportFilters('xlsx', exportRange);

    this.loadFilteredTicketExportRows(
      exportRange,
      (source: any[]) => {
        if (!source.length) {
          this.ticketExcelExporting = false;
          this.toasterService.error('No ticket data found for Excel');
          return;
        }

        try {
          const section = this.buildTicketExcelSection(filters, source, exportRange);
          this.excelService.generateTableWorkbookExcel({
            workbookTitle: filters.reportTitle,
            author: filters.generatedBy,
            fromDate: exportRange.startDate,
            toDate: exportRange.endDate,
            departmentName: filters.department,
            scopeLabel: 'Department',
            scopeName: filters.department,
            filename: filters.filename
          }, [section]);
          this.toasterService.success('Excel downloaded successfully');
        } catch (error) {
          console.error('Ticket Excel generation error:', error);
          this.toasterService.error('Failed to generate Excel');
        } finally {
          this.ticketExcelExporting = false;
        }
      },
      (error: any) => {
        console.error('Ticket export list error:', error);
        this.ticketExcelExporting = false;
        this.toasterService.error('Failed to load ticket report data');
      }
    );
  }

  private loadFilteredTicketExportRows(
    exportRange: { startDate: string; endDate: string },
    onSuccess: (rows: any[]) => void,
    onError: (error: any) => void
  ): void {
    this.authService.getAllTickets(this.empId, this.userId, exportRange.startDate, exportRange.endDate)
      .pipe(takeUntil(this.destroy$), takeLast(1))
      .subscribe({
        next: (res: any) => onSuccess(this.getFilteredTicketRowsForExport(res)),
        error: onError
      });
  }

  private hasValidTicketReportDateRange(): boolean {
    return !!this.startDate && !!this.endDate && new Date(this.startDate) <= new Date(this.endDate);
  }

  private resolveTicketExportRange(): {
    startDate: string;
    endDate: string;
    monthlySummary: boolean;
    monthLabel: string;
  } {
    const start = this.parseTicketDate(this.startDate);
    const end = this.parseTicketDate(this.endDate);
    const isMonthPreset = this.ticketRangePreset === 'This Month' || this.ticketRangePreset === 'Last Month';
    const isCompleteMonth = !!start && !!end &&
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === 1 &&
      end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();

    if (!start || !end || (!isMonthPreset && !isCompleteMonth)) {
      return {
        startDate: this.startDate,
        endDate: this.endDate,
        monthlySummary: false,
        monthLabel: ''
      };
    }

    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);

    return {
      startDate: this.formatDateToYMD(monthStart),
      endDate: this.formatDateToYMD(monthEnd),
      monthlySummary: true,
      monthLabel: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };
  }

  private parseTicketDate(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) {
      return null;
    }

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1]) &&
      date.getMonth() === Number(match[2]) - 1 &&
      date.getDate() === Number(match[3])
      ? date
      : null;
  }

  private getTicketExportFilters(
    extension: 'pdf' | 'xlsx',
    exportRange: { startDate: string; endDate: string; monthlySummary: boolean; monthLabel: string }
  ): any {
    const selectedDepartment = this.getSelectedDepartmentOption();
    const selectedEmployee = this.getSelectedEmployeeOption();
    const department = selectedDepartment?.department_name || 'All Departments';
    const reportTitle = `${department} Tickets`;
    const filenameBase = `${this.sanitizeTicketExportPart(department)}_TICKETS_${exportRange.startDate}_to_${exportRange.endDate}`;

    return {
      generatedBy: this.storageService.getEmpName() || this.storageService.getUsername() || 'System User',
      department,
      selectedEmployee: selectedEmployee?.employee_name || 'All Employees',
      reportTitle,
      filename: `${filenameBase}.${extension}`,
      monthlySummary: exportRange.monthlySummary,
      monthLabel: exportRange.monthLabel
    };
  }

  private sanitizeTicketExportPart(value: any): string {
    return `${value || 'ALL_DEPARTMENTS'}`
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase() || 'ALL_DEPARTMENTS';
  }

  private getSelectedDepartmentApiId(): any {
    const selectedDepartment = this.getSelectedDepartmentOption();

    return this.firstPresent(
      selectedDepartment?.id,
      selectedDepartment?.department_id,
      selectedDepartment?.departmentId,
      selectedDepartment?.dept_id,
      selectedDepartment?.deptid,
      this.selectedDepartmentId
    );
  }

  private getSelectedDepartmentOption(): any {
    return this.departments.find((department: any) => this.isSameId(department?.filter_id, this.selectedDepartmentId)) || null;
  }

  private getSelectedEmployeeOption(): any {
    return this.employees.find((employee: any) => this.isSameId(employee?.filter_id, this.selectedEmployeeId)) || null;
  }

  private getFilteredTicketRowsForExport(response: any): any[] {
    const tickets = this.normalizeTicketRows(response);
    return this.filterTicketRowsForExport(tickets);
  }

  private filterTicketRowsForExport(tickets: any[]): any[] {
    return this.filterTicketRows(tickets);
  }

  private filterTicketRows(tickets: any[]): any[] {
    const searchValue = `${this.searchTerm ?? ''}`.trim().toLowerCase();

    return (Array.isArray(tickets) ? tickets : []).filter((ticket: any) => {
      const matchesSearch = !searchValue || [
        ticket?.ticket_name,
        ticket?.code,
        ticket?.description,
        ticket?.assigned_from_name,
        ticket?.assigned_to_name,
        ticket?.company_name,
        ticket?.product_name,
        ticket?.department_name
      ].some((value: any) => `${value ?? ''}`.toLowerCase().includes(searchValue));

      const matchesStatus = this.selectedStatus === '' || this.statusesMatch(ticket?.status, this.selectedStatus);
      const matchesEmployee = this.ticketMatchesEmployee(ticket);
      const matchesDepartment = this.isRaisedTickets || this.ticketMatchesDepartment(ticket);

      return matchesSearch && matchesStatus && matchesEmployee && matchesDepartment;
    });
  }

  private buildTicketExcelSection(
    filters: any,
    tickets: any[],
    exportRange: { startDate: string; endDate: string }
  ): TableWorkbookExcelSection {
    const headers = [
      'S.No', 'Date', 'Day', 'Code', 'Ticket', 'Client', 'Product', 'Department',
      'Assigned From', 'Assigned To', 'Remarks', 'Worked Hrs', 'Entry Date', 'Status'
    ];

    const rows = this.buildTicketExcelCalendarRows(tickets, exportRange.startDate, exportRange.endDate);

    return {
      title: filters.reportTitle,
      reportTitle: filters.reportTitle,
      departmentName: filters.department,
      scopeLabel: 'Department',
      scopeName: filters.department,
      sheetName: 'Tickets',
      highlightSundayRows: true,
      summary: [
        ['Employee', filters.selectedEmployee],
        ['Total Tickets', tickets.length]
      ],
      headers,
      rows
    };
  }

  private buildTicketExcelCalendarRows(tickets: any[], startDate: string, endDate: string): any[][] {
    const groupedRows: Record<string, any[]> = {};

    for (const ticket of tickets) {
      const dateKey = this.getTicketExportDateKey(this.getTicketExportDateValue(ticket));
      if (!dateKey) {
        continue;
      }

      if (!groupedRows[dateKey]) {
        groupedRows[dateKey] = [];
      }
      groupedRows[dateKey].push(ticket);
    }

    const dateKeys = this.getTicketExportCalendarDateKeys(startDate, endDate, Object.keys(groupedRows));
    const rows: any[][] = [];

    for (const dateKey of dateKeys) {
      const ticketsForDate = groupedRows[dateKey] || [];

      if (!ticketsForDate.length) {
        rows.push([
          rows.length + 1,
          this.formatTicketExportDate(dateKey),
          this.getTicketExportDay(dateKey),
          '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'
        ]);
        continue;
      }

      for (const ticket of ticketsForDate) {
        const dateValue = this.getTicketExportDateValue(ticket);
        rows.push([
          rows.length + 1,
          this.formatTicketExportDate(dateKey),
          this.getTicketExportDay(dateKey),
          ticket?.code || '-',
          ticket?.ticket_name || '-',
          ticket?.company_name || '-',
          ticket?.product_name || '-',
          ticket?.department_name || '-',
          ticket?.assigned_from_name || '-',
          ticket?.assigned_to_name || '-',
          this.getTicketExportRemarks(ticket),
          this.firstPresent(ticket?.worked_hours, ticket?.workedHours, '-'),
          this.formatTicketExportDateTime(this.firstPresent(ticket?.created_date, ticket?.createdDate, dateValue)),
          this.firstPresent(ticket?.status, '-')
        ]);
      }
    }

    return rows;
  }

  private getTicketExportCalendarDateKeys(startDate: string, endDate: string, dataDateKeys: string[]): string[] {
    const start = this.parseTicketExportDate(startDate);
    const end = this.parseTicketExportDate(endDate);

    if (start && end && start.getTime() <= end.getTime()) {
      const keys: string[] = [];
      const cursor = new Date(start);

      while (cursor.getTime() <= end.getTime() && keys.length < 1500) {
        keys.push(this.formatDateToYMD(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }

      if (keys.length) {
        return keys;
      }
    }

    return [...new Set(dataDateKeys.filter(Boolean))]
      .sort((first: string, second: string) => first.localeCompare(second));
  }

  private getTicketExportDateValue(ticket: any): any {
    return this.firstPresent(
      ticket?.date,
      ticket?.work_date,
      ticket?.workDate,
      ticket?.ticket_date,
      ticket?.ticketDate,
      ticket?.created_date,
      ticket?.createdDate,
      ticket?.assigned_date,
      ticket?.assignedDate,
      ticket?.updated_date,
      ticket?.updatedDate,
      ticket?.entry_date,
      ticket?.entryDate
    );
  }

  private getTicketExportDateKey(value: any): string {
    const date = this.parseTicketExportDate(value);
    return date ? this.formatDateToYMD(date) : '';
  }

  private parseTicketExportDate(value: any): Date | null {
    if (value === null || value === undefined || `${value}`.trim() === '') {
      return null;
    }

    const text = `${value}`.trim();
    const ymdMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(text);
    if (ymdMatch) {
      return new Date(Number(ymdMatch[1]), Number(ymdMatch[2]) - 1, Number(ymdMatch[3]));
    }

    const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(text);
    if (dmyMatch) {
      return new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? null
      : new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private getTicketExportRemarks(ticket: any): string {
    const remarks = [
      ['Description', ticket?.description],
      ['Solution', ticket?.solution],
      ['Reason For Issue', ticket?.reason_f_issue || ticket?.reasonFIssue || ticket?.reason_for_issue]
    ]
      .filter(([, value]) => value !== null && value !== undefined && `${value}`.trim() !== '')
      .map(([label, value]) => `${label} : ${this.stripHtml(value)}`);

    return remarks.length ? remarks.join('\n') : '-';
  }

  private formatTicketExportDate(value: any): string {
    const date = this.parseTicketExportDate(value);
    if (!date) {
      return '-';
    }

    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  }

  private formatTicketExportDateTime(value: any): string {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
      return '-';
    }

    return `${this.formatTicketExportDate(value)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  }

  private getTicketExportDay(value: any): string {
    const date = this.parseTicketExportDate(value);
    return !date
      ? '-'
      : date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  }

  openTicketDetailsDialog(rowData: any): void {
    // Resolve role-scoped employee names again when opening a row so the detail
    // dialog also shows Assigned By when the API supplied only an employee ID.
    rowData = this.normalizeTicketRow(rowData);

    const priorityMap: any = {
      1: { text: "High", color: "#dc2626", bg: "#fee2e2" },
      2: { text: "Medium", color: "#d97706", bg: "#fef3c7" },
      3: { text: "Low", color: "#16a34a", bg: "#dcfce7" }
    };

    const status = this.getStatusDialogMeta(rowData.status);

    const priority = priorityMap[rowData.priority] || {
      text: "-",
      color: "#64748b",
      bg: "#f1f5f9"
    };

    const item = (title: string, value: any, icon: string) => `
      <div style="
        background: linear-gradient(180deg, var(--bg-card) 0%, var(--bg-elevated) 100%);
        border: 1px solid var(--border-card);
        border-radius: 12px;
        padding: 14px 16px;
        transition: all 0.2s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      ">
        <div style="
          color: var(--text-muted);
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          margin-bottom: 6px;
          letter-spacing: 0.05em;
        ">
          <i class="${icon}" style="margin-right: 6px; color: var(--text-active);"></i>
          ${title}
        </div>
        <div style="
          color: var(--text-main);
          font-size: 14px;
          font-weight: 600;
          word-break: break-word;
          line-height: 1.3;
        ">
          ${value || '-'}
        </div>
      </div>
    `;

    Swal.fire({
      width: "900px",
      showConfirmButton: false,
      showCloseButton: false,
      background: "transparent",
      padding: 0,

      html: `
    <div style="
      --header-text: var(--bg-card);

      text-align: left;
      background: linear-gradient(
        180deg,
        var(--overlay-bg) 0%,
        var(--bg-elevated) 100%
      );
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.18);
      border: 1px solid var(--overlay-border);
    ">

      <!-- ================= HEADER ================= -->

      <div style="
        padding: 24px 28px;
        background: var(--text-active);
        border-bottom: 1px solid color-mix(
          in srgb,
          var(--header-text) 12%,
          transparent
        );
        color: var(--header-text);
        position: relative;
        overflow: hidden;
      ">

        <!-- Decorative circle -->
        <div style="
          position: absolute;
          top: -56px;
          right: -24px;
          width: 160px;
          height: 160px;
          border-radius: 999px;
          background: color-mix(
            in srgb,
            var(--header-text) 10%,
            transparent
          );
        "></div>

        <!-- Decorative circle -->
        <div style="
          position: absolute;
          bottom: -70px;
          left: -12px;
          width: 180px;
          height: 180px;
          border-radius: 999px;
          background: color-mix(
            in srgb,
            var(--header-text) 8%,
            transparent
          );
        "></div>

        <!-- Close button -->
        <button
          type="button"
          class="ticket-dialog-close"
          style="
            position: absolute;
            top: 16px;
            right: 16px;
            width: 36px;
            height: 36px;
            border: 1px solid color-mix(
              in srgb,
              var(--header-text) 16%,
              transparent
            );
            border-radius: 999px;
            background: color-mix(
              in srgb,
              var(--header-text) 16%,
              transparent
            );
            color: var(--header-text);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition:
              background 0.2s ease,
              transform 0.2s ease;
            z-index: 2;
            backdrop-filter: blur(8px);
            font-size: 16px;
          "
        >
          <i class="ri-close-line"></i>
        </button>

        <!-- Header content -->
        <div style="
          padding-right: 48px;
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        ">

          <div style="
            min-width: 0;
            flex: 1;
          ">

            <!-- Support Ticket badge -->
            <div style="
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 4px 10px;
              border-radius: 999px;

              background: color-mix(
                in srgb,
                var(--header-text) 14%,
                transparent
              );

              border: 1px solid color-mix(
                in srgb,
                var(--header-text) 18%,
                transparent
              );

              font-size: 9px;
              font-weight: 800;
              letter-spacing: 0.1em;
              text-transform: uppercase;

              color: color-mix(
                in srgb,
                var(--header-text) 88%,
                transparent
              );

              margin-bottom: 8px;
            ">

              <span style="
                display: block;
                width: 6px;
                height: 6px;
                border-radius: 999px;
                background: var(--header-text);
              "></span>

              Support Ticket

            </div>

            <!-- Ticket title -->
            <h2 style="
              margin: 0 0 4px;
              font-size: 22px;
              font-weight: 800;
              line-height: 1.2;
              word-break: break-word;
              color: var(--header-text);
            ">
              ${this.escapeHtml(rowData.company_name || 'Untitled Ticket')}
            </h2>

          </div>

          <!-- Priority -->
          <div style="
            background: color-mix(
              in srgb,
              ${priority.color} 14%,
              var(--bg-card)
            );

            border: 1px solid color-mix(
              in srgb,
              ${priority.color} 28%,
              var(--border-card)
            );

            color: ${priority.color};

            padding: 8px 14px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 11px;
            white-space: nowrap;
            text-transform: uppercase;
            letter-spacing: 0.05em;

            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          ">
            ⚡ ${priority.text}
          </div>

        </div>

        <!-- Ticket code -->
        <p style="
          margin: 6px 0 0;
          opacity: 0.85;
          font-size: 12px;

          color: color-mix(
            in srgb,
            var(--header-text) 85%,
            transparent
          );

          position: relative;
          z-index: 1;
        ">
          ${this.escapeHtml(rowData.code || '-')}
        </p>

      </div>


      <!-- ================= BODY ================= -->

      <div style="
        padding: 20px 24px 24px;
        max-height: 72vh;
        overflow-y: auto;

        background:
          radial-gradient(
            circle at top right,
            color-mix(
              in srgb,
              var(--text-active) 10%,
              transparent
            ),
            transparent 26%
          ),

          linear-gradient(
            180deg,
            color-mix(
              in srgb,
              var(--bg-card) 84%,
              transparent
            ) 0%,
            var(--bg-elevated) 100%
          );
      ">


        <!-- Ticket information -->

        <div style="
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(200px, 1fr)
          );
          gap: 12px;
          margin-bottom: 16px;
        ">

          ${item(
        "Client",
        rowData.company_name,
        "ri-building-2-line"
      )}

          ${item(
        "Created Date",
        this.formatDate(rowData.created_date),
        "ri-calendar-2-line"
      )}

          ${item(
        "Worked Hours",
        rowData.worked_hours || "00:00",
        "ri-time-line"
      )}

          ${item(
        "Department",
        rowData.department_name,
        "ri-team-line"
      )}

          ${item(
        "Assigned By",
        rowData.assigned_from_name,
        "ri-user-3-line"
      )}

          ${item(
        "Assigned To",
        rowData.assigned_to_name,
        "ri-user-3-line"
      )}


          <!-- Status -->

          <div style="
            background: color-mix(
              in srgb,
              ${status.color} 14%,
              var(--bg-card)
            );

            border-radius: 12px;
            padding: 14px 16px;

            border: 1px solid color-mix(
              in srgb,
              ${status.color} 28%,
              var(--border-card)
            );

            box-shadow:
              0 1px 3px rgba(0, 0, 0, 0.05);
          ">

            <div style="
              font-size: 9px;
              font-weight: 700;
              color: var(--text-muted);
              margin-bottom: 6px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            ">

              <i
                class="ri-checkbox-circle-line"
                style="
                  margin-right: 6px;
                  color: ${status.color};
                "
              ></i>

              Status

            </div>

            <span style="
              color: ${status.color};
              font-weight: 800;
              font-size: 14px;
            ">
              ${status.text}
            </span>

          </div>

        </div>


        <!-- ================= DESCRIPTION ================= -->

        <div style="
          background: linear-gradient(
            180deg,
            var(--bg-card) 0%,
            var(--bg-elevated) 100%
          );

          border: 1px solid var(--border-card);
          border-radius: 12px;
          padding: 14px 16px;

          box-shadow:
            0 4px 12px rgba(15, 23, 42, 0.05);

          margin-bottom: 12px;
        ">

          <h4 style="
            margin: 0 0 3px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 0.08em;
          ">

            <i
              class="ri-file-text-line"
              style="
                margin-right: 6px;
                color: var(--text-active);
              "
            ></i>

            Description

          </h4>

          <p style="
            margin: 0;
            color: var(--text-main);
            line-height: 1.35;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 13px;
          ">
            ${this.escapeHtml(rowData.description) || 'No description'}
          </p>

        </div>


        <!-- ================= CLIENT COMMENTS ================= -->

        <div style="
          background: linear-gradient(
            180deg,
            var(--bg-card) 0%,
            var(--bg-elevated) 100%
          );

          border: 1px solid var(--border-card);
          border-radius: 12px;
          padding: 14px 16px;

          box-shadow:
            0 4px 12px rgba(15, 23, 42, 0.05);

          margin-bottom: 12px;
        ">

          <h4 style="
            margin: 0 0 3px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 0.08em;
          ">

            <i
              class="ri-chat-3-line"
              style="
                margin-right: 6px;
                color: var(--text-active);
              "
            ></i>

            Client Comments

          </h4>

          <p style="
            margin: 0;
            color: var(--text-main);
            line-height: 1.35;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 13px;
          ">
            ${this.escapeHtml(rowData.client_comments) || 'No comments'}
          </p>

        </div>


        <!-- ================= SOLUTION ================= -->

        <div style="
          background: linear-gradient(
            180deg,
            var(--bg-card) 0%,
            var(--bg-elevated) 100%
          );

          border: 1px solid var(--border-card);
          border-radius: 12px;
          padding: 14px 16px;

          box-shadow:
            0 4px 12px rgba(15, 23, 42, 0.05);

          margin-bottom: 12px;
        ">

          <h4 style="
            margin: 0 0 3px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 0.08em;
          ">

            <i
              class="ri-chat-3-line"
              style="
                margin-right: 6px;
                color: var(--text-active);
              "
            ></i>

            Solution

          </h4>

          <p style="
            margin: 0;
            color: var(--text-main);
            line-height: 1.35;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 13px;
          ">
            ${this.escapeHtml(rowData.solution) || 'No Solution'}
          </p>

        </div>

      </div>

    </div>
  `,

      didOpen: (popup) => {

        popup.style.setProperty(
          '--swal2-background',
          'transparent',
          'important'
        );

        const closeButton =
          popup.querySelector(
            '.ticket-dialog-close'
          ) as HTMLButtonElement | null;

        if (closeButton) {
          closeButton.addEventListener(
            'click',
            () => Swal.close()
          );
        }

      }
    });
  }

  private formatDate(date: any): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  private escapeHtml(text: any): string {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = `${text}`;
    return div.innerHTML;
  }

  handleActionClick(e: any, cell: any) {
    const row = cell.getRow();
    const data = row.getData();

    e.stopPropagation();
    const target = e.target.closest('button');
    if (!target) return;

    if (!this.canEditTicket(data)) {
      this.toasterService.error("You are Not Allowed.");
      return;
    }

    if (target.classList.contains('btn-edit')) {
      if (this.shouldOpenAssignTicketEdit(data)) {
        this.drawerService.open('assignticket', data);
      } else {
        this.drawerService.open('ticket', data);
      }
    } else if (target.classList.contains('btn-delete')) {
      Swal.fire({
        title: "Are you sure?",
        text: "Are you sure you want to Delete?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes, delete it!"
      }).then((result: any) => {
        if (result.isConfirmed) {
          this.authService.deleteTicket(data.id).subscribe({
            next: (res: any) => {
              this.toasterService.success(res?.message);
              this.getAllTickets();
            },
            error: (err: any) => {
              this.toasterService.error(err?.error?.message || 'Failed to delete ticket');
            }
          });
        }
      });
    }
  }

  private shouldShowActionsColumn(): boolean {
    return this.isRaisedTickets
      || !!this.storageService.roles?.isAdmin
      || !!this.storageService.roles?.isManager
      || !!this.storageService.roles?.isEmployee;
  }

  private canEditTicket(data: any): boolean {
    if (this.storageService.roles?.isAdmin || this.storageService.roles?.isManager) {
      return true;
    }

    const loggedInEmpId = this.storageService.getEmpId();
    const assignedFrom = this.getAssignedFromId(data);
    const assignedTo = this.getAssignedToId(data);

    if (this.storageService.roles?.isEmployee) {
      return this.isSameId(loggedInEmpId, assignedFrom)
        || this.isSameId(loggedInEmpId, assignedTo);
    }

    return this.isRaisedTickets;
  }

  private shouldOpenAssignTicketEdit(data: any): boolean {
    const loggedInEmpId = this.storageService.getEmpId();
    const assignedFrom = this.getAssignedFromId(data);
    const assignedTo = this.getAssignedToId(data);
    const isAssignedTicket = this.isReassignedTicket(data)
      || this.areDifferentIds(assignedFrom, assignedTo)
      || this.isReOpenTicketStatus(data?.status);

    if (this.storageService.roles?.isAdmin || this.storageService.roles?.isManager) {
      return isAssignedTicket;
    }

    return (this.isSameId(assignedFrom, loggedInEmpId)
      || this.isSameId(assignedTo, loggedInEmpId))
      && isAssignedTicket;
  }

  private isReassignedTicket(data: any): boolean {
    const value = this.firstPresent(data?.isreassign, data?.isReassign, data?.is_reassign);
    return value === true || value === 1 || String(value).trim().toLowerCase() === 'true';
  }

  private getAssignedFromId(data: any): any {
    return this.firstPresent(
      data?.assigned_from,
      data?.assignedFrom,
      data?.assigned_from_id,
      data?.assignedFromId
    );
  }

  private getAssignedToId(data: any): any {
    return this.firstPresent(
      data?.assigned_to,
      data?.assignedTo,
      data?.assigned_to_id,
      data?.assignedToId,
      data?.empId,
      data?.emp_id
    );
  }

  private firstPresent(...values: any[]): any {
    return values.find(value => this.isPresentScalar(value)) ?? null;
  }

  private firstPresentDisplay(...values: any[]): any {
    for (const value of values) {
      const displayValue = this.toDisplayScalar(value);
      if (displayValue !== null) {
        return displayValue;
      }
    }

    return null;
  }

  private toDisplayScalar(value: any, depth = 0): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (Array.isArray(value)) {
      return value.length === 1 ? this.toDisplayScalar(value[0], depth + 1) : null;
    }

    if (typeof value === 'object') {
      if (depth > 1) {
        return null;
      }

      const displayKeys = [
        'ticket_name',
        'ticketName',
        'ticket_title',
        'ticketTitle',
        'company_name',
        'companyName',
        'client_name',
        'clientName',
        'customer_name',
        'customerName',
        'product_name',
        'productName',
        'project_name',
        'projectName',
        'department_name',
        'departmentName',
        'dept_name',
        'deptName',
        'employee_name',
        'employeeName',
        'assigned_to_name',
        'assignedToName',
        'assigned_from_name',
        'assignedFromName',
        'description',
        'ticket_details',
        'ticketDetails',
        'comments',
        'remarks',
        'status_name',
        'statusName',
        'version',
        'type',
        'name',
        'title',
        'subject',
        'label',
        'text',
        'value'
      ];

      for (const key of displayKeys) {
        const displayValue = this.toDisplayScalar(value?.[key], depth + 1);
        if (displayValue !== null) {
          return displayValue;
        }
      }

      return null;
    }

    return this.isPresentScalar(value) ? value : null;
  }

  private isPresentScalar(value: any): boolean {
    if (value === null || value === undefined || Array.isArray(value)) {
      return false;
    }

    if (value instanceof Date) {
      return !Number.isNaN(value.getTime());
    }

    if (typeof value === 'object') {
      return false;
    }

    return `${value}`.trim() !== '';
  }

  private isSameId(first: any, second: any): boolean {
    if (first === null || first === undefined || second === null || second === undefined) {
      return false;
    }

    return String(first) === String(second);
  }

  private areDifferentIds(first: any, second: any): boolean {
    if (first === null || first === undefined || second === null || second === undefined) {
      return false;
    }

    return !this.isSameId(first, second);
  }

  filterByStatus() {
    this.applyFilters();
  }

  getStatus(): void {
    this.authService.getStatusList()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const list = Array.isArray(res) ? res : (res?.data ?? res?.statusList ?? []);
          this.statusList = list.map((status: any, index: number) => ({
            id: index,
            name: status
          }));
          this.statusEditorValues = this.statusList.map((s: any) => ({ label: s.name, value: String(s.name) }));
          this.allTickets = this.allTickets.map(ticket => ({
            ...ticket,
            status: this.getStatusName(ticket.status)
          }));
          this.applyFilters(false);
          this.renderTicketsToTable();
          this.refreshStatusColumn();
        },
        error: (err: any) => {
          console.error('Get status error:', err);
        }
      });
  }
  private refreshStatusColumn(): void {
    if (!this.table) return;
    const definitionPatch = {
      editorParams: (cell: any) => this.getStatusEditorParams(cell)
    };
    try {
      this.table.updateColumnDefinition('status', definitionPatch);
    } catch {
      const col = this.table.getColumn?.('status');
      col?.updateDefinition?.(definitionPatch);
    }
  }
  private getStatusEditorParams(cell: any): any {
    const rowData = cell.getRow().getData();
    const loggedInEmpId = this.storageService.getEmpId();
    const isAdmin = this.storageService.roles?.isAdmin;
    const assignedFrom = this.getAssignedFromId(rowData);
    const assignedTo = this.getAssignedToId(rowData);

    // Full list: admin, the assigner, or when assigned_from === assigned_to.
    const canSeeClosed = isAdmin
      || this.isSameId(loggedInEmpId, assignedFrom)
      || this.isSameId(assignedFrom, assignedTo);
    const values = canSeeClosed
      ? this.statusEditorValues
      : this.statusEditorValues.filter((value: any) => !this.isClosedTicketStatus(value.label));

    return {
      values,
      autocomplete: true,
      listOnEmpty: true,
      clearable: true
    };
  }

  private updateTicketStatus(ticket: any, cell: any): void {
    const assignedTo = this.firstPresent(
      ticket?.assigned_to,
      ticket?.assignedTo,
      ticket?.assigned_to_id,
      ticket?.assignedToId
    );
    const payload = { ...ticket, username: this.storageService.getUsername() };

    const assignedDate = this.firstPresent(ticket?.assigned_date, ticket?.assignedDate);
    if (assignedDate !== null) {
      payload.assigned_date = this.formatTicketAssignedDate(assignedDate);
    }

    // `empId` can contain the logged-in admin's ID. For an update, always keep
    // the ticket's existing/selected assignee and never default it to the admin.
    delete payload.empId;
    delete payload.emp_id;

    if (assignedTo !== null) {
      payload.assigned_to = assignedTo;
      payload.empId = assignedTo;
    }

    this.authService.updateTicket(payload).subscribe({
      next: (res: any) => {
        this.toasterService.success(res?.message || 'Ticket updated');
        this.getAllTickets();
      },
      error: (err: any) => {
        cell.restoreOldValue();
        this.toasterService.error(err?.error?.message || 'Unable to update ticket');
      }
    });
  }

  private formatTicketAssignedDate(value: any): any {
    // Date-only values are already in the format expected by the API. Keep
    // them as-is to avoid interpreting them as UTC and shifting their day.
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      return value.trim();
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
