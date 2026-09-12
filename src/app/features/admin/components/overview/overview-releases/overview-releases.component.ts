import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, filter, finalize, forkJoin, map, Observable, of, startWith } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { PdfService } from 'src/app/_core/services/pdf.service';
import { ExcelService } from 'src/app/_core/services/excel.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { ReleaseMailsListComponent } from '../../../core/mails/release-mails-list/release-mails-list.component';
import { MatDialog } from '@angular/material/dialog';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import Swal from 'sweetalert2';
declare const Tabulator: any;
declare const luxon: any;
export interface Release {
  id: string;
  code: string;
  title: string;
  version: string;
  status: ReleaseStatus;
  planned_date: string;
  released_date: string;
  projectid: string;
  assigned_to: string;
  assignedTo?: string | number;
  assigned_to_id?: string | number;
  assignedToId?: string | number;
  assigned_from?: string | number;
  assignedFrom?: string | number;
  assigned_from_id?: string | number;
  assignedFromId?: string | number;
  assigned_to_name?: string;
  assignedToName?: string;
  assignee_to_name?: string;
  assigneeToName?: string;
  release_type: 'Internal' | 'External';
  ismail: boolean;
  closed_date?: string;
  createddate?: string;
  updateddate?: string;
  created_date?: string;
  updated_date?: string;
  to_be_tested_date?: string;
  toBeTestedDate?: string;
  status_changed_date?: string;
  file_url?: string;
  mail_content?: string;
  project_name?: string
  project_title?: string;
  manager_name?: string;
  managerName?: string;
  reject_reason?: string
}
export interface Project {
  id: string;
  project_title: string;
}

export interface Employee {
  id: string;
  employee_name: string;
  email: string;
  department?: any;
  dept?: any;
  team?: any;
  department_id?: string | number;
  departmentId?: string | number;
  departmentid?: string | number;
  dept_id?: string | number;
  deptId?: string | number;
  deptid?: string | number;
  department_name?: string;
  departmentName?: string;
  dept_name?: string;
  deptName?: string;
}
interface DepartmentOption {
  filter_id: string;
  api_id: any;
  department_name: string;
  raw?: any;
}
interface ReleaseDepartmentDefinition {
  key: string;
  label: string;
  aliases: string[];
  managerName?: string;
}
interface ReleaseOverviewExportSection {
  departmentName: string;
  managerName: string;
  releases: Release[];
}
export type ReleaseStatus = 'Upcoming-Release' | 'On-Hold' | 'Open' | 'In-Progress' | 'To-be-Tested' | 'Rejected' | 'Pass' | 'Failed';
type ReleasePerformanceState = 'none' | 'excellent' | 'very-good' | 'good' | 'poor';
@Component({
  selector: 'app-overview-releases',
  templateUrl: './overview-releases.component.html',
  styleUrls: ['./overview-releases.component.scss']
})
export class OverviewReleasesComponent {
  tabulator: any;
  // View State
  currentView: string = 'table';
  searchQuery: string = '';
  readonly allProjectsValue = '__all_projects__';
  readonly allEmployeesValue = '__all_employees__';
  myControl = new FormControl<any>(this.allProjectsValue);
  projectFilterControl = new FormControl('');
  filteredOptions: Observable<any[]> = of([]);
  employeeControl = new FormControl<any>(this.allEmployeesValue);
  employeeFilterControl = new FormControl('');
  filteredEmployeeOptions: Observable<Employee[]> = of([]);
  // Data
  releaseList: Release[] = [];
  filteredReleases: Release[] = [];
  projectList: Project[] = [];
  employeeList: Employee[] = [];
  departmentList: any[] = [];
  managerList: any[] = [];
  private employeeDirectory: any[] = [];
  departmentTabs: DepartmentOption[] = [];
  showDepartmentTabs = true;
  selectedDepartmentId: string = 'all';
  projectid: any = 0;
  selectedEmployeeId: any = 0;
  selectedEmployeeName: string = '';
  releaseTypeControl = new FormControl('All');
  releaseTypeFilterControl = new FormControl('');
  readonly releaseTypeOptions: string[] = ['All', 'Internal', 'External'];
  filteredReleaseTypeOptions: Observable<string[]> = of(this.releaseTypeOptions);
  selectedReleaseType: string = 'All';
  hasViewedPdf = false;
  releaseLoading = false;
  pdfPreviewLoading = false;
  pdfDownloadLoading = false;
  excelExporting = false;
  deletingReleaseId: number | null = null;
  updatingReleaseId: number | null = null;

  private previewedReleasePdfRequest: {
    filters: any;
    startDate: any;
    endDate: any;
    data: Release[];
  } | null = null;
  private releaseOverviewLoadRunId = 0;
  private readonly allDepartmentTab: DepartmentOption = {
    filter_id: 'all',
    api_id: '',
    department_name: 'All'
  };
  private readonly releaseDepartmentDefinitions: ReleaseDepartmentDefinition[] = [
    { key: 'ridapps', label: 'Ridapps', aliases: ['ridapps', 'ridapp', 'ridapps team', 'rid apps'] },
    { key: 'software-team', label: 'Software Team', aliases: ['Software Development Team', 'software', 'software development'] },
    { key: 'sqa', label: 'SQA', aliases: ['sqa', 'qa', 'quality assurance', 'software quality assurance', 'qa team'], managerName: 'Gnanamudhalvan P' }
  ];
  // Config
  statusList: ReleaseStatus[] = ['Upcoming-Release', 'To-be-Tested', 'On-Hold', 'In-Progress', 'Rejected', 'Pass', 'Failed'];

  // Drag & Drop
  draggedReleaseId: string | null = null;

  empid: any = 0
  startDate: any = null;
  endDate: any = null;
  username: any;

  @ViewChild('tableEl') tableEl?: ElementRef;

  constructor(private matDialog: MatDialog, private authService: AuthService, private drawerService: DrawerService, private storageService: StorageService, private router: Router, private route: ActivatedRoute, private toasterService: ToasterService, private pdfService: PdfService, private excelService: ExcelService) {
    this.clearStoredReleaseOverviewState();
    this.empid = this.storageService.getEmpId();
    this.username = this.storageService.getUsername();

  }
  setActiveTab(id: any): void {
    this.currentView = id;
    this.setView(id)
  }
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
  ngOnInit(): void {
    this.departmentTabs = this.buildReleaseDepartmentTabs([]);
    this.applyRoleBasedDepartmentState();
    this.initializeReleaseTypeFilter();
    this.initializeEmployeeFilter();
    this.setCurrentWeekDates();
    this.loadData();

    if (this.currentView === 'table') {
      this.setView('table');
    }

    this.drawerService.drawerAction$
      .pipe(filter(a => a.source === 'release'))
      .subscribe(() => { this.loadData() });
  }



  loadData() {
    this.getAllDepartments();
    this.getManagers();
    this.getReleaseOverviewByEmp();
    this.getEmployeelistByProjectId();
    this.getAllProjectsByEmployeeId();
  }

  createNew() {
    console.log('New Release button clicked');

    this.drawerService.open("release")
  }

  // --- View & Search ---

  setView(view: 'table' | 'kanban') {
    this.currentView = view;
    if (view === 'table') {
      // wait a tick for *ngIf to render the container
      setTimeout(() => {
        if (this.tableEl) {
          this.drawTable(this.tableEl.nativeElement);
        }
        this.getReleaseOverviewByEmp();
      });
    }
  }

  onSearchChange(query: string) {
    this.searchQuery = query;
    this.filterData();
  }

  filterData() {
    let data = [...this.releaseList];
    const selectedDepartment = this.getSelectedDepartmentOption();

    data = this.applySelectedProjectFilter(data);
    data = this.applySelectedEmployeeFilter(data);

    if (!this.isAllDepartment(selectedDepartment)) {
      data = this.filterReleasesByManagerOrDepartment(data, selectedDepartment);
    }

    data = this.applySelectedReleaseTypeFilter(data);

    if (this.searchQuery) {
      const lowerQuery = this.searchQuery.toLowerCase();
      data = data.filter(r =>
        `${r.title ?? ''}`.toLowerCase().includes(lowerQuery) ||
        `${r.code ?? ''}`.toLowerCase().includes(lowerQuery) ||
        `${r.version ?? ''}`.toLowerCase().includes(lowerQuery)
      );
    }

    this.filteredReleases = data;

    if (this.currentView === 'table' && this.tabulator) {
      this.safeReplaceData(this.tabulator, this.filteredReleases);

    }
  }

  // --- Kanban Logic ---

  getReleasesByStatus(status: ReleaseStatus): Release[] {
    return this.filteredReleases.filter(r => r.status === status);
  }

  getCountByStatus(status: ReleaseStatus): number {
    return this.filteredReleases.filter(r => r.status === status).length;
  }

  // --- Drag and Drop ---

  onDragStart(event: DragEvent, release: Release) {
    if (!this.canDragRelease(release)) {
      event.preventDefault();
      this.toasterService.error("You are Not Allowed.");
      this.draggedReleaseId = null;
      return;
    }

    this.draggedReleaseId = release.id;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', release.id);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDrop(event: DragEvent, newStatus: string) {
    event.preventDefault();
    const releaseId = event.dataTransfer?.getData('text/plain');
    if (releaseId) {
      const release = this.releaseList.find(r => r.id == releaseId);
      console.log(release);

      if (!release) {
        this.draggedReleaseId = null;
        return;
      }

      if (!this.canDragRelease(release)) {
        this.toasterService.error("You are Not Allowed.");
        this.draggedReleaseId = null;
        return;
      }

      if (!this.canDragOrDrop(release.status, newStatus)) {
        this.toasterService.error('Not Allowed');
        this.draggedReleaseId = null;
        return;
      }

      if (release && release.status !== newStatus) {
        release.status = newStatus as ReleaseStatus;
        this.updateRelease(release)
        this.filterData();
      }
    }
    this.draggedReleaseId = null;
  }

  // --- Helpers ---

  getOwnerInitials(name: string | undefined): string {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  }

  trackById(index: number, item: Release) {
    return item.id;
  }
  // --- Tabulator Logic ---


