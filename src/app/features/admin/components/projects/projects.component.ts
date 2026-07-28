import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { TransientViewStateService } from 'src/app/_core/services/transient-view-state.service';
import Swal from 'sweetalert2';
declare const Tabulator: any;
declare const luxon: any;

interface ProjectsViewState {
  managerList: any[];
  employeeList: any[];
  projectList: any[];
  departmentList: any[];
  statusList: any[];
  searchTerm: string;
  page: number;
  pageSize: number;
}

@Component({
  selector: 'app-projects',
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.scss']
})
export class ProjectsComponent implements AfterViewInit, OnDestroy, OnInit {
  @ViewChild('tableDiv') tableDiv!: ElementRef;
  selectedCount = 0;
  showBar = false;
  showMoveMenu = false;
  empId: string | null = null;
  private table: any;
  managerList: any = [];
  private managerLookup: Record<string, string> = {};
  private managerEditorValues: Array<{ label: string; value: any }> = [];
  private managerIndexReady = false;
  employeeList: any = [];
  projectList: any = [];
  departmentList: any = [];
  statusList: any = [];
  canSelectEmployee = false;
  searchTerm = '';

  private tableCheckInterval: any;
  private destroyed = false;
  private tableOps: Promise<void> = Promise.resolve();
  private tableBuiltPromise: Promise<void> = Promise.resolve();
  private resolveTableBuilt: (() => void) | null = null;
  private pendingStateRestore = false;
  private isRestoringTableState = false;

  constructor(private authService: AuthService, private toasterService: ToasterService, private router: Router, private storageService: StorageService, private drawerService: DrawerService, private transientViewStateService: TransientViewStateService) {
    const roles = this.storageService.roles;
    this.canSelectEmployee = !!(roles?.isAdmin || roles?.isManager);
  }
  ngOnInit(): void {
    this.empId = this.storageService.getEmpId();
    if (!this.empId) {
      this.toasterService.error('Session expired. Please login again.');
      this.authService.logout();
      return;
    }

    this.restoreViewState();
    if (!this.pendingStateRestore) {
      this.loadData();
    }

    this.drawerService.drawerAction$
      .pipe(filter(a => a.source === 'project'))
      .subscribe(() => { this.getProjects() });
  }


  ngAfterViewInit() {
    this.tableCheckInterval = setInterval(() => {
      if (this.destroyed) return;
      if (!this.tableDiv?.nativeElement?.isConnected) return;
      if (typeof Tabulator !== 'undefined' && typeof luxon !== 'undefined' && this.tableDiv) {
        clearInterval(this.tableCheckInterval);
        this.tableCheckInterval = null;
        this.initializeTable();
        if (this.pendingStateRestore) {
          this.restoreTableState();
        }
      }
    }, 50);
  }

  ngOnDestroy(): void {
    this.saveViewState();
    this.destroyed = true;

    if (this.tableCheckInterval) {
      clearInterval(this.tableCheckInterval);
      this.tableCheckInterval = null;
    }

    const tableToDestroy = this.table;
    this.table = null;

    this.resolveTableBuilt?.();
    this.resolveTableBuilt = null;

    // Avoid Tabulator internal promise races by destroying only after queued ops finish.
    this.tableOps = this.tableOps.finally(() => {
      try {
        tableToDestroy?.destroy?.();
      } catch {
        // ignore
      }
    });
  }

  initializeTable() {
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

    this.rebuildManagerIndex();
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.projectList,
      layout: "fitColumns",
      autoResize: false,        
      // layout: "fitDataStretch",
      pagination: "local",
      paginationSize: 10,
      paginationCounter: "rows",
      movableColumns: true,
      selectable: true,
      editTriggerEvent: "dblclick",
      placeholder: "No Data Found",
      paginationSizeSelector: [10, 15, 25, 30, 50, 100],
      headerSortElement: function (col: any, dir: any) {
        if (dir === "asc") return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === "desc") return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },

      // initialSort: [
      //   { column: "start_date", dir: "desc" },
      // ],

