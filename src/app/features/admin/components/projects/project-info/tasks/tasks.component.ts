import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, min } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { TransientViewStateService } from 'src/app/_core/services/transient-view-state.service';
import Swal from 'sweetalert2';
declare const Tabulator: any;
declare const luxon: any;

interface TasksViewState {
  tableData: any[];
  projectList: any[];
  employeeList: any[];
  phaseList: any[];
  statusList: any[];
  searchTerm: string;
  fromdate: string | null;
  todate: string | null;
  page: number;
  pageSize: number;
}

@Component({
  selector: 'app-tasks',
  templateUrl: './tasks.component.html',
  styleUrls: ['./tasks.component.scss']
})
export class TasksComponent implements AfterViewInit, OnDestroy {
  @Input() title = 'Tasks';
  @Input() btnText = "Task"
  @Input() titleDesc = 'Manage your tasks';
  @ViewChild('tableDiv') tableDiv!: ElementRef;

  private tableCheckInterval: any;
  private destroyed = false;
  private tableOps: Promise<void> = Promise.resolve();
  type: any = "requirement";
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
  private suppressInitialRangeFetch = false;
  private tableStateRestoreAttempts = 0;
  selectTask: any
  empid: any = 0;
  version: any = '';
  fromdate: any = null
  todate: any = null;
  searchTerm = '';
  initialStartDate: string | null = null;
  initialEndDate: string | null = null;
  versionList: any[] = [];
  taskCategory:any[] = [];
  constructor(private authService: AuthService, private route: ActivatedRoute, private router: Router, private toasterService: ToasterService, private storageService: StorageService, private drawerService: DrawerService, private transientViewStateService: TransientViewStateService) {
    this.projectid = this.route.snapshot.paramMap.get('projectid');
    this.empid = this.storageService.getEmpId();
    this.restoreViewState();
    if (!this.fromdate || !this.todate) {
      this.setCurrentMondayToSaturdayRange();
    }
  }

