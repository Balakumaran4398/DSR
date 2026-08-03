import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { LoaderService } from 'src/app/_core/services/loader.service';
import { PdfService } from 'src/app/_core/services/pdf.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import Swal from 'sweetalert2';
declare const Tabulator: any;
@Component({
  selector: 'app-tickets',
  templateUrl: './tickets.component.html',
  styleUrls: ['./tickets.component.scss']
})
export class TicketsComponent {

  @ViewChild('tableDiv') tableDiv!: ElementRef;
  @Input() isRaisedTickets = false;

  private table: any;
  private destroy$ = new Subject<void>();
  canSelectEmployee = false;
  searchTerm: any = '';
  selectedStatus = '';
  tickets: any[] = [];
  allTickets: any[] = [];
  employees: any[] = [];
  dept: any[] = [];
  statusList: any[] = [];
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

  hasViewedPdf = false;

  constructor(
    private drawerService: DrawerService,
    private authService: AuthService,
    private toasterService: ToasterService,
    private storageService: StorageService,
    private pdfService: PdfService,
    private loaderService: LoaderService,
  ) {
    const roles = this.storageService.roles;

    this.canSelectEmployee = !(roles?.isEmployee);
  }

  ngOnInit() {
    this.role = this.storageService.getRoleNames();
    this.userId = this.storageService.getUserId();
    this.empId = this.storageService.getEmpId();

    this.setDefaultDateRange();

    this.listenForDrawerActions();
    this.getStatus();
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
    this.authService.getAllTickets(this.empId, this.userId, this.startDate, this.endDate).subscribe({
      next: (res: any[]) => {
        const processedData = res.map(ticket => ({
          ...ticket,
          version: ticket.version && String(ticket.version).trim() !== '' ? ticket.version : '-'
        }));
 
        this.allTickets = this.isRaisedTickets
          ? processedData.filter(ticket => ticket.status !== 4)
          : processedData;
 
        console.log(processedData);
        this.tickets = [...this.allTickets];
 
        if (!this.table) {
          setTimeout(() => this.initializeTable(), 100);
        } else {
          this.table.setData(this.tickets);
        }
      },
      error: (err: any) => {
        this.toasterService.error('Failed to load tickets');
        console.error('Error loading tickets:', err);
      }
    });
  }
 

  onRangeChange(event: { startDate: Date; endDate: Date }): void {
    const nextStartDate = this.formatDateToYMD(event.startDate);
    const nextEndDate = this.formatDateToYMD(event.endDate);

    this.startDate = nextStartDate;
    this.endDate = nextEndDate;
    this.initialStartDate = this.startDate;
    this.initialEndDate = this.endDate;

    this.getAllTickets();
  }

