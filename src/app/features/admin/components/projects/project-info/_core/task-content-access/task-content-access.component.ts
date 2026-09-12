import { Component, ElementRef, inject, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import { formatStatusPill, getStatusPillClass } from 'src/app/_core/utils/status-pill.util';
import Swal from 'sweetalert2';
declare const Tabulator: any;
declare const luxon: any;
// --- Interfaces ---
interface Comment {
  id: number;
  author: { name: string; };
  content: string;
  timestamp: Date;
  isEditing?: boolean;
  username?: string;
}

interface TimelineLog {
  id: number | null;
  empid: number | null;
  taskid: number | null;
  sub_taskid: number | null;
  phaseid: number | null;
  releaseid: number | null;
  action: string | null;
  remark: string | null;
  status: string;
  logdate: string;
  employee_name: string | null;
}

interface ActivityLog {
  id: number | null;
  empid: number | null;
  taskid: number | null;
  sub_taskid: number | null;
  phaseid: number | null;
  releaseid: number | null;
  action: string | null;
  remark: string | null;
  status: string;
  logdate: string;
  employee_name: string | null;
}

interface DsrEntry {
  id: number;
  subtaskid: number;
  taskid?: number;
  comments: string;
  worked_hours: string;
  date: string;
  isdelete: boolean;
  createddate: string;
  updateddate: string;
  sub_task: string;
  start_date: string;
  end_date: string;
  completion_percentage: number;
  task: string;
  firstname: string;
  project_title: string;
}

@Component({
  selector: 'app-task-content-access',
  templateUrl: './task-content-access.component.html',
  styleUrls: ['./task-content-access.component.scss']
})
export class TaskContentAccessComponent implements OnInit, OnChanges, OnDestroy {
  // Form Stuff
  commentControl: any = new FormControl('', [Validators.required, Validators.minLength(1)]);
  private fb = inject(FormBuilder);
  statusList: any[] = [];
  // --- State ---
  // activeTab = 'sub-tasks';
  activeTab = 'dsr-entries';
  isTabulatorLoaded = false;
  isEditing = false;
  editCache = '';
  @Input() selectedTask: any
  @Input() dsrEntries: DsrEntry[] = [];
  @Input() contentMode: 'task' | 'dsr-overview' = 'task';
  @ViewChild('dsrEntriesTableRef') dsrEntriesTableRef!: ElementRef<HTMLDivElement>;
  @ViewChild('subtasksTableRef') subtasksTableRef!: ElementRef<HTMLDivElement>;
  // Store Tabulator instances
  dsrEntriesTable: any;
  subtasksTable: any;
  issuesTable: any;
  taskid: any = 0;
  projectid: any = 0;
  empid: any = 0;
  private currentTabInitTimer?: ReturnType<typeof setTimeout>;
  private drawerActionSubscription?: Subscription;
  private isComponentInitialized = false;
  constructor(private authService: AuthService, private storageService: StorageService, private toasterService: ToasterService, private drawerService: DrawerService, private route: ActivatedRoute) {
    this.taskid = this.route.snapshot.paramMap.get('taskid');
    this.projectid = this.route.snapshot.paramMap.get('projectid');
    this.empid = this.storageService.getEmpId();
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['selectedTask'] && !changes['dsrEntries'] && !changes['contentMode']) {
      return;
    }

    this.configureTabs();
    this.taskid = this.resolveTaskId();
    this.projectid = this.resolveProjectId();

    if (!this.isComponentInitialized) {
      return;
    }

    this.refreshContent();
  }

  createComments(payload: any) {
    this.authService.createComments(payload).subscribe({
      next: (res) => {
        this.getComments();
      }, error: (err) => {

      }
    })
  }
  getComments() {
    this.authService.getComments('task', this.taskid).subscribe({
      next: (res: any) => {
        this.commentList = res;
        this.comments = this.mapToCommentList(this.commentList);
      }, error: (err) => {

      }
    })
  }
  getActivityLogs(type: any) {
    this.authService.getActivityLogs('task', this.taskid, type).subscribe({
      next: (res: any) => {
        if (type == 'all') {
          this.activityList = res;
        } else if (type == 'status') {
          this.timelineLogs = res;
        }
      }
    })
  }

  // Timeline Mock Data
  timelineLogs: TimelineLog[] = [];

  // Full Activity List Data
  activityList: ActivityLog[] = [];

  // Mock Comments
  comments: Comment[] = [];
  commentList: any[] = []
  // Subtasks Data
  subtasksData = [];

  // Issues Data
  issuesData = [

  ];

  dsrEntriesData: DsrEntry[] = [];

  // Tab Definitions
  allTabs = [
    { id: 'dsr-entries', label: 'DSR-Entries', icon: 'fact_check' },
    { id: 'sub-tasks', label: 'Sub-tasks', icon: 'list' },
    { id: 'comments', label: 'Comments', icon: 'chat' },
    { id: 'issues', label: 'Issues', icon: 'bug_report' },
    { id: 'status-timeline', label: 'Timeline', icon: 'timeline' },
    { id: 'activity', label: 'Activity', icon: 'history' }
  ];
  tabs = [...this.allTabs];

  ngOnInit() {
    this.isComponentInitialized = true;
    this.configureTabs();
    this.taskid = this.resolveTaskId();
    this.projectid = this.resolveProjectId();
    this.refreshContent();
    this.drawerActionSubscription = this.drawerService.drawerAction$
      .pipe(filter(a => a.source === 'sub-task' || a.source === 'dsr'))
      .subscribe(() => {
        if (this.contentMode === 'task') {
          this.getSubtasks();
        }
        this.getDsrEntries();
      });
  }

  ngOnDestroy(): void {
    if (this.currentTabInitTimer) {
      clearTimeout(this.currentTabInitTimer);
    }

    this.destroyTable('dsrEntriesTable');
    this.destroyTable('subtasksTable');
    this.drawerActionSubscription?.unsubscribe();
  }

  // setActiveTab(tabId: string) {
  //   this.activeTab = tabId;
  //   if (['dsr-entries', 'sub-tasks', 'issues'].includes(tabId)) {
  //     this.initializeCurrentTab();
  //   }
  // }
  setActiveTab(tabId: string) {
    this.activeTab = tabId;
    this.initializeCurrentTab();
  }
  initTabulator(type: string) {
    const Tabulator = (window as any).Tabulator;
    if (!Tabulator) return;

    if (type === 'dsr-entries') {
      this.initializeDsrEntriesTable();
    } else if (type === 'sub-tasks') {
      this.initializeTable()
    } else if (type === 'issues') {

    }
  }

  private configureTabs(): void {
    this.tabs = this.contentMode === 'dsr-overview'
      ? this.allTabs.filter(tab => tab.id === 'dsr-entries')
      : [...this.allTabs];

    if (!this.tabs.some(tab => tab.id === this.activeTab)) {
      this.activeTab = this.tabs[0]?.id ?? 'dsr-entries';
    }
  }

  private resolveTaskId(): any {
    if (this.contentMode === 'task') {
      return this.selectedTask?.id ?? this.route.snapshot.paramMap.get('taskid') ?? 0;
    }

    return 0;
  }

  private resolveProjectId(): any {
    if (this.contentMode === 'task') {
      return this.selectedTask?.projectid
        ?? this.selectedTask?.project_id
        ?? this.selectedTask?.projectId
        ?? this.route.snapshot.paramMap.get('projectid')
        ?? 0;
    }

    return this.route.snapshot.paramMap.get('projectid') ?? 0;
  }

  private refreshContent(): void {
    if (this.contentMode === 'task') {
      this.getComments();
      this.getActivityLogs('all');
      this.getActivityLogs('status');
      this.getStatusList();
      this.getSubtasks();
    } else {
      this.comments = [];
      this.commentList = [];
      this.timelineLogs = [];
      this.activityList = [];
      this.subtasksData = [];
    }

    this.getDsrEntries();
    this.initializeCurrentTab();
  }

  private initializeCurrentTab(): void {
    if (this.currentTabInitTimer) {
      clearTimeout(this.currentTabInitTimer);
    }

    this.currentTabInitTimer = setTimeout(() => {
      if (this.activeTab === 'dsr-entries' || this.activeTab === 'sub-tasks') {
        this.initTabulator(this.activeTab);
      }
    }, 0);
  }

  // --- Logic Helpers ---

  applySubtaskFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    if (this.subtasksTable) {
      this.subtasksTable.setFilter((data: any) => {
        const term = filterValue.toLowerCase();
        return (data.task?.toLowerCase().includes(term) || data.code?.toLowerCase().includes(term));
      });
      if (!filterValue) this.subtasksTable.clearFilter();
    }
  }

  addSubtask() {
    if (!this.taskid) {
      this.toasterService.error('Select a task before adding a subtask');
      return;
    }

    this.drawerService.open('sub-task', {
      ...this.buildSelectedTaskContext(),
      mode: 'create',
      drawerTitle: 'Create New Sub-Task'
    }, 'requirement');
  }

  private openDsrDrawer(rowData: any, entryMode: 'sub-task' | 'dsr-entries' = 'sub-task'): void {
    const selectedTaskContext = this.buildSelectedTaskContext();
    const taskid = rowData?.taskid ?? rowData?.task_id ?? this.taskid;
    const subtaskid = entryMode === 'sub-task'
      ? (rowData?.subtaskid ?? rowData?.sub_taskid ?? rowData?.id ?? null)
      : null;

    this.drawerService.open('dsr', {
      ...selectedTaskContext,
      ...rowData,
      id: entryMode === 'sub-task' ? subtaskid : (rowData?.id ?? taskid),
      taskid,
      subtaskid,
      task: rowData?.task ?? selectedTaskContext?.task ?? '',
      projectid: rowData?.projectid ?? rowData?.project_id ?? rowData?.projectId ?? this.projectid,
      entryMode,
      selectedEntryId: entryMode === 'dsr-entries'
        ? (taskid ?? null)
        : subtaskid
    }, '');
  }

  private openDsrEditDrawer(rowData: any, entryMode: 'sub-task' | 'dsr-entries' = 'dsr-entries'): void {
    const selectedTaskContext = this.buildSelectedTaskContext();
    const taskid = rowData?.taskid ?? rowData?.task_id ?? this.taskid;
    const subtaskid = entryMode === 'sub-task'
      ? (rowData?.subtaskid ?? rowData?.sub_taskid ?? rowData?.id ?? null)
      : (rowData?.subtaskid ?? rowData?.sub_taskid ?? null);

    this.drawerService.open('dsr', {
      ...selectedTaskContext,
      ...rowData,
      id: entryMode === 'sub-task' ? subtaskid : (rowData?.id ?? taskid),
      taskid,
      subtaskid,
      task: rowData?.task ?? rowData?.sub_task ?? selectedTaskContext?.task ?? '',
      projectid: rowData?.projectid ?? rowData?.project_id ?? rowData?.projectId ?? this.projectid,
      entryMode,
      editMode: true,
      selectedEntryId: entryMode === 'dsr-entries'
        ? (taskid ?? null)
        : subtaskid,
      dsrRecord: {
        id: rowData?.id,
        subtaskid: subtaskid ?? rowData?.id,
        task: rowData?.task ?? rowData?.sub_task ?? '',
        comments: rowData?.comments ?? '',
        worked_hours: rowData?.worked_hours ?? '08:00:00',
        date: rowData?.date,
        completion_percentage: Number(rowData?.completion_percentage ?? 0)
      }
    }, '');
  }

  addtodaydsr() {
    if (!this.taskid) {
      this.toasterService.error('Select a task before adding DSR');
      return;
    }

    this.openDsrDrawer(this.buildSelectedTaskContext(), 'dsr-entries');
  }
  //   getDsrDetailsBySubtaskId(e?: any) {
  //   this.authService.getDsrDetailsBySubtaskId(e ? e.value : this.data.id).subscribe({
  //     next: (value: any) => {
  //       this.logEntries = value;
  //     }
  //   })
  // }

  addComment() {
    if (this.commentControl.valid && this.commentControl.value.trim()) {
      let empName: any = this.storageService.getEmpName()
      const newComment: Comment = {
        id: Date.now(),
        author: { name: empName },
        content: this.commentControl.value,
        timestamp: new Date(),

      };
      let comment = {
        "empid": this.storageService.getEmpId(),
        "taskid": this.taskid,
        "sub_taskid": 0,
        "phaseid": 0,
        "releaseid": 0,
        "comments": this.commentControl.value,
        "username": this.storageService.getUsername()
      }
      this.authService.createComments(comment).subscribe((res) => {
        this.comments.unshift(newComment);
        this.commentControl.reset();
      })

    }
  }

  deleteComment(id: number) {
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
        this.authService.deleteComment(this.storageService.getUsername(), id).subscribe((res: any) => {
          this.comments = this.comments.filter(c => c.id !== id);
          this.toasterService.success(res?.message)
        })

      }
    });
  }

  enableEdit(comment: Comment) {
    comment.isEditing = true;
    this.editCache = comment.content;
  }

  saveEditComment(comment: Comment) {
    if (this.editCache.trim()) {
      let c = this.commentList.find(e => e.id === comment.id);
      c.comments = this.editCache;
      c.username = this.storageService.getUsername();
      this.authService.updatecomments(c).subscribe((res) => {
        comment.content = this.editCache;
        comment.isEditing = false;
      })
    }
  }

  cancelCommentEdit(comment: Comment) {
    comment.isEditing = false;
    this.editCache = '';
  }
  // Helpers for Styling
  getStatusColor(status: string | undefined | null): string {
    return `app-status-pill ${getStatusPillClass(status)}`;
  }
  // --- Visual Helpers ---

  getInitials(name: string | undefined): string {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  getAvatarColor(name: string): string {
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1'];
    return colors[name.length % colors.length];
  }



  getStatusBadge(val: string) {
    return formatStatusPill(val);
  }

  getPriorityBadge(val: string) {
    const color = val === 'High' ? 'text-red-600 bg-red-50' : val === 'Medium' ? 'text-orange-600 bg-orange-50' : 'text-green-600 bg-green-50';
    return `<span class="px-2 py-0.5 rounded text-xs font-medium border border-transparent ${color}">${val}</span>`;
  }

  getTimelineDotColor(status: string): string {
    const val = status || '';
    if (["Active", "On-Track", "Approved", "Completed", "Invoiced"].includes(val)) return "bg-emerald-500 border-emerald-100";
    if (["In-Progress", "In-Review", "In-Testing", "Planning"].includes(val)) return "bg-blue-500 border-blue-100";
    if (["On-Hold", "To-be-Tested"].includes(val)) return "bg-amber-500 border-amber-100";
    if (["Delayed", "Cancelled", "Rejected"].includes(val)) return "bg-red-500 border-red-100";
    return "bg-slate-300 border-slate-100";
  }

  trackById(index: number, item: any) { return item.id; }

  mapToComment(obj: any): Comment {
    return {
      id: obj.id,
      author: {
        name: obj.employee_name
      },
      content: obj.comments,
      timestamp: new Date(obj.created_date),
      isEditing: false
    };
  }
  mapToCommentList(list: any[]): Comment[] {
    return list.map(item => this.mapToComment(item));
  }

  formatTimeAgo(input: Date | string): string {
    const date = new Date(input);
    const now = new Date();

    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
      return `${diffSecs} secs ago`;
    }

    if (diffMins < 60) {
      return `${diffMins} minutes ago`;
    }

    if (diffHours < 24) {
      return `${diffHours} hours ago`;
    }

    if (diffDays === 1) {
      return 'yesterday';
    }

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
  isReverting = false;
  initializeDsrEntriesTable() {
    if (!this.dsrEntriesTableRef?.nativeElement) return;

    if (this.hasTableHostChanged(this.dsrEntriesTable, this.dsrEntriesTableRef.nativeElement)) {
      this.destroyTable('dsrEntriesTable');
    }

    if (this.dsrEntriesTable) {
      this.safeReplaceData(this.dsrEntriesTable, this.dsrEntriesData);
      this.redrawTable(this.dsrEntriesTable);
      return;
    }

    this.dsrEntriesTable = new Tabulator(this.dsrEntriesTableRef.nativeElement, {
      data: this.dsrEntriesData,
      layout: "fitColumns",
      // responsiveLayout: "collapse",
      pagination: "local",
      paginationSize: 10,
      paginationCounter: "rows",
      movableColumns: true,
      placeholder: "No DSR entries found",
      rowClick: (e: any, row: any) => {
        if (this.contentMode === 'task') {
          this.openDsrEditDrawer(row.getData(), 'dsr-entries');
        }
      },
      paginationSizeSelector: [10, 25, 50, 100],
      headerSortElement: function (col: any, dir: any) {
        if (dir === "asc") return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === "desc") return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },
      initialSort: [
        { column: "date", dir: "desc" },
      ],
      columns: [
        { title: "Date", field: "date", width: 120 },
        {
          title: "Employee",
          field: "firstname",
          minWidth: 150,
          formatter: (cell: any) =>
            `<span class="font-semibold text-slate-800">${cell.getValue() || '-'}</span>`
        },
        {
          title: "Project",
          field: "project_title",
          minWidth: 150,
          formatter: (cell: any) =>
            `<span class="text-slate-700">${cell.getValue() || '-'}</span>`
        },
        {
          title: "Task",
          field: "task",
          minWidth: 150,
          formatter: (cell: any) =>
            `<span class="font-medium text-slate-900">${cell.getValue() || '-'}</span>`
        },
      
        {
          title: "Comments",
          field: "comments",
          minWidth: 280,
          formatter: (cell: any) => {
            const value = cell.getValue() || '-';
            return `<div class="whitespace-normal leading-6 text-slate-600">${value}</div>`;
          }
        },
        { title: "Worked Hours", field: "worked_hours", width: 130, hozAlign: "center" },
        ...(this.contentMode === 'task' ? [{
          title: "Actions",
          field: "actions", // Ensures CSS targeting matches a "field"
          width: 100,
          hozAlign: "center",
          headerSort: false,
          frozen: true,
          formatter: this.dsrActionFormatter,
          cellClick: (e: any, cell: any) => this.handleDsrActionClick(e, cell),
          cssClass: "sticky-col-right",
        }] : [])
        // { title: "Start Date", field: "createddate", width: 180 },
        // { title: "End Date", field: "end_date", width: 120 },
        // {
        //   title: "Progress",
        //   field: "completion_percentage",
        //   minWidth: 180,
        //   formatter: (cell: any) => {
        //     const value = Number(cell.getValue() || 0);
        //     return `
        //       <div class="flex items-center gap-3">
        //         <div class="w-28 bg-slate-200 rounded-full h-2">
        //           <div class="h-2 rounded-full transition-all duration-300"
        //                style="width:${value}%; background-color: var(--text-active);">
        //           </div>
        //         </div>
        //         <span class="text-xs font-semibold text-slate-700">${value}%</span>
        //       </div>
        //     `;
        //   }
        // }
      ],
    });

    attachTabulatorPaginationPersistence(this.dsrEntriesTable, buildTabulatorPaginationKey('task-content-access-dsr-table'));
    this.redrawTable(this.dsrEntriesTable);
  }

  initializeTable() {
    if (!this.subtasksTableRef?.nativeElement) return;

    if (this.hasTableHostChanged(this.subtasksTable, this.subtasksTableRef.nativeElement)) {
      this.destroyTable('subtasksTable');
    }

    if (this.subtasksTable) {
      this.safeReplaceData(this.subtasksTable, this.subtasksData);
      this.redrawTable(this.subtasksTable);
      return;
    }

    this.subtasksTable = new Tabulator(this.subtasksTableRef.nativeElement, {
      data: this.subtasksData,
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

      initialSort: [
        { column: "task", dir: "asc" },
      ],

      columns: [

        // Selection Checkbox
        // { formatter: "rowSelection", titleFormatter: "rowSelection", width: 50, hozAlign: "center", headerSort: false },
        // { title: "Task Name", field: "task", width: 220, frozen: true, formatter: this.nameFormatter },
        {
          title: "Sub Task Name",
          field: "task",
          widthGrow: 2.5,
          minWidth: 350,
          frozen: true,
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
                            <span class="font-medium text-gray-900 text-m leading-relaxed break-words">${data.task}</span>
                        </div>
                    </div>
                    <button class="absolute access-btn right-0 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white border border-gray-200 shadow-sm px-2.5 py-1 rounded-md hover:bg-gray-50 text-[var(--text-active)] hover:text-[var(--text-active)]-700 focus:outline-none z-10 flex items-center gap-1.5 transform translate-x-2 group-hover:translate-x-0" >
                        <span class="text-[10px] font-semibold uppercase tracking-wide">DSR</span>
                        <i class="ri-arrow-right-up-line text-xs"></i>
                    </button>
                </div>
                `;
          },
          cellClick: (e: any, cell: any) => {
            e.stopPropagation();
            const rowData = cell.getRow().getData();
            this.openDsrDrawer(rowData, 'sub-task');
          }
        },

        // Status & Priority
        {
          title: "Status",
          field: "status",
          editor: "list",
          minWidth: 150,
          cssClass: "app-status-cell",
          editorParams: {
            values: this.statusList,
            autocomplete: true,
            listOnEmpty: true,
            clearable: true
          },
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
        // Timeline

        { title: "Est. Hours", field: "estimated_hours", width: 100, hozAlign: "center" },

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
          frozen: true,
          formatter: this.actionFormatter,
          cellClick: (e: any, cell: any) => this.handleActionClick(e, cell),
          cssClass: "sticky-col-right",
        }
      ],
    });
    this.isTabulatorLoaded = true;

    attachTabulatorPaginationPersistence(this.subtasksTable, buildTabulatorPaginationKey('task-content-access-subtasks-table'));
    this.redrawTable(this.subtasksTable);

    this.subtasksTable.on('cellEdited', (cell: any) => {
      if (this.isReverting) {
        this.isReverting = false;
        return;
      }
      const rowData = cell.getRow().getData();
  const oldValue = cell.getOldValue();
      this.updateTask(rowData,cell, oldValue)
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

  dsrActionFormatter(_cell: any) {
    return `
      <div class="flex items-center justify-center w-full h-full">
        <button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit" title="Edit">
          <i class="ri-pencil-line text-lg pointer-events-none"></i>
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
    if (target.classList.contains('btn-edit')) {
      this.drawerService.open('sub-task', {
        ...this.buildSelectedTaskContext(),
        ...data,
        taskid: data?.taskid ?? data?.task_id ?? this.taskid,
        projectid: data?.projectid ?? data?.project_id ?? this.projectid,
        mode: 'edit',
        drawerTitle: 'Update Sub-Task'
      }, 'requirement')
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
          this.authService.deleteSubtask(this.storageService.getUsername(), data.id).subscribe((res: any) => {
            this.toasterService.success(res.message);
            this.getSubtasks();
          }, err => {
            this.toasterService.error(err?.error?.message);
          })
        }
      });
    }

  }

  handleDsrActionClick(e: any, cell: any) {
    e.stopPropagation();
    const target = e.target.closest('button');
    if (!target || !target.classList.contains('btn-edit')) return;
    this.openDsrEditDrawer(cell.getRow().getData(), 'dsr-entries');
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

  getStatusList() {
    this.authService.getStatusList().subscribe({
      next: (res: any) => {
        this.statusList = res;
      }
    });
  }

  getDsrEntries() {
    if (this.contentMode === 'dsr-overview') {
      const overviewEntries = Array.isArray(this.dsrEntries) && this.dsrEntries.length
        ? this.dsrEntries
        : (this.selectedTask ? [this.selectedTask] : []);
      this.dsrEntriesData = overviewEntries as DsrEntry[];

      if (this.dsrEntriesTable) {
        this.safeReplaceData(this.dsrEntriesTable, this.dsrEntriesData);
        this.redrawTable(this.dsrEntriesTable);
      }
      return;
    }

    if (!this.taskid) {
      this.dsrEntriesData = [];
      if (this.dsrEntriesTable) {
        this.safeReplaceData(this.dsrEntriesTable, this.dsrEntriesData);
        this.redrawTable(this.dsrEntriesTable);
      }
      return;
    }

    this.authService.getdsrdetailsbytask(this.taskid).subscribe({
      next: (res: any) => {
        this.dsrEntriesData = Array.isArray(res) ? res : [];
        if (this.dsrEntriesTable) {
          this.safeReplaceData(this.dsrEntriesTable, this.dsrEntriesData);
          this.redrawTable(this.dsrEntriesTable);
        }
      }
    });
  }

  getSubtasks() {
    if (!this.taskid) {
      this.subtasksData = [];
      if (this.subtasksTable) {
        this.safeReplaceData(this.subtasksTable, this.subtasksData);
        this.redrawTable(this.subtasksTable);
      }
      return;
    }

    this.authService.getSubtasks(this.taskid).subscribe({
      next: (res: any) => {
        this.subtasksData = res;
        if (this.subtasksTable) {
          this.safeReplaceData(this.subtasksTable, res);
          this.redrawTable(this.subtasksTable);
        }
      }
    });
  }

  private buildSelectedTaskContext(): any {
    const selectedTask = this.selectedTask || {};

    return {
      ...selectedTask,
      id: this.taskid,
      taskid: this.taskid,
      projectid: this.projectid,
      project_id: this.projectid
    };
  }

  onSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value.toLowerCase();
    const activeTable = this.activeTab === 'dsr-entries' ? this.dsrEntriesTable : this.subtasksTable;

    if (!activeTable) {
      return;
    }

    if (!value) {
      activeTable.clearFilter();
      return;
    }

    if (this.activeTab === 'dsr-entries') {
      activeTable.setFilter((data: DsrEntry) => {
        return [
          data.firstname,
          data.project_title,
          data.task,
          data.sub_task,
          data.comments,
          data.date,
          data.worked_hours,
          `${data.completion_percentage ?? ''}`
        ].some(fieldValue => `${fieldValue ?? ''}`.toLowerCase().includes(value));
      });
      return;
    }

    activeTable.setFilter([
      [
        { field: "task", type: "like", value: value },
        { field: "status", type: "like", value: value },
        { field: "priority", type: "like", value: value },
        { title: "Owner", type: "like", value: value }
      ]
    ]);
  }

  updateTask(selectTask: any, cell: any, oldValue: any) {
    selectTask.username = this.storageService.getUsername();
    selectTask.employeeid = this.storageService.getEmpId();

    this.authService.updateSubtask(selectTask).subscribe({
      next: ((res: any) => {
        this.toasterService.success(res?.message);
      }),
      error: (err: any) => {
        this.toasterService.error(err?.error?.message);
        this.isReverting = true;
        cell.setValue(oldValue);
      }
    })
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

  private hasTableHostChanged(table: any, hostElement: HTMLElement): boolean {
    return !!table && !!hostElement && table?.element !== hostElement;
  }

  private destroyTable(tableKey: 'dsrEntriesTable' | 'subtasksTable'): void {
    const tableInstance = (this as any)[tableKey];

    try {
      tableInstance?.destroy?.();
    } catch {
      // ignore destroy errors from stale instances
    } finally {
      (this as any)[tableKey] = null;
    }
  }

  private redrawTable(table: any): void {
    setTimeout(() => {
      try {
        table?.redraw?.(true);
      } catch {
        // ignore redraw errors during tab transitions
      }
    }, 0);
  }

}
