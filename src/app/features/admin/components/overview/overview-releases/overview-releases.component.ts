import { Component, ElementRef, HostListener } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, map, Observable, startWith } from 'rxjs';
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
  assignee_to_name?: string;
  release_type: 'Internal' | 'External';
  ismail: boolean;
  file_url?: string;
  mail_content?: string;
  project_name?: string
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
}
export type ReleaseStatus = 'Upcoming-Release' | 'On-Hold' | 'Open' | 'In-Progress' | 'To-be-Tested' | 'Rejected' | 'Pass' | 'Failed';
@Component({
  selector: 'app-overview-releases',
  templateUrl: './overview-releases.component.html',
  styleUrls: ['./overview-releases.component.scss']
})
export class OverviewReleasesComponent {
  tabulator: any;
  // View State
  currentView: 'table' | 'kanban' = 'kanban';
  searchQuery: string = '';
  myControl = new FormControl<string>('');
  filteredOptions!: Observable<any[]>;
  // Data
  releaseList: Release[] = [];
  filteredReleases: Release[] = [];
  projectList: Project[] = [];
  employeeList: Employee[] = [];
  projectid: any = 0;
  releaseTypeControl = new FormControl('');
  selectedReleaseType: string = 'All';
  hasViewedPdf = false;

  private previewedReleasePdfRequest: {
    filters: any;
    startDate: any;
    endDate: any;
    data: Release[];
  } | null = null;
  // Config
  statusList: ReleaseStatus[] = ['Upcoming-Release', 'To-be-Tested', 'On-Hold', 'In-Progress', 'Rejected', 'Pass', 'Failed'];

  // Drag & Drop
  draggedReleaseId: string | null = null;

  empid: any = 0
  startDate: any = null;
  endDate: any = null;
  username: any;

  constructor(private matDialog: MatDialog, private authService: AuthService, private drawerService: DrawerService, private storageService: StorageService, private router: Router, private route: ActivatedRoute, private toasterService: ToasterService, private pdfService: PdfService, private excelService: ExcelService) {
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
    this.setCurrentWeekDates();
    this.loadData();

    this.drawerService.drawerAction$
      .pipe(filter(a => a.source === 'release'))
      .subscribe(() => { this.loadData() });
  }