      columns: [
        // Selection Checkbox
        // { formatter: "rowSelection", titleFormatter: "rowSelection", hozAlign: "center", headerSort: false, responsive: 0 },
        // Primary Info (Avatar + Name + Email)
        {
          title: "Project",
          field: "project_title",
          widthGrow: 2,
          frozen: true,
          width: 250,
          editor: "input",
          formatter: (cell: any) => {
            const data = cell.getData();
            return `
                <div class="flex items-center justify-between w-full h-full group relative pr-8">
                    <div class="flex items-center gap-2">
                        <div class="text-[var(--text-active)] text-lg font-semibold">
                            <i class="ri-folder-3-line"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="font-medium text-gray-900 truncate text-m leading-tight">${data.project_title}</span>
                        </div>
                    </div>
                    <button class="absolute access-btn right-0 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white border border-gray-200 shadow-sm px-2.5 py-1 rounded-md hover:bg-gray-50 text-[var(--text-active)] hover:text-[var(--text-active)]-700 focus:outline-none z-10 flex items-center gap-1.5 transform translate-x-2 group-hover:translate-x-0" >
                        <span class="text-[10px] font-semibold uppercase tracking-wide">Open</span>
                        <i class="ri-arrow-right-up-line text-xs"></i>
                    </button>
                </div>
                `;
          },
          cellClick: (e: any, cell: any) => {
            if (e.target.closest('.access-btn')) {
              e.stopPropagation();
              const rowData = cell.getRow().getData();
              localStorage.setItem('projectDetails', JSON.stringify(rowData));
              this.router.navigate([`/main/projects/project-content/${rowData.id}`]);
              sessionStorage.setItem('activeProjectTab', 'tasks');
            }
          }
        },
        {
          title: "Manager",
          field: "assigned_manager",
          editor: "list",
          width: 200,
          editorParams: {
            values: this.managerEditorValues,
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
            const resolvedName = key ? this.managerLookup[key] : '';
            const fallbackName = rowData?.manager_name ?? rowData?.assigned_manager_name ?? '';
            const displayName = resolvedName || fallbackName || (this.managerIndexReady ? '' : 'Loading...');
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
                    <div class="h-6 w-6 rounded-full bg-gray-200  flex items-center justify-center text-[10px] text-gray-600">${initials}</div>
                    <span class="text-m">${displayName}</span>
                </div>
                `;
          }
        },
        {
          title: "Start Date",
          field: "start_date",
          editor: "date",
          width: 120,
          formatter: (cell: any) => {
            const val = cell.getValue();
            return `<span class="text-sm font-medium text-gray-600">${val}</span>`;
          }
        },
        {
          title: "End Date",
          field: "end_date",
          editor: "date",
          width: 120,
          formatter: (cell: any) => {
            const val = cell.getValue();
            return `<span class="text-sm font-medium text-gray-600">${val}</span>`;
          }
        },
        {
          title: "Timeline",
          field: "end_date",
          width: 150,
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
          title: "Client",
          field: "client",
          editor: "input",
          // width: 350,
          formatter: (cell: any) => {
            const value = cell.getValue();
            return `
              <div class="flex items-center border px-3 py-1">
                  <div class=" flex items-center justify-center  font-bold mr-2"><i class="ri-building-line" style="color:var(--text-muted)"></i></div>
                  <span>${value}</span>
              </div>
              `;
          }
        },
        {
          title: "Progress",
          field: "tasks_done",
          width: 180,
          formatter: (cell: any) => {
            const data = cell.getData();
            const total = data.tasks_done + data.tasks_pending;
            const pct = total === 0 ? 0 : Math.round((data.tasks_done / total) * 100);

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

            // SVG parameters for 36x36 viewBox, radius 14
            // Circumference = 2 * PI * 14 ~= 87.96
            const radius = 14;
            const circumference = 100;
            const offset = circumference - (pct / 100) * circumference;

            return `
                <div class="flex items-center gap-3 w-full">
                    <div class="relative w-10 h-10 flex items-center justify-center shrink-0">
                        <!-- Background Circle -->
                        <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            <path class="text-gray-200" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3" />
                            <!-- Progress Circle -->
                            <path class="${strokeClass} transition-all duration-1000 ease-out" stroke-dasharray="${circumference}, ${circumference}" stroke-dashoffset="${offset}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                        </svg>
                        <div class="absolute text-[10px] font-bold text-gray-700">${pct}%</div>
                    </div>
                    <div class="flex flex-col min-w-0">
                        <span class="text-xs font-semibold text-gray-700 truncate">${data.tasks_done}/${total} Tasks</span>
                        <span class="text-[10px] text-gray-400 font-medium truncate">Completed</span>
                    </div>
                </div>
                `;
          }
        },
        {
          title: "Department",
          field: "department",
          // width: 100,
          formatter: (cell: any) => {
            return `<span class="inline-flex text-center  items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">${cell.getValue()}</span>`;
          }
        },
        {
          title: "Status",
          field: "isclose", // Boolean Field
          hozAlign: "center",
          // width: 100,
          editor: "list",
          editorParams: {
            values: [
              { label: "Open", value: false },
              { label: "Closed", value: true }
            ]
          },
          formatter: (cell: any) => {
            const isClosed = cell.getValue();
            const label = isClosed ? "Closed" : "Open";
            const colorClass = isClosed ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700";
            const dotClass = isClosed ? "bg-red-500" : "bg-green-500";

            return `
              <div class="flex items-center justify-center gap-1.5">
                  <span class="h-2 w-2 rounded-full ${dotClass}"></span>
                  <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}">${label}</span>
              </div>`;
          }
        },
        // {
        //   title: "Status",
        //   field: "status", 
        //   editor: "list",
        //   editorParams: {
        //     values: this.statusList,
        //     autocomplete: true,
        //     listOnEmpty: true,
        //     clearable: true
        //   },
        //   formatter: (cell: any) => {
        //     const val = cell.getValue();

        //     // Simple color logic
        //     let colorClass = "bg-gray-100 text-gray-700";
        //     if (["Active", "On-Track", "Approved", "Completed", "Invoiced", "Open"].includes(val)) {
        //       colorClass = "bg-emerald-100 text-emerald-700";
        //     } else if (["In-Progress", "In-Review", "In-Testing", "Planning"].includes(val)) {
        //       colorClass = "bg-blue-100 text-blue-700";
        //     } else if (["On-Hold", "To-be-Tested"].includes(val)) {
        //       colorClass = "bg-amber-100 text-amber-700";
        //     } else if (["Delayed", "Cancelled", "Rejected", "Closed"].includes(val)) {
        //       colorClass = "bg-red-100 text-red-700";
        //     }

        //     return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}">${val}</span>`;
        //   }
        // },
        {
          title: "Description",
          field: "description",
          // width: 250,
          editor: "textarea",
          formatter: (cell: any) => {
            return `<span class="text-sm text-gray-500 truncate block" title="${cell.getValue()}">${cell.getValue()}</span>`;
          }
        },
        {
          title: "Actions",
          field: "actions", // Ensures CSS targeting matches a "field"
          width: 100,
          hozAlign: "center",
          headerSort: false,
          frozen: true,
          formatter: this.actionFormatter,
          cellClick: (e: any, cell: any) => this.handleActionClick(e, cell),
          cssClass: "sticky-col-right",
        }
      ],
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

    // Fallback: if Tabulator never fires tableBuilt, unblock queued ops after a short delay.
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
      this.updateProject(rowData)
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
    if (this.storageService.roles.isEmployee) {
      return
    }
    e.stopPropagation();
    const target = e.target.closest('button');
    if (!target) return;

    const row = cell.getRow();
    const data = row.getData();
    if (target.classList.contains('btn-edit')) {
      this.drawerService.open('project', data)
    } else if (target.classList.contains('btn-delete')) {
      Swal.fire({
        title: "Are you sure?",
        text: "You won't be able to revert this!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes, delete it!"
      }).then((result) => {
        if (result.isConfirmed) {
          this.authService.deleteProject(this.storageService.getUsername(), data.id).subscribe((res: any) => {
            this.toasterService.success(res.message);
            this.getProjects();
          }, err => {
            this.toasterService.error(err?.error?.message);
          })
        }
      });
    }
  }



