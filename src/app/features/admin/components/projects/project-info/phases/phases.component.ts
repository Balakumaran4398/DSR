import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { filter, finalize } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { TransientViewStateService } from 'src/app/_core/services/transient-view-state.service';
import { formatStatusPill } from 'src/app/_core/utils/status-pill.util';
import { attachStandardTabulatorPagination } from 'src/app/_core/utils/tabulator-pagination.util';
declare const Tabulator: any;
declare const luxon: any;

interface PhasesViewState {
  tableData: any[];
  projectList: any[];
  employeeList: any[];
  phaseList: any[];
  statusList: any[];
  searchTerm: string;
  initialStartDate: string | null;
  initialEndDate: string | null;
  page: number;
  pageSize: number;
}

@Component({
  selector: 'app-phases',
  templateUrl: './phases.component.html',
  styleUrls: ['./phases.component.scss']
})
export class PhasesComponent {
  @Input() title = 'Phases';
  @Input() btnText = "Phase"
  @Input() titleDesc = 'Manage your Phases';
  @ViewChild('tableDiv') tableDiv!: ElementRef;
  selectedCount = 0;
  showBar = false;
  showMoveMenu = false;
  projectid: any = 0
  private table: any;
  private tableData: any[] = [];
  private employeeLookup: Record<string, string> = {};
  private employeeEditorValues: Array<{ label: string; value: any }> = [];
  private employeeIndexReady = false;
  private pendingStateRestore = false;
  private isRestoringTableState = false;
  private tableStateRestoreAttempts = 0;
  selectPhase: any
  empid: any = 0
  searchTerm = '';
  initialStartDate: string | null = null;
  initialEndDate: string | null = null;
  tableLoading = false;
  updatingPhaseId: number | null = null;
  constructor(private authService: AuthService, private route: ActivatedRoute, private toasterService: ToasterService, private storageService: StorageService, private drawerService: DrawerService, private transientViewStateService: TransientViewStateService) {
    this.projectid = this.route.snapshot.paramMap.get('projectid');
    this.empid = this.storageService.getEmpId();
    this.restoreViewState();
  }



  ngAfterViewInit() {
    const checkInterval = setInterval(() => {
      if (typeof Tabulator !== 'undefined' && typeof luxon !== 'undefined' && this.tableDiv) {
        clearInterval(checkInterval);
        this.initializeTable();
        if (this.pendingStateRestore) {
          this.restoreTableState();
        } else {
          this.loadData({ target: { value: this.projectid } });
        }
      }
    }, 50);
    this.drawerService.drawerAction$
      .pipe(filter(a => a.source === 'phases'))
      .subscribe(() => { this.getPhasesByProjectId({ target: { value: this.projectid } }) });
  }

  ngOnDestroy(): void {
    this.saveViewState();
  }

