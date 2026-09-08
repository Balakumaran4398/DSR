import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, finalize, map, min, Observable, startWith } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { PdfService } from 'src/app/_core/services/pdf.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { TransientViewStateService } from 'src/app/_core/services/transient-view-state.service';
import { OverviewTaskViewDialogComponent } from './overview-task-view-dialog/overview-task-view-dialog.component';
declare const Tabulator: any;
declare const luxon: any;

interface OverviewTaskViewState {
  tableData: any[];
  projectList: any[];
  employeeList: any[];
  phaseList: any[];
  statusList: any[];
  currentView: string;
  startDate: string | null;
  endDate: string | null;
  selectedEmpId: number;
  selectedEmployeeName: string;
  searchTerm: string;
  page: number;
  pageSize: number;
}

@Component({
  selector: 'app-overview-task',
  templateUrl: './overview-task.component.html',
  styleUrls: ['./overview-task.component.scss']
})
export class OverviewTaskComponent implements AfterViewInit, OnDestroy {
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
  myControl = new FormControl<string>('');
  filteredOptions!: Observable<any[]>;
  private pendingStateRestore = false;
  private isRestoringTableState = false;
  private suppressInitialRangeFetch = false;
  private pendingTableRedraw: number | null = null;
  private taskTableLoadRunId = 0;
  private taskPdfPreviewLoadRunId = 0;
  hasViewedPdf = false;
  private previewedOverviewPdfRequest: {
    filters: any;
    startDate: any;
    endDate: any;
    data: any[];
  } | null = null;
  startDate: any = null;
  endDate: any = null;
  selected_emp_id: any = 0;
  searchTerm = '';
  initialStartDate: string | null = null;
  initialEndDate: string | null = null;
  selectedEmployeeName = '';
  kanbanInitialized = false;
  tableLoading = false;
  pdfPreviewLoading = false;
  pdfDownloadLoading = false;
  updatingTaskId: number | null = null;
  constructor(private authService: AuthService, private route: ActivatedRoute, private router: Router, private toasterService: ToasterService, private storageService: StorageService, private drawerService: DrawerService, private transientViewStateService: TransientViewStateService, private pdfService: PdfService, private dialog: MatDialog) {
    this.empid = this.storageService.getEmpId();
    this.restoreViewState();
    if (!this.startDate || !this.endDate) {
      this.setCurrentMondayToSaturdayRange();
    }
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
    if (this.currentView === id) {
      return;
    }

    if (id === 'kanban') {
      this.kanbanInitialized = true;
    }

    this.currentView = id;
    console.log("hi from setActiveTab");
    
    sessionStorage.setItem('currentView',id);
    this.saveViewState();

    if (id === 'table') {
      this.ensureTableReady();
    }
  }

  getTaskOverviewByEmp(callback?: (data: any[]) => void) {
    if (this.destroyed) return;
    const isPreviewRequest = !!callback;
    const loadRunId = isPreviewRequest
      ? ++this.taskPdfPreviewLoadRunId
      : ++this.taskTableLoadRunId;
    const payload = {
      employee_id: this.empid,
      selected_emp_id: this.selected_emp_id,
      fromdate: this.startDate,
      todate: this.endDate
    };

    if (isPreviewRequest) {
      this.pdfPreviewLoading = true;
    } else {
      this.tableLoading = true;
      this.setTableInlineLoading(true, 'Loading time logs...');
    }

    this.authService.getTaskOverviewByEmp(payload)
      .pipe(finalize(() => {
        if (isPreviewRequest) {
          if (loadRunId === this.taskPdfPreviewLoadRunId) {
            this.pdfPreviewLoading = false;
          }
          return;
        }

        if (loadRunId === this.taskTableLoadRunId) {
          this.tableLoading = false;
          this.setTableInlineLoading(false);
        }
      }))
      .subscribe({
        next: (res: any) => {
          if (!isPreviewRequest && loadRunId !== this.taskTableLoadRunId) {
            return;
          }

          const normalized = Array.isArray(res) ? res : res ? [res] : [];
          this.tableData = normalized;

          if (this.table) {
            this.safeReplaceData(this.table, this.tableData);
            this.applySearchFilter();
          }
          if (!callback) {
            this.resetPdfPreviewState();
          }
          this.saveViewState();
          callback?.(normalized);
        },
        error: (err: any) => {
          if (!isPreviewRequest && loadRunId !== this.taskTableLoadRunId) {
            return;
          }

          if (!callback) {
            this.tableData = [];
            if (this.table) {
              this.safeReplaceData(this.table, this.tableData);
              this.applySearchFilter();
            }
          }
          this.toasterService.error(err?.error?.message || 'Unable to load task overview.');
        }
      });
  }