  onSearch(event: Event) {
    if (!this.table) return;
    this.searchTerm = (event.target as HTMLInputElement).value.toLowerCase();
    this.applySearchFilter();
    this.saveViewState();
  }

  // --- Actions ---

  cancelSelection() {
    this.table?.deselectRow?.();
  }

  onDelete() {
    const rows = this.table?.getSelectedRows?.() ?? [];
    if (confirm(`Delete ${rows.length} users?`)) {
      rows.forEach((r: any) => r.delete());
    }
  }

  toggleMoveMenu(event: MouseEvent) {
    event.stopPropagation(); // Prevent window click from closing immediately
    this.showMoveMenu = !this.showMoveMenu;
  }

  moveTo(department: string) {
    const rows = this.table?.getSelectedRows?.() ?? [];
    rows.forEach((r: any) => r.update({ department: department }));

    this.showMoveMenu = false;
  }
  loadData() {
    this.getAllDepartments();
    this.getStatusList();
    this.getManagers();
    this.getEmployees();
    this.getProjects();
  }

  getManagers() {
    this.authService.getManagerList().subscribe({
      next: (res: any) => {
        this.managerList = Array.isArray(res) ? res : (res?.data ?? res?.managers ?? []);
        this.managerIndexReady = true;
        this.rebuildManagerIndex();
        setTimeout(() => { if (!this.destroyed) this.refreshManagerColumn(); }, 0);
        this.saveViewState();
      },
      error: (err: any) => {
        this.managerList = [];
        this.managerIndexReady = true;
        this.rebuildManagerIndex();
        setTimeout(() => { if (!this.destroyed) this.refreshManagerColumn(); }, 0);
        this.toasterService.error(err?.error?.message ?? 'Unable to load managers');
      }
    });
  }
  getStatusList() {
    this.authService.getStatusList().subscribe({
      next: (res: any) => {
        this.statusList = Array.isArray(res) ? res : (res?.data ?? []);
        this.saveViewState();
      },
      error: (err: any) => {
        this.statusList = [];
        this.toasterService.error(err?.error?.message ?? 'Unable to load status list');
      }
    });
  }

