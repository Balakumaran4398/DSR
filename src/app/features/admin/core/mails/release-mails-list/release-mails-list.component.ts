import { Component, ElementRef, Inject, inject, Input, OnInit, Optional, QueryList, SimpleChanges, ViewChildren } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { catchError, filter, forkJoin, of } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
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
@Component({
  selector: 'app-release-mails-list',
  templateUrl: './release-mails-list.component.html',
  styleUrls: ['./release-mails-list.component.scss']
})
export class ReleaseMailsListComponent implements OnInit {
  // Form Stuff
  commentControl: any = new FormControl('', [Validators.required, Validators.minLength(1)]);
  private fb = inject(FormBuilder);
  statusList: any[] = [];
  // --- State ---
  activeTab = 'release';
  isTabulatorLoaded = false;
  isEditing = false;
  editCache = '';
  @Input() selectedTask: any
  // Store Tabulator instances
  subtasksTable: any;
  issuesTable: any;
  taskid: any = 0;
  empid: any = 0;
  releaseMails: any[] = [];
  constructor(private authService: AuthService, private storageService: StorageService, private toasterService: ToasterService, private drawerService: DrawerService, private route: ActivatedRoute, @Optional() @Inject(MAT_DIALOG_DATA) public data: any, public matDialog: MatDialog) {
    this.taskid = this.route.snapshot.paramMap.get('taskid');
    if (data?.id) {
      this.taskid = data?.id;
    }
    this.empid = this.storageService.getEmpId();
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
    console.log(this.data);

    this.authService.getComments('release', this.taskid).subscribe({
      next: (res: any) => {
        this.commentList = res;
        this.comments = this.mapToCommentList(this.commentList);
      }, error: (err) => {

      }
    })
  }
  getActivityLogs(type: any) {
    this.authService.getActivityLogs('release', this.taskid, type).subscribe({
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

  // Tab Definitions
  tabs = [
    { id: 'release', label: 'Release Details', icon: 'bug_report' },
    { id: 'comments', label: 'Comments', icon: 'chat' },
    { id: 'status-timeline', label: 'Timeline', icon: 'timeline' },
    { id: 'activity', label: 'Activity', icon: 'history' }
  ];

  ngOnInit() {
    this.getComments();
    this.getActivityLogs('all');
    this.getActivityLogs('status');
    this.getStatusList();
    this.getReleaseMailById();
  }

  setActiveTab(tabId: string) {
    this.activeTab = tabId;
    console.log(tabId);
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
        "taskid": 0,
        "sub_taskid": 0,
        "phaseid": 0,
        "releaseid": this.taskid,
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
    const val = `${status ?? ''}`.trim().toLowerCase().replace(/\s+/g, '-');

    if (['active', 'on-track', 'approved', 'completed', 'invoiced', 'open', 'pass', 'passed'].includes(val)) {
      return 'release-mail-status release-mail-status--success';
    } else if (['in-progress', 'in-review', 'in-testing', 'planning'].includes(val)) {
      return 'release-mail-status release-mail-status--info';
    } else if (['on-hold', 'to-be-tested'].includes(val)) {
      return 'release-mail-status release-mail-status--warning';
    } else if (['delayed', 'cancelled', 'rejected', 'closed', 'failed'].includes(val)) {
      return 'release-mail-status release-mail-status--danger';
    }

    return 'release-mail-status release-mail-status--neutral';
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
    let colorClass = "bg-gray-100 text-gray-700";
    if (["Active", "On-Track", "Approved", "Completed", "Invoiced"].includes(val)) colorClass = "bg-emerald-100 text-emerald-700";
    else if (["In-Progress", "In-Review", "In-Testing", "Planning"].includes(val)) colorClass = "bg-blue-100 text-blue-700";
    else if (["On-Hold", "To-be-Tested"].includes(val)) colorClass = "bg-amber-100 text-amber-700";
    else if (["Delayed", "Cancelled", "Rejected"].includes(val)) colorClass = "bg-red-100 text-red-700";
    return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}">${val}</span>`;
  }

  getPriorityBadge(val: string) {
    const color = val === 'High' ? 'text-red-600 bg-red-50' : val === 'Medium' ? 'text-orange-600 bg-orange-50' : 'text-green-600 bg-green-50';
    return `<span class="px-2 py-0.5 rounded text-xs font-medium border border-transparent ${color}">${val}</span>`;
  }

  getTimelineDotColor(status: string): string {
    const val = status || '';
    if (["Active", "On-Track", "Approved", "Completed", "Invoiced", "Pass", "Passed"].includes(val)) return "bg-emerald-500 border-emerald-100";
    if (["In-Progress", "In-Review", "In-Testing", "Planning"].includes(val)) return "bg-blue-500 border-blue-100";
    if (["On-Hold", "To-be-Tested"].includes(val)) return "bg-amber-500 border-amber-100";
    if (["Delayed", "Cancelled", "Rejected", "Closed", "Failed"].includes(val)) return "bg-red-500 border-red-100";
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

  getStatusList() {
    this.authService.getStatusList().subscribe({
      next: (res: any) => {
        this.statusList = this.mergeReleaseStatuses(res);
      }
    });
  }

  private mergeReleaseStatuses(statuses: any): string[] {
    const defaultStatuses = ['In-Progress', 'To-be-Tested', 'In-Review', 'Rejected', 'Failed', 'Completed'];
    const incomingStatuses = Array.isArray(statuses) ? statuses : [];
    const mergedStatuses = [...incomingStatuses, ...defaultStatuses]
      .map((status: any) => `${status ?? ''}`.trim())
      .filter((status: string) => !!status && defaultStatuses.includes(status));

    return Array.from(new Set(mergedStatuses));
  }



  getReleaseMailById() {
    const releaseMailSourceIds = this.resolveReleaseMailSourceIds(this.data);

    if (releaseMailSourceIds.length === 0) {
      this.releaseMails = this.buildFallbackReleaseMails();
      return;
    }

    const mailRequests = releaseMailSourceIds.map((id: any) =>
      this.authService.getReleaseMailById(id).pipe(catchError(() => of([])))
    );

    forkJoin(mailRequests).subscribe({
      next: (responses: any[]) => {
        const normalized = this.normalizeReleaseMails(responses.flat());
        this.releaseMails = normalized.length > 0 ? normalized : this.buildFallbackReleaseMails();
      },
      error: () => {
        this.releaseMails = this.buildFallbackReleaseMails();
      }
    });
  }

  private normalizeReleaseMails(mails: any): any[] {
    if (!Array.isArray(mails)) {
      return [];
    }

    const normalizedMails = mails.map((mail: any) => ({
      id: mail?.id || null,
      releaseid: mail?.releaseid || null,
      subject: mail?.subject || this.buildFallbackSubject(),
      employee_name: mail?.employee_name || this.data?.assignee_name || '-',
      created_date: mail?.created_date || mail?.createddate || this.data?.updateddate || this.data?.createddate || null,
      message: mail?.message || mail?.mail_content || this.data?.mail_content || '',
      file_path: mail?.file_path || '',
      file_name: mail?.file_name || this.data?.file_name || ''
    }));

    return this.removeDuplicateReleaseMails(normalizedMails).sort((first: any, second: any) => {
      const dateDiff = this.getMailTime(second.created_date) - this.getMailTime(first.created_date);
      return dateDiff || ((second.id || 0) - (first.id || 0));
    });
  }

  private buildFallbackReleaseMails(): any[] {
    if (!this.data?.mail_content && !this.data?.file_path) {
      return [];
    }

    return [{
      id: this.data?.id || null,
      releaseid: this.data?.id || null,
      subject: this.buildFallbackSubject(),
      employee_name: this.data?.assignee_name || '-',
      created_date: this.data?.updateddate || this.data?.createddate || null,
      message: this.data?.mail_content || '',
      file_path: this.data?.file_path || '',
      file_name: this.data?.file_name || ''
    }];
  }

  private getMailTime(date: string | Date | null | undefined): number {
    if (!date) {
      return 0;
    }

    const timestamp = new Date(date).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private removeDuplicateReleaseMails(mails: any[]): any[] {
    const uniqueMails = new Map<string, any>();

    mails.forEach((mail: any) => {
      const key = mail.id
        ? `id:${mail.id}`
        : `${mail.releaseid || ''}|${mail.subject || ''}|${mail.created_date || ''}|${mail.message || ''}`;

      if (!uniqueMails.has(key)) {
        uniqueMails.set(key, mail);
      }
    });

    return Array.from(uniqueMails.values());
  }

  getReleaseMailType(mail: any): string {
    const subject = mail?.subject || '';

    if (/\binternal\b/i.test(subject)) {
      return 'Internal';
    }

    if (/\bexternal\b/i.test(subject)) {
      return 'External';
    }

    return 'Release';
  }

  getReleaseMailTypeClasses(mail: any): string {
    const type = this.getReleaseMailType(mail);

    if (type === 'Internal') {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }

    if (type === 'External') {
      return 'bg-purple-50 text-purple-700 border-purple-200';
    }

    return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  getReleaseMailMessageClasses(mail: any): string {
    const type = this.getReleaseMailType(mail);

    if (type === 'Internal') {
      return 'border-blue-100 bg-blue-50/40';
    }

    if (type === 'External') {
      return 'border-purple-100 bg-purple-50/40';
    }

    return 'border-slate-100 bg-slate-50/70';
  }

  getReleaseMailHeading(mail: any): string {
    const type = this.getReleaseMailType(mail);
    return type === 'Release' ? 'Release Mail' : `${type} Release Mail`;
  }

  private buildFallbackSubject(): string {
    const title = this.data?.title || 'Release';
    const version = this.data?.version ? ` - ${this.data.version}` : '';
    return `${title}${version}`;
  }

  private resolveReleaseMailSourceIds(data: any): any[] {
    const releaseIds = new Set<any>();
    const currentReleaseId = data?.id ?? this.taskid;

    if (currentReleaseId) {
      releaseIds.add(currentReleaseId);
    }

    if (Array.isArray(data?.releaseList)) {
      if (data?.release_type === 'External' && data?.parent_version) {
        const parentRelease = data.releaseList.find((release: any) =>
          this.normalizeVersion(release?.version) === this.normalizeVersion(data.parent_version)
        );

        if (parentRelease?.id) {
          releaseIds.add(parentRelease.id);
        }
      }

      if (data?.release_type === 'Internal' && data?.version) {
        data.releaseList
          .filter((release: any) =>
            release?.release_type === 'External' &&
            this.normalizeVersion(release?.parent_version) === this.normalizeVersion(data.version)
          )
          .forEach((release: any) => {
            if (release?.id) {
              releaseIds.add(release.id);
            }
          });
      }
    }

    return Array.from(releaseIds);
  }

  private normalizeVersion(version: string | null | undefined): string {
    return (version ?? '').trim().toLowerCase();
  }

  // File Download Method
  downloadFile(path: string | null): void {
    if (path) {
      window.open(path, '_blank');
    }
  }
}