  generateOverviewPdf() {
    if (!this.previewedOverviewPdfRequest || this.pdfDownloadLoading) {
      return;
    }

    this.pdfDownloadLoading = true;
    setTimeout(() => {
      try {
        this.pdfService.generateOverviewPDF(
          this.previewedOverviewPdfRequest!.filters,
          this.previewedOverviewPdfRequest!.startDate,
          this.previewedOverviewPdfRequest!.endDate,
          this.previewedOverviewPdfRequest!.data,
          'download'
        );
      } finally {
        this.pdfDownloadLoading = false;
      }
    }, 0);
  }

  previewOverviewPdf() {
    if (this.pdfPreviewLoading) return;

    this.getTaskOverviewByEmp((data: any[]) => {
      const request = {
        filters: {
          generatedBy: this.storageService.getEmpName() || this.storageService.getUsername(),
          filteredEmployee: this.selectedEmployeeName
        },
        startDate: this.startDate,
        endDate: this.endDate,
        data
      };

      this.previewedOverviewPdfRequest = request;
      this.pdfService.generateOverviewPDF(
        request.filters,
        request.startDate,
        request.endDate,
        request.data,
        'preview'
      );
      this.hasViewedPdf = true;
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
        if (this.pendingStateRestore) {
          this.setupEmployeeAutocomplete();
          this.syncSelectedEmployeeControl();
          this.restoreTableState();
        } else {
          this.loadData({ target: { value: this.projectid } });
        }

      }
    }, 50);
    this.drawerService.drawerAction$
      .pipe(filter(a => a.source === 'task'))
      .subscribe(() => { this.getTaskOverviewByEmp() });
  }

  ngOnDestroy(): void {
    this.saveViewState();
    this.destroyed = true;

    if (this.tableCheckInterval) {
      clearInterval(this.tableCheckInterval);
      this.tableCheckInterval = null;
    }

    if (this.pendingTableRedraw !== null) {
      cancelAnimationFrame(this.pendingTableRedraw);
      this.pendingTableRedraw = null;
    }

    const tableToDestroy = this.table;
    this.setTableInlineLoading(false);
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
    const freezeColumns = !this.isCompactViewport();
    this.table = new Tabulator(tableDiv, {
      data: this.tableData,
      layout: "fitDataStretch",
      responsiveLayout: false,
      pagination: "local",
      paginationSize: 10,
      paginationCounter: "rows",
      movableColumns: true,
      selectable: true,
      editTriggerEvent: "dblclick",
      paginationSizeSelector: [10, 15, 25, 30, 50, 100],
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
          title: "Task Name",
          field: "task",
          width: 500,
          widthGrow: 0.8,
          minWidth: 380,
          frozen: freezeColumns, // Freeze the Project column on desktop only
          editor: "textarea",
          formatter: (cell: any) => {
            const data = cell.getData();
            const taskTitle = this.escapeHtml(data.task || 'Untitled task');
            return `
                <div class="flex items-center justify-between w-full group relative pr-32">
                    <div class="flex  gap-2">
                        <div class="text-[var(--text-active)] text-lg font-semibold">
                            <i class="ri-folder-3-line"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="font-medium text-gray-900 text-m leading-relaxed break-words">${taskTitle}</span>
                        </div>
                    </div>
                    <div class="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-x-2 group-hover:translate-x-0 z-10">
                        <button class="task-row-btn open-task-btn bg-[var(--text-active)] text-white border border-[var(--text-active)] shadow-sm px-2.5 py-1 rounded-md hover:brightness-95 focus:outline-none flex items-center gap-1.5" type="button">
                            <span class="text-[10px] font-semibold uppercase tracking-wide">Open</span>
                            <i class="ri-arrow-right-up-line text-xs"></i>
                        </button>
                        <button class="task-row-btn view-task-btn bg-white border border-gray-200 shadow-sm px-2.5 py-1 rounded-md hover:bg-gray-50 text-slate-700 focus:outline-none flex items-center gap-1.5" type="button">
                            <span class="text-[10px] font-semibold uppercase tracking-wide">View</span>
                            <i class="ri-eye-line text-xs"></i>
                        </button>
                    </div>
                </div>
                `;
          },
          cellClick: (e: any, cell: any) => {
            const actionButton = e.target.closest('.task-row-btn');
            if (actionButton) {
              e.stopPropagation();
              const rowData = cell.getRow().getData();
              if (actionButton.classList.contains('view-task-btn')) {
                this.openTaskPreview(rowData);
                return;
              }
              this.persistNavigationDateRange(rowData);
              this.router.navigate([`/main/projects/project-content/${rowData.projectid}/${rowData.id}`]);
            }
          }
        },
        {
          title: "Owner",
          field: "assigned_from_name",
          minWidth: 200,
        },
        {
          title: "Assignee",
          field: "assigned_to",
          minWidth: 200,
          editor: "list",
          editorParams: {
            values: this.ownerEditorValues,
            autocomplete: true,
            listOnEmpty: true,
            clearable: true
          },
          formatter: (cell: any) => {
            const raw = cell.getValue();
            const rowData = cell.getRow?.().getData?.() ?? cell.getData?.() ?? {};
            const id =
              raw && typeof raw === 'object'
                ? (raw.id ?? raw.value ?? raw.employee_id ?? raw.employeeid ?? raw.employeeId ?? null)
                : raw;
            const key = id === null || id === undefined ? '' : String(id);
            const resolvedName = key ? this.ownerLookup[key] : '';
            const fallbackName = rowData?.assigned_to_name ?? rowData?.employee_name ?? rowData?.owner_name ?? '';
            const displayName = resolvedName || fallbackName || (this.ownerIndexReady ? '-' : 'Loading...');

            const initials =
              displayName && displayName !== 'Loading...' && displayName !== '-'
                ? String(displayName)
                  .split(' ')
                  .filter(Boolean)
                  .map((n: string) => n[0])
                  .join('')
                  .substring(0, 2)
                  .toUpperCase()
                : '--';

            return `
                <div class="flex items-center gap-2">
                    <div class="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-600">${initials}</div>
                    <span class="text-m">${displayName}</span>
                </div>
                `;
          }
        },
        // Status & Priority
        {
          title: "Status",
          field: "status",
          editor: "list",
          minWidth: 150,
          editorParams: {
            values: this.statusEditorValues,
            autocomplete: true,
            listOnEmpty: true,
            clearable: true
          },
          formatter: (cell: any) => {
            const val = this.getStatusDisplayValue(cell.getValue());
            const safeValue = this.escapeHtml(val);
            return val
              ? `<span class="overview-status-pill ${this.getOverviewStatusPillClass(val)}" title="${safeValue}">${safeValue}</span>`
              : '';
          }
        },
        { title: "Start Date", field: "start_date", width: 120 },
        { title: "End Date", field: "end_date", width: 120, editor: 'date' },
        {
          title: "Timeline",
          field: "end_date",
          minWidth: 150,
          formatter: (cell: any) => {
            const val = cell.getValue();

            if (!val) return "";

            const endDate = new Date(val);
            const today = new Date();
            // Reset time to start of day for accurate comparison
            today.setHours(0, 0, 0, 0);
            endDate.setHours(0, 0, 0, 0);

            const diffTime = endDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let text = "";
            let colorClass = "";

            if (diffDays < 0) {
              text = `Ended ${Math.abs(diffDays)} days ago`;
              colorClass = "text-red-500";
            } else if (diffDays === 0) {
              text = "Ends today";
              colorClass = "text-amber-600 font-bold";
            } else if (diffDays === 1) {
              text = "1 day left";
              colorClass = "text-amber-600 font-bold";
            } else {
              text = `${diffDays} days left`;
              colorClass = diffDays < 5 ? "text-amber-600" : "text-blue-600";
            }

            return `
                    <div class="flex flex-col justify-center h-full">
                        <span class="text-m font-semibold ${colorClass} leading-tight">${text}</span>
                    </div>
                `;
          }
        },
        {
          title: "Progress",
          field: "tasks_done",
          minWidth: 150,
          formatter: (cell: any) => {
            const data = cell.getData();
            const total = data.tasks_done + data.tasks_pending;
            const pct = data.completion_percentage

            // Color logic
            let colorClass = "text-blue-600";
            let strokeClass = "text-blue-600";

            if (pct === 100) {
              colorClass = "text-emerald-500";
              strokeClass = "text-emerald-500";
            } else if (pct < 30) {
              colorClass = "text-amber-500";
              strokeClass = "text-amber-500";
            }

            const radius = 14;
            const circumference = 100;
            const offset = circumference - (pct / 100) * circumference;

            return `
                <div class="flex items-center gap-3 w-full">
                    <div class="relative w-9 h-9 flex items-center justify-center shrink-0">
                        <!-- Background Circle -->
                        <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            <path class="text-gray-200" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3" />
                            <!-- Progress Circle -->
                            <path class="${strokeClass} transition-all duration-1000 ease-out" stroke-dasharray="${circumference}, ${circumference}" stroke-dashoffset="${offset}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                        </svg>
                        <div class="absolute text-[9px] font-bold text-gray-700">${pct}%</div>
                    </div>
                    <div class="flex flex-col min-w-0">
                        <span class="text-xs font-semibold text-gray-700 truncate"> ${pct}</span>
                        <span class="text-[10px] text-gray-400 font-medium truncate">Completed</span>
                    </div>
                </div>
                `;
          }
        },

        { title: "Priority", field: "priority", width: 120, formatter: this.priorityFormatter },
        { title: "Type", field: "task_type", width: 120, formatter: this.typeFormatter },
        // Context
        { title: "Phase", field: "phase_title", width: 140 },
        // Timeline

        { title: "Est. Hours", field: "estimated_hours", width: 100, hozAlign: "center" },

        { title: "Version", field: "version", width: 100 },
        {
          title: "Description",
          field: "description",
          width: 250,
          formatter: this.descriptionFormatter, // Uses the new formatter below
          editor: "textarea"
        },
        {
          title: "Actions",
          field: "actions", // Ensures CSS targeting matches a "field"
          width: 100,
          hozAlign: "center",
          headerSort: false,
          frozen: freezeColumns,
          formatter: (cell: any) => this.actionFormatter(cell),
          cellClick: (e: any, cell: any) => this.handleActionClick(e, cell),
          cssClass: "sticky-col-right",
        }
      ],
    });

    if (this.tableLoading) {
      this.setTableInlineLoading(true, 'Loading time logs...');
    }


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

    this.table.on("rowSelectionChanged", (data: any[], rows: any[]) => {
      this.selectedCount = rows.length;
      this.showBar = this.selectedCount > 0;
      if (!this.showBar) this.showMoveMenu = false;
    });

    this.table.on('cellEdited', (cell: any) => {
      const rowData = cell.getRow().getData();
      this.updateTask(rowData)
    });

    this.table.on('pageLoaded', () => {
      if (!this.isRestoringTableState) {
        this.saveViewState();
      }
    });

    this.table.on('pageSizeChanged', () => {
      if (!this.isRestoringTableState) {
        this.saveViewState();
      }
    });
  }


  actionFormatter(cell: any) {
    const data = cell.getData?.() ?? {};
    const taskId = Number(data?.id);
    const isUpdating = this.updatingTaskId === taskId;

    return `
      <div class="flex items-center justify-center gap-3 w-full h-full">
        <button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit ${isUpdating ? 'tabulator-action-button--loading' : ''}" title="${isUpdating ? 'Updating...' : 'Edit'}" ${isUpdating ? 'disabled' : ''}>
          <i class="${isUpdating ? 'ri-loader-4-line tabulator-action-spinner' : 'ri-pencil-line text-lg'} pointer-events-none"></i>
        </button>
        <button class="text-slate-400 hover:text-red-600 transition-colors btn-delete" title="Delete" ${isUpdating ? 'disabled' : ''}>
          <i class="ri-delete-bin-line text-lg pointer-events-none"></i>
        </button>
      </div>
    `;
  }

  handleActionClick(e: any, cell: any) {
    e.stopPropagation();
    const target = e.target.closest('button');
    if (!target) return;
    if (target.disabled) return;

    const row = cell.getRow();
    const data = row.getData();
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
    this.searchTerm = (event.target as HTMLInputElement).value.toLowerCase();
    this.applySearchFilter();
    this.saveViewState();
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
    this.getProjects();
    this.getPhasesByProjectId(e);
    this.getStatusList();
    this.getEmployees();
  }

  projectList: any[] = [];
  employeeList: any[] = [];
  private ownerLookup: Record<string, string> = {};
  private ownerEditorValues: Array<{ label: string; value: any }> = [];
  private ownerIndexReady = false;
  phaseList: any[] = [];
  statusList: any[] = [];
  private statusEditorValues: any[] = [];
  getProjects(callback?: Function) {
    this.authService.getAllProjectsByEmployeeId(this.empid).subscribe({
      next: (res: any) => {
        this.projectList = res
        this.saveViewState();
        // this.viewOptions = this.commonService.getFieldLabels(this.projectList);
        if (callback) callback();
      }
    });
  }
  getPhasesByProjectId(e: any) {
    this.authService.getPhaseByProjectId(e?.target?.value).subscribe({
      next: (res: any) => {
        this.phaseList = res
        this.saveViewState();
      }
    });
  }
  getStatusList() {
    this.authService.getStatusList().subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? res?.statusList ?? []);
        this.statusList = Array.isArray(list) ? list : [];
        this.statusEditorValues = this.buildStatusEditorValues(this.statusList);
        this.refreshStatusColumn();
        this.saveViewState();
      }
    });
  }

  getEmployees() {
    this.authService.getEmployeeList().subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? res?.employees ?? []);
        this.employeeList = Array.isArray(list) ? list : [];
        this.ownerIndexReady = true;
        this.rebuildOwnerIndex();
        this.refreshOwnerColumn();
        this.setupEmployeeAutocomplete();
        this.syncSelectedEmployeeControl();
        this.saveViewState();
      },
      error: (err: any) => {
        this.employeeList = [];
        this.ownerIndexReady = true;
        this.rebuildOwnerIndex();
        this.refreshOwnerColumn();
        this.setupEmployeeAutocomplete();
        this.toasterService.error(err?.error?.message ?? 'Unable to load employees');
      }
    });
  }
  updateTask(selectTask: any) {
    selectTask.username = this.storageService.getUsername();
    this.updatingTaskId = Number(selectTask?.id);
    this.refreshVisibleRows();
    this.authService.updateTask(selectTask)
      .pipe(finalize(() => {
        this.updatingTaskId = null;
        this.refreshVisibleRows();
      }))
      .subscribe({
      next: ((res: any) => {
        this.toasterService.success(res?.message);
        this.getTaskOverviewByEmp()
      }),
      error: (err: any) => {
        this.toasterService.error(err?.error?.message);
      }
    })
  }

  private refreshVisibleRows(): void {
    try {
      this.table?.redraw?.(true);
    } catch {
      // ignore redraw timing during table rebuilds
    }
  }

  onRangeChange(event: { startDate: Date; endDate: Date }) {
    const nextStartDate = this.formatDateToYMD(event.startDate);
    const nextEndDate = this.formatDateToYMD(event.endDate);
    const isSameRange = this.startDate === nextStartDate && this.endDate === nextEndDate;

    this.startDate = nextStartDate;
    this.endDate = nextEndDate;
    this.initialStartDate = this.startDate;
    this.initialEndDate = this.endDate;

    if (this.suppressInitialRangeFetch && isSameRange) {
      this.suppressInitialRangeFetch = false;
      this.saveViewState();
      return;
    }
    this.suppressInitialRangeFetch = false;
    this.resetPdfPreviewState();
    this.getTaskOverviewByEmp();
  }

  private persistNavigationDateRange(rowData?: any): void {
    const weekRange = this.getWeekRangeFromDate(rowData?.start_date);
    const navigationFromDate = weekRange?.fromdate || this.startDate;
    const navigationToDate = weekRange?.todate || this.endDate;
    const navigationTaskType = rowData?.task_type || this.type;

    if (navigationFromDate && navigationToDate) {
      sessionStorage.setItem('fromdate', navigationFromDate);
      sessionStorage.setItem('todate', navigationToDate);
      sessionStorage.setItem('tasktype', navigationTaskType);
      return;
    }

    sessionStorage.removeItem('fromdate');
    sessionStorage.removeItem('todate');
    sessionStorage.removeItem('tasktype');
  }

  private getWeekRangeFromDate(date: string | Date | null | undefined): { fromdate: string; todate: string } | null {
    if (!date) {
      return null;
    }

    const baseDate = new Date(date);
    if (Number.isNaN(baseDate.getTime())) {
      return null;
    }

    const day = baseDate.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const weekStart = new Date(baseDate);
    weekStart.setDate(baseDate.getDate() + diffToMonday);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 5);

    return {
      fromdate: this.formatDateToYMD(weekStart),
      todate: this.formatDateToYMD(weekEnd)
    };
  }

  private setCurrentMondayToSaturdayRange(): void {
    const today = new Date();
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 5);
    weekEnd.setHours(23, 59, 59, 999);

    this.startDate = this.formatDateToYMD(weekStart);
    this.endDate = this.formatDateToYMD(weekEnd);
    this.initialStartDate = this.startDate;
    this.initialEndDate = this.endDate;
  }


  formatDateToYMD(date: Date | string | null): string {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }
  private _filter(value: string): any[] {
    const filterValue = value.toLowerCase();
    return this.employeeList.filter((emp: any) =>
      (emp.employee_name ?? '').toLowerCase().includes(filterValue)
    );
  }

  displayFn(employee: any): string {
    return employee && employee.employee_name
      ? employee.employee_name
      : '';
  }
  clearSelection(): void {
    this.myControl.setValue('');
    this.selected_emp_id = 0;
    this.selectedEmployeeName = '';
    this.resetPdfPreviewState();
    this.saveViewState();
    this.getTaskOverviewByEmp();
  }
  onEmployeeSelect(employee: any) {
    const nextEmpId = this.getEmployeeId(employee);
    if (!nextEmpId || Number(this.selected_emp_id || 0) === Number(nextEmpId)) {
      return;
    }

    this.selected_emp_id = nextEmpId;
    this.selectedEmployeeName = employee?.employee_name ?? employee?.name ?? '';
    this.resetPdfPreviewState();
    this.saveViewState();
    this.getTaskOverviewByEmp();
  }

  get canDownloadPdf(): boolean {
    return (
      !!this.startDate &&
      !!this.endDate &&
      new Date(this.startDate) <= new Date(this.endDate)
    );
  }

  private resetPdfPreviewState(): void {
    this.hasViewedPdf = false;
    this.previewedOverviewPdfRequest = null;
  }

  private openTaskPreview(task: any): void {
    this.dialog.open(OverviewTaskViewDialogComponent, {
      width: '920px',
      maxWidth: '96vw',
      autoFocus: false,
      restoreFocus: false,
      panelClass: 'overview-task-details-dialog-panel',
      data: {
        task
      }
    });
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }

  private getOverviewStatusPillClass(status: string): string {
    const normalized = `${status ?? ''}`.trim().toLowerCase();
    if (['active', 'on-track', 'approved', 'completed', 'invoiced', 'open', 'pass', 'passed'].includes(normalized)) {
      return 'overview-status--success';
    }
    if (['in-progress', 'in-review', 'in-testing', 'planning'].includes(normalized)) {
      return 'overview-status--progress';
    }
    if (['on-hold', 'to-be-tested', 'upcoming-release'].includes(normalized)) {
      return 'overview-status--warning';
    }
    if (['delayed', 'cancelled', 'rejected', 'closed', 'failed'].includes(normalized)) {
      return 'overview-status--danger';
    }
    return 'overview-status--muted';
  }

  private buildStatusEditorValues(statuses: any[]): any[] {
    return statuses.map((status: any) => {
      if (!status || typeof status !== 'object') {
        return status;
      }

      const label = this.getStatusDisplayValue(status);
      const value = status.value ?? status.status ?? status.status_name ?? status.name ?? label;

      return { label, value };
    });
  }

  private getStatusDisplayValue(status: any): string {
    if (status === null || status === undefined) {
      return '';
    }

    if (typeof status === 'object') {
      return String(
        status.status ??
        status.status_name ??
        status.name ??
        status.label ??
        status.value ??
        ''
      );
    }

    return String(status);
  }

  private refreshStatusColumn(): void {
    if (!this.table) return;

    const tableRef = this.table;
    const values = this.statusEditorValues;

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
          tableRef.updateColumnDefinition('status', definitionPatch);
          updated = true;
        }
      } catch {
        // ignore
      }

      if (!updated) {
        try {
          const col = tableRef.getColumn?.('status');
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

  private setTableInlineLoading(loading: boolean, label = 'Loading data...'): void {
    const host = this.tableDiv?.nativeElement as HTMLElement | undefined;
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

  private get viewStateKey(): string {
    return `overview-task:${this.empid}`;
  }

  private restoreViewState(): void {
    const state = this.transientViewStateService.getState<OverviewTaskViewState>(this.viewStateKey);
    if (!state) {
      return;
    }

    this.tableData = Array.isArray(state.tableData) ? state.tableData : [];
    this.projectList = Array.isArray(state.projectList) ? state.projectList : [];
    this.employeeList = Array.isArray(state.employeeList) ? state.employeeList : [];
    this.phaseList = Array.isArray(state.phaseList) ? state.phaseList : [];
    this.statusList = Array.isArray(state.statusList) ? state.statusList : [];
    this.statusEditorValues = this.buildStatusEditorValues(this.statusList);
    this.currentView = state.currentView || 'table';
    this.startDate = state.startDate || null;
    this.endDate = state.endDate || null;
    this.initialStartDate = this.startDate;
    this.initialEndDate = this.endDate;
    this.selected_emp_id = Number(state.selectedEmpId || 0);
    this.selectedEmployeeName = state.selectedEmployeeName || '';
    this.searchTerm = state.searchTerm || '';
    this.ownerIndexReady = this.employeeList.length > 0;
    this.rebuildOwnerIndex();
    this.setupEmployeeAutocomplete();
    this.pendingStateRestore = true;
    this.isRestoringTableState = true;
    this.suppressInitialRangeFetch = !!(this.startDate && this.endDate);
    this.kanbanInitialized = this.currentView === 'kanban';
  }

  private restoreTableState(): void {
    const state = this.transientViewStateService.getState<OverviewTaskViewState>(this.viewStateKey);
    if (!state || !this.table) {
      this.pendingStateRestore = false;
      this.isRestoringTableState = false;
      return;
    }

    this.applySearchFilter();

    this.enqueueTableOp(async () => {
      try {
        const pageSize = Number(state.pageSize || 0);
        const currentPageSize = Number(this.table?.getPageSize?.() || 0);
        if (pageSize > 0 && pageSize !== currentPageSize && typeof this.table?.setPageSize === 'function') {
          await Promise.resolve(this.table.setPageSize(pageSize)).catch(() => undefined);
        }

        const maxPage = Number(this.table?.getPageMax?.() || state.page || 1);
        const targetPage = Math.max(1, Math.min(Number(state.page || 1), maxPage || 1));
        const currentPage = Number(this.table?.getPage?.() || 1);
        if (targetPage !== currentPage && typeof this.table?.setPage === 'function') {
          await Promise.resolve(this.table.setPage(targetPage)).catch(() => undefined);
        }
      } finally {
        this.pendingStateRestore = false;
        this.isRestoringTableState = false;
      }
    }, this.table);
  }

  private applySearchFilter(): void {
    if (!this.table) {
      return;
    }

    const value = this.searchTerm?.trim().toLowerCase() || '';
    if (value) {
      this.table.setFilter([
        [
          { field: "task", type: "like", value: value },
          { field: "status", type: "like", value: value },
          { field: "priority", type: "like", value: value },
          { title: "Owner", type: "like", value: value }
        ]
      ]);
      return;
    }

    this.table.clearFilter();
  }

  private setupEmployeeAutocomplete(): void {
    this.filteredOptions = this.myControl.valueChanges.pipe(
      startWith(this.myControl.value || ''),
      map((value: any) => {
        const name = typeof value === 'string' ? value : value?.employee_name || '';
        return name ? this._filter(name) : [...this.employeeList];
      })
    );
  }

  private getEmployeeId(employee: any): number {
    return Number(employee?.id ?? employee?.employee_id ?? employee?.employeeid ?? 0);
  }

  private syncSelectedEmployeeControl(): void {
    if (!this.selected_emp_id) {
      this.myControl.setValue(this.selectedEmployeeName || '', { emitEvent: false });
      return;
    }

    const selectedEmployee = this.employeeList.find((emp: any) => {
      const candidateId = emp?.id ?? emp?.employee_id ?? emp?.employeeid;
      return Number(candidateId) === Number(this.selected_emp_id);
    });

    if (selectedEmployee) {
      this.selectedEmployeeName = selectedEmployee.employee_name ?? selectedEmployee.name ?? this.selectedEmployeeName;
      this.myControl.setValue(selectedEmployee as any, { emitEvent: false });
      return;
    }

    this.myControl.setValue(this.selectedEmployeeName || '', { emitEvent: false });
  }

  private saveViewState(): void {
    this.transientViewStateService.setState<OverviewTaskViewState>(this.viewStateKey, {
      tableData: this.tableData,
      projectList: this.projectList,
      employeeList: this.employeeList,
      phaseList: this.phaseList,
      statusList: this.statusList,
      currentView: this.currentView,
      startDate: this.startDate,
      endDate: this.endDate,
      selectedEmpId: Number(this.selected_emp_id || 0),
      selectedEmployeeName: this.selectedEmployeeName,
      searchTerm: this.searchTerm,
      page: Number(this.table?.getPage?.() || 1) || 1,
      pageSize: Number(this.table?.getPageSize?.() || 25) || 25
    });
  }

  private ensureTableReady(): void {
    this.scheduleTableRedraw(() => {
      if (this.destroyed) return;

      if (!this.table && this.tableDiv?.nativeElement) {
        this.initializeTable(this.tableDiv.nativeElement);
      }

      if (this.pendingStateRestore) {
        this.restoreTableState();
      } else if (!this.tableData.length && this.startDate && this.endDate) {
        this.getTaskOverviewByEmp();
      }

      if (this.table) {
        this.enqueueTableOp(() => this.table?.redraw?.(true), this.table);
      }
    });
  }

  private scheduleTableRedraw(action: () => void): void {
    if (this.pendingTableRedraw !== null) {
      cancelAnimationFrame(this.pendingTableRedraw);
    }

    this.pendingTableRedraw = requestAnimationFrame(() => {
      this.pendingTableRedraw = requestAnimationFrame(() => {
        this.pendingTableRedraw = null;
        action();
      });
    });
  }

}
