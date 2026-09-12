import { Component, ElementRef, HostListener } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, finalize } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { ReleaseMailsListComponent } from 'src/app/features/admin/core/mails/release-mails-list/release-mails-list.component';
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
  assignee_name?: string;
  release_type: 'Internal' | 'External';
  ismail: boolean;
  createdby?: string | number;
  created_by?: string | number;
  file_url?: string;
  file_name?: string;
  mail_content?: string;
  parent_version?: string;
  reason?: string;
  reject_reason?: string;
}
export interface Project {
  id: string;
  project_title: string;
}

export interface Employee {
  id: string;
  employee_name: string;
  email: string;
}
export type ReleaseStatus = 'Upcoming-Release' | 'On-Hold' | 'Open' | 'In-Progress' | 'To-be-Tested' | 'In-Review' | 'Rejected' | 'Pass' | 'Failed';
@Component({
  selector: 'app-release-manager',
  templateUrl: './release-manager.component.html',
  styleUrls: ['./release-manager.component.scss']
})
export class ReleaseManagerComponent {
  tabulator: any;
  deptName: any;
  // View State
  currentView: 'table' | 'kanban' = 'kanban';

  searchQuery: string = '';

  // Data
  releaseList: Release[] = [];
  filteredReleases: Release[] = [];
  projectList: Project[] = [];
  employeeList: Employee[] = [];

  // Config
  statusList: ReleaseStatus[] = ['Upcoming-Release', 'To-be-Tested', 'On-Hold', 'In-Progress', 'Rejected', 'Pass', 'Failed'];

  // Drag & Drop
  draggedReleaseId: string | null = null;
  username: string;
  empid: any = 0
  projectid: any = 0
  releaseTypeControl = new FormControl('');
  selectedReleaseType: string = 'All';
  readonly releaseTypeOptions = ['Internal', 'External'];
  filteredReleaseTypeOptions = [...this.releaseTypeOptions];
  releaseTypeSearchText = '';
  releaseLoading = false;
  createReleaseLoading = false;
  deletingReleaseId: number | null = null;
  updatingReleaseId: number | null = null;
  constructor(private matDialog: MatDialog, private authService: AuthService, private drawerService: DrawerService, private storageService: StorageService, private router: Router, private route: ActivatedRoute, private toasterService: ToasterService) {
    this.empid = this.storageService.getEmpId();
    this.username = this.storageService.getUsername();
    // this.projectid = this.route.snapshot.paramMap.get('projectid');
    this.route.paramMap.subscribe(params => {
      const newProjectId = Number(params.get('projectid') || params.get('projectId') || params.get('id'));

      if (newProjectId && newProjectId !== this.projectid) {
        this.projectid = newProjectId;
        this.loadData(); // Re-loads employees and releases for the new project
      }
    });
    this.deptName = this.storageService.getDept();

  }

  ngOnInit(): void {
    if (this.projectid) {
      this.loadData();
    }
    this.drawerService.drawerAction$
      .pipe(filter(a => a.source === 'release'))
      .subscribe(() => { this.loadData() });
  }



  loadData() {
    this.getReleaseByProjectId();
    this.getEmployeelistByProjectId();
  }

  createNew() {
    if (this.createReleaseLoading) return;

    this.createReleaseLoading = true;
    this.getReleaseByProjectId((releases: Release[]) => {
      this.createReleaseLoading = false;
      this.drawerService.open('release', {
        mode: 'create',
        projectid: this.projectid,
        releaseList: releases
      });
    });
  }

  // --- View & Search ---

  setView(view: 'table' | 'kanban') {
    this.currentView = view;
    if (view === 'table') {
      setTimeout(() => {
        const el = document.querySelector('div[class="w-full h-full"]');
        if (el) this.drawTable(el); this.getReleaseByProjectId();
      }, 100);
    }
  }

  onSearchChange(query: string) {
    this.searchQuery = query;
    this.filterData();
  }

  filterData() {
    if (!this.searchQuery) {
      this.filteredReleases = [...this.releaseList];
    } else {
      const lowerQuery = this.searchQuery.toLowerCase();
      this.filteredReleases = this.releaseList.filter(r =>
        r.title.toLowerCase().includes(lowerQuery) ||
        r.code.toLowerCase().includes(lowerQuery) ||
        r.version.toLowerCase().includes(lowerQuery)
      );
    }

    if (this.currentView === 'table' && this.tabulator) {
      this.safeReplaceData(this.tabulator, this.filteredReleases);
    }
  }