  initializeTable() {
    if (this.table) {
      this.table.destroy();
    }
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.tickets,
      layout: "fitData",
      pagination: "local",
      paginationSize: 15,
      paginationCounter: "rows",
      movableColumns: true,
      maxHeight: "800px",
      selectable: true,
      editTriggerEvent: "dblclick",
      paginationSizeSelector: [10, 15, 25, 50, 100],
      placeholder: "No Tickets Found",

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
          frozen: true,
          minWidth: 230,
          formatter: (cell: any) => {
            const row = cell.getRow().getData();
            const code = this.escapeHtml(row.code || '-');

            return `
              <div class="flex items-center justify-between w-full group relative pr-24">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-col">
                    <span class="font-medium text-gray-900 text-m leading-relaxed break-words">${code}</span>
                  </div>
                </div>
                <div class="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 transform translate-x-2 group-hover:translate-x-0">
                  <button class="view-btn bg-white border border-gray-200 shadow-sm px-2.5 py-1 rounded-md hover:bg-gray-50 text-[var(--text-active)] hover:text-[var(--text-active)]-700 focus:outline-none flex items-center gap-1.5">
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
          minWidth: 200,
        },
        {
          title: "Client",
          field: "company_name",
          width: 190,
        },
 {
          title: "Product",
          field: "product_name",
          width: 190, valueFormatter: (params: any) => {
            return params.value && params.value.trim() !== '' ? params.value : '-';
          }
        },
        {
          title: "Product version",
          field: "version",
          width: 190, valueFormatter: (params: any) => {
            return params.value && params.value.trim() !== '' ? params.value : '-';
          }
        },
        {
          title: "Product Type",
          field: "type",
          width: 190, valueFormatter: (params: any) => {
            return params.value && params.value.trim() !== '' ? params.value : '-';
          }
        },
        {
          title: "Assigned From",
          field: "assigned_from_name",
          minWidth: 170,
        },
        {
          title: "Assigned to",
          field: "assigned_to_name",
          minWidth: 170,
        },
        {
          title: "Status",
          field: "status",
          width: 140,
          hozAlign: "left",
          formatter: (cell: any) => {
            const value = Number(cell.getValue());
            const map: Record<number, { text: string; cls: string }> = {
              0: { text: "Open", cls: "bg-pink-100 text-pink-700" },
              1: { text: "In-Progress", cls: "bg-blue-100 text-blue-700" },
              2: { text: "To-be-Tested", cls: "bg-amber-100 text-amber-700" },
              3: { text: "Delayed", cls: "bg-purple-100 text-purple-700" },
              4: { text: "Closed", cls: "bg-slate-200 text-slate-700" },
              5: { text: "Cancelled", cls: "bg-red-100 text-red-700" },
              6: { text: "Approved", cls: "bg-green-100 text-green-700" },
              7: { text: "Completed", cls: "bg-emerald-100 text-emerald-700" },
              8: { text: "Rejected", cls: "bg-red-100 text-red-700" },
              9: { text: "Failed", cls: "bg-red-100 text-red-700" },
              10: { text: "Passed", cls: "bg-green-100 text-green-700" },
            };

            const s = map[value] ?? {
              text: "Unknown",
              cls: "bg-gray-100 text-gray-700"
            };
            return `
              <span class="px-2 py-1 text-center rounded-full text-xs font-semibold ${s.cls}">
                ${s.text}
              </span>
            `;
          }
        },
        {
          title: "Created Date",
          field: "created_date",
          width: 150,
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
          width: 250,
          formatter: (cell: any) => {
            const value = cell.getValue() || "";
            return `
              <div class="flex items-center h-full">
                <span class="text-m text-black truncate max-w-full cursor-help" title="${value}">
                  ${value || '-'}
                </span>
              </div>
            `;
          }
        },
        ...(this.isRaisedTickets
          ? [{
            title: "Actions",
            field: "actions",
            width: 120,
            frozen: true,
            headerSort: false,
            hozAlign: "center",
            cssClass: "sticky-col-right",
            formatter: () => `
            <div class="flex items-center justify-center gap-3 w-full h-full">
              <button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit" title="Edit">
                <i class="ri-pencil-line text-lg pointer-events-none"></i>
              </button>
              <button class="text-slate-400 hover:text-red-600 transition-colors btn-delete" title="Delete">
                <i class="ri-delete-bin-line text-lg pointer-events-none"></i>
              </button>
            </div>
          `,
            cellClick: (e: any, cell: any) => {
              this.handleActionClick(e, cell);
            }
          }]
          : [])
      ],
    });

    attachTabulatorPaginationPersistence(
      this.table,
      buildTabulatorPaginationKey("ticket-table")
    );
    this.table.on("rowSelectionChanged", (data: any[], rows: any[]) => {
      this.selectedCount = rows.length;
      this.showBar = this.selectedCount > 0;

      if (!this.showBar) {
        this.showMoveMenu = false;
      }
    });
  }

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value.trim();

    if (!this.table) return;

    this.table.clearFilter(true);

    if (this.searchTerm) {
      this.table.addFilter([
        [
          { field: 'ticket_name', type: 'like', value: this.searchTerm },
          { field: 'code', type: 'like', value: this.searchTerm },
          { field: 'description', type: 'like', value: this.searchTerm },
          { field: 'assigned_from_name', type: 'like', value: this.searchTerm },
          { field: 'assigned_to_name', type: 'like', value: this.searchTerm },
        ]
      ]);
    }

    if (this.selectedStatus) {
      this.table.addFilter(
        "status",
        "=",
        Number(this.selectedStatus)
      );
    }
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
    return (
      !!this.startDate &&
      !!this.endDate &&
      new Date(this.startDate) <= new Date(this.endDate) &&
      this.tickets.length > 0
    );
  }
  generateTicketsPdf(): void {
    if (!this.canDownloadPdf) {
      this.toasterService.error('Please select a date range first');
      return;
    }

    this.loaderService.show();

    const filters = {
      generatedBy: this.storageService.getEmpName() || this.storageService.getUsername(),
    };

    try {
      this.pdfService.generateTicketsPDF(
        filters,
        this.startDate,
        this.endDate,
        this.tickets,
        'download'
      );

      setTimeout(() => {
        this.loaderService.hide();
        this.toasterService.success('PDF downloaded successfully');
      }, 3000);

    } catch (error) {
      console.error('PDF generation error:', error);
      this.loaderService.hide();
      this.toasterService.error('Failed to generate PDF');
    }
  }

  openTicketDetailsDialog(rowData: any): void {
    console.log("Dialog mapped data:", rowData);

    const statusMap: any = {
      0: { text: "Open", color: "#030303ff", bg: "#9d9ba0ff" },
      1: { text: "In-Progress", color: "#2563eb", bg: "#dbeafe" },
      2: { text: "To-be-Tested", color: "#d97706", bg: "#fef3c7" },
      3: { text: "Delayed", color: "#7c3aed", bg: "#ede9fe" },
      4: { text: "Closed", color: "#475569", bg: "#f1f5f9" },
      5: { text: "Cancelled", color: "#fa2323", bg: "#fadad1" },
      6: { text: "Approved", color: "#059669", bg: "#cbfec7" },
      7: { text: "Completed", color: "#059669", bg: "#cbfec7" },
      8: { text: "Rejected", color: "#fa2323", bg: "#fadad1" },
      9: { text: "Failed", color: "#fa2323", bg: "#fadad1" },
      10: { text: "Passed", color: "#059669", bg: "#cbfec7" },
    };

    const priorityMap: any = {
      1: { text: "High", color: "#dc2626", bg: "#fee2e2" },
      2: { text: "Medium", color: "#d97706", bg: "#fef3c7" },
      3: { text: "Low", color: "#16a34a", bg: "#dcfce7" }
    };

    const status = statusMap[rowData.status] || {
      text: "-",
      color: "#64748b",
      bg: "#f1f5f9"
    };

    const priority = priorityMap[rowData.priority] || {
      text: "-",
      color: "#64748b",
      bg: "#f1f5f9"
    };

    const item = (title: string, value: any, icon: string) => `
      <div style="
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 14px 16px;
        transition: all 0.2s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      ">
        <div style="
          color: #64748b;
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
          color: #0f172a;
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
          text-align: left;
          background: linear-gradient(180deg, #eef6ff 0%, #f8fafc 100%);
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 24px 80px rgba(15, 23, 42, 0.18);
          border: 1px solid #dbe3f0;
        ">

          <div style="
            padding: 24px 28px;
            background: var(--text-active);
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            color: white;
            position: relative;
            overflow: hidden;
          ">
            <div style="
              position: absolute;
              top: -56px;
              right: -24px;
              width: 160px;
              height: 160px;
              border-radius: 999px;
              background: rgba(255, 255, 255, 0.10);
            "></div>
            <div style="
              position: absolute;
              bottom: -70px;
              left: -12px;
              width: 180px;
              height: 180px;
              border-radius: 999px;
              background: rgba(255, 255, 255, 0.08);
            "></div>
            
            <button type="button" class="ticket-dialog-close" style="
              position: absolute;
              top: 16px;
              right: 16px;
              width: 36px;
              height: 36px;
              border: 1px solid rgba(255, 255, 255, 0.16);
              border-radius: 999px;
              background: rgba(255, 255, 255, 0.16);
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              transition: background 0.2s ease, transform 0.2s ease;
              z-index: 2;
              backdrop-filter: blur(8px);
              font-size: 16px;
            ">
              <i class="ri-close-line"></i>
            </button>

            <div style="
              padding-right: 48px;
              position: relative;
              z-index: 1;
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 16px;
            ">
              <div style="min-width: 0; flex: 1;">
                <div style="
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                  padding: 4px 10px;
                  border-radius: 999px;
                  background: rgba(255, 255, 255, 0.14);
                  border: 1px solid rgba(255, 255, 255, 0.18);
                  font-size: 9px;
                  font-weight: 800;
                  letter-spacing: 0.1em;
                  text-transform: uppercase;
                  color: rgba(255, 255, 255, 0.88);
                  margin-bottom: 8px;
                ">
                  <span style="display: block; width: 6px; height: 6px; border-radius: 999px; background: #ffffff;"></span>
                  Support Ticket
                </div>
                <h2 style="
                  margin: 0 0 4px;
                  font-size: 22px;
                  font-weight: 800;
                  line-height: 1.2;
                  word-break: break-word;
                  color: #ffffff;
                ">
                  ${this.escapeHtml(rowData.company_name || 'Untitled Ticket')}
                </h2>
              </div>

              <div style="
                background: ${priority.bg};
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

            <p style="
              margin: 6px 0 0;
              opacity: 0.85;
              font-size: 12px;
              color: rgba(255, 255, 255, 0.85);
              position: relative;
              z-index: 1;
            ">
              ${this.escapeHtml(rowData.code || '-')}
            </p>
          </div>

          <div style="
            padding: 20px 24px 24px;
            max-height: 72vh;
            overflow-y: auto;
            background: 
              radial-gradient(circle at top right, rgba(59, 130, 246, 0.08), transparent 26%),
              linear-gradient(180deg, rgba(255, 255, 255, 0.68) 0%, rgba(248, 250, 252, 0.96) 100%);
          ">

            <div style="
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 12px;
              margin-bottom: 16px;
            ">
              ${item("Client", rowData.company_name, "ri-building-2-line")}
              ${item("Created Date", this.formatDate(rowData.created_date), "ri-calendar-2-line")}
              ${item("Worked Hours", rowData.worked_hours || "00:00", "ri-time-line")}
              ${item("Department", rowData.department_name, "ri-team-line")}
              ${item("Assigned By", rowData.assigned_from_name, "ri-user-3-line")}
              ${item("Assigned To", rowData.assigned_to_name, "ri-user-3-line")}
              
              <div style="
                background: ${status.bg};
                border-radius: 12px;
                padding: 14px 16px;
                border: 1px solid rgba(59, 130, 246, 0.12);
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
              ">
                <div style="
                  font-size: 9px;
                  font-weight: 700;
                  color: #64748b;
                  margin-bottom: 6px;
                  text-transform: uppercase;
                  letter-spacing: 0.05em;
                ">
                  <i class="ri-checkbox-circle-line" style="margin-right: 6px; color: ${status.color};"></i>
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

            <div style="
              background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
              border: 1px solid rgba(59, 130, 246, 0.12);
              border-radius: 12px;
              padding: 14px 16px;
              box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
              margin-bottom: 12px;
            ">
              <h4 style="
                margin: 0 0 3px;
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
                color: #64748b;
                letter-spacing: 0.08em;
              ">
                <i class="ri-file-text-line" style="margin-right: 6px; color: var(--text-active);"></i>
                Description
              </h4>
              <p style="
                margin: 0;
                color: #1e293b;
                line-height: 1.35;
                white-space: pre-wrap;
                word-break: break-word;
                font-size: 13px;
              ">
                ${this.escapeHtml(rowData.description) || 'No description'}
              </p>
            </div>

            <div style="
              background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
              border: 1px solid rgba(59, 130, 246, 0.12);
              border-radius: 12px;
              padding: 14px 16px;
              box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
              margin-bottom: 12px;
            ">
              <h4 style="
                margin: 0 0 3px;
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
                color: #64748b;
                letter-spacing: 0.08em;
              ">
                <i class="ri-chat-3-line" style="margin-right: 6px; color: var(--text-active);"></i>
                Client Comments
              </h4>
              <p style="
                margin: 0;
                color: #1e293b;
                line-height: 1.35;
                white-space: pre-wrap;
                word-break: break-word;
                font-size: 13px;
              ">
                ${this.escapeHtml(rowData.client_comments) || 'No comments'}
              </p>
            </div>

            <div style="
              background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
              border: 1px solid rgba(59, 130, 246, 0.12);
              border-radius: 12px;
              padding: 14px 16px;
              box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
              margin-bottom: 12px;
            ">
              <h4 style="
                margin: 0 0 3px;
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
                color: #64748b;
                letter-spacing: 0.08em;
              ">
                <i class="ri-chat-3-line" style="margin-right: 6px; color: var(--text-active);"></i>
                Solution
              </h4>
              <p style="
                margin: 0;
                color: #1e293b;
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
        popup.style.setProperty('--swal2-background', 'transparent', 'important');
        const closeButton = popup.querySelector('.ticket-dialog-close') as HTMLButtonElement | null;
        if (closeButton) {
          closeButton.addEventListener('click', () => Swal.close());
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

  private escapeHtml(text: string): string {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  handleActionClick(e: any, cell: any) {
    const row = cell.getRow();
    const data = row.getData();

    const loggedInEmpId = this.storageService.getEmpId();
    const isEmployee = this.storageService.roles?.isEmployee;
    const isAssignedUser = loggedInEmpId === data.emp_id || loggedInEmpId === data.assigned_from;
    if (isEmployee && !isAssignedUser) {
      this.toasterService.error("You are Not Allowed.");
      return;
    }

    e.stopPropagation();
    const target = e.target.closest('button');
    if (!target) return;

    if (target.classList.contains('btn-edit')) {
      if (this.role.includes('ROLE_MANAGER') || this.role.includes('ROLE_ADMIN')) {
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

  filterByStatus() {
    if (!this.table) return;
    this.table.clearFilter(true);
    if (this.searchTerm) {
      this.table.addFilter([
        [
          { field: 'ticket_name', type: 'like', value: this.searchTerm },
          { field: 'code', type: 'like', value: this.searchTerm },
          { field: 'description', type: 'like', value: this.searchTerm },
          { field: 'assigned_from_name', type: 'like', value: this.searchTerm },
          { field: 'assigned_to_name', type: 'like', value: this.searchTerm },
        ]
      ]);
    }

    if (this.selectedStatus) {
      this.table.addFilter("status", "=", Number(this.selectedStatus));
    }
  }

  getStatus(): void {
    this.authService.getStatusList().subscribe({
      next: (res: any[]) => {
        this.statusList = res.map((status, index) => ({
          id: index,
          name: status
        }));
      },
      error: (err: any) => {
        console.error('Get status error:', err);
      }
    });
  }
}


