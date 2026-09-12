import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, finalize, map, Observable, of, startWith } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { DateRangeFilterComponent } from 'src/app/_shared/components/date-range-filter/date-range-filter.component';
import { attachStandardTabulatorPagination } from 'src/app/_core/utils/tabulator-pagination.util';
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

  constructor(private authService: AuthService, private route: ActivatedRoute, private router: Router, private toasterService: ToasterService, private storageService: StorageService, private drawerService: DrawerService) {
    this.empid = this.storageService.getEmpId();
    const roles = this.storageService.roles;
    this.canSelectEmployee = !!(roles?.isAdmin || roles?.isManager);
    // this.getNotsendTasksOverview();
    this.initializeDatesFromQueryParams();
    this.loadData({ target: { value: this.projectid } })

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
          const normalized = Array.isArray(res) ? res : res ? [res] : [];
          this.tableData = normalized;

          if (this.table) {
            this.safeReplaceData(this.table, this.tableData);
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
    const raw = employee.id ?? employee.employee_id ?? employee.employeeid;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
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
}
