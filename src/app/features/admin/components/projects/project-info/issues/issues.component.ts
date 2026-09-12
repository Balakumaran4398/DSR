import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, finalize, from } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { TransientViewStateService } from 'src/app/_core/services/transient-view-state.service';
import { attachStandardTabulatorPagination } from 'src/app/_core/utils/tabulator-pagination.util';
import Swal from 'sweetalert2';
declare const Tabulator: any;
declare const luxon: any;

interface IssuesViewState {
  tableData: any[];
  projectList: any[];
  employeeList: any[];
  phaseList: any[];
  statusList: any[];
  searchTerm: string;
  version: string | null;
  fromdate: string | null;
  todate: string | null;
  page: number;
  pageSize: number;
}

@Component({
  selector: 'app-issues',
  templateUrl: './issues.component.html',
  styleUrls: ['./issues.component.scss']
})
export class IssuesComponent {
  @Input() title = 'Issues';
  @Input() btnText = "Issue"
  @Input() titleDesc = 'Manage your Issues';
  @ViewChild('tableDiv') tableDiv!: ElementRef;
  type: any = "bug";
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
  empid: any = 0
  fromdate: any;
  todate: any
  version: any = '';
  filteredVersionList: any[] = [];
  versionSearchText = '';
  searchTerm = '';
  initialStartDate: string | null = null;
  initialEndDate: string | null = null;
  tableLoading = false;
  deletingIssueId: number | null = null;
  updatingIssueId: number | null = null;
  movingPhaseId: number | null = null;
  private originalAssignedTo: number | null = null;
  readonly categoryOptions = [
    { value: 'High', textClass: 'text-red-600' },
    { value: 'Medium', textClass: 'text-amber-600' },
    { value: 'Low', textClass: 'text-green-600' },
    { value: 'Critical', textClass: 'text-rose-600' },
    { value: 'Blocked', textClass: 'text-slate-600' },
    { value: 'Random', textClass: 'text-violet-600' },
    { value: 'Regression', textClass: 'text-sky-600' }
  ];
  private readonly categoryTextClassMap = this.categoryOptions.reduce((acc, option) => {
    acc[option.value] = option.textClass;
    return acc;
  }, {} as Record<string, string>);

  constructor(private authService: AuthService, private router: Router, private route: ActivatedRoute, private toasterService: ToasterService, private storageService: StorageService, private drawerService: DrawerService, private transientViewStateService: TransientViewStateService) {
    this.empid = this.storageService.getEmpId();

    this.route.paramMap.subscribe(params => {
      this.projectid = Number(params.get('projectid'));
      this.restoreViewState();
      this.applyNavigationDateRange();
      if (!this.fromdate || !this.todate) {
        this.setCurrentMondayToSaturdayRange();
      }
      this.getVersions();
    });
  }

  getTasksByProjectIdNdEmployeeId() {
    this.refreshIssuesData();
  }

  getTasksVersionList(v?: any) {
    if (v !== undefined) {
      this.version = v ?? '';
    }
    this.refreshIssuesData(true);
  }
  ngAfterViewInit() {
    // const checkInterval = setInterval(() => {
    if (typeof Tabulator !== 'undefined' && typeof luxon !== 'undefined' && this.tableDiv) {
      // clearInterval(checkInterval);
      this.initializeTable();
      if (this.pendingStateRestore) {
        this.restoreTableState();
      } else {
        this.loadData({ target: { value: this.projectid } });
      }
    }
    // }, 50);
    this.drawerService.drawerAction$
      .pipe(filter(a => a.source === 'task'))
      .subscribe(() => { this.getTasksByProjectIdNdEmployeeId() });
  }

  ngOnDestroy(): void {
    this.saveViewState();
  }
  getVersions() {
    if (!this.projectid) return;

    this.authService.getVersionsById(this.projectid).subscribe({
      next: (res: any) => {
        this.versionList = Array.isArray(res) ? res : [];
        this.filteredVersionList = [...this.versionList];
        this.version = this.versionList.includes(this.version) ? this.version : '';
        this.refreshIssuesData();
      }
    });
  }