  loadData() {
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
      setTimeout(() => {
        const el = document.querySelector('div[class="w-full h-full"]');
        if (el) this.drawTable(el); this.getReleaseOverviewByEmp();
      }, 100);
    }
  }

  onSearchChange(query: string) {
    this.searchQuery = query;
    this.filterData();
  }

  filterData() {
    let data = [...this.releaseList];

    if (this.selectedReleaseType !== 'All') {
      const selectedType = this.normalizeReleaseType(this.selectedReleaseType);
      data = data.filter(r => this.normalizeReleaseType(r.release_type) === selectedType);
    }

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

    } const employeeList = this.employeeList.map((m: any) => ({ label: m.employee_name, value: m.id }));
    const employeeListLookup = this.employeeList.reduce((acc: any, cur: any) => {
      acc[cur.id] = cur.employee_name;
      return acc;
    }, {});
    this.tabulator = new Tabulator(element, {
      data: this.filteredReleases,
      layout: "fitColumns",
      pagination: "local",
      paginationSize: 15,
      paginationCounter: "rows",
      movableColumns: true,
      selectable: true,
      editTriggerEvent: "dblclick",
      paginationSizeSelector: [10, 15, 25, 30, 50, 100],
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
        // Sync change with local array so filtered data persists
        const found = this.releaseList.find(r => r.id === data.id);
        if (found) {
          (found as any)[cell.getField()] = val;
        }
      },
      columns: [
        {
          title: "Title", field: "title", editor: "input",
          frozen: true,
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
        { title: "Version", field: "version", editor: "input" },
        { title: "Reject Reason", field: "reject_reason", width: 200, editor: "input" },
        {
          title: "Status",
          field: "status",
          editor: "list", editorParams: { values: this.statusList },
          formatter: (cell: any) => {
            const val = cell.getValue();

            // Simple color logic
            let colorClass = "bg-gray-100 text-gray-700";
            if (["Active", "On-Track", "Approved", "Pass", "Invoiced", "Open"].includes(val)) {
              colorClass = "bg-emerald-100 text-emerald-700";
            } else if (["In-Progress", "In-Review", "To-be-Tested", "In-Testing", "Planning"].includes(val)) {
              colorClass = "bg-blue-100 text-blue-700";
            } else if (["On-Hold", "To-be-Tested"].includes(val)) {
              colorClass = "bg-amber-100 text-amber-700";
            } else if (["Delayed", "Cancelled", "Rejected", "Failed", "Closed"].includes(val)) {
              colorClass = "bg-red-100 text-red-700";
            }
            return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}">${val}</span>`;
          }
        },
        {
          title: "Assignee",
          field: "assigned_to",
          minWidth: 200,
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
          frozen: true,
          formatter: this.actionFormatter,
          cellClick: (e: any, cell: any) => this.handleActionClick(e, cell),
          cssClass: "sticky-col-right",
        }
      ]
    });

    attachTabulatorPaginationPersistence(this.tabulator, buildTabulatorPaginationKey('overview-releases-table'));

    this.tabulator.on("cellEdited", (cell: any) => {
      var rowData = cell.getData();
      this.updateRelease(rowData)
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
      this.drawerService.open('release', data)
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

      this.authService.deleteRelease(releaseId, this.username).subscribe({
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
        this.projectList = res;
        this.filteredOptions = this.myControl.valueChanges.pipe(
          startWith(''),
          map((value: any) => {
            const name =
              typeof value === 'string' ? value : value?.project_title || '';

            return name ? this._filter(name) : [...this.projectList];
          })
        );
      }
    });
  }

  getEmployeelistByProjectId() {
    this.authService.getEmployeeList().subscribe({
      next: (res: any) => {
        this.employeeList = res;
      }
    });
  }
  onProjectSelect(e: any) {
    this.projectid
      = e.id
    this.resetPdfPreviewState();
    this.getReleaseOverviewByEmp()
  }
  getReleaseOverviewByEmp(callback?: Function) {
    this.authService.getReleaseOverviewByEmp(this.getReleaseOverviewPayload()).subscribe({
      next: (res: any) => {
        this.releaseList = this.normalizeReleaseResponse(res);
        this.filterData();
        if (!callback) {
          this.resetPdfPreviewState();
        }
        callback?.(this.filteredReleases);
      }
    });
  }
  getReleaseOverviewListByEmp(callback?: Function) {
    this.authService.getReleaseOverviewListByEmp(this.getReleaseOverviewPayload()).subscribe({
      next: (res: any) => {
        callback?.(this.normalizeReleaseResponse(res));
      },
      error: (err: any) => {
        this.toasterService.error(err?.error?.message || 'Unable to load release report data.');
      }
    });
  }

  private getReleaseOverviewPayload(): any {
    return {
      employee_id: this.empid,
      projectid: this.projectid,
      fromdate: this.startDate,
      todate: this.endDate
    };
  }

  private normalizeReleaseResponse(res: any): Release[] {
    return Array.isArray(res) ? res : res ? [res] : [];
  }

  generateReleaseOverviewPdf() {
    if (!this.previewedReleasePdfRequest) {
      return;
    }

    this.pdfService.generateReleaseOverviewPDF(
      this.previewedReleasePdfRequest.filters,
      this.previewedReleasePdfRequest.startDate,
      this.previewedReleasePdfRequest.endDate,
      this.previewedReleasePdfRequest.data,
      'download'
    );
  }

  previewReleaseOverviewPdf() {
    this.getReleaseOverviewListByEmp((data: Release[]) => {
      const reportData = this.getReportableReleases(data);
      const projectValue = this.myControl.value as any;
      const projectName =
        typeof projectValue === 'string'
          ? projectValue
          : projectValue?.project_title || '';

      const request = {
        filters: {
          generatedBy: this.storageService.getEmpName() || this.storageService.getUsername(),
          filteredProject: projectName,
          releaseType: this.selectedReleaseType
        },
        startDate: this.startDate,
        endDate: this.endDate,
        data: reportData
      };

      this.previewedReleasePdfRequest = request;
      this.pdfService.generateReleaseOverviewPDF(
        request.filters,
        request.startDate,
        request.endDate,
        request.data,
        'preview'
      );
      this.hasViewedPdf = true;
    });
  }

  generateReleaseOverviewExcel(): void {
    this.getReleaseOverviewListByEmp((data: Release[]) => {
      const reportData = this.getReportableReleases(data);
      const projectValue = this.myControl.value as any;
      const projectName =
        typeof projectValue === 'string'
          ? projectValue
          : projectValue?.project_title || '';

      try {
        this.excelService.generateReleaseOverviewExcel(
          {
            generatedBy: this.storageService.getEmpName() || this.storageService.getUsername(),
            filteredProject: projectName,
            releaseType: this.selectedReleaseType
          },
          this.startDate,
          this.endDate,
          reportData
        );
      } catch (error) {
        this.toasterService.error('Unable to generate the Excel report.');
      }
    });
  }

  private getReportableReleases(data: Release[]): Release[] {
    return Array.isArray(data) ? data : [];
  }

  updateRelease(rowData: any) {
    rowData.username = this.storageService.getUsername();
    this.authService.updateRelease(rowData).subscribe({
      next: (res: any) => {
        this.toasterService.success(res?.message);
        this.getReleaseOverviewByEmp()
      }, error: (err) => {
        this.toasterService.error(err?.error?.message);
      }
    })
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
    this.drawerService.open('release', data)
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
  private _filter(value: string): any[] {
    const filterValue = value.toLowerCase();
    return this.projectList.filter((emp: any) =>
      emp.project_title.toLowerCase().includes(filterValue)
    );
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
    this.myControl.setValue('');
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


  setReleaseType(type: string) {
    this.selectedReleaseType = type;
    this.releaseTypeControl.setValue(type);
    this.resetPdfPreviewState();
    this.applyFilters();
    this.setView(this.normalizeReleaseType(type) === 'external' ? 'table' : 'kanban');
  }

  clearReleaseType() {
    this.releaseTypeControl.setValue('');
    this.selectedReleaseType = 'All';
    this.resetPdfPreviewState();
    this.applyFilters();
  }

  private resetPdfPreviewState(): void {
    this.hasViewedPdf = false;
    this.previewedReleasePdfRequest = null;
  }

  private normalizeReleaseType(type: any): string {
    return `${type ?? ''}`.trim().toLowerCase();
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

  private parseReleaseDate(value: string): Date | null {
    const normalized = value.trim();
    const ymdParts = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

    if (ymdParts) {
      const year = Number(ymdParts[1]);
      const month = Number(ymdParts[2]);
      const day = Number(ymdParts[3]);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const dmyParts = normalized.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

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