  drawTable(element?: any) {
    if (this.tabulator) {
      this.safeReplaceData(this.tabulator, this.filteredReleases);

    }
    const freezeColumns = !this.isCompactViewport();
    const canEditTableCell = (cell: any) => this.canEditRelease(cell.getRow().getData());
    this.tabulator = new Tabulator(element, {
      data: this.filteredReleases,
      layout: "fitDataStretch",
      responsiveLayout: false,
      pagination: "local",
      paginationSize: 10,
      paginationCounter: "rows",
      movableColumns: true,
      selectable: true,
      editTriggerEvent: "dblclick",
      paginationSizeSelector: [10, 25, 50, 100],
      placeholder: "No Releases Found",

      headerSortElement: function (col: any, dir: any) {
        if (dir === "asc") return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === "desc") return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },
      // Edit Callback
      cellEdited: (cell: any) => {
        const val = cell.getValue();
        const data = cell.getData();
        if (!this.canEditRelease(data)) {
          return;
        }
        // Sync change with local array so filtered data persists
        const found = this.releaseList.find(r => r.id === data.id);
        if (found) {
          (found as any)[cell.getField()] = val;
        }
      },
      columns: [
        {
          title: "Title", field: "title", editor: "input",
          editable: canEditTableCell,
          frozen: freezeColumns,
          width: 300,
          formatter: (cell: any) => {
            const data = cell.getData();
            return `
                <div class="flex items-center justify-between w-full group relative pr-8">
                    <div class="flex  gap-2">
                        <div class="text-[var(--text-active)] text-lg font-semibold">
                            <i class="ri-folder-3-line"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="font-medium text-gray-900 text-m leading-relaxed break-words">${data.title}</span>
                        </div>
                    </div>
                    <button class="absolute access-btn right-0 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white border border-gray-200 shadow-sm px-2.5 py-1 rounded-md hover:bg-gray-50 text-[var(--text-active)] hover:text-[var(--text-active)]-700 focus:outline-none z-10 flex items-center gap-1.5 transform translate-x-2 group-hover:translate-x-0" >
                        <span class="text-[10px] font-semibold uppercase tracking-wide">Open</span>
                        <i class="ri-arrow-right-up-line text-xs"></i>
                    </button>
                </div>
                `;
          }, cellClick: (e: any, cell: any) => {
            if (e.target.closest('.access-btn')) {
              e.stopPropagation();
              const rowData = cell.getRow().getData();
              this.openDailogue(rowData);
            }
          }
        },
        { title: "Project", field: "project_name", },
        {
          title: "Manager / TL",
          field: "manager_name",
          width: 200,
          hozAlign: "center",
        },
        {
          title: "Assiged from",
          field: "assignee_from_name",
          width: 200,
          hozAlign: "center",
        },
         {
          title: "Assignee To",
          field: "assigned_to",
          minWidth: 200,
          editable: canEditTableCell,
          editor: "list",
          editorParams: () => ({
            values: (Array.isArray(this.employeeList) ? this.employeeList : []).map((employee: any) => ({
              label: this.getEmployeeDisplayName(employee),
              value: this.getEmployeeId(employee)
            })),
            autocomplete: true,
            listOnEmpty: true,
            clearable: true
          }),
          formatter: (cell: any) => {
            const name = this.getReleaseAssigneeDisplayName(cell.getData());
            const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
            return `
                <div class="flex items-center gap-2">
                    <div class="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-600">${this.escapeHtml(initials)}</div>
                    <span class="text-m">${this.escapeHtml(name)}</span>
                </div>
                `;
          }
        },
        {
          title: "Release Performance",
          field: "release_performance",
          width: 180,
          hozAlign: "center",
          headerSort: true,
          sorter: (_a: any, _b: any, aRow: any, bRow: any) =>
            this.getReleasePerformanceSortValue(aRow?.getData?.()) - this.getReleasePerformanceSortValue(bRow?.getData?.()),
          formatter: (cell: any) => {
            const performance = this.getReleasePerformance(cell.getData());
            return performance && performance !== '-'
              ? `<span class="release-performance-pill ${this.getReleasePerformancePillClass(performance)}">${this.escapeHtml(performance)}</span>`
              : '-';
          }
        },
        { title: "Version", field: "version", editor: "input", editable: canEditTableCell },
        { title: "Reject Reason", field: "reject_reason", width: 200, editor: "input", editable: canEditTableCell },
        {
          title: "Status",
          field: "status", width: 200,
          editable: canEditTableCell,
          editor: "list", editorParams: { values: this.statusList },
          formatter: (cell: any) => {
            const val = `${cell.getValue() ?? ''}`.trim();
            return val
              ? `<span class="release-status-pill ${this.getReleaseStatusPillClass(val)}">${this.escapeHtml(val)}</span>`
              : '';
          }
        },
       

        {
          title: "Actions",
          field: "actions",
          width: 100,
          hozAlign: "center",
          headerSort: false,
          frozen: freezeColumns,
          formatter: (cell: any) => this.actionFormatter(cell),
          cellClick: (e: any, cell: any) => this.handleActionClick(e, cell),
          cssClass: "sticky-col-right",
        }
      ]
    });

    attachTabulatorPaginationPersistence(this.tabulator, buildTabulatorPaginationKey('overview-releases-table'));