  initializeTable() {
    this.rebuildEmployeeIndex();
    const freezeColumns = !this.isCompactViewport();
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.tableData,
      layout: "fitDataStretch",
      responsiveLayout: false,
      // height: "500px", 
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
      columnDefaults: {
        editable: (cell: any) => {
          const rowData = cell.getRow().getData();
          const loggedInEmpId = Number(this.storageService.getEmpId());
          const assignedFrom = Number(rowData.assigned_from);
          const assignedTo = Number(rowData.assigned_to);
          const isAdmin = this.storageService.roles?.isAdmin;
          const canEdit = isAdmin || loggedInEmpId === assignedFrom || loggedInEmpId === assignedTo;
          return canEdit;
        }
      },
      // initialSort: [
      //   { column: "task", dir: "asc" },
      // ],

      columns: [

        // Selection Checkbox
        { formatter: "rowSelection", titleFormatter: "rowSelection", width: 50, hozAlign: "center", headerSort: false },
        // { title: "Task Name", field: "task", width: 220, frozen: true, formatter: this.nameFormatter },
        {
          title: "Task Name",
          field: "task",
          width: 500,
          widthGrow: 0.9,
          minWidth: 380,
          frozen: freezeColumns, // Freeze the Project column on desktop only
          editor: "textarea",
          formatter: (cell: any) => {
            const data = cell.getData();
            const canOpenTask = this.canOpenIssueTaskDetails(data);
            return `
                <div class="flex items-center justify-between w-full group relative pr-24">
                    <div class="flex  gap-2">
                        <div class="text-[var(--text-active)] text-lg font-semibold">
                            <i class="ri-folder-3-line"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="task-name-link font-medium text-gray-900 text-m leading-relaxed break-words cursor-pointer hover:text-[var(--text-active)]">${data.task}</span>
                        </div>
                    </div>
                    <div class="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 transform translate-x-2 group-hover:translate-x-0">
                        <button class="view-btn bg-white border border-gray-200 shadow-sm px-2.5 py-1 rounded-md hover:bg-gray-50 text-[var(--text-active)] hover:text-[var(--text-active)]-700 flex items-center gap-1.5">
                            <span class="text-[10px] font-semibold uppercase tracking-wide">View</span>
                            <i class="ri-eye-line text-xs"></i>
                        </button>
                        ${canOpenTask ? `
                        <button class="access-btn bg-white border border-gray-200 shadow-sm px-2.5 py-1 rounded-md hover:bg-gray-50 text-[var(--text-active)] hover:text-[var(--text-active)]-700 focus:outline-none flex items-center gap-1.5">
                            <span class="text-[10px] font-semibold uppercase tracking-wide">Open</span>
                            <i class="ri-arrow-right-up-line text-xs"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>
                `;
          },
          cellClick: (e: any, cell: any) => {
            const rowData = cell.getRow().getData();

            if (e.target.closest('.access-btn') || (e.target.closest('.task-name-link') && this.canOpenIssueTaskDetails(rowData))) {
              e.stopPropagation();
              this.openTaskDetails(rowData);
              return;
            }

            if (e.target.closest('.view-btn')) {
              e.stopPropagation();
              this.openIssueDetailsDialog(rowData);
            }
          }
        }
        , {
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
        }, { title: "Version", field: "version", width: 120, editor: "input" },
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
            const val = `${cell.getValue() ?? ''}`.trim() || '-';
            const safeValue = this.escapeHtml(val);
            return `
              <span class="issue-status-pill ${this.getIssueStatusClass(val)}" title="${safeValue}">
                <span class="issue-status-dot"></span>
                <span class="issue-status-label">${safeValue}</span>
              </span>
            `;
          }
        },
        {
          title: "Task Category",
          field: "task_category",
          width: 120,
          formatter: (cell: any) => {
            const val = `${cell.getValue() ?? ''}`.trim() || '-';
            const safeValue = this.escapeHtml(val);
            return `<span class="issue-category-pill ${this.getIssueCategoryClass(val)}" title="${safeValue}">${safeValue}</span>`;
          }
        },      

        // {
        //   title: "Category",
        //   field: "category",
        //   width: 120,
        //   formatter: (cell: any) => {
        //     const value = cell.getValue();

        //     if (!value) {
        //       return "";
        //     }

        //     const textClass = this.categoryTextClassMap[value] ?? "text-gray-500";

        //     return `
        //       <span class="font-medium ${textClass}">${value}</span>
        //     `;
        //   }
        // },
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
        // {
        //   title: "Progress",
        //   field: "tasks_done",
        //   minWidth: 150,
        //   formatter: (cell: any) => {
        //     const data = cell.getData();
        //     const total = data.tasks_done + data.tasks_pending;
        //     const pct = data.completion_percentage

        //     // Color logic
        //     let colorClass = "text-blue-600";
        //     let strokeClass = "text-blue-600";

        //     if (pct === 100) {
        //       colorClass = "text-emerald-500";
        //       strokeClass = "text-emerald-500";
        //     } else if (pct < 30) {
        //       colorClass = "text-amber-500";
        //       strokeClass = "text-amber-500";
        //     }

        //     // SVG parameters for 36x36 viewBox, radius 14
        //     // Circumference = 2 * PI * 14 ~= 87.96
        //     const radius = 14;
        //     const circumference = 100;
        //     const offset = circumference - (pct / 100) * circumference;

        //     return `
        //         <div class="flex items-center gap-3 w-full">
        //             <div class="relative w-9 h-9 flex items-center justify-center shrink-0">
        //                 <!-- Background Circle -->
        //                 <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
        //                     <path class="text-gray-200" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3" />
        //                     <!-- Progress Circle -->
        //                     <path class="${strokeClass} transition-all duration-1000 ease-out" stroke-dasharray="${circumference}, ${circumference}" stroke-dashoffset="${offset}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        //                 </svg>
        //                 <div class="absolute text-[9px] font-bold text-gray-700">${pct}%</div>
        //             </div>
        //             <div class="flex flex-col min-w-0">
        //                 <span class="text-xs font-semibold text-gray-700 truncate"> ${pct}</span>
        //                 <span class="text-[10px] text-gray-400 font-medium truncate">Completed</span>
        //             </div>
        //         </div>
        //         `;
        //   }
        // },

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
          width: 130,
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

    this.table.on("cellEditing", (cell: any) => {
      if (cell.getField() === "assigned_to") {
        this.originalAssignedTo = Number(cell.getValue());
      }
    });

    this.table.on('cellEdited', (cell: any) => {
      const rowData = cell.getRow().getData();
      const loggedInEmpId = Number(this.storageService.getEmpId());
      const isAdmin = this.storageService.roles?.isAdmin;
      const assignedFrom = Number(rowData.assigned_from);
      const assignedTo =
        cell.getField() === "assigned_to" ? Number(this.originalAssignedTo) : Number(rowData.assigned_to);
      const canEdit = isAdmin || loggedInEmpId === assignedFrom || loggedInEmpId === assignedTo;
      if (!canEdit) {
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
    const data = cell.getData?.() ?? {};
    const issueId = Number(data?.id);
    const isDeleting = this.deletingIssueId === issueId;
    const isUpdating = this.updatingIssueId === issueId;

    return `
      <div class="flex items-center justify-center gap-3 w-full h-full">
        <button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit ${isUpdating ? 'tabulator-action-button--loading' : ''}" title="${isUpdating ? 'Updating...' : 'Edit'}" ${isUpdating || isDeleting ? 'disabled' : ''}>
          <i class="${isUpdating ? 'ri-loader-4-line tabulator-action-spinner' : 'ri-pencil-line text-lg'} pointer-events-none"></i>
        </button>
        <button class="text-slate-400 hover:text-red-600 transition-colors btn-delete ${isDeleting ? 'tabulator-action-button--loading' : ''}" title="${isDeleting ? 'Deleting...' : 'Delete'}" ${isDeleting || isUpdating ? 'disabled' : ''}>
          <i class="${isDeleting ? 'ri-loader-4-line tabulator-action-spinner' : 'ri-delete-bin-line text-lg'} pointer-events-none"></i>
        </button>
           <button class="text-slate-400 hover:text-emerald-600 transition-colors btn-download" title="Download" ${isDeleting || isUpdating ? 'disabled' : ''}>
          <i class="ri-download-2-line text-lg pointer-events-none"></i>
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

    const loggedInEmpId = this.storageService.getEmpId();
    const isEmployee = this.storageService.roles?.isEmployee;
    const isAssignedUser = loggedInEmpId === data.assigned_to || loggedInEmpId === data.assigned_from;
    if (isEmployee && !isAssignedUser) {
      this.toasterService.error("You are Not Allowed.");
      return;
    }
    if (target.classList.contains('btn-edit')) {
      this.drawerService.open('task', data, 'bug')
    } else if (target.classList.contains('btn-delete')) {
      // if (this.storageService.roles.isEmployee) {
      //   return
      // }
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
          this.deletingIssueId = Number(data.id);
          this.refreshVisibleRows();
          this.authService.deleteTask(this.storageService.getUsername(), data.id)
            .pipe(finalize(() => {
              this.deletingIssueId = null;
              this.refreshVisibleRows();
            }))
            .subscribe((res: any) => {
              this.toasterService.success(res.message);
              this.getTasksByProjectIdNdEmployeeId();
            }, err => {
              this.toasterService.error(err?.error?.message);
            })
        }
      });
    }else if (target.classList.contains('btn-download')) {
      this.openFile(data.link_url);
    }
  }

    private openFile(linkUrl: string | null | undefined): void {
    const url = `${linkUrl ?? ''}`.trim();
    if (!url) {
      this.toasterService.error('No file is available for this issue.');
      return;
    }
 
    window.open(encodeURI(url), '_blank', 'noopener,noreferrer');
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
      this.toasterService.error('Please select issues and a phase.');
      return;
    }

    this.movingPhaseId = Number(phaseId);
    this.authService.swapTask(phaseId, taskIds.join(','), this.storageService.getUsername())
      .pipe(finalize(() => {
        this.movingPhaseId = null;
      }))
      .subscribe({
      next: (res: any) => {
        this.toasterService.success(res?.message || 'Issues moved successfully.');
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
        this.toasterService.error(err?.error?.message || 'Unable to move issues.');
      }
    });
  }
  addMenber() {
    this.drawerService.open('task', "", 'bug');

  }

  loadData(e: any) {
    this.getProjects();
    this.getPhasesByProjectId(e);
    this.getStatusList();
    this.getEmployees();

  }

  projectList: any[] = [];
  employeeList: any[] = [];
  versionList: any[] = [];
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
    this.updatingIssueId = Number(selectTask?.id);
    this.refreshVisibleRows();
    this.authService.updateTask(selectTask)
      .pipe(finalize(() => {
        this.updatingIssueId = null;
        this.refreshVisibleRows();
      }))
      .subscribe({
      next: ((res: any) => {
        this.toasterService.success(res?.message);
        this.getTasksByProjectIdNdEmployeeId()
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
    this.version = '';
    this.refreshIssuesData();
  }

  onVersionChange(version: any): void {
    this.version = version ?? '';
    this.refreshIssuesData(true);
  }

  filterVersions(event: Event): void {
    this.versionSearchText = (event.target as HTMLInputElement).value;
    const query = this.versionSearchText.trim().toLowerCase();
    this.filteredVersionList = query
      ? this.versionList.filter(item => `${item ?? ''}`.toLowerCase().includes(query))
      : [...this.versionList];
  }

  onVersionSelectOpened(opened: boolean): void {
    if (!opened) return;
    this.versionSearchText = '';
    this.filteredVersionList = [...this.versionList];
  }

  private canOpenIssueTaskDetails(rowData: any): boolean {
    const loggedInEmpId = Number(this.storageService.getEmpId());
    const assignedFrom = Number(rowData?.assigned_from);
    const assignedTo = Number(rowData?.assigned_to);
    const roles = this.storageService.roles;

    return !!(
      roles?.isAdmin ||
      roles?.isManager ||
      loggedInEmpId === assignedFrom ||
      loggedInEmpId === assignedTo
    );
  }

  private openTaskDetails(rowData: any): void {
    this.saveViewState();
    sessionStorage.setItem('activeProjectTab', 'issues');
    this.router.navigate(['/main/projects/project-content', this.projectid, rowData.id], {
      queryParams: this.buildTaskDetailsQueryParams(rowData)
    });
  }

  private openIssueDetailsDialog(rowData: any): void {
    const summaryCards = [
      { label: 'Owner', value: rowData?.assigned_from_name || '-' },
      { label: 'Assignee', value: rowData?.assigned_to_name || '-' },
      { label: 'Start Date', value: rowData?.start_date || '-' },
      { label: 'End Date', value: rowData?.end_date || '-' },
      { label: 'Estimated Hours', value: rowData?.estimated_hours || '-' },
      { label: 'Worked Hours', value: rowData?.worked_hours || '-' }
    ];

    const summaryHtml = summaryCards.map((item: any) => `
      <div style="
        background:#ffffff;
        border:1px solid #e2e8f0;
        border-radius:16px;
        padding:14px 16px;
        box-shadow:0 10px 30px rgba(15,23,42,0.06);
      ">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; margin-bottom:6px;">
          ${this.escapeHtml(item.label)}
        </div>
        <div style="font-size:14px; font-weight:600; color:#0f172a; word-break:break-word;">
          ${this.escapeHtml(item.value)}
        </div>
      </div>
    `).join('');

    const metadataRows = [
      { label: 'Type', value: rowData?.task_type || '-' },
      { label: 'Version', value: rowData?.version || '-' },
      { label: 'Phase', value: rowData?.phase_title || '-' },
      {
        label: 'Completion',
        value: rowData?.completion_percentage !== undefined && rowData?.completion_percentage !== null
          ? `${rowData.completion_percentage}%`
          : '-'
      }
    ];

    const metadataHtml = metadataRows.map((item: any) => `
      <div style="display:flex; justify-content:space-between; gap:16px; padding:12px 0; border-bottom:1px solid #e2e8f0;">
        <div style="font-size:13px; font-weight:600; color:#475569;">${this.escapeHtml(item.label)}</div>
        <div style="font-size:13px; font-weight:600; color:#0f172a; text-align:right; word-break:break-word;">${this.escapeHtml(item.value)}</div>
      </div>
    `).join('');

    Swal.fire({
      showCloseButton: false,
      showConfirmButton: false,
      width: 860,
      padding: 0,
      backdrop: 'rgba(0,0,0,0.4)',
      html: `
        <div style="
          text-align:left;
          background:#ffffff;
          border-radius:24px;
          overflow:hidden;
          box-shadow:0 24px 80px rgba(15,23,42,0.22);
          border:1px solid #dbe3f0;
        ">
          <div style="
            padding:28px 32px 24px;
            background:var(--text-active);
            border-radius:24px 24px 0 1px;
            color:#ffffff;
            position:relative;
          ">
            <button type="button" class="issue-dialog-close" style="
              position:absolute;
              top:18px;
              right:18px;
              width:40px;
              height:40px;
              border:none;
              border-radius:999px;
              background:rgba(255,255,255,0.16);
              color:#ffffff;
              display:flex;
              align-items:center;
              justify-content:center;
              cursor:pointer;
              transition:background 0.2s ease;
            ">
              <i class="ri-close-line" style="font-size:20px;"></i>
            </button>
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-right:56px;">
              <div style="min-width:0;">
                 <div style="font-size:28px; font-weight:800; line-height:1.25; word-break:break-word;">
                  ${this.escapeHtml(rowData?.task || 'Issue Details')}
                </div>
              </div>
            </div>
          </div>
          <div style="padding:24px 32px 32px; max-height:68vh; overflow:auto;">
            <div style="
              display:grid;
              grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
              gap:14px;
              margin-bottom:24px;
            ">
              ${summaryHtml}
            </div>

            <div style="display:grid; grid-template-columns:1.1fr 0.9fr; gap:20px;">
              <div style="
                background:#ffffff;
                border:1px solid #e2e8f0;
                border-radius:20px;
                padding:20px 22px;
                box-shadow:0 10px 30px rgba(15,23,42,0.06);
              ">
                <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; margin-bottom:12px;">
                  Description
                </div>
                <div style="font-size:14px; line-height:1.7; color:#1e293b; white-space:pre-wrap; word-break:break-word;">
                  ${this.escapeHtml(rowData?.description || 'No description available')}
                </div>
              </div>

              <div style="
                background:#ffffff;
                border:1px solid #e2e8f0;
                border-radius:20px;
                padding:20px 22px;
                box-shadow:0 10px 30px rgba(15,23,42,0.06);
              ">
                <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; margin-bottom:4px;">
                  More Details
                </div>
                ${metadataHtml}
              </div>
            </div>
          </div>
        </div>
      `,
      didOpen: (popup) => {
        const swalPopup = popup.parentElement as HTMLElement | null;
        // if (swalPopup) {
        //   swalPopup.style.background = 'transparent';
        //   swalPopup.style.boxShadow = 'none';
        // }
        popup.style.setProperty('--swal2-background', 'transparent', 'important');  //removed everything added this
        const closeButton = popup.querySelector('.issue-dialog-close') as HTMLButtonElement | null;
        if (closeButton) {
          closeButton.addEventListener('click', () => Swal.close());
        }
      }
    });
  }

  private buildBadge(label: string, background: string, color: string): string {
    return `
      <span style="
        display:inline-flex;
        align-items:center;
        padding:6px 12px;
        border-radius:999px;
        background:${background};
        color:${color};
        font-size:12px;
        font-weight:700;
        letter-spacing:0.02em;
      ">
        ${this.escapeHtml(label)}
      </span>
    `;
  }

  private getIssueStatusClass(status: string): string {
    const normalized = `${status ?? ''}`.trim().toLowerCase();
    if (['active', 'on-track', 'approved', 'completed', 'invoiced', 'open', 'pass', 'passed'].includes(normalized)) {
      return 'issue-status-success';
    }
    if (['in-progress', 'in-review', 'in-testing', 'planning'].includes(normalized)) {
      return 'issue-status-progress';
    }
    if (['on-hold', 'to-be-tested', 'upcoming-release'].includes(normalized)) {
      return 'issue-status-warning';
    }
    if (['delayed', 'cancelled', 'rejected', 'closed', 'failed'].includes(normalized)) {
      return 'issue-status-danger';
    }
    return 'issue-status-muted';
  }

  private getIssueCategoryClass(category: string): string {
    const normalized = `${category ?? ''}`.trim().toLowerCase();
    if (normalized === 'support') {
      return 'issue-category-success';
    }
    if (normalized === 'requirement') {
      return 'issue-category-warning';
    }
    if (normalized === 'bug') {
      return 'issue-category-danger';
    }
    return 'issue-category-muted';
  }

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }

  private escapeHtml(value: any): string {
    return String(value ?? '-')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildTaskDetailsQueryParams(rowData?: any): Record<string, string | null> {
    const weekRange = this.getWeekRangeFromDate(rowData?.start_date);
    const navigationFromDate = weekRange?.fromdate || this.fromdate;
    const navigationToDate = weekRange?.todate || this.todate;

    return {
      tasktype: 'bug',
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

  private applyNavigationDateRange(): void {
    const params = this.route.snapshot.queryParamMap;
    const fromDate = params.get('fromdate') || params.get('startDate');
    const toDate = params.get('todate') || params.get('endDate');

    if (!this.isValidDateRangeValue(fromDate) || !this.isValidDateRangeValue(toDate)) {
      return;
    }

    this.fromdate = fromDate;
    this.todate = toDate;
    this.initialStartDate = this.fromdate;
    this.initialEndDate = this.todate;
    this.version = '';
    this.tableData = [];
    this.pendingStateRestore = false;
    this.isRestoringTableState = false;
    this.suppressInitialRangeFetch = false;
    this.tableStateRestoreAttempts = 0;
  }

  private isValidDateRangeValue(value: string | null): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.getTime());
  }


  formatDateToYMD(date: Date | string | null): string {
    // if (!date) return 'null';
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }

  private get viewStateKey(): string {
    return `project-issues:${this.projectid}`;
  }

  private restoreViewState(): void {
    const state = this.transientViewStateService.getState<IssuesViewState>(this.viewStateKey);
    if (!state) {
      return;
    }

    this.tableData = Array.isArray(state.tableData) ? state.tableData : [];
    this.projectList = Array.isArray(state.projectList) ? state.projectList : [];
    this.employeeList = Array.isArray(state.employeeList) ? state.employeeList : [];
    this.phaseList = Array.isArray(state.phaseList) ? state.phaseList : [];
    this.statusList = Array.isArray(state.statusList) ? state.statusList : [];
    this.searchTerm = state.searchTerm || '';
    this.version = state.version || '';
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
    const state = this.transientViewStateService.getState<IssuesViewState>(this.viewStateKey);
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
          { field: "version", type: "like", value: value }
        ]
      ]);
      return;
    }

    this.table.clearFilter();
  }

  private saveViewState(): void {
    this.transientViewStateService.setState<IssuesViewState>(this.viewStateKey, {
      tableData: this.tableData,
      projectList: this.projectList,
      employeeList: this.employeeList,
      phaseList: this.phaseList,
      statusList: this.statusList,
      searchTerm: this.searchTerm,
      version: this.version || null,
      fromdate: this.fromdate,
      todate: this.todate,
      page: Number(this.table?.getPage?.() || 1) || 1,
      pageSize: Number(this.table?.getPageSize?.() || 15) || 15
    });
  }

  private refreshIssuesData(clearExistingData = false): void {
    if (!this.projectid || !this.empid) {
      return;
    }

    if (clearExistingData) {
      this.tableData = [];
      if (this.table) {
        this.safeReplaceData(this.table, this.tableData);
      }
    }

    const request$ = this.version
      ? this.authService.getIsasueByProjectIdNdEmployeeId(this.projectid, this.empid, 0, "bug", this.version)
      : this.authService.getTasksByProjectIdNdEmployeeId(this.projectid, this.empid, 0, "bug", this.fromdate || '', this.todate || '');

    this.tableLoading = true;
    request$
      .pipe(finalize(() => {
        this.tableLoading = false;
      }))
      .subscribe({
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
        this.toasterService.error(err?.error?.message || 'Unable to load issues.');
      }
    });
  }

  // private safeReplaceData(table: any, data: any): void {
  //   const normalized = Array.isArray(data) ? data : [];
  //   try {
  //     table?.replaceData?.(normalized);
  //   } catch {
  //     try {
  //       table?.setData?.(normalized);
  //     } catch {
  //       // ignore
  //     }
  //   }

  //   try {
  //     // table?.redraw?.(true);
  //   } catch {
  //     // ignore
  //   }
  // }
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

}