  initializeTable() {
    this.rebuildEmployeeIndex();
    const freezeColumns = !this.isCompactViewport();
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.tableData,
      layout: "fitDataStretch",
      responsiveLayout: false,
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

      initialSort: [
        { column: "phase_title", dir: "asc" },
      ],

      columns: [

        // Selection Checkbox
        { formatter: "rowSelection", titleFormatter: "rowSelection", width: 50, hozAlign: "center", headerSort: false },

        {
          title: "Phase",
          field: "phase_title",
          widthGrow: 2,
          minWidth: 350,
          // frozen: freezeColumns, // Freeze the Project column on desktop only
          // editor: "input",
          // formatter: (cell: any) => {
          //   const data = cell.getData();
          //   return `
          //       <div class="flex items-center justify-between w-full group relative pr-8">
          //           <div class="flex  gap-2">
          //               <div class="text-[var(--text-active)] text-lg font-semibold">
          //                   <i class="ri-folder-3-line"></i>
          //               </div>
          //               <div class="flex flex-col">
          //                   <span class="font-medium text-gray-900 text-m leading-relaxed break-words">${data.phase_title}</span>
          //               </div>
          //           </div>
          //           <button class="absolute access-btn right-0 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white border border-gray-200 shadow-sm px-2.5 py-1 rounded-md hover:bg-gray-50 text-[var(--text-active)] hover:text-[var(--text-active)]-700 focus:outline-none z-10 flex items-center gap-1.5 transform translate-x-2 group-hover:translate-x-0" >
          //               <span class="text-[10px] font-semibold uppercase tracking-wide">Open</span>
          //               <i class="ri-arrow-right-up-line text-xs"></i>
          //           </button>
          //       </div>
          //       `;
          // },
        },
        {
          title: "Owner",
          field: "assignee",
          minWidth: 200,
          editor: "list",
          editorParams: {
            values: this.employeeEditorValues,
            autocomplete: true,
            listOnEmpty: true,
            clearable: true
          },
          formatter: (cell: any) => {
            const raw = cell.getValue();
            const rowData = cell.getRow?.().getData?.() ?? cell.getData?.() ?? {};
            const id =
              raw && typeof raw === 'object'
                ? (raw.id ?? raw.value ?? raw.employee_id ?? raw.employeeid ?? null)
                : raw;
            const key = id === null || id === undefined ? '' : String(id);
            const resolvedName = key ? this.employeeLookup[key] : '';
            const fallbackName = rowData?.assignee_name ?? rowData?.owner_name ?? rowData?.assigned_to_name ?? '';
            const displayName = resolvedName || fallbackName || (this.employeeIndexReady ? 'Unknown' : 'Loading...');
            const initials =
              resolvedName || fallbackName
                ? String(resolvedName || fallbackName)
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
          editable: false,
          minWidth: 150,
          cssClass: "app-status-cell",
          formatter: (cell: any) => {
            return formatStatusPill(cell.getValue());
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
          minWidth: 180,
          formatter: (cell: any) => {
            const data = cell.getData();
            const done = Number(data.tasks_done) || 0;
            const pending = Number(data.tasks_pending) || 0;
            const total = done + pending;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);

            let progressClass = "phase-progress--active";
            if (pct === 100) {
              progressClass = "phase-progress--complete";
            } else if (pct < 30) {
              progressClass = "phase-progress--warning";
            }

            const circumference = 100;
            const offset = circumference - (pct / 100) * circumference;

            return `
                <div class="phase-progress ${progressClass}">
                    <div class="phase-progress__ring">
                        <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            <path class="phase-progress__track" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3" />
                            <path class="phase-progress__value" stroke-dasharray="${circumference}, ${circumference}" stroke-dashoffset="${offset}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                        </svg>
                        <div class="phase-progress__percent">${pct}%</div>
                    </div>
                    <div class="phase-progress__copy">
                        <span>${done}/${total} Tasks</span>
                        <small>Completed</small>
                    </div>
                </div>
                `;
          }
        },

        { title: "Type", field: "phase_type", width: 120, formatter: this.typeFormatter },


        { title: "Version", field: "version", width: 100 },
        {
          title: "Description",
          field: "remark",
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

    attachStandardTabulatorPagination(this.table);

    this.table.on("rowSelectionChanged", (data: any[], rows: any[]) => {
      this.selectedCount = rows.length;
      this.showBar = this.selectedCount > 0;
      if (!this.showBar) this.showMoveMenu = false;
    });

    this.table.on('cellEdited', (cell: any) => {
      const rowData = cell.getRow().getData();
      console.log(rowData);
      this.selectPhase = rowData;
      this.updatePhase()
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

    this.table.on('tableBuilt', () => {
      if (this.pendingStateRestore) {
        this.restoreTableState();
      }
    });

    this.table.on('dataProcessed', () => {
      if (this.pendingStateRestore) {
        this.restoreTableState();
      }
    });
  }
  actionFormatter(cell: any) {
    const data = cell.getData?.() ?? {};
    const phaseId = Number(data?.id);
    const isUpdating = this.updatingPhaseId === phaseId;

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
    console.log(data);

    if (target.classList.contains('btn-edit')) {
      this.drawerService.open('phases', data)
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


  typeFormatter(cell: any) {
    const value = (cell.getValue() || "").toLowerCase();
    if (value.includes("internal")) {
      return `<div class="flex items-center gap-1.5 text-red-600"><i class="ri-home-wifi-line"></i> Internal</div>`;
    } else if (value.includes("external")) {
      return `<div class="flex items-center gap-1.5 text-blue-600"><i class="ri-external-link-line"></i> External</div>`;
    }
    return value;
  }

  // --- Formatters ---
  statusFormatter(cell: any) {
    return formatStatusPill(cell.getValue());
  }


  nameFormatter(cell: any) {
    const data = cell.getData();
    const toTitleCase = (str: string): string =>
      str
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    const name = toTitleCase(`${data.firstname} ${data.lastname}`);

    const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2);
    // Stacked layout: Name on top, email below
    // <span class="text-gray-500 text-xs leading-tight">${data.email} | ${data.mobile}</span>
    return `
      <div class="flex items-center gap-2">
          <div class="h-8 w-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold border border-gray-200">
              ${initials}
          </div>
          <div class="flex flex-col">
            <span class="font-medium text-gray-900 text-m leading-tight">${name}</span>
           
          </div>
      </div>
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
    this.drawerService.open('phases');
  }

  loadData(e: any) {
    this.getProjects();
    this.getPhasesByProjectId(e);
    this.getStatusList();
    this.getEmployees();
  }

  projectList: any[] = [];
  employeeList: any[] = [];
  phaseList: any[] = [];
  statusList: any[] = [];
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
    this.tableLoading = true;
    this.authService.getPhaseByProjectId(e?.target?.value)
      .pipe(finalize(() => {
        this.tableLoading = false;
      }))
      .subscribe({
      next: (res: any) => {
        this.phaseList = res
        this.tableData = res;

        if (this.table) {
          this.safeReplaceData(this.table, this.tableData);
          this.applySearchFilter();
          if (this.pendingStateRestore) {
            this.restoreTableState();
          }
        }
        if (!this.pendingStateRestore && !this.isRestoringTableState) {
          this.saveViewState();
        }
      },
      error: (err: any) => {
        this.phaseList = [];
        this.tableData = [];
        if (this.table) {
          this.safeReplaceData(this.table, this.tableData);
          this.applySearchFilter();
        }
        this.toasterService.error(err?.error?.message || 'Unable to load phases.');
      }
    });
  }
  getStatusList() {
    this.authService.getStatusList().subscribe({
      next: (res: any) => {
        this.statusList = res;
        this.saveViewState();
      }
    });
  }

  getEmployees() {
    this.authService.getEmployeelistByProjectId(this.projectid).subscribe({
      next: (res: any) => {
        this.employeeList = res?.assigned_employee_list ?? [];
        this.employeeIndexReady = true;
        this.rebuildEmployeeIndex();
        this.refreshOwnerColumn();
        this.saveViewState();
      }
    });
  }

  private rebuildEmployeeIndex(): void {
    const list = Array.isArray(this.employeeList) ? this.employeeList : [];

    const nextLookup: Record<string, string> = {};
    const nextValues: Array<{ label: string; value: any }> = [];

    for (const employee of list) {
      if (!employee) continue;

      const name = employee.employee_name ?? employee.name ?? '';
      const value = employee.employee_id ?? employee.employeeid ?? employee.id;
      if (value === null || value === undefined) continue;

      const keys = [employee.id, employee.employee_id, employee.employeeid, value];
      for (const k of keys) {
        if (k === null || k === undefined) continue;
        nextLookup[String(k)] = name;
      }

      nextValues.push({ label: name || 'Unknown', value });
    }

    this.employeeLookup = nextLookup;
    this.employeeEditorValues = nextValues;
  }

  private refreshOwnerColumn(): void {
    if (!this.table) return;

    const definitionPatch = {
      editorParams: {
        values: this.employeeEditorValues,
        autocomplete: true,
        listOnEmpty: true,
        clearable: true
      }
    };

    let updated = false;
    try {
      if (typeof this.table.updateColumnDefinition === 'function') {
        this.table.updateColumnDefinition('assignee', definitionPatch);
        updated = true;
      }
    } catch {
      // ignore
    }

    if (!updated) {
      try {
        const col = this.table.getColumn?.('assignee');
        if (col && typeof col.updateDefinition === 'function') {
          col.updateDefinition(definitionPatch);
        }
      } catch {
        // ignore
      }
    }

    try {
      this.table.redraw?.(true);
    } catch {
      // ignore
    }
  }


  updatePhase() {
    this.selectPhase.username = this.storageService.getUsername();
    this.updatingPhaseId = Number(this.selectPhase?.id);
    this.refreshVisibleRows();
    this.authService.updatePhase(this.selectPhase)
      .pipe(finalize(() => {
        this.updatingPhaseId = null;
        this.refreshVisibleRows();
      }))
      .subscribe({
      next: ((res: any) => {
        this.toasterService.success(res?.message);
        this.loadData({ target: { value: this.projectid } });
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
    this.initialStartDate = this.formatDateToYMD(event.startDate);
    this.initialEndDate = this.formatDateToYMD(event.endDate);
    this.saveViewState();
  }

  private formatDateToYMD(date: Date | string | null): string {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }

  private safeReplaceData(table: any, data: any): void {
    const normalized = Array.isArray(data) ? data : [];
    try {
      table?.replaceData?.(normalized);
    } catch {
      try {
        table?.setData?.(normalized);
      } catch {
        // ignore
      }
    }

    try {
      table?.redraw?.(true);
    } catch {
      // ignore
    }
  }

  private get viewStateKey(): string {
    return `project-phases:${this.projectid}`;
  }

  private restoreViewState(): void {
    const state = this.transientViewStateService.getState<PhasesViewState>(this.viewStateKey);
    if (!state) {
      return;
    }

    this.tableData = Array.isArray(state.tableData) ? state.tableData : [];
    this.projectList = Array.isArray(state.projectList) ? state.projectList : [];
    this.employeeList = Array.isArray(state.employeeList) ? state.employeeList : [];
    this.phaseList = Array.isArray(state.phaseList) ? state.phaseList : [];
    this.statusList = Array.isArray(state.statusList) ? state.statusList : [];
    this.searchTerm = state.searchTerm || '';
    this.initialStartDate = state.initialStartDate || null;
    this.initialEndDate = state.initialEndDate || null;
    this.employeeIndexReady = this.employeeList.length > 0;
    this.rebuildEmployeeIndex();
    this.pendingStateRestore = true;
    this.isRestoringTableState = true;
    this.tableStateRestoreAttempts = 0;
  }

  private restoreTableState(): void {
    const state = this.transientViewStateService.getState<PhasesViewState>(this.viewStateKey);
    if (!state || !this.table) {
      this.pendingStateRestore = false;
      this.isRestoringTableState = false;
      return;
    }

    this.applySearchFilter();

    setTimeout(async () => {
      const requestedPage = Math.max(1, Number(state.page || 1));
      try {
        const pageSize = Number(state.pageSize || 0);
        const currentPageSize = Number(this.table?.getPageSize?.() || 0);
        if (pageSize > 0 && pageSize !== currentPageSize && typeof this.table?.setPageSize === 'function') {
          await Promise.resolve(this.table.setPageSize(pageSize)).catch(() => undefined);
        }

        const currentPage = Number(this.table?.getPage?.() || 1);
        if (requestedPage !== currentPage && typeof this.table?.setPage === 'function') {
          await Promise.resolve(this.table.setPage(requestedPage)).catch(() => undefined);
        }
      } finally {
        const activePage = Number(this.table?.getPage?.() || 1);
        const restoreComplete = requestedPage <= 1 || activePage === requestedPage;

        if (!restoreComplete && this.tableStateRestoreAttempts < 6) {
          this.tableStateRestoreAttempts += 1;
          setTimeout(() => this.restoreTableState(), 80);
          return;
        }

        this.pendingStateRestore = false;
        this.isRestoringTableState = false;
        this.tableStateRestoreAttempts = 0;
      }
    }, 0);
  }

  private applySearchFilter(): void {
    if (!this.table) {
      return;
    }

    const value = this.searchTerm?.trim().toLowerCase() || '';
    if (value) {
      this.table.setFilter([
        [
          { field: "phase_title", type: "like", value: value },
          { field: "status", type: "like", value: value },
          { field: "phase_type", type: "like", value: value },
          { field: "version", type: "like", value: value },
        ]
      ]);
      return;
    }

    this.table.clearFilter();
  }

  private saveViewState(): void {
    this.transientViewStateService.setState<PhasesViewState>(this.viewStateKey, {
      tableData: this.tableData,
      projectList: this.projectList,
      employeeList: this.employeeList,
      phaseList: this.phaseList,
      statusList: this.statusList,
      searchTerm: this.searchTerm,
      initialStartDate: this.initialStartDate,
      initialEndDate: this.initialEndDate,
      page: Number(this.table?.getPage?.() || 1) || 1,
      pageSize: Number(this.table?.getPageSize?.() || 15) || 15
    });
  }

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }

}