  // --- Kanban Logic ---

  getReleasesByStatus(status: ReleaseStatus): Release[] {
    return this.filteredReleases.filter(r => r.status === status);
  }

  getCountByStatus(status: ReleaseStatus): number {
    return this.releaseList.filter(r => r.status === status).length;
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

  // onDrop(event: DragEvent, newStatus: string) {
  //   event.preventDefault();
  //   const releaseId = event.dataTransfer?.getData('text/plain');
  //   if (releaseId) {
  //     const release = this.releaseList.find(r => r.id == releaseId);
  //     console.log(release);

  //     if (release && release.status !== newStatus) {
  //       release.status = newStatus as ReleaseStatus;
  //       this.updateRelease(release)
  //       this.filterData();
  //     }
  //   }
  //   this.draggedReleaseId = null;
  // }

  onDrop(event: DragEvent, newStatus: string) {
    event.preventDefault();
    const releaseId = event.dataTransfer?.getData('text/plain');
    if (!releaseId) return;

    const release = this.releaseList.find(r => r.id == releaseId);
    if (!release) return;

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
    if (release.status !== newStatus) {
      release.status = newStatus as ReleaseStatus;
      this.updateRelease(release);
      this.filterData();
    }
    this.draggedReleaseId = null;
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
  // --- Helpers ---

  getOwnerInitials(name: string | undefined): string {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  }

  isReleaseOverdue(release: Release): boolean {
    if (release?.status !== 'Upcoming-Release') {
      return false;
    }

    const rawValue = `${release?.released_date ?? ''}`.trim();
    if (!rawValue) {
      return false;
    }

    if (rawValue.toLowerCase() === 'overdue') {
      return true;
    }

    const releaseDate = new Date(rawValue);
    if (Number.isNaN(releaseDate.getTime())) {
      return false;
    }

    releaseDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return releaseDate.getTime() <= today.getTime();
  }

  trackById(index: number, item: Release) {
    return item.id;
  }
  // --- Tabulator Logic ---

  drawTable(element?: any) {
    if (this.tabulator) {
      this.safeReplaceData(this.tabulator, this.filteredReleases);

    } const employeeList = this.employeeList.map((m: any) => ({ label: m.employee_name, value: m.id }));
    const freezeColumns = !this.isCompactViewport();
    const employeeListLookup = this.employeeList.reduce((acc: any, cur: any) => {
      acc[cur.id] = cur.employee_name;
      return acc;
    }, {});
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
        { title: "Version", field: "version", width: 100, editor: "input", editable: canEditTableCell },
        { title: "Reject Reason", field: "reject_reason", width: 200, editor: "input", editable: canEditTableCell },
        {
          title: "Status",
          field: "status",
          width: 200,
          editable: canEditTableCell,
          editor: "list", editorParams: { values: this.statusList },
          formatter: (cell: any) => {
            const val = `${cell.getValue() ?? ''}`.trim();
            const safeValue = this.escapeHtml(val || '-');
            return `<span class="release-status-pill ${this.getReleaseStatusPillClass(val)}" title="${safeValue}">${safeValue}</span>`;
          }
        },


        {
          title: "Assignee",
          field: "assigned_to",
          minWidth: 200,
          editable: canEditTableCell,
          editor: "list",
          editorParams: {
            values: employeeList,
            autocomplete: true,
            listOnEmpty: true,
            clearable: true
          },
          formatter: (cell: any) => {
            const id = cell.getValue();
            const name = employeeListLookup[id] || "Unknown";
            const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
            return `
                <div class="flex items-center gap-2">
                    <div class="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-600">${initials}</div>
                    <span class="text-m">${name}</span>
                </div>
                `;
          }
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
      ]
    });
    attachTabulatorPaginationPersistence(this.tabulator, buildTabulatorPaginationKey('release-manager-table'));

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

  getStatusList() {
    this.authService.getStatusList().subscribe({
      next: (res: any) => {
        this.statusList = this.mergeReleaseStatuses(res);
      }
    });
  }

  private mergeReleaseStatuses(statuses: any): ReleaseStatus[] {
    const defaultStatuses: ReleaseStatus[] = ['In-Progress', 'To-be-Tested', 'In-Review', 'Rejected', 'Pass', 'Failed'];
    const incomingStatuses = Array.isArray(statuses) ? statuses : [];
    const mergedStatuses = [...incomingStatuses, ...defaultStatuses]
      .map((status: any) => `${status ?? ''}`.trim())
      .filter((status): status is ReleaseStatus => !!status && defaultStatuses.includes(status as ReleaseStatus));

    return Array.from(new Set(mergedStatuses)) as ReleaseStatus[];
  }

  getEmployeelistByProjectId() {
    this.authService.getEmployeelistByProjectId(this.projectid).subscribe({
      next: (res: any) => {
        this.employeeList = res?.assigned_employee_list;
      }
    });
  }

  getReleaseByProjectId(callback?: Function) {
    this.releaseLoading = true;
    this.authService.getReleaseByProjectId(this.projectid)
      .pipe(finalize(() => {
        this.releaseLoading = false;
        if (callback && this.createReleaseLoading) {
          this.createReleaseLoading = false;
        }
      }))
      .subscribe({
        next: (res: any) => {
          this.releaseList = res;
          this.filterData();
          if (callback) callback(res);
        },
        error: (err: any) => {
          this.releaseList = [];
          this.filterData();
          this.toasterService.error(err?.error?.message || 'Unable to load releases.');
        }
      });
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
          this.getReleaseByProjectId()
        }, error: (err) => {
          this.toasterService.error(err?.error?.message);
        }
      })
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
          },
          error: (err: any) => {
            this.toasterService.error(err?.error?.message || 'Unable to delete release.');
          }
        });
    });
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

  canDragRelease(release: any): boolean {
    const loggedInEmpId = `${this.storageService.getEmpId() ?? ''}`;
    const assignedTo = `${release?.assigned_to ?? release?.assignedTo ?? release?.assigned_to_id ?? release?.assignedToId ?? ''}`;
    const roles = this.storageService.roles;

    if (roles?.isAdmin || roles?.isManager) {
      return true;
    }

    return !!loggedInEmpId && !!assignedTo && loggedInEmpId === assignedTo;
  }
  openDailogue(data: any) {
    const dialogRef = this.matDialog.open(ReleaseMailsListComponent,
      {
        data: {
          ...data,
          releaseList: this.releaseList
        },
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

  setReleaseType(type: string) {
    this.selectedReleaseType = type;
    this.releaseTypeControl.setValue(type);
    this.applyFilters();
  }

  filterReleaseTypes(event: Event): void {
    this.releaseTypeSearchText = (event.target as HTMLInputElement).value;
    const query = this.releaseTypeSearchText.trim().toLowerCase();
    this.filteredReleaseTypeOptions = query
      ? this.releaseTypeOptions.filter(type => type.toLowerCase().includes(query))
      : [...this.releaseTypeOptions];
  }

  onReleaseTypeSelectOpened(opened: boolean): void {
    if (!opened) return;
    this.releaseTypeSearchText = '';
    this.filteredReleaseTypeOptions = [...this.releaseTypeOptions];
  }

  clearReleaseType() {
    this.releaseTypeControl.setValue('');
    this.selectedReleaseType = 'All';
    this.applyFilters();
  }

  applyFilters() {
    let data = [...this.releaseList];
    if (this.selectedReleaseType !== 'All') {
      data = data.filter(
        r => r.release_type === this.selectedReleaseType
      );
    }
    this.filteredReleases = data;
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

  private getReleaseStatusPillClass(status: string): string {
    const normalized = `${status ?? ''}`.trim().toLowerCase();
    if (['active', 'on-track', 'approved', 'pass', 'passed', 'completed', 'invoiced', 'open'].includes(normalized)) {
      return 'release-status--success';
    }
    if (['in-progress', 'in-review', 'in-testing', 'planning'].includes(normalized)) {
      return 'release-status--progress';
    }
    if (['on-hold', 'to-be-tested', 'upcoming-release'].includes(normalized)) {
      return 'release-status--warning';
    }
    if (['delayed', 'cancelled', 'rejected', 'failed', 'closed'].includes(normalized)) {
      return 'release-status--danger';
    }
    return 'release-status--muted';
  }

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

}