  getEmployees() {
    this.authService.getEmployeeList().subscribe({
      next: (res: any) => {
        this.employeeList = Array.isArray(res) ? res : (res?.data ?? res?.employees ?? []);
        this.saveViewState();
      },
      error: (err: any) => {
        this.employeeList = [];
        this.toasterService.error(err?.error?.message ?? 'Unable to load employees');
      }
    });
  }

  getProjects(callback?: Function) {
    const employeeId = this.empId ?? this.storageService.getEmpId();
    if (!employeeId) {
      this.projectList = [];
      if (this.table) {
        this.safeReplaceData(this.table, this.projectList);
      }
      this.toasterService.error('Session expired. Please login again.');
      this.authService.logout();
      return;
    }

    this.authService.getAllProjectsByEmployeeId(employeeId).subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? res?.projects ?? []);
        this.projectList = Array.isArray(list) ? list : [];
        if (this.table) {
          this.safeReplaceData(this.table, this.projectList);
          this.applySearchFilter();
        }
        this.saveViewState();
        if (callback) callback();
      },
      error: (err: any) => {
        this.projectList = [];
        if (this.table) {
          this.safeReplaceData(this.table, this.projectList);
        }
        this.toasterService.error(err?.error?.message ?? 'Unable to load projects');
      }
    });
  }

  getAllDepartments() {
    this.authService.getAllDepartments().subscribe({
      next: (res: any) => {
        this.departmentList = Array.isArray(res) ? res : (res?.data ?? res?.departments ?? []);
        this.saveViewState();
      },
      error: (err: any) => {
        this.departmentList = [];
        this.toasterService.error(err?.error?.message ?? 'Unable to load departments');
      }
    });
  }

  openProject(type: any) {
    this.drawerService.open(type)
  }

  updateProject(selectedProject: any) {
    selectedProject.username = this.storageService.getUsername();

    this.authService.updateProject(selectedProject).subscribe({
      next: ((res: any) => {
        this.toasterService.success(res?.message);
        this.getProjects();

      }),
      error: (err: any) => {
        this.toasterService.error(err?.error?.message);
      }
    })
  }

  private resetTableBuilt(): void {
    this.tableBuiltPromise = new Promise<void>((resolve) => {
      this.resolveTableBuilt = resolve;
    });
  }

  private enqueueTableOp(action: () => any, tableRef?: any): void {
    const expectedTable = tableRef ?? this.table;
    const tableBuilt = this.tableBuiltPromise;

    // Serializes Tabulator calls to avoid RowManager races (unhandled promise errors).
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


  private rebuildManagerIndex(): void {
    const list = Array.isArray(this.managerList) ? this.managerList : [];

    const nextLookup: Record<string, string> = {};
    const nextValues: Array<{ label: string; value: any }> = [];
    for (const manager of list) {
      if (!manager) continue;

      const name = manager.employee_name ?? manager.manager_name ?? '';
      const value = manager.employee_id ?? manager.employeeid ?? manager.id;
      if (value === null || value === undefined) continue;

      // Map common id fields to the same display name to handle API inconsistencies.
      const keys = [manager.id, manager.employee_id, manager.employeeid, value];
      for (const k of keys) {
        if (k === null || k === undefined) continue;
        nextLookup[String(k)] = name;
      }

      nextValues.push({ label: name || 'Unknown', value });
    }

    this.managerLookup = nextLookup;
    this.managerEditorValues = nextValues;
  }

  private refreshManagerColumn(): void {
    if (this.destroyed) return;
    if (!this.table) return;
    if (!this.tableDiv?.nativeElement?.isConnected) return;

    const tableRef = this.table;
    const values = this.managerEditorValues;

    this.enqueueTableOp(() => {
      const col = tableRef.getColumn?.('assigned_manager');
      if (!col) return;

      const definitionPatch = {
        editorParams: {
          values,
          autocomplete: true,
          listOnEmpty: true,
          clearable: true
        }
      };

      try {
        if (typeof tableRef.updateColumnDefinition === 'function') {
          return tableRef.updateColumnDefinition('assigned_manager', definitionPatch);
        }
      } catch {
        // ignore
      }

      try {
        if (typeof col.updateDefinition === 'function') {
          return col.updateDefinition(definitionPatch);
        }
      } catch {
        // ignore
      }
    }, tableRef);
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
    return `projects-table:${this.empId ?? this.storageService.getEmpId() ?? 'default'}`;
  }

  private restoreViewState(): void {
    const state = this.transientViewStateService.getState<ProjectsViewState>(this.viewStateKey);
    if (!state) {
      return;
    }

    this.managerList = Array.isArray(state.managerList) ? state.managerList : [];
    this.employeeList = Array.isArray(state.employeeList) ? state.employeeList : [];
    this.projectList = Array.isArray(state.projectList) ? state.projectList : [];
    this.departmentList = Array.isArray(state.departmentList) ? state.departmentList : [];
    this.statusList = Array.isArray(state.statusList) ? state.statusList : [];
    this.searchTerm = state.searchTerm || '';
    this.managerIndexReady = this.managerList.length > 0;
    this.rebuildManagerIndex();
    this.pendingStateRestore = true;
    this.isRestoringTableState = true;
  }

  private restoreTableState(): void {
    const state = this.transientViewStateService.getState<ProjectsViewState>(this.viewStateKey);
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
          { field: "department", type: "like", value: value },
          { field: "project_title", type: "like", value: value },
          { field: "client", type: "like", value: value },
        ]
      ]);
      return;
    }

    this.table.clearFilter();
  }

  private saveViewState(): void {
    this.transientViewStateService.setState<ProjectsViewState>(this.viewStateKey, {
      managerList: this.managerList,
      employeeList: this.employeeList,
      projectList: this.projectList,
      departmentList: this.departmentList,
      statusList: this.statusList,
      searchTerm: this.searchTerm,
      page: Number(this.table?.getPage?.() || 1) || 1,
      pageSize: Number(this.table?.getPageSize?.() || 10) || 10
    });
  }

}