  ngOnInit() {
	  this.loadVersionList();  
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
        } else {
          this.loadData({ target: { value: this.projectid } });
        }

      }
    }, 50);
    this.drawerService.drawerAction$
      .pipe(filter(a => a.source === 'task'))
      .subscribe(() => { this.getTasksByProjectIdNdEmployeeId() });
      
  }


  getTasksByProjectIdNdEmployeeId() {     //Mugilan
	  if (this.fromdate && this.todate) {
	    const request$ = this.version
	      ? this.authService.getIsasueByProjectIdNdEmployeeId(
		  this.projectid, 
		  this.empid, 
		  0, 
		  this.type == 'requirement' ? 'requirement' : this.type,
		  this.version 
		)
	      : this.authService.getTasksByProjectIdNdEmployeeId(
		  this.projectid, 
		  this.empid, 
		  0, 
		  this.type == 'requirement' ? 'requirement' : this.type, 
		  this.fromdate, 
		  this.todate
		);

	    request$.subscribe({
	      next: (res: any) => {
		this.tableData = Array.isArray(res) ? res : [];
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
		this.tableData = [];
		if (this.table) {
		  this.safeReplaceData(this.table, this.tableData);
		  this.applySearchFilter();
		}
		this.toasterService.error(err?.error?.message || 'Unable to load tasks');
	      }
	    });
	  }
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

    this.rebuildEmployeeIndex();
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.tableData,
      layout: "fitColumns",
      // height: "500px", 
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
      //   { column: "task", dir: "asc" },
      // ],
      columns: [
        // Selection Checkbox
        // { formatter: "rowSelection", titleFormatter: "rowSelection", width: 50, hozAlign: "center", headerSort: false },
        {
          title: "Task Name",
          field: "task",
          widthGrow: 2,
          minWidth: 350,
          frozen: true, // Freeze the Project column
          editor: "textarea",
          formatter: (cell: any) => {
            const data = cell.getData();
            return `
                <div class="flex items-center justify-between w-full group relative pr-8">
                    <div class="flex  gap-2">
                        <div class="text-[var(--text-active)] text-lg font-semibold">
                            <i class="ri-folder-3-line"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="task-name-link font-medium text-gray-900 text-m leading-relaxed break-words cursor-pointer hover:text-[var(--text-active)]">${data.task}</span>
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
            if (e.target.closest('.access-btn') || e.target.closest('.task-name-link')) {
              e.stopPropagation();
              const rowData = cell.getRow().getData();
              this.openTaskDetails(rowData);
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
            const fallbackName = rowData?.assigned_to_name ?? rowData?.owner_name ?? '';
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
        { title: "Version", field: "version", width: 120 },
        // Status & Priority
        {
          title: "Status",
          field: "status",
          editor: "list",
          minWidth: 150,
          editorParams: {
            values: this.statusList,
            autocomplete: true,
            listOnEmpty: true,
            clearable: true
          },
          formatter: (cell: any) => {
            const val = cell.getValue();

            // Simple color logic
            let colorClass = "bg-gray-100 text-gray-700";
            if (["Active", "On-Track", "Approved", "Completed", "Invoiced", "Open"].includes(val)) {
              colorClass = "bg-emerald-100 text-emerald-700";
            } else if (["In-Progress", "In-Review", "In-Testing", "Planning"].includes(val)) {
              colorClass = "bg-blue-100 text-blue-700";
            } else if (["On-Hold", "To-be-Tested"].includes(val)) {
              colorClass = "bg-amber-100 text-amber-700";
            } else if (["Delayed", "Cancelled", "Rejected", "Closed"].includes(val)) {
              colorClass = "bg-red-100 text-red-700";
            }

            return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}">${val}</span>`;
          }
        },
        {
          title: "Task Category",
          field: "task_category",
          editor: "list",
          minWidth: 150,
          editorParams: {
            values: this.taskCategory,
            autocomplete: true,
            listOnEmpty: true,
            clearable: true
          }, formatter: (cell: any) => {
            const val = cell.getValue();

            let colorClass = "bg-gray-100 text-gray-700";
            if (["Support"].includes(val)) {
              colorClass = "bg-emerald-100 text-emerald-700";
            } else if (["Requirement"].includes(val)) {
              colorClass = "bg-amber-100 text-amber-700";
            } else if (["Bug"].includes(val)) {
              colorClass = "bg-red-100 text-red-700";
            }
            // return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}">${val}</span>`;

            if (!val) {
              return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-slate-500">-</span>`;
            }
            return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}">${val}</span>`;

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

            // SVG parameters for 36x36 viewBox, radius 14
            // Circumference = 2 * PI * 14 ~= 87.96
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
          field: "actions", 
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

    this.table.on("rowSelectionChanged", (data: any[], rows: any[]) => {
      this.selectedCount = rows.length;
      this.showBar = this.selectedCount > 0;
      if (!this.showBar) this.showMoveMenu = false;
    });

    this.table.on('cellEdited', (cell: any) => {
      const rowData = cell.getRow().getData();
      console.log(rowData);
      const loggedInEmpId = this.storageService.getEmpId();
      const isEmployee = this.storageService.roles?.isEmployee;
      const isAssignedUser = loggedInEmpId === rowData.assigned_to || loggedInEmpId === rowData.assigned_from;
      if (isEmployee && !isAssignedUser) {
        this.toasterService.error("You are Not Allowed.");
        cell.restoreOldValue();
        return;
      }
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
    const loggedInEmpId = this.storageService.getEmpId();
    const isEmployee = this.storageService.roles?.isEmployee;
    const isAssignedUser = loggedInEmpId === data.assigned_to || loggedInEmpId === data.assigned_from;
    if (isEmployee && !isAssignedUser) {
      this.toasterService.error("You are Not Allowed.");
      return;
    }
    if (target.classList.contains('btn-edit')) {
      this.drawerService.open('task', data, 'requirement')
    } else if (target.classList.contains('btn-delete')) {
      // if (this.storageService.roles.isEmployee) {
      //   return
      // }
      if (loggedInEmpId !== data.assigned_to && loggedInEmpId !== data.assigned_from) {
        this.toasterService.error("You are Not Allowed.");
        return;
      }
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
          this.authService.deleteTask(this.storageService.getUsername(), data.id).subscribe((res: any) => {
            this.toasterService.success(res.message);
            this.getProjects();
          }, err => {
            this.toasterService.error(err?.error?.message);
          })
        }
      });
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

  moveTo(phase: any) {
    const phaseId = phase?.id ?? phase?.phaseid ?? phase?.phase_id;
    const rows = this.table.getSelectedRows();
    const taskIds = rows
      .map((row: any) => row.getData()?.id)
      .filter((id: any) => id !== null && id !== undefined);

    if (!phaseId || taskIds.length === 0) {
      this.toasterService.error('Please select tasks and a phase.');
      return;
    }

    this.authService.swapTask(phaseId, taskIds.join(','), this.storageService.getUsername()).subscribe({
      next: (res: any) => {
        this.toasterService.success(res?.message || 'Tasks moved successfully.');
        rows.forEach((row: any) => row.update({
          phaseid: phaseId,
          phase_id: phaseId,
          phase_title: phase?.phase_title ?? ''
        }));
        this.showMoveMenu = false;
        this.cancelSelection();
        this.getTasksByProjectIdNdEmployeeId();
      },
      error: (err: any) => {
        this.toasterService.error(err?.error?.message || 'Unable to move tasks.');
      }
    });
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
    console.log(e);
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
        this.statusList = res;
        // For status not showing properly for change purpose (my code)
        this.refreshStatusColumn();
        this.saveViewState();
      }
    });
  }

  private refreshStatusColumn(): void {
    if (!this.table) return;

    const definitionPatch = {
      editorParams: {
        values: this.statusList,
        autocomplete: true,
        listOnEmpty: true,
        clearable: true
      }
    };
    try {
      this.table.updateColumnDefinition('status', definitionPatch);
    } catch {
      const col = this.table.getColumn?.('status');
      col?.updateDefinition?.(definitionPatch);
    }
    // this.table.redraw?.(true);
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
        this.table.updateColumnDefinition('assigned_to', definitionPatch);
        updated = true;
      }
    } catch {
      // ignore
    }

    if (!updated) {
      try {
        const col = this.table.getColumn?.('assigned_to');
        if (col && typeof col.updateDefinition === 'function') {
          col.updateDefinition(definitionPatch);
        }
      } catch {
        // ignore
      }
    }

    try {
      // this.table.redraw?.(true);
    } catch {
      // ignore
    }
  }

  updateTask(selectTask: any) {
    selectTask.username = this.storageService.getUsername();
    this.authService.updateTask(selectTask).subscribe({
      next: ((res: any) => {
        this.toasterService.success(res?.message);
        this.getTasksByProjectIdNdEmployeeId()
      }),
      error: (err: any) => {
        this.toasterService.error(err?.error?.message);
      }
    })
  }


  onRangeChange(event: { startDate: Date; endDate: Date }) {
    const nextFromDate = this.formatDateToYMD(event.startDate);
    const nextToDate = this.formatDateToYMD(event.endDate);
    const isSameRange = this.fromdate === nextFromDate && this.todate === nextToDate;

    this.fromdate = nextFromDate;
    this.todate = nextToDate;
    this.initialStartDate = this.fromdate;
    this.initialEndDate = this.todate;

    if (this.suppressInitialRangeFetch && isSameRange) {
      this.suppressInitialRangeFetch = false;
      return;
    }

    this.suppressInitialRangeFetch = false;
    this.getTasksByProjectIdNdEmployeeId()
  }

  private openTaskDetails(rowData: any): void {
    this.saveViewState();
    sessionStorage.setItem('activeProjectTab', 'tasks');
    this.router.navigate(['/main/projects/project-content', this.projectid, rowData.id], {
      queryParams: this.buildTaskDetailsQueryParams(rowData)
    });
  }

  private buildTaskDetailsQueryParams(rowData?: any): Record<string, string | null> {
    const weekRange = this.getWeekRangeFromDate(rowData?.start_date);
    const navigationFromDate = weekRange?.fromdate || this.fromdate;
    const navigationToDate = weekRange?.todate || this.todate;
    const navigationTaskType = rowData?.task_type || this.type;

    return {
      tasktype: navigationTaskType || null,
      fromdate: navigationFromDate || null,
      todate: navigationToDate || null
    };
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

    this.fromdate = this.formatDateToYMD(weekStart);
    this.todate = this.formatDateToYMD(weekEnd);
    this.initialStartDate = this.fromdate;
    this.initialEndDate = this.todate;
  }


  formatDateToYMD(date: Date | string | null): string {
    if (!date) return 'null';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }

  private enqueueTableOp(action: () => any): void {
    this.tableOps = this.tableOps.finally(() => {
      if (this.destroyed) return;
      if (!this.tableDiv?.nativeElement?.isConnected) return;
      try {
        const result = action();
        return Promise.resolve(result).catch(() => { });
      } catch {
        return;
      }
    });
  }

  

  private safeReplaceData(table: any, data: any): void {
    if (!table) return;
    if (!this.tableDiv?.nativeElement?.isConnected) return;
    const normalized = Array.isArray(data) ? data : [];
    setTimeout(() => {
      try {
        if (table && typeof table.replaceData === 'function') {
          table.replaceData(normalized);
        } else if (table && typeof table.setData === 'function') {
          table.setData(normalized);
        }
      } catch (e) {
        console.warn("Tabulator update skipped:", e);
      }
    }, 0);
  }

  private get viewStateKey(): string {
    return `project-tasks:${this.projectid}`;
  }

  private restoreViewState(): void {
    const state = this.transientViewStateService.getState<TasksViewState>(this.viewStateKey);
    if (!state) {
      return;
    }

    this.tableData = Array.isArray(state.tableData) ? state.tableData : [];
    this.projectList = Array.isArray(state.projectList) ? state.projectList : [];
    this.employeeList = Array.isArray(state.employeeList) ? state.employeeList : [];
    this.phaseList = Array.isArray(state.phaseList) ? state.phaseList : [];
    this.statusList = Array.isArray(state.statusList) ? state.statusList : [];
    this.searchTerm = state.searchTerm || '';
    this.fromdate = state.fromdate || null;
    this.todate = state.todate || null;
    this.initialStartDate = this.fromdate;
    this.initialEndDate = this.todate;
    this.employeeIndexReady = this.employeeList.length > 0;
    this.rebuildEmployeeIndex();
    this.pendingStateRestore = true;
    this.isRestoringTableState = true;
    this.suppressInitialRangeFetch = !!(this.fromdate && this.todate);
    this.tableStateRestoreAttempts = 0;
  }

  private restoreTableState(): void {
    const state = this.transientViewStateService.getState<TasksViewState>(this.viewStateKey);
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

  private saveViewState(): void {
    this.transientViewStateService.setState<TasksViewState>(this.viewStateKey, {
      tableData: this.tableData,
      projectList: this.projectList,
      employeeList: this.employeeList,
      phaseList: this.phaseList,
      statusList: this.statusList,
      searchTerm: this.searchTerm,
      fromdate: this.fromdate,
      todate: this.todate,
      page: Number(this.table?.getPage?.() || 1) || 1,
      pageSize: Number(this.table?.getPageSize?.() || 10) || 10
    });
  }


  onVersionChange(version: any): void {
	  this.version = version ?? '';
	  this.getTasksByProjectIdNdEmployeeId();  
	}

	  loadVersionList(): void {
	  if (!this.projectid) return;
	  
	  this.authService.getVersionsById(this.projectid).subscribe({
	    next: (res: any) => {
	      this.versionList = Array.isArray(res) ? res : [];
	      this.version = this.versionList.includes(this.version) ? this.version : '';
	    },
	    error: (err: any) => {
	      this.toasterService.error(err?.error?.message || 'Unable to load versions');
	    }
	  });
	}

}