    this.tabulator.on("cellEdited", (cell: any) => {
      var rowData = cell.getData();
      if (!this.canEditRelease(rowData)) {
        this.toasterService.error("You are Not Allowed.");
        cell.restoreOldValue();
        return;
      }
      this.updateRelease(rowData)
    });
  }
  actionFormatter(cell: any) {
    const data = cell.getData();
    const releaseId = Number(data?.id);
    const isDeleting = this.deletingReleaseId === releaseId;
    const isUpdating = this.updatingReleaseId === releaseId;
    const editButton = this.canEditRelease(data)
      ? `
        <button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit ${isUpdating ? 'tabulator-action-button--loading' : ''}" title="${isUpdating ? 'Updating...' : 'Edit'}" ${isUpdating || isDeleting ? 'disabled' : ''}>
          <i class="${isUpdating ? 'ri-loader-4-line tabulator-action-spinner' : 'ri-pencil-line text-lg'} pointer-events-none"></i>
        </button>
      `
      : '';

    return `
      <div class="flex items-center justify-center gap-3 w-full h-full">
        ${editButton}
        <button class="text-slate-400 hover:text-red-600 transition-colors btn-delete ${isDeleting ? 'tabulator-action-button--loading' : ''}" title="${isDeleting ? 'Deleting...' : 'Delete'}" ${isDeleting || isUpdating ? 'disabled' : ''}>
          <i class="${isDeleting ? 'ri-loader-4-line tabulator-action-spinner' : 'ri-delete-bin-line text-lg'} pointer-events-none"></i>
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
      this.openDrawer(data);
    } else if (target.classList.contains('btn-delete')) {
      this.deleteRelease(data);
    }
  }
  deleteRelease(release: Release | any): void {

    const releaseId = Number(release?.id);
    const createdBy = Number(release?.createdby ?? release?.created_by ?? this.empid);
    const releaseName = release?.title || `Release #${releaseId}`;

    if (!releaseId) {
      this.toasterService.error('Invalid release selected.');
      return;
    }

    if (!createdBy) {
      this.toasterService.error('Unable to identify release creator.');
      return;
    }

    Swal.fire({
      title: 'Delete Release?',
      text: `Are you sure you want to delete "${releaseName}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }

      this.deletingReleaseId = releaseId;
      this.refreshReleaseRows();
      this.authService.deleteRelease(releaseId, this.username)
        .pipe(finalize(() => {
          this.deletingReleaseId = null;
          this.refreshReleaseRows();
        }))
        .subscribe({
          next: (res: any) => {
            this.toasterService.success(res?.message || 'Release deleted successfully.');
            this.activeMenuId = null;
            this.getReleaseByProjectId();
            this.getReleaseOverviewByEmp()
          },
          error: (err: any) => {
            this.toasterService.error(err?.error?.message || 'Unable to delete release.');
          }
        });
    });
  }
  getReleaseByProjectId(callback?: Function) {
    this.authService.getReleaseByProjectId(this.projectid).subscribe({
      next: (res: any) => {
        this.releaseList = res;
        this.filterData();
      }
    });
    if (this.releaseLoading) {
      this.setReleaseTableInlineLoading(true, 'Loading releases...');
    }
  }
  getStatusList() {
    this.authService.getStatusList().subscribe({
      next: (res: any) => {
        this.statusList = this.mergeReleaseStatuses(res);
      }
    });
  }

  private mergeReleaseStatuses(statuses: any): ReleaseStatus[] {
    const defaultStatuses: ReleaseStatus[] = ['In-Progress', 'To-be-Tested', 'On-Hold', 'Rejected', 'Pass', 'Failed',];
    const incomingStatuses = Array.isArray(statuses) ? statuses : [];
    const mergedStatuses = [...incomingStatuses, ...defaultStatuses]
      .map((status: any) => `${status ?? ''}`.trim())
      .filter((status): status is ReleaseStatus => !!status && defaultStatuses.includes(status as ReleaseStatus));

    return Array.from(new Set(mergedStatuses)) as ReleaseStatus[];
  }
  getAllProjectsByEmployeeId() {
    this.authService.getAllProjectsByEmployeeId(this.empid).subscribe({
      next: (res: any) => {
        this.projectList = Array.isArray(res) ? res : this.extractResponseList(res, ['projects', 'projectList', 'data', 'details', 'result', 'results']);
        this.filteredOptions = this.projectFilterControl.valueChanges.pipe(
          startWith(this.projectFilterControl.value || ''),
          map((value: any) => {
            const name = typeof value === 'string' ? value : '';

            return name ? this._filter(name) : [...this.projectList];
          })
        );
        this.projectFilterControl.setValue(this.projectFilterControl.value || '', { emitEvent: true });
      }
    });
  }

  getEmployeelistByProjectId() {
    forkJoin({
      employees: this.authService.getEmployeeList().pipe(catchError(() => of([]))),
      employeeDirectory: this.authService.getUsersAll(Number(this.empid || 0)).pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ employees, employeeDirectory }: any) => {
        const employeeRows = this.extractResponseList(employees, ['employees', 'users', 'data', 'details', 'result', 'results']);
        const directoryRows = this.extractResponseList(employeeDirectory, ['employees', 'users', 'data', 'details', 'result', 'results']);

        this.employeeList = employeeRows;
        this.employeeDirectory = this.mergeEmployeeDirectoryRows(employeeRows, directoryRows);
        this.initializeEmployeeFilter();
        this.syncSelectedEmployeeControl();
        const previousDepartmentApiId = this.getSelectedDepartmentApiId();
        this.applyRoleBasedDepartmentState();
        this.filterData();

        const currentDepartmentApiId = this.getSelectedDepartmentApiId();
        if (
          this.shouldScopeToLoggedInEmployeeDepartment() &&
          `${previousDepartmentApiId ?? ''}` !== `${currentDepartmentApiId ?? ''}`
        ) {
          this.resetPdfPreviewState();
          this.getReleaseOverviewByEmp();
        }
      }
    });
  }
  getManagers() {
    const previousManagerName = this.getSelectedManagerNameParam();

    this.authService.getManagerList().subscribe({
      next: (res: any) => {
        this.managerList = this.extractResponseList(res, ['manager_list', 'managerList', 'managerlist', 'managers', 'users', 'employees', 'data', 'details', 'result', 'results']);
        this.filterData();

        const currentManagerName = this.getSelectedManagerNameParam();
        if (
          !this.isAllDepartment(this.getSelectedDepartmentOption()) &&
          `${previousManagerName ?? ''}` !== `${currentManagerName ?? ''}`
        ) {
          this.getReleaseOverviewByEmp();
        }
      },
      error: () => {
        this.managerList = [];
        this.filterData();
      }
    });
  }
  getAllDepartments() {
    this.authService.getAllDepartments().subscribe({
      next: (res: any) => {
        const previousDepartmentApiId = this.getSelectedDepartmentApiId();
        const persistedDepartmentKey = this.normalizeDepartmentKey(this.selectedDepartmentId);

        this.departmentList = this.extractResponseList(res, ['departments', 'departmentList', 'data', 'details']);
        this.departmentTabs = this.buildReleaseDepartmentTabs(this.departmentList);

        if (this.shouldScopeToLoggedInEmployeeDepartment()) {
          this.applyRoleBasedDepartmentState();
        } else if (!this.departmentTabs.some(department => department.filter_id === this.selectedDepartmentId)) {
          const matchedPersistedDepartment = this.departmentTabs.find(department =>
            !this.isAllDepartment(department) &&
            this.getDepartmentOptionKeys(department).includes(persistedDepartmentKey)
          );

          this.selectedDepartmentId = matchedPersistedDepartment?.filter_id || this.allDepartmentTab.filter_id;
        }

        this.filterData();

        const currentDepartmentApiId = this.getSelectedDepartmentApiId();
        if (
          !this.isAllDepartment(this.getSelectedDepartmentOption()) &&
          `${previousDepartmentApiId ?? ''}` !== `${currentDepartmentApiId ?? ''}`
        ) {
          this.getReleaseOverviewByEmp();
        }
      },
      error: () => {
        this.departmentTabs = this.buildReleaseDepartmentTabs([]);
        this.applyRoleBasedDepartmentState();
        this.filterData();
      }
    });
  }
  onProjectSelect(e: any) {
    if (!e || e === this.allProjectsValue) {
      this.myControl.setValue(this.allProjectsValue, { emitEvent: false });
      this.projectid = 0;
    } else {
      this.myControl.setValue(e, { emitEvent: false });
      this.projectid = e.id;
    }

    this.resetPdfPreviewState();
    this.getReleaseOverviewByEmp()
  }
  getReleaseOverviewByEmp(callback?: Function) {
    const loadRunId = ++this.releaseOverviewLoadRunId;
    this.releaseLoading = true;
    this.setReleaseTableInlineLoading(true, 'Loading releases...');
    this.authService.getReleaseOverviewByEmp(this.getReleaseOverviewPayload())
      .pipe(finalize(() => {
        if (loadRunId === this.releaseOverviewLoadRunId) {
          this.releaseLoading = false;
          this.setReleaseTableInlineLoading(false);
        }
      }))
      .subscribe({
        next: (res: any) => {
          if (loadRunId !== this.releaseOverviewLoadRunId) {
            return;
          }

          this.releaseList = this.normalizeReleaseResponse(res);
          this.filterData();
          if (!callback) {
            this.resetPdfPreviewState();
          }
          callback?.(this.filteredReleases);
        },
        error: (err: any) => {
          if (loadRunId !== this.releaseOverviewLoadRunId) {
            return;
          }

          this.releaseList = [];
          this.filterData();
          this.toasterService.error(err?.error?.message || 'Unable to load release overview.');
        }
      });
  }
  getReleaseOverviewListByEmp(callback?: Function, onError?: () => void) {
    this.authService.getReleaseOverviewListByEmp(this.getReleaseOverviewPayload()).subscribe({
      next: (res: any) => {
        const reportReleases = this.normalizeReleaseResponse(res);
        callback?.(this.getReportRowsMatchingDisplayedReleases(reportReleases));
      },
      error: (err: any) => {
        this.toasterService.error(err?.error?.message || 'Unable to load release report data.');
        onError?.();
      }
    });
  }

  private getReleaseOverviewPayload(): any {
    return {
      employee_id: this.empid,
      selected_emp_id: this.getSelectedEmployeeIdParam(),
      projectid: this.projectid,
      fromdate: this.startDate,
      todate: this.endDate,
      department_id: this.getSelectedDepartmentApiId(),
      manager_name: this.getSelectedManagerNameParam()
    };
  }

  private normalizeReleaseResponse(res: any): Release[] {
    const responseRows = this.extractResponseList(res, [
      'release_list',
      'releaseList',
      'releaseoverviewList',
      'releaseOverviewList',
      'release_overview_list',
      'releases',
      'data',
      'details',
      'result',
      'results'
    ]);
    const releases = responseRows.length ? responseRows : Array.isArray(res) ? res : res ? [res] : [];
    return releases.map((release: any) => this.normalizeReleaseRecord(release));
  }

  private normalizeReleaseRecord(release: any): Release {
    if (!release || typeof release !== 'object') {
      return release;
    }

    const managerName = this.getReleaseManagerDisplayName(release)
      || this.getReleaseDepartmentManagerFallbackName(release)
      || this.getSelectedDepartmentFallbackManagerName();

    return {
      ...release,
      manager_name: managerName || release?.manager_name || release?.managerName || '',
      release_type: this.getReleaseTypeDisplayValue(release?.release_type)
    };
  }

  private getReportRowsMatchingDisplayedReleases(reportReleases: Release[]): Release[] {
    const displayedReleases = Array.isArray(this.filteredReleases) ? this.filteredReleases : [];

    if (!displayedReleases.length) {
      return [];
    }

    const reportRowsByKey = new Map<string, Release>();
    (Array.isArray(reportReleases) ? reportReleases : []).forEach(release => {
      this.getReleaseMatchKeys(release).forEach(key => {
        if (!reportRowsByKey.has(key)) {
          reportRowsByKey.set(key, release);
        }
      });
    });

    return displayedReleases.map(displayedRelease => {
      const detailedRelease = this.getReleaseMatchKeys(displayedRelease)
        .map(key => reportRowsByKey.get(key))
        .find(Boolean);

      return detailedRelease
        ? { ...displayedRelease, ...detailedRelease }
        : displayedRelease;
    });
  }

  private getReleaseMatchKeys(release: any): string[] {
    if (!release || typeof release !== 'object') {
      return [];
    }

    const keys = [
      this.getPrefixedMatchKey('id', release?.id),
      this.getPrefixedMatchKey('code', release?.code)
    ];
    const projectKey = this.normalizeReleaseMatchValue(this.firstPresent(
      release?.projectid,
      release?.project_id,
      release?.projectId,
      release?.project_name,
      release?.projectName,
      release?.project_title,
      release?.projectTitle
    ));
    const titleKey = this.normalizeReleaseMatchValue(release?.title);
    const versionKey = this.normalizeReleaseMatchValue(release?.version);

    if (projectKey && titleKey && versionKey) {
      keys.push(`project-title-version:${projectKey}|${titleKey}|${versionKey}`);
    }

    return Array.from(new Set(keys.filter(Boolean)));
  }

  private getPrefixedMatchKey(prefix: string, value: any): string {
    const normalizedValue = this.normalizeReleaseMatchValue(value);
    return normalizedValue ? `${prefix}:${normalizedValue}` : '';
  }

  private normalizeReleaseMatchValue(value: any): string {
    return `${value ?? ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  generateReleaseOverviewPdf() {
    if (!this.previewedReleasePdfRequest || this.pdfDownloadLoading) {
      return;
    }

    this.pdfDownloadLoading = true;
    setTimeout(() => {
      try {
        this.pdfService.generateReleaseOverviewPDF(
          this.previewedReleasePdfRequest!.filters,
          this.previewedReleasePdfRequest!.startDate,
          this.previewedReleasePdfRequest!.endDate,
          this.previewedReleasePdfRequest!.data,
          'download'
        );
      } finally {
        this.pdfDownloadLoading = false;
      }
    }, 0);
  }

  previewReleaseOverviewPdf() {
    if (this.pdfPreviewLoading) return;

    this.pdfPreviewLoading = true;
    this.getReleaseOverviewListByEmp((data: Release[]) => {
      this.getReportableReleases(data, (reportData: Release[]) => {
        const projectName = this.getSelectedProjectNameLabel();
        const departmentSections = this.buildReleaseOverviewExportSections(reportData);

        const request = {
          filters: {
            generatedBy: this.storageService.getEmpName() || this.storageService.getUsername(),
            filteredEmployee: this.getSelectedEmployeeNameLabel(),
            filteredProject: projectName,
            releaseType: this.selectedReleaseType,
            department: this.getSelectedDepartmentLabel(),
            managerName: this.getSelectedManagerNameLabel(reportData),
            departmentWiseReleaseReport: true,
            departmentSections
          },
          startDate: this.startDate,
          endDate: this.endDate,
          data: reportData
        };

        this.previewedReleasePdfRequest = request;
        try {
          this.pdfService.generateReleaseOverviewPDF(
            request.filters,
            request.startDate,
            request.endDate,
            request.data,
            'preview'
          );
          this.hasViewedPdf = true;
        } finally {
          this.pdfPreviewLoading = false;
        }
      });
    }, () => {
      this.pdfPreviewLoading = false;
    });
  }

  generateReleaseOverviewExcel(): void {
    if (this.excelExporting) return;

    this.excelExporting = true;
    this.getReleaseOverviewListByEmp((data: Release[]) => {
      this.getReportableReleases(data, (reportData: Release[]) => {
        const projectName = this.getSelectedProjectNameLabel();
        const departmentSections = this.buildReleaseOverviewExportSections(reportData);

        try {
          this.excelService.generateReleaseOverviewExcel(
            {
              generatedBy: this.storageService.getEmpName() || this.storageService.getUsername(),
              filteredEmployee: this.getSelectedEmployeeNameLabel(),
              filteredProject: projectName,
              releaseType: this.selectedReleaseType,
              department: this.getSelectedDepartmentLabel(),
              managerName: this.getSelectedManagerNameLabel(reportData),
              departmentWiseReleaseReport: true,
              departmentSections
            },
            this.startDate,
            this.endDate,
            reportData
          );
        } catch (error) {
          this.toasterService.error('Unable to generate the Excel report.');
        } finally {
          this.excelExporting = false;
        }
      });
    }, () => {
      this.excelExporting = false;
    });
  }

  private getReportableReleases(data: Release[], callback: (releases: Release[]) => void): void {
    const releases = Array.isArray(data) ? data : [];

    if (releases.length === 0) {
      callback([]);
      return;
    }

    const releaseRequests = releases.map((release: Release) => {
      const knownTransitionDate = this.getReleaseCompletionDate(release, []);

      if (this.normalizeReleaseStatus(release?.status) === 'upcoming-release' || knownTransitionDate) {
        return of(this.attachToBeTestedTransitionDate(release, []));
      }

      if (!release?.id) {
        return of(this.attachToBeTestedTransitionDate(release, []));
      }

      return this.authService.getActivityLogs('release', release.id, 'status').pipe(
        map((logs: any) => this.attachToBeTestedTransitionDate(release, logs)),
        catchError(() => of(this.attachToBeTestedTransitionDate(release, [])))
      );
    });

    forkJoin(releaseRequests).subscribe({
      next: (reportReleases: Release[]) => callback(reportReleases),
      error: () => callback(releases)
    });
  }

  private buildReleaseOverviewExportSections(releases: Release[]): ReleaseOverviewExportSection[] {
    const reportReleases = Array.isArray(releases) ? releases : [];
    const selectedDepartment = this.getSelectedDepartmentOption();

    if (!this.isAllDepartment(selectedDepartment)) {
      return [{
        departmentName: selectedDepartment.department_name,
        managerName: this.getSelectedManagerNameLabel(reportReleases),
        releases: reportReleases
      }];
    }

    const assignedReleases = new Set<Release>();
    const departmentSections = this.departmentTabs
      .filter(department => !this.isAllDepartment(department))
      .map(department => {
        const departmentReleases = this.filterReleasesByManagerOrDepartment(reportReleases, department);
        departmentReleases.forEach(release => assignedReleases.add(release));

        return {
          departmentName: department.department_name,
          managerName: this.getDepartmentManagerNameLabel(department, departmentReleases),
          releases: departmentReleases
        };
      })
      .filter(section => section.releases.length > 0);

    const unmatchedReleases = reportReleases.filter(release => !assignedReleases.has(release));
    if (unmatchedReleases.length) {
      departmentSections.push({
        departmentName: 'Software Departments',
        managerName: this.getSelectedManagerNameLabel(unmatchedReleases),
        releases: unmatchedReleases
      });
    }

    return departmentSections.length
      ? departmentSections
      : [{
        departmentName: 'All Departments',
        managerName: this.getSelectedManagerNameLabel(reportReleases),
        releases: reportReleases
      }];
  }

  private attachToBeTestedTransitionDate(release: Release, logs: any): Release {
    const transitionDate = this.getToBeTestedTransitionDate(release, logs);

    if (!transitionDate) {
      return release;
    }

    return {
      ...release,
      to_be_tested_date: transitionDate
    };
  }

  private getToBeTestedTransitionDate(release: Release, logs: any): string | null {
    const explicitTransitionDate = this.getFirstDateValue(release, [
      'to_be_tested_date',
      'toBeTestedDate',
      'to_be_tested_at',
      'toBeTestedAt',
      'release_tested_date',
      'release_status_changed_date',
      'status_changed_date'
    ]);

    if (explicitTransitionDate) {
      return explicitTransitionDate;
    }

    const timelineDate = this.getFirstToBeTestedTimelineDate(logs);

    if (timelineDate) {
      return timelineDate;
    }

    if (this.normalizeReleaseStatus(release?.status) === 'to-be-tested') {
      return this.getFirstDateValue(release, ['updateddate', 'updated_date']);
    }

    return null;
  }

  private getReleaseCompletionDate(release: Release | any, logs: any = []): string | null {
    const transitionDate = this.getToBeTestedTransitionDate(release, logs);

    if (transitionDate) {
      return transitionDate;
    }

    return this.getFirstDateValue(release, [
      'completed_date',
      'completedDate',
      'completion_date',
      'completionDate',
      'closed_date',
      'closedDate',
      'qc_released_date',
      'qcReleasedDate',
      'qc_release_date',
      'qcReleaseDate',
      'actual_release_date',
      'actualReleaseDate'
    ]);
  }

  private getFirstToBeTestedTimelineDate(logs: any): string | null {
    const timeline = Array.isArray(logs) ? logs : [];
    const toBeTestedLogs = timeline
      .map((log: any) => ({
        date: this.getFirstDateValue(log, ['logdate', 'created_date', 'createddate', 'updated_date', 'updateddate']),
        status: this.normalizeReleaseStatus(log?.status)
      }))
      .filter((log: any) => log.status === 'to-be-tested' && !!log.date)
      .map((log: any) => ({
        date: log.date,
        time: this.getReleaseDateTime(log.date)
      }))
      .filter((log: any) => log.time !== null)
      .sort((first: any, second: any) => first.time - second.time);

    return toBeTestedLogs[0]?.date || null;
  }

  private getFirstDateValue(source: any, keys: string[]): string | null {
    for (const key of keys) {
      const value = `${source?.[key] ?? ''}`.trim();
      if (value && this.getReleaseDateTime(value) !== null) {
        return value;
      }
    }

    return null;
  }

  private getReleaseDateTime(value: string): number | null {
    const parsed = this.parseReleaseDate(value);
    return parsed ? parsed.getTime() : null;
  }

  private normalizeReleaseStatus(status: any): string {
    return `${status ?? ''}`.trim().toLowerCase().replace(/[-_\s]+/g, '-');
  }

  private getReleaseStatusPillClass(status: any): string {
    const normalizedStatus = this.normalizeReleaseStatus(status);

    if (['active', 'on-track', 'approved', 'pass', 'invoiced', 'open'].includes(normalizedStatus)) {
      return 'release-status--success';
    }

    if (['in-progress', 'in-review', 'in-testing', 'planning'].includes(normalizedStatus)) {
      return 'release-status--progress';
    }

    if (['on-hold', 'to-be-tested', 'upcoming-release'].includes(normalizedStatus)) {
      return 'release-status--warning';
    }

    if (['delayed', 'cancelled', 'rejected', 'failed', 'closed'].includes(normalizedStatus)) {
      return 'release-status--danger';
    }

    return 'release-status--muted';
  }

  private getReleasePerformance(release: Release | any): string {
    if (this.isUpcomingRelease(release) || this.isReleasePerformancePending(release)) {
      return 'Pending';
    }

    const performanceState = this.getReleasePerformanceState(release);
    if (performanceState === 'excellent') return 'Excellent';
    if (performanceState === 'very-good') return 'Very Good';
    if (performanceState === 'good') return 'Good';
    if (performanceState === 'poor') return 'Poor';
    return '-';
  }

  private getReleasePerformanceState(release: Release | any): ReleasePerformanceState {
    const scheduledReleaseDate = this.parseReleaseDate(this.getFirstDateValue(release, [
      'released_date',
      'release_date',
      'releaseDate',
      'scheduled_release_date',
      'scheduledReleaseDate'
    ]) || '');
    const completionDate = this.parseReleaseDate(this.getReleaseCompletionDate(release, []) || '');

    if (!scheduledReleaseDate || !completionDate) {
      return 'none';
    }

    const plannedDate = this.parseReleaseDate(this.getFirstDateValue(release, [
      'planned_date',
      'plannedDate',
      'scheduled_date',
      'scheduledDate'
    ]) || '');
    const scheduledTime = this.getStartOfDayTime(scheduledReleaseDate);
    const completionTime = this.getStartOfDayTime(completionDate);
    const plannedTime = plannedDate ? this.getStartOfDayTime(plannedDate) : null;
    const daysBeforeRelease = Math.floor((scheduledTime - completionTime) / 86400000);

    if (daysBeforeRelease >= 2) {
      return 'excellent';
    }

    if (daysBeforeRelease === 1) {
      return 'very-good';
    }

    if (daysBeforeRelease === 0) {
      return plannedTime === scheduledTime ? 'excellent' : 'good';
    }

    return 'poor';
  }

  private getReleasePerformanceSortValue(release: Release | any): number {
    const performance = this.getReleasePerformance(release);
    const order: Record<string, number> = {
      Excellent: 1,
      'Very Good': 2,
      Good: 3,
      Poor: 4,
      Pending: 5,
      '-': 6
    };

    return order[performance] || 6;
  }

  private getReleasePerformancePillClass(performance: any): string {
    const key = `${performance ?? ''}`.trim().toLowerCase().replace(/[-_\s]+/g, '-');

    if (key === 'excellent') return 'release-performance--excellent';
    if (key === 'very-good') return 'release-performance--very-good';
    if (key === 'good') return 'release-performance--good';
    if (key === 'poor') return 'release-performance--poor';
    if (key === 'pending') return 'release-performance--pending';
    return 'release-performance--muted';
  }

  private isUpcomingRelease(release: Release | any): boolean {
    return this.normalizeReleaseStatus(release?.status) === 'upcoming-release';
  }

  private isReleasePerformancePending(release: Release | any): boolean {
    return this.normalizeReleaseStatus(release?.status) === 'pending';
  }

  private getStartOfDayTime(date: Date): number {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    return normalizedDate.getTime();
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  updateRelease(rowData: any) {
    rowData.username = this.storageService.getUsername();
    this.updatingReleaseId = Number(rowData?.id);
    this.refreshReleaseRows();
    this.authService.updateRelease(rowData)
      .pipe(finalize(() => {
        this.updatingReleaseId = null;
        this.refreshReleaseRows();
      }))
      .subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message);
          this.getReleaseOverviewByEmp()
        }, error: (err) => {
          this.toasterService.error(err?.error?.message);
        }
      })
  }

  private refreshReleaseRows(): void {
    try {
      this.tabulator?.redraw?.(true);
    } catch {
      // ignore redraw timing during table rebuilds
    }
  }


  // Tracks which menu is currently open
  activeMenuId: number | null | any = null;

  /**
   * Toggles the menu for a specific card.
   * Stops propagation so the document listener doesn't immediately close it.
   */
  toggleMenu(event: Event, id: number | any) {
    event.stopPropagation();
    if (this.activeMenuId === id) {
      this.activeMenuId = null;
    } else {
      this.activeMenuId = id;
    }
  }

  /**
   * Closes any open menu when clicking anywhere else on the document.
   */
  @HostListener('document:click')
  closeMenu() {
    this.activeMenuId = null;
  }

  openDrawer(data: any) {
    if (!this.canEditRelease(data)) {
      this.toasterService.error("You are Not Allowed.");
      return;
    }
    this.drawerService.open('release', {
      ...data,
      mode: 'edit',
      projectid: data?.projectid ?? this.projectid,
      releaseList: this.releaseList
    })
  }

  canEditRelease(release: any): boolean {
    const loggedInEmpId = `${this.storageService.getEmpId() ?? ''}`;
    const assignedFrom = `${release?.assigned_from ?? release?.assignedFrom ?? release?.assigned_from_id ?? release?.assignedFromId ?? ''}`;
    const assignedTo = `${release?.assigned_to ?? release?.assignedTo ?? release?.assigned_to_id ?? release?.assignedToId ?? ''}`;
    const roles = this.storageService.roles;

    if (roles?.isAdmin || roles?.isManager) {
      return true;
    }

    return !!loggedInEmpId && (
      (!!assignedFrom && loggedInEmpId === assignedFrom) ||
      (!!assignedTo && loggedInEmpId === assignedTo)
    );
  }

  canDragOrDrop(sourceStatus: string, targetStatus?: string): boolean {
    const roles = this.storageService.roles;
    const department = this.storageService.getDept();
    if (department?.toUpperCase() === 'SQA') {
      return true;
    }
    if (roles?.isAdmin || roles?.isManager || !roles?.isEmployee) return true;
    const allowedStatuses = ['In-Progress', 'To-be-Tested'];
    if (!targetStatus) {
      return allowedStatuses.includes(sourceStatus);
    }
    return (
      allowedStatuses.includes(sourceStatus) &&
      allowedStatuses.includes(targetStatus)
    );
  }

  canDragRelease(release: any): boolean {
    const loggedInEmpId = `${this.storageService.getEmpId() ?? ''}`;
    const assignedTo = `${release?.assigned_to ?? release?.assignedTo ?? release?.assigned_to_id ?? release?.assignedToId ?? ''}`;
    const roles = this.storageService.roles;

    if (roles?.isAdmin || roles?.isManager) {
      return true;
    }

    return !!loggedInEmpId && !!assignedTo && loggedInEmpId === assignedTo;
  }
  onRangeChange(event: { startDate: Date; endDate: Date }) {
    console.log(event.startDate, event.endDate);
    this.startDate = this.formatDateToYMD(event.startDate);
    this.endDate = this.formatDateToYMD(event.endDate);
    this.resetPdfPreviewState();
    this.getReleaseOverviewByEmp();
  }

  formatDateToYMD(date: Date | string | null): string {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }
  get selectedProjectLabel(): string {
    return this.getSelectedProjectNameLabel();
  }

  get hasProjectSelection(): boolean {
    return !!this.projectid && this.myControl.value !== this.allProjectsValue;
  }

  compareProjectById = (first: any, second: any): boolean => {
    if (first === this.allProjectsValue || second === this.allProjectsValue) {
      return first === second;
    }

    return `${first?.id ?? first ?? ''}` === `${second?.id ?? second ?? ''}`;
  };

  onProjectSelectOpened(isOpen: boolean): void {
    if (isOpen) {
      this.projectFilterControl.setValue('', { emitEvent: true });
    }
  }

  onReleaseTypeSelectOpened(isOpen: boolean): void {
    if (isOpen) {
      this.releaseTypeFilterControl.setValue('', { emitEvent: true });
    }
  }

  onEmployeeSelectOpened(isOpen: boolean): void {
    if (isOpen) {
      this.employeeFilterControl.setValue('', { emitEvent: true });
    }
  }

  private initializeReleaseTypeFilter(): void {
    this.filteredReleaseTypeOptions = this.releaseTypeFilterControl.valueChanges.pipe(
      startWith(''),
      map((value: any) => this.filterReleaseTypeOptions(value))
    );
  }

  private initializeEmployeeFilter(): void {
    this.filteredEmployeeOptions = this.employeeFilterControl.valueChanges.pipe(
      startWith(this.employeeFilterControl.value || ''),
      map((value: any) => this.filterEmployeeOptions(value))
    );
    this.employeeFilterControl.setValue(this.employeeFilterControl.value || '', { emitEvent: true });
  }

  private filterReleaseTypeOptions(value: any): string[] {
    const filterValue = `${typeof value === 'string' ? value : ''}`.trim().toLowerCase();

    return filterValue
      ? this.releaseTypeOptions.filter(type => type.toLowerCase().includes(filterValue))
      : [...this.releaseTypeOptions];
  }

  private _filter(value: string): any[] {
    const filterValue = `${value ?? ''}`.toLowerCase();
    return this.projectList.filter((emp: any) =>
      `${emp?.project_title ?? ''}`.toLowerCase().includes(filterValue)
    );
  }

  private filterEmployeeOptions(value: any): Employee[] {
    const filterValue = `${typeof value === 'string' ? value : ''}`.trim().toLowerCase();
    const employees = Array.isArray(this.employeeList) ? this.employeeList : [];

    return filterValue
      ? employees.filter((employee: any) =>
        `${employee?.employee_name ?? employee?.employeeName ?? employee?.name ?? ''}`.toLowerCase().includes(filterValue) ||
        `${employee?.email ?? ''}`.toLowerCase().includes(filterValue)
      )
      : [...employees];
  }

  private getSelectedProjectNameLabel(): string {
    const projectValue = this.myControl.value as any;

    if (!projectValue || projectValue === this.allProjectsValue || !this.projectid || `${this.projectid}` === '0') {
      return 'All Projects';
    }

    return typeof projectValue === 'string'
      ? projectValue
      : projectValue?.project_title || 'All Projects';
  }

  get selectedEmployeeLabel(): string {
    return this.getSelectedEmployeeNameLabel();
  }

  get hasEmployeeSelection(): boolean {
    return !!this.getSelectedEmployeeIdParam();
  }

  compareEmployeeById = (first: any, second: any): boolean => {
    if (first === this.allEmployeesValue || second === this.allEmployeesValue) {
      return first === second;
    }

    return `${this.getEmployeeId(first) ?? first ?? ''}` === `${this.getEmployeeId(second) ?? second ?? ''}`;
  };

  onEmployeeSelect(employee: any): void {
    if (!employee || employee === this.allEmployeesValue) {
      this.selectedEmployeeId = 0;
      this.selectedEmployeeName = '';
      this.employeeControl.setValue(this.allEmployeesValue, { emitEvent: false });
    } else {
      this.selectedEmployeeId = this.getEmployeeId(employee);
      this.selectedEmployeeName = this.getEmployeeDisplayName(employee);
      this.employeeControl.setValue(employee, { emitEvent: false });
    }

    this.resetPdfPreviewState();
    this.getReleaseOverviewByEmp();
  }

  clearEmployeeSelection(): void {
    this.selectedEmployeeId = 0;
    this.selectedEmployeeName = '';
    this.employeeControl.setValue(this.allEmployeesValue, { emitEvent: false });
    this.employeeFilterControl.setValue('', { emitEvent: true });
    this.resetPdfPreviewState();
    this.getReleaseOverviewByEmp();
  }

  private getSelectedEmployeeNameLabel(): string {
    if (!this.getSelectedEmployeeIdParam()) {
      return 'All Employees';
    }

    const selectedEmployee = this.getSelectedEmployeeOption();
    return selectedEmployee
      ? this.getEmployeeDisplayName(selectedEmployee)
      : this.selectedEmployeeName || 'Selected Employee';
  }

  private syncSelectedEmployeeControl(): void {
    if (!this.getSelectedEmployeeIdParam()) {
      this.employeeControl.setValue(this.allEmployeesValue, { emitEvent: false });
      return;
    }

    const selectedEmployee = this.getSelectedEmployeeOption();
    if (selectedEmployee) {
      this.selectedEmployeeName = this.getEmployeeDisplayName(selectedEmployee);
      this.employeeControl.setValue(selectedEmployee, { emitEvent: false });
    }
  }

  private getSelectedEmployeeOption(): Employee | null {
    const selectedId = this.getSelectedEmployeeIdParam();
    if (!selectedId) {
      return null;
    }

    return (Array.isArray(this.employeeList) ? this.employeeList : []).find((employee: any) =>
      `${this.getEmployeeId(employee) ?? ''}` === `${selectedId}`
    ) || null;
  }

  private getSelectedEmployeeIdParam(): any {
    const id = `${this.selectedEmployeeId ?? ''}`.trim();
    return id && id !== '0' ? this.selectedEmployeeId : 0;
  }

  private getEmployeeId(employee: any): any {
    if (!employee || employee === this.allEmployeesValue) {
      return 0;
    }

    return this.firstPresent(
      employee?.id,
      employee?.empid,
      employee?.emp_id,
      employee?.empId,
      employee?.employeeid,
      employee?.employee_id,
      employee?.employeeId,
      employee?.userid,
      employee?.user_id,
      employee?.userId
    );
  }

  private getEmployeeDisplayName(employee: any): string {
    return `${this.firstPresent(
      employee?.employee_name,
      employee?.employeeName,
      employee?.full_name,
      employee?.fullName,
      employee?.user_name,
      employee?.username,
      employee?.name,
      employee?.email
    ) ?? ''}`.trim();
  }

  private getReleaseAssigneeDisplayName(release: any): string {
    const responseName = `${this.firstPresent(
      release?.assigned_to_name,
      release?.assignedToName,
      release?.assignee_to_name,
      release?.assigneeToName
    ) ?? ''}`.trim();

    if (responseName) {
      return responseName;
    }

    const matchedEmployee = this.getReleaseAssignedToReferences(release)
      .map(reference => this.findEmployeeByReference(reference))
      .find(Boolean);

    return matchedEmployee ? this.getEmployeeDisplayName(matchedEmployee) || 'Unknown' : 'Unknown';
  }

  setCurrentWeekDates() {
    const today = new Date();
    const day = today.getDay();

    const monday = new Date(today);
    monday.setDate(today.getDate() - day + (day === 0 ? -6 : 1));

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    this.startDate = this.formatDateToYMD(monday);
    this.endDate = this.formatDateToYMD(sunday);
  }
  displayFn(employee: any): string {
    return employee && employee.project_title
      ? employee.project_title
      : '';
  }
  clearSelection(): void {
    this.myControl.setValue(this.allProjectsValue, { emitEvent: false });
    this.projectFilterControl.setValue('', { emitEvent: true });
    this.projectid = 0;
    this.resetPdfPreviewState();
    this.getReleaseOverviewByEmp();
  }

  get canDownloadPdf(): boolean {
    return (
      !!this.startDate &&
      !!this.endDate &&
      new Date(this.startDate) <= new Date(this.endDate)
    );
  }
  openDailogue(rowData: any) {
    const dialogRef = this.matDialog.open(ReleaseMailsListComponent,
      {
        data: rowData,
        width: '100vw'
      }
    );

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // handle dialog result (refresh, API call, etc.)
        console.log('Dialog closed with:', result);
      }
    });
  }

  applyFilters() {
    this.filterData();
  }

  private clearStoredReleaseOverviewState(): void {
    const keys = [
      'overviewReleaseCurrentView',
      'overviewReleaseDepartment',
      'overviewReleaseSelectedEmployeeId',
      'overviewReleaseSelectedEmployeeName'
    ];

    try {
      keys.forEach(key => sessionStorage.removeItem(key));
    } catch {
      // Ignore storage access failures.
    }

    try {
      keys.forEach(key => localStorage.removeItem(key));
    } catch {
      // Ignore storage access failures.
    }
  }


  setReleaseType(type: string) {
    const selectedType = this.releaseTypeOptions.find(option =>
      this.normalizeReleaseType(option) === this.normalizeReleaseType(type)
    ) || 'All';

    this.selectedReleaseType = selectedType;
    this.releaseTypeControl.setValue(selectedType, { emitEvent: false });
    this.resetPdfPreviewState();
    this.applyFilters();
    this.setView(this.normalizeReleaseType(selectedType) === 'external' ? 'table' : 'kanban');
  }

  clearReleaseType() {
    this.selectedReleaseType = 'All';
    this.releaseTypeControl.setValue('All', { emitEvent: false });
    this.releaseTypeFilterControl.setValue('', { emitEvent: true });
    this.resetPdfPreviewState();
    this.applyFilters();
  }

  private applyRoleBasedDepartmentState(): boolean {
    this.showDepartmentTabs = this.canShowDepartmentTabsForRole();

    if (!this.shouldScopeToLoggedInEmployeeDepartment()) {
      return false;
    }

    return this.selectLoggedInEmployeeDepartment();
  }

  private canShowDepartmentTabsForRole(): boolean {
    const roles = this.storageService.roles;
    return !!(roles?.isAdmin || roles?.isManager);
  }

  private shouldScopeToLoggedInEmployeeDepartment(): boolean {
    const roles = this.storageService.roles;
    return !!roles?.isEmployee && !roles?.isAdmin && !roles?.isManager;
  }

  private selectLoggedInEmployeeDepartment(): boolean {
    const employeeDepartment = this.resolveLoggedInEmployeeDepartmentOption();
    const nextDepartmentId = employeeDepartment?.filter_id || this.allDepartmentTab.filter_id;
    const changed = this.selectedDepartmentId !== nextDepartmentId;

    if (employeeDepartment && !this.departmentTabs.some(department => department.filter_id === employeeDepartment.filter_id)) {
      this.departmentTabs = [
        this.allDepartmentTab,
        employeeDepartment,
        ...this.departmentTabs.filter(department => !this.isAllDepartment(department))
      ];
    }

    this.selectedDepartmentId = nextDepartmentId;
    return changed;
  }

  private resolveLoggedInEmployeeDepartmentOption(): DepartmentOption | null {
    const loggedInDepartmentKeys = this.getLoggedInEmployeeDepartmentKeys();

    if (loggedInDepartmentKeys.length) {
      const matchedDepartment = this.departmentTabs.find(department =>
        !this.isAllDepartment(department) &&
        this.doFilterKeysOverlap(this.getDepartmentOptionKeys(department), loggedInDepartmentKeys)
      );

      if (matchedDepartment) {
        return matchedDepartment;
      }
    }

    return this.buildLoggedInEmployeeDepartmentFallbackOption();
  }

  private getLoggedInEmployeeDepartmentKeys(): string[] {
    return this.normalizeFilterKeys(this.getLoggedInEmployeeDepartmentValues());
  }

  private getLoggedInEmployeeDepartmentValues(): any[] {
    const user = this.storageService.getUser() || {};
    const loggedInEmployee = this.findLoggedInEmployee();
    const values: any[] = [this.storageService.getDept()];

    [user, loggedInEmployee].forEach(source => {
      if (!source || typeof source !== 'object') {
        return;
      }

      values.push(
        source?.department,
        source?.dept,
        source?.team,
        source?.department_id,
        source?.departmentId,
        source?.departmentid,
        source?.dept_id,
        source?.deptId,
        source?.deptid,
        source?.department_name,
        source?.departmentName,
        source?.dept_name,
        source?.deptName,
        source?.team_name,
        source?.teamName
      );
      values.push(...this.collectFilterValues(source?.department));
      values.push(...this.collectFilterValues(source?.dept));
      values.push(...this.collectFilterValues(source?.team));
    });

    return values;
  }

  private findLoggedInEmployee(): any | null {
    const user = this.storageService.getUser() || {};
    const references = [
      this.storageService.getEmpId(),
      this.storageService.getUsername(),
      user
    ];

    return references
      .map(reference => this.findEmployeeByReference(reference))
      .find(Boolean) || null;
  }

  private buildLoggedInEmployeeDepartmentFallbackOption(): DepartmentOption | null {
    const user = this.storageService.getUser() || {};
    const department = this.firstPresent(user?.department, user?.dept, user?.team, this.storageService.getDept());
    const id = this.firstPresent(
      this.extractDepartmentId(department),
      user?.department_id,
      user?.departmentId,
      user?.departmentid,
      user?.dept_id,
      user?.deptId,
      user?.deptid
    );
    const name = this.firstPresent(
      this.extractDepartmentName(department),
      user?.department_name,
      user?.departmentName,
      user?.dept_name,
      user?.deptName,
      user?.team_name,
      user?.teamName,
      typeof department === 'string' && department !== '[object Object]' ? department : null,
      id
    );
    const filterId = this.firstPresent(id, name);

    if (!filterId || !name) {
      return null;
    }

    return {
      raw: department || user,
      api_id: id ?? filterId,
      filter_id: `${filterId}`,
      department_name: `${name}`.trim()
    };
  }

  private extractDepartmentId(value: any): any {
    if (!value || typeof value !== 'object') {
      return null;
    }

    return this.firstPresent(
      value?.id,
      value?.department_id,
      value?.departmentId,
      value?.departmentid,
      value?.dept_id,
      value?.deptId,
      value?.deptid
    );
  }

  private extractDepartmentName(value: any): any {
    if (!value || typeof value !== 'object') {
      return null;
    }

    return this.firstPresent(
      value?.department_name,
      value?.departmentName,
      value?.dept_name,
      value?.deptName,
      value?.team_name,
      value?.teamName,
      value?.name,
      value?.title,
      value?.label
    );
  }

  setDepartmentTab(department: DepartmentOption): void {
    if (!this.showDepartmentTabs) {
      return;
    }

    if (!department || this.selectedDepartmentId === department.filter_id) {
      return;
    }

    this.selectedDepartmentId = department.filter_id;
    this.resetPdfPreviewState();
    this.getReleaseOverviewByEmp();
  }

  trackByDepartmentId(index: number, department: DepartmentOption): string {
    return department.filter_id;
  }

  private getSelectedDepartmentOption(): DepartmentOption {
    return this.departmentTabs.find(department => department.filter_id === this.selectedDepartmentId)
      || this.allDepartmentTab;
  }

  private getSelectedDepartmentApiId(): any {
    const department = this.getSelectedDepartmentOption();
    return this.isAllDepartment(department) || this.isSqaDepartment(department)
      ? ''
      : this.firstPresent(department.api_id, department.filter_id, department.department_name);
  }

  private getSelectedDepartmentLabel(): string {
    const department = this.getSelectedDepartmentOption();
    return this.isAllDepartment(department) ? 'All Departments' : department.department_name;
  }

  private getReleaseDepartmentDefinition(department: DepartmentOption | null | undefined): ReleaseDepartmentDefinition | undefined {
    if (!department) {
      return undefined;
    }

    const departmentKeys = this.getDepartmentOptionKeys(department);
    return this.releaseDepartmentDefinitions.find(definition => {
      const definitionKeys = this.normalizeFilterKeys([
        definition.key,
        definition.label,
        ...definition.aliases
      ]);

      return definition.key === department.filter_id || this.doFilterKeysOverlap(definitionKeys, departmentKeys);
    });
  }

  private getConfiguredDepartmentManagerName(department: DepartmentOption | null | undefined): string {
    return this.getReleaseDepartmentDefinition(department)?.managerName || '';
  }

  private getSelectedManagerNameParam(): string {
    const department = this.getSelectedDepartmentOption();
    if (this.isAllDepartment(department) || this.isSqaDepartment(department)) {
      return '';
    }

    const displayName = this.getDepartmentManagerDisplayNames(department)[0];
    if (displayName) {
      return displayName;
    }

    return this.getDepartmentManagerValues(department)
      .map(value => `${value ?? ''}`.trim())
      .find(Boolean) || '';
  }

  private getSelectedManagerNameLabel(releases: Release[] = this.filteredReleases): string {
    const department = this.getSelectedDepartmentOption();
    const releaseManagerNames = this.getUniqueReleaseManagerDisplayNames(releases);

    if (this.isAllDepartment(department)) {
      const allDepartmentManagerNames = this.getAllDepartmentManagerDisplayNames(releases);

      return allDepartmentManagerNames.length
        ? allDepartmentManagerNames.join(', ')
        : 'All Managers';
    }

    const departmentManagerNames = this.getDepartmentManagerDisplayNames(department);
    if (this.isSqaDepartment(department) && departmentManagerNames.length) {
      return departmentManagerNames.join(', ');
    }

    const managerNames = [
      ...departmentManagerNames,
      ...releaseManagerNames
    ];
    const uniqueNames = Array.from(new Set(managerNames));

    return uniqueNames.length ? uniqueNames.join(', ') : 'All Managers';
  }

  private getDepartmentManagerNameLabel(department: DepartmentOption, releases: Release[] = []): string {
    const departmentManagerNames = this.getDepartmentManagerDisplayNames(department);
    if (this.isSqaDepartment(department) && departmentManagerNames.length) {
      return departmentManagerNames.join(', ');
    }

    const managerNames = [
      ...departmentManagerNames,
      ...this.getUniqueReleaseManagerDisplayNames(releases)
    ];
    const uniqueNames = Array.from(new Set(managerNames));

    return uniqueNames.length ? uniqueNames.join(', ') : 'All Managers';
  }

  private isAllDepartment(department: DepartmentOption | null | undefined): boolean {
    return !department || department.filter_id === this.allDepartmentTab.filter_id;
  }

  private isSqaDepartment(department: DepartmentOption | null | undefined): boolean {
    if (!department || this.isAllDepartment(department)) {
      return false;
    }

    const definition = this.getReleaseDepartmentDefinition(department);
    if (definition?.key === 'sqa') {
      return true;
    }

    const sqaKeys = this.normalizeFilterKeys(['sqa', 'qa', 'quality assurance', 'software quality assurance', 'qa team']);
    return this.doFilterKeysOverlap(this.getDepartmentOptionKeys(department), sqaKeys);
  }

  private buildReleaseDepartmentTabs(list: any[]): DepartmentOption[] {
    const apiDepartments = this.normalizeDepartmentOptions(list);
    const configuredTabs = this.releaseDepartmentDefinitions.map(definition => {
      const aliasKeys = definition.aliases.map(alias => this.normalizeDepartmentKey(alias));
      const matchedDepartment = apiDepartments.find(department => {
        const departmentKeys = this.getDepartmentOptionKeys(department);
        return departmentKeys.some(key => aliasKeys.includes(key));
      });

      return matchedDepartment
        ? {
          ...matchedDepartment,
          filter_id: definition.key,
          department_name: definition.label
        }
        : {
          filter_id: definition.key,
          api_id: definition.label,
          department_name: definition.label
        };
    });

    return [this.allDepartmentTab, ...configuredTabs];
  }

  private normalizeDepartmentOptions(list: any[]): DepartmentOption[] {
    const seen = new Set<string>();
    const options: DepartmentOption[] = [];

    (Array.isArray(list) ? list : []).forEach(department => {
      const id = this.firstPresent(
        department?.id,
        department?.department_id,
        department?.departmentId,
        department?.departmentid,
        department?.dept_id,
        department?.deptId,
        department?.deptid
      );
      const name = this.firstPresent(
        department?.department_name,
        department?.departmentName,
        department?.dept_name,
        department?.deptName,
        department?.name,
        department?.title,
        department?.label
      );
      const filterId = this.firstPresent(id, name);

      if (!filterId || !name) {
        return;
      }

      const key = `${filterId}`.trim().toLowerCase();
      if (!key || seen.has(key)) {
        return;
      }

      seen.add(key);
      options.push({
        raw: department,
        api_id: id ?? filterId,
        filter_id: `${filterId}`,
        department_name: `${name}`.trim()
      });
    });

    return options;
  }

  private filterReleasesByDepartment(releases: Release[], department: DepartmentOption): Release[] {
    const selectedKeys = this.getDepartmentOptionKeys(department);
    const hasDepartmentData = releases.some(release => this.getReleaseDepartmentKeys(release).length > 0);

    if (!selectedKeys.length || !hasDepartmentData) {
      return releases;
    }

    return releases.filter(release => {
      const releaseKeys = this.getReleaseDepartmentKeys(release);
      return releaseKeys.some(key => selectedKeys.includes(key));
    });
  }

  private applySelectedDepartmentReleaseScope(releases: Release[]): Release[] {
    const selectedDepartment = this.getSelectedDepartmentOption();
    return this.isAllDepartment(selectedDepartment)
      ? releases
      : this.filterReleasesByManagerOrDepartment(releases, selectedDepartment);
  }

  private applySelectedReportFilters(releases: Release[]): Release[] {
    return this.applySelectedReleaseTypeFilter(
      this.applySelectedDepartmentReleaseScope(
        this.applySelectedEmployeeFilter(
          this.applySelectedProjectFilter(releases)
        )
      )
    );
  }

  private applySelectedProjectFilter(releases: Release[]): Release[] {
    if (!this.projectid || `${this.projectid}` === '0') {
      return releases;
    }

    const projectValue = this.myControl.value as any;
    const selectedProjectKeys = this.normalizeFilterKeys([
      this.projectid,
      projectValue?.id,
      projectValue?.project_title,
      typeof projectValue === 'string' ? projectValue : ''
    ]);

    if (!selectedProjectKeys.length) {
      return releases;
    }

    return releases.filter(release =>
      this.doFilterKeysOverlap(this.getReleaseProjectKeys(release), selectedProjectKeys)
    );
  }

  private applySelectedEmployeeFilter(releases: Release[]): Release[] {
    const selectedEmployeeId = this.getSelectedEmployeeIdParam();

    if (!selectedEmployeeId) {
      return releases;
    }

    const selectedEmployee = this.getSelectedEmployeeOption();
    const selectedEmployeeValues = selectedEmployee ? this.getEmployeeIdentityValues(selectedEmployee) : [];
    const selectedEmployeeKeys = this.normalizeFilterKeys([
      selectedEmployeeId,
      this.selectedEmployeeName,
      ...selectedEmployeeValues
    ]);

    if (!selectedEmployeeKeys.length) {
      return releases;
    }

    const hasEmployeeData = releases.some(release => this.getReleaseEmployeeKeys(release).length > 0);
    if (!hasEmployeeData) {
      return releases;
    }

    return releases.filter(release =>
      this.doFilterKeysOverlap(this.getReleaseEmployeeKeys(release), selectedEmployeeKeys)
    );
  }

  private applySelectedReleaseTypeFilter(releases: Release[]): Release[] {
    if (this.normalizeReleaseType(this.selectedReleaseType) === 'all') {
      return releases;
    }

    const selectedType = this.normalizeReleaseType(this.selectedReleaseType);
    return releases.filter(release => this.normalizeReleaseType(release?.release_type) === selectedType);
  }

  private filterReleasesByManagerOrDepartment(releases: Release[], department: DepartmentOption): Release[] {
    if (this.isSqaDepartment(department)) {
      return this.filterReleasesByAssignedToDepartment(releases, department);
    }

    const managerKeys = this.getDepartmentManagerKeys(department);
    const hasManagerData = releases.some(release => this.getReleaseManagerKeys(release).length > 0);

    if (managerKeys.length && hasManagerData) {
      const scopedReleases = releases.filter(release =>
        this.doFilterKeysOverlap(this.getReleaseManagerKeys(release), managerKeys)
      );
      const hasDepartmentData = releases.some(release => this.getReleaseDepartmentKeys(release).length > 0);

      if (scopedReleases.length || !hasDepartmentData) {
        return scopedReleases;
      }
    }

    return this.filterReleasesByDepartment(releases, department);
  }

  private filterReleasesByAssignedToDepartment(releases: Release[], department: DepartmentOption): Release[] {
    const departmentKeys = this.getAssignedToDepartmentFilterKeys(department);

    if (!departmentKeys.length) {
      return releases;
    }

    return releases.filter(release =>
      this.doFilterKeysOverlap(this.getReleaseAssignedToDepartmentKeys(release), departmentKeys)
    );
  }

  private getAssignedToDepartmentFilterKeys(department: DepartmentOption): string[] {
    const definition = this.getReleaseDepartmentDefinition(department);

    return this.normalizeFilterKeys([
      department.filter_id,
      department.api_id,
      department.department_name,
      department.raw,
      definition?.key,
      definition?.label,
      ...(definition?.aliases || [])
    ]);
  }

  private getReleaseAssignedToDepartmentKeys(release: any): string[] {
    if (!release || typeof release !== 'object') {
      return [];
    }

    const departmentValues: any[] = [];
    const assignedDepartmentKeys = [
      'assigned_to_department',
      'assignedToDepartment',
      'assigned_to_dept',
      'assignedToDept',
      'assigned_to_department_id',
      'assignedToDepartmentId',
      'assigned_to_dept_id',
      'assignedToDeptId',
      'assignee_to_department',
      'assigneeToDepartment',
      'assignee_to_dept',
      'assigneeToDept',
      'assignee_to_department_id',
      'assigneeToDepartmentId',
      'assignee_to_dept_id',
      'assigneeToDeptId',
      'employee_department',
      'employeeDepartment',
      'employee_dept',
      'employeeDept',
      'employee_department_id',
      'employeeDepartmentId',
      'employee_dept_id',
      'employeeDeptId'
    ];

    assignedDepartmentKeys.forEach(key => {
      departmentValues.push(...this.collectFilterValues(release[key]));
    });

    this.getReleaseAssignedToReferences(release).forEach(reference => {
      if (reference && typeof reference === 'object') {
        departmentValues.push(...this.collectEmployeeDepartmentValues(reference));
      }

      const employee = this.findEmployeeByReference(reference);
      if (employee) {
        departmentValues.push(...this.collectEmployeeDepartmentValues(employee));
      }
    });

    return this.normalizeFilterKeys(departmentValues);
  }

  private getReleaseAssignedToReferences(release: any): any[] {
    if (!release || typeof release !== 'object') {
      return [];
    }

    const references = [
      release?.assigned_to,
      release?.assignedTo,
      release?.assigned_to_id,
      release?.assignedToId,
      release?.assigned_to_name,
      release?.assignedToName,
      release?.assignee_to,
      release?.assigneeTo,
      release?.assignee_to_id,
      release?.assigneeToId,
      release?.assignee_to_name,
      release?.assigneeToName,
      release?.assigned_to_employee,
      release?.assignedToEmployee,
      release?.assigned_to_details,
      release?.assignedToDetails,
      release?.assignee_to_employee,
      release?.assigneeToEmployee,
      release?.assignee_to_details,
      release?.assigneeToDetails
    ];

    return references
      .flatMap(value => Array.isArray(value) ? value : [value])
      .filter(value => value !== null && value !== undefined && `${value}`.trim() !== '');
  }

  private findEmployeeByReference(reference: any): any | null {
    if (reference === null || reference === undefined || reference === '') {
      return null;
    }

    const referenceKeys = this.normalizeFilterKeys(this.getEmployeeIdentityValues(reference));
    if (!referenceKeys.length) {
      return null;
    }

    return this.employeeDirectory.find(employee =>
      this.doFilterKeysOverlap(this.getEmployeeIdentityKeys(employee), referenceKeys)
    ) || null;
  }

  private mergeEmployeeDirectoryRows(employeeRows: any[], directoryRows: any[]): any[] {
    const baseRows = Array.isArray(employeeRows) ? employeeRows : [];
    const detailRows = Array.isArray(directoryRows) ? directoryRows : [];

    if (!detailRows.length) {
      return [...baseRows];
    }

    const detailByKey = new Map<string, any>();
    detailRows.forEach(detail => {
      this.getEmployeeIdentityKeys(detail).forEach(key => {
        if (!detailByKey.has(key)) {
          detailByKey.set(key, detail);
        }
      });
    });

    const mergedRows = baseRows.map(employee => {
      const matchingDetail = this.getEmployeeIdentityKeys(employee)
        .map(key => detailByKey.get(key))
        .find(Boolean);

      return matchingDetail
        ? this.mergePresentObjects(matchingDetail, employee)
        : employee;
    });

    if (!mergedRows.length) {
      return [...detailRows];
    }

    const mergedKeys = this.normalizeFilterKeys(mergedRows.flatMap(employee => this.getEmployeeIdentityValues(employee)));
    const unmatchedDetailRows = detailRows.filter(detail =>
      !this.doFilterKeysOverlap(this.getEmployeeIdentityKeys(detail), mergedKeys)
    );

    return [...mergedRows, ...unmatchedDetailRows];
  }

  private getEmployeeIdentityKeys(employee: any): string[] {
    return this.normalizeFilterKeys(this.getEmployeeIdentityValues(employee));
  }

  private getEmployeeIdentityValues(value: any): any[] {
    if (Array.isArray(value)) {
      return value.flatMap(item => this.getEmployeeIdentityValues(item));
    }

    if (!value || typeof value !== 'object') {
      return [value];
    }

    return [
      value?.id,
      value?.empid,
      value?.emp_id,
      value?.empId,
      value?.employeeid,
      value?.employee_id,
      value?.employeeId,
      value?.userid,
      value?.user_id,
      value?.userId,
      value?.assigned_to,
      value?.assignedTo,
      value?.assigned_to_id,
      value?.assignedToId,
      value?.assignee_to,
      value?.assigneeTo,
      value?.assignee_to_id,
      value?.assigneeToId,
      value?.tested_by,
      value?.testedBy,
      value?.tested_by_id,
      value?.testedById,
      value?.employee_name,
      value?.employeeName,
      value?.assigned_to_name,
      value?.assignedToName,
      value?.assignee_to_name,
      value?.assigneeToName,
      value?.tested_by_name,
      value?.testedByName,
      value?.full_name,
      value?.fullName,
      value?.user_name,
      value?.username,
      value?.name,
      value?.email
    ];
  }

  private collectEmployeeDepartmentValues(employee: any): any[] {
    if (Array.isArray(employee)) {
      return employee.flatMap(item => this.collectEmployeeDepartmentValues(item));
    }

    if (!employee || typeof employee !== 'object') {
      return [];
    }

    const values: any[] = [];
    [
      employee?.department,
      employee?.dept,
      employee?.team,
      employee?.department_id,
      employee?.departmentId,
      employee?.departmentid,
      employee?.dept_id,
      employee?.deptId,
      employee?.deptid,
      employee?.department_name,
      employee?.departmentName,
      employee?.dept_name,
      employee?.deptName,
      employee?.team_name,
      employee?.teamName,
      employee?.employee_department,
      employee?.employeeDepartment,
      employee?.employee_department_id,
      employee?.employeeDepartmentId,
      employee?.employee_dept_id,
      employee?.employeeDeptId
    ].forEach(value => values.push(...this.collectFilterValues(value)));

    return values;
  }

  private getDepartmentManagerKeys(department: DepartmentOption): string[] {
    return this.normalizeFilterKeys(this.getDepartmentManagerValues(department));
  }

  private getDepartmentManagerValues(department: DepartmentOption): any[] {
    if (this.isAllDepartment(department)) {
      return [];
    }

    const raw = department.raw || {};
    const definition = this.getReleaseDepartmentDefinition(department);
    const values: any[] = [
      raw?.manager_name,
      raw?.managerName,
      raw?.department_manager_name,
      raw?.departmentManagerName,
      definition?.managerName,
      raw?.team_lead_name,
      raw?.teamLeadName,
      raw?.lead_name,
      raw?.leadName,
      raw?.hod_name,
      raw?.hodName,
      ...this.collectManagerValues(raw?.manager),
      ...this.collectManagerValues(raw?.managerDetails),
      ...this.collectManagerValues(raw?.department_manager),
      ...this.collectManagerValues(raw?.departmentManager),
      ...this.collectManagerValues(raw?.team_lead),
      ...this.collectManagerValues(raw?.teamLead),
      ...this.collectManagerValues(raw?.lead),
      ...this.collectManagerValues(raw?.owner)
    ];
    const departmentKeys = this.getDepartmentOptionKeys(department);

    this.managerList.forEach(manager => {
      if (this.doFilterKeysOverlap(this.getManagerDepartmentKeys(manager), departmentKeys)) {
        values.push(...this.collectManagerValues(manager));
      }
    });

    values.push(
      raw?.manager_id,
      raw?.managerId,
      raw?.managerid,
      raw?.department_manager_id,
      raw?.departmentManagerId,
      raw?.team_lead_id,
      raw?.teamLeadId,
      raw?.lead_id,
      raw?.leadId,
      department.department_name,
      definition?.label,
      ...(definition?.aliases || [])
    );

    return Array.from(new Set(values.filter(value => value !== null && value !== undefined && `${value}`.trim() !== '')));
  }

  private getManagerDepartmentKeys(manager: any): string[] {
    return this.normalizeFilterKeys([
      manager?.department,
      manager?.dept,
      manager?.team,
      manager?.department_id,
      manager?.departmentId,
      manager?.departmentid,
      manager?.dept_id,
      manager?.deptId,
      manager?.deptid,
      manager?.department_name,
      manager?.departmentName,
      manager?.dept_name,
      manager?.deptName,
      manager?.team_name,
      manager?.teamName,
      manager?.manager_department,
      manager?.managerDepartment
    ]);
  }

  private getReleaseManagerKeys(release: any): string[] {
    return this.normalizeFilterKeys([
      release?.manager_name,
      release?.managerName,
      release?.manager_id,
      release?.managerId,
      release?.managerid,
      release?.department_manager_name,
      release?.departmentManagerName,
      release?.department_manager_id,
      release?.departmentManagerId,
      release?.team_lead_name,
      release?.teamLeadName,
      release?.team_lead_id,
      release?.teamLeadId,
      release?.lead_name,
      release?.leadName,
      release?.lead_id,
      release?.leadId,
      release?.assigned_manager_name,
      release?.assignedManagerName,
      release?.project_manager_name,
      release?.projectManagerName,
      release?.owner_name,
      release?.ownerName,
      ...this.collectManagerValues(release?.manager),
      ...this.collectManagerValues(release?.managerDetails),
      ...this.collectManagerValues(release?.department_manager),
      ...this.collectManagerValues(release?.departmentManager),
      ...this.collectManagerValues(release?.team_lead),
      ...this.collectManagerValues(release?.teamLead),
      ...this.collectManagerValues(release?.lead),
      ...this.collectManagerValues(release?.owner)
    ]);
  }

  private getReleaseProjectKeys(release: any): string[] {
    return this.normalizeFilterKeys([
      release?.projectid,
      release?.project_id,
      release?.projectId,
      release?.project,
      release?.project_name,
      release?.projectName,
      release?.project_title,
      release?.projectTitle
    ]);
  }

  private getReleaseEmployeeKeys(release: any): string[] {
    if (!release || typeof release !== 'object') {
      return [];
    }

    const directValues: any[] = [
      release?.employee_id,
      release?.employeeId,
      release?.employeeid,
      release?.empid,
      release?.emp_id,
      release?.empId,
      release?.userid,
      release?.user_id,
      release?.userId,
      release?.employee_name,
      release?.employeeName,
      release?.assigned_to,
      release?.assignedTo,
      release?.assigned_to_id,
      release?.assignedToId,
      release?.assigned_to_name,
      release?.assignedToName,
      release?.assignee_to,
      release?.assigneeTo,
      release?.assignee_to_id,
      release?.assigneeToId,
      release?.assignee_to_name,
      release?.assigneeToName,
      release?.assigned_from,
      release?.assignedFrom,
      release?.assigned_from_id,
      release?.assignedFromId,
      release?.assigned_from_name,
      release?.assignedFromName,
      release?.assignee_from,
      release?.assigneeFrom,
      release?.assignee_from_id,
      release?.assigneeFromId,
      release?.assignee_from_name,
      release?.assigneeFromName,
      release?.released_by,
      release?.releasedBy,
      release?.released_by_id,
      release?.releasedById,
      release?.released_by_name,
      release?.releasedByName,
      release?.tested_by,
      release?.testedBy,
      release?.tested_by_id,
      release?.testedById,
      release?.tested_by_name,
      release?.testedByName,
      release?.createdby,
      release?.created_by,
      release?.createdBy,
      release?.created_by_name,
      release?.createdByName,
      release?.updatedby,
      release?.updated_by,
      release?.updatedBy
    ];
    const nestedEmployeeValues = [
      release?.employee,
      release?.employeeDetails,
      release?.assigned_to_employee,
      release?.assignedToEmployee,
      release?.assigned_to_details,
      release?.assignedToDetails,
      release?.assignee_to_employee,
      release?.assigneeToEmployee,
      release?.assignee_to_details,
      release?.assigneeToDetails,
      release?.assigned_from_employee,
      release?.assignedFromEmployee,
      release?.assigned_from_details,
      release?.assignedFromDetails,
      release?.assignee_from_employee,
      release?.assigneeFromEmployee,
      release?.released_by_employee,
      release?.releasedByEmployee,
      release?.tested_by_employee,
      release?.testedByEmployee,
      release?.tester,
      release?.created_by_employee,
      release?.createdByEmployee
    ].flatMap(value => this.getEmployeeIdentityValues(value));

    this.getReleaseAssignedToReferences(release)
      .forEach(reference => nestedEmployeeValues.push(...this.getEmployeeIdentityValues(reference)));

    return this.normalizeFilterKeys([...directValues, ...nestedEmployeeValues]);
  }

  private getAllDepartmentManagerDisplayNames(releases: Release[] = this.filteredReleases): string[] {
    const departmentOptions = this.departmentTabs.filter(department => !this.isAllDepartment(department));
    const expectedDepartmentCount = departmentOptions.length || this.releaseDepartmentDefinitions.length;
    const namesByDepartment = departmentOptions.flatMap(department => {
      const configuredNames = this.getDepartmentManagerDisplayNames(department);
      if (configuredNames.length) {
        return configuredNames.slice(0, 1);
      }

      return this.getUniqueReleaseManagerDisplayNames(
        this.filterReleasesByDepartment(releases, department)
      ).slice(0, 1);
    });
    const normalizedNames = this.normalizeDisplayNameList(namesByDepartment);

    if (normalizedNames.length >= expectedDepartmentCount) {
      return normalizedNames.slice(0, expectedDepartmentCount);
    }

    return this.normalizeDisplayNameList([
      ...normalizedNames,
      ...this.getUniqueReleaseManagerDisplayNames(releases)
    ]).slice(0, expectedDepartmentCount);
  }

  private getSelectedDepartmentFallbackManagerName(): string {
    const department = this.getSelectedDepartmentOption();
    return this.isAllDepartment(department) ? '' : this.getConfiguredDepartmentManagerName(department);
  }

  private getReleaseDepartmentManagerFallbackName(release: any): string {
    const releaseDepartmentKeys = this.getReleaseDepartmentKeys(release);
    const definition = this.releaseDepartmentDefinitions.find(item => {
      const definitionKeys = this.normalizeFilterKeys([item.key, item.label, ...item.aliases]);
      return this.doFilterKeysOverlap(releaseDepartmentKeys, definitionKeys);
    });

    return definition?.managerName || '';
  }

  private getDepartmentManagerDisplayNames(department: DepartmentOption): string[] {
    if (this.isAllDepartment(department)) {
      return [];
    }

    const raw = department.raw || {};
    const definition = this.getReleaseDepartmentDefinition(department);
    const values: any[] = [
      raw?.manager_name,
      raw?.managerName,
      raw?.department_manager_name,
      raw?.departmentManagerName,
      definition?.managerName,
      raw?.team_lead_name,
      raw?.teamLeadName,
      raw?.lead_name,
      raw?.leadName,
      raw?.hod_name,
      raw?.hodName,
      ...this.collectManagerDisplayNames(raw?.manager),
      ...this.collectManagerDisplayNames(raw?.managerDetails),
      ...this.collectManagerDisplayNames(raw?.department_manager),
      ...this.collectManagerDisplayNames(raw?.departmentManager),
      ...this.collectManagerDisplayNames(raw?.team_lead),
      ...this.collectManagerDisplayNames(raw?.teamLead),
      ...this.collectManagerDisplayNames(raw?.lead),
      ...this.collectManagerDisplayNames(raw?.owner)
    ];
    const departmentKeys = this.getDepartmentOptionKeys(department);

    this.managerList.forEach(manager => {
      if (this.doFilterKeysOverlap(this.getManagerDepartmentKeys(manager), departmentKeys)) {
        values.push(...this.collectManagerDisplayNames(manager));
      }
    });

    return this.normalizeDisplayNameList(values);
  }

  private getUniqueReleaseManagerDisplayNames(releases: Release[]): string[] {
    return this.normalizeDisplayNameList(
      (Array.isArray(releases) ? releases : []).map(release => this.getReleaseManagerDisplayName(release))
    );
  }

  private getReleaseManagerDisplayName(release: any): string {
    return this.normalizeDisplayNameList([
      release?.manager_name,
      release?.managerName,
      release?.department_manager_name,
      release?.departmentManagerName,
      release?.team_lead_name,
      release?.teamLeadName,
      release?.lead_name,
      release?.leadName,
      release?.assigned_manager_name,
      release?.assignedManagerName,
      release?.project_manager_name,
      release?.projectManagerName,
      release?.owner_name,
      release?.ownerName,
      ...this.collectManagerDisplayNames(release?.manager),
      ...this.collectManagerDisplayNames(release?.managerDetails),
      ...this.collectManagerDisplayNames(release?.department_manager),
      ...this.collectManagerDisplayNames(release?.departmentManager),
      ...this.collectManagerDisplayNames(release?.team_lead),
      ...this.collectManagerDisplayNames(release?.teamLead),
      ...this.collectManagerDisplayNames(release?.lead),
      ...this.collectManagerDisplayNames(release?.owner)
    ])[0] || '';
  }

  private collectManagerDisplayNames(value: any, depth = 0): any[] {
    if (!value || depth > 2) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap(item => this.collectManagerDisplayNames(item, depth + 1));
    }

    if (typeof value !== 'object') {
      return [value];
    }

    const values: any[] = [
      value?.manager_name,
      value?.managerName,
      value?.employee_name,
      value?.employeeName,
      value?.full_name,
      value?.fullName,
      value?.user_name,
      value?.username,
      value?.name,
      value?.title,
      value?.label
    ];

    ['manager', 'managerDetails', 'department_manager', 'departmentManager', 'team_lead', 'teamLead', 'lead', 'owner']
      .forEach(key => values.push(...this.collectManagerDisplayNames(value[key], depth + 1)));

    return values;
  }

  private normalizeDisplayNameList(values: any[]): string[] {
    return Array.from(new Set(
      values
        .map(value => `${value ?? ''}`.trim())
        .filter(value => this.isManagerDisplayName(value))
    ));
  }

  private isManagerDisplayName(value: string): boolean {
    if (!value || !/[a-z]/i.test(value) || value.includes('@') || /^\d+$/.test(value)) {
      return false;
    }

    const departmentKeys = this.releaseDepartmentDefinitions.flatMap(definition => [
      definition.key,
      definition.label,
      ...definition.aliases,
      'all',
      'all departments',
      'all managers'
    ]).map(value => this.normalizeDepartmentKey(value));

    return !departmentKeys.includes(this.normalizeDepartmentKey(value));
  }

  private collectManagerValues(value: any, depth = 0): any[] {
    if (Array.isArray(value)) {
      return value.flatMap(item => this.collectManagerValues(item, depth + 1));
    }

    if (!value || typeof value !== 'object' || depth > 2) {
      return value === null || value === undefined ? [] : [value];
    }

    const values: any[] = [
      value?.manager_name,
      value?.managerName,
      value?.employee_name,
      value?.employeeName,
      value?.full_name,
      value?.fullName,
      value?.user_name,
      value?.username,
      value?.name,
      value?.title,
      value?.label,
      value?.email,
      value?.manager_id,
      value?.managerId,
      value?.managerid,
      value?.id,
      value?.empid,
      value?.emp_id,
      value?.empId,
      value?.employee_id,
      value?.employeeId,
      value?.user_id,
      value?.userId
    ];

    ['manager', 'managerDetails', 'department_manager', 'departmentManager', 'team_lead', 'teamLead', 'lead', 'owner']
      .forEach(key => values.push(...this.collectManagerValues(value[key], depth + 1)));

    return values;
  }

  private doFilterKeysOverlap(first: string[], second: string[]): boolean {
    if (!first.length || !second.length) {
      return false;
    }

    const secondKeys = new Set(second);
    return first.some(key => secondKeys.has(key));
  }

  private getDepartmentOptionKeys(department: DepartmentOption): string[] {
    return this.normalizeFilterKeys([
      department.filter_id,
      department.api_id,
      department.department_name,
      department.raw?.id,
      department.raw?.department_id,
      department.raw?.departmentId,
      department.raw?.departmentid,
      department.raw?.dept_id,
      department.raw?.deptId,
      department.raw?.deptid,
      department.raw?.department_name,
      department.raw?.departmentName,
      department.raw?.dept_name,
      department.raw?.deptName,
      department.raw?.name,
      department.raw?.title,
      department.raw?.label
    ]);
  }

  private getReleaseDepartmentKeys(release: any): string[] {
    return this.normalizeFilterKeys([
      release?.department,
      release?.dept,
      release?.team,
      release?.department_id,
      release?.departmentId,
      release?.departmentid,
      release?.dept_id,
      release?.deptId,
      release?.deptid,
      release?.department_name,
      release?.departmentName,
      release?.dept_name,
      release?.deptName,
      release?.team_name,
      release?.teamName,
      release?.assigned_from_department,
      release?.assignedFromDepartment,
      release?.assignee_from_department,
      release?.assigneeFromDepartment,
      release?.released_by_department,
      release?.releasedByDepartment,
      release?.manager_department,
      release?.managerDepartment
    ]);
  }

  private normalizeFilterKeys(values: any[]): string[] {
    return Array.from(new Set(
      values
        .flatMap(value => this.collectFilterValues(value))
        .map(value => this.normalizeDepartmentKey(value))
        .filter(Boolean)
    ));
  }

  private collectFilterValues(value: any): any[] {
    if (Array.isArray(value)) {
      return value.flatMap(item => this.collectFilterValues(item));
    }

    if (value && typeof value === 'object') {
      return [
        value?.id,
        value?.department_id,
        value?.departmentId,
        value?.departmentid,
        value?.dept_id,
        value?.deptId,
        value?.deptid,
        value?.department_name,
        value?.departmentName,
        value?.dept_name,
        value?.deptName,
        value?.team_name,
        value?.teamName,
        value?.name,
        value?.title,
        value?.label
      ];
    }

    return [value];
  }

  private normalizeDepartmentKey(value: any): string {
    return `${value ?? ''}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private firstPresent(...values: any[]): any {
    return values.find(value => value !== null && value !== undefined && value !== '');
  }

  private mergePresentObjects(...rows: any[]): any {
    const merged: any = {};

    rows.forEach(row => {
      if (!row || typeof row !== 'object') {
        return;
      }

      Object.keys(row).forEach(key => {
        const value = row[key];
        if (this.isPresentValue(value) || !Object.prototype.hasOwnProperty.call(merged, key)) {
          merged[key] = value;
        }
      });
    });

    return merged;
  }

  private isPresentValue(value: any): boolean {
    return value !== null && value !== undefined && `${value}`.trim() !== '';
  }

  private extractResponseList(response: any, keys: string[]): any[] {
    if (Array.isArray(response)) {
      return response;
    }

    for (const key of keys) {
      if (Array.isArray(response?.[key])) {
        return response[key];
      }
    }

    return [];
  }

  private resetPdfPreviewState(): void {
    this.hasViewedPdf = false;
    this.previewedReleasePdfRequest = null;
  }

  private normalizeReleaseType(type: any): string {
    return `${type ?? ''}`.trim().toLowerCase();
  }

  private getReleaseTypeDisplayValue(type: any): any {
    const normalizedType = this.normalizeReleaseType(type);

    if (normalizedType === 'internal') {
      return 'Internal';
    }

    if (normalizedType === 'external') {
      return 'External';
    }

    return type || '';
  }


  private setReleaseTableInlineLoading(loading: boolean, label = 'Loading data...'): void {
    const host = this.tableEl?.nativeElement as HTMLElement | undefined;
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
  }

  isReleaseOverdue(release: Release): boolean {
    const status = `${release?.status ?? ''}`.trim().toLowerCase().replace(/[_\s]+/g, '-');
    if (status !== 'upcoming-release') {
      return false;
    }

    const daysUntilRelease = this.getDaysUntilRelease(release?.released_date);
    return daysUntilRelease !== null && daysUntilRelease < 0;
  }

  getReleaseDateBadgeClass(release: Release): string {
    const daysUntilRelease = this.getDaysUntilRelease(release?.released_date);

    if (daysUntilRelease !== null && daysUntilRelease < 0) {
      return 'release-date-pill--danger';
    }

    if (daysUntilRelease !== null && daysUntilRelease <= 1) {
      return 'release-date-pill--high-warning';
    }

    if (daysUntilRelease !== null) {
      return 'release-date-pill--warning';
    }

    return 'release-date-pill--info';
  }

  private getDaysUntilRelease(releasedDate: string | null | undefined): number | null {
    const rawValue = `${releasedDate ?? ''}`.trim();
    if (!rawValue) {
      return null;
    }

    if (rawValue.toLowerCase() === 'overdue') {
      return 0;
    }

    const releaseDate = this.parseReleaseDate(rawValue);
    if (!releaseDate) {
      return null;
    }

    releaseDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Math.ceil((releaseDate.getTime() - today.getTime()) / 86400000);
  }

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }

  private parseReleaseDate(value: string): Date | null {
    const normalized = value.trim();
    const ymdParts = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);

    if (ymdParts) {
      const year = Number(ymdParts[1]);
      const month = Number(ymdParts[2]);
      const day = Number(ymdParts[3]);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const dmyParts = normalized.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s].*)?$/);

    if (dmyParts) {
      const day = Number(dmyParts[1]);
      const month = Number(dmyParts[2]);
      const year = Number(dmyParts[3]);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

}
