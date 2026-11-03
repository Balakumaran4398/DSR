import { Component, Input, OnDestroy, OnInit, ElementRef, ViewChild, HostListener, ChangeDetectorRef } from '@angular/core';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { Router } from '@angular/router';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { Subscription } from 'rxjs';
import { NotificationDateRange, NotificationDateRangeService } from 'src/app/_core/services/notification-date-range.service';
import { NotificationNavigationCategory, NotificationNavigationContext, NotificationNavigationService } from 'src/app/_core/services/notification-navigation.service';
import {
  extractNotificationEmployeeDirectory,
  filterNotificationRecordsForViewer,
  isNotificationRecordInDepartments
} from 'src/app/_core/utils/notification-department.util';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss'],
})
export class NotificationsComponent implements OnInit, OnDestroy {
  @Input() data: any;
  tickets: any[] = [];
  ticket_count: number = 0;
  loadedTicketCount = 0;
  isTicketExpanded = false;
  canSeeTickets = false;
  canSeeIssueAndReleaseNotifications = false;
  notSentTickets: any[] = [];
  notSentTicketCount = 0;
  loadedNotSentTicketCount = 0;
  isNotSentTicketExpanded = false;
  canSeeNotSentTickets = false;
  issues: number = 0;
  release: number = 0;
  total: number = 0;
  projects: any[] = [];
  filterStartDate: Date | null = null;
  filterEndDate: Date | null = null;
  selectedPreset: string = '';
  isCustomOpen: boolean = false;
  isDropdownOpen: boolean = false;
  empId: any = 0;
  private notificationRangeSubscription?: Subscription;
  private notificationDataSubscription?: Subscription;
  private employeeDirectorySubscription?: Subscription;
  private employeeDirectory: any[] = [];
  private latestNotificationData: any = null;

  // Expansion states
  isExpanded: boolean = false;
  isReleaseExpanded: boolean = false;
  isDsrExpanded: boolean = false;
  dsrCount = 0;
  loadedDsrCount = 0;
  dsr: any[] = [];
  canSeeNotSentDsr = false;
  dsrRequests: any[] = [];
  dsrRequestCount = 0;
  isDsrRequestExpanded = false;
  expandedProjects: { [projectId: number]: boolean } = {};

  @ViewChild('customPopup') customPopupRef?: ElementRef;
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isCustomOpen) return;

    const path = event.composedPath();

    const clickedInsidePopup = path.includes(
      this.customPopupRef?.nativeElement
    );

    const clickedInsideMaterialOverlay = path.some(
      (element: EventTarget | null) =>
        element instanceof HTMLElement &&
        element.classList.contains('cdk-overlay-container')
    );

    if (!clickedInsidePopup && !clickedInsideMaterialOverlay) {
      this.isCustomOpen = false;
      this.cdr.markForCheck();
    }
  }

  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private router: Router,
    private drawerService: DrawerService,
    private notificationDateRangeService: NotificationDateRangeService,
    private notificationNavigationService: NotificationNavigationService,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit() {
    this.empId = this.storageService.getEmpId();
    this.applyRangeFromService(this.notificationDateRangeService.currentRange);
    this.notificationRangeSubscription = this.notificationDateRangeService.range$.subscribe(range => {
      this.applyRangeFromService(range);
    });
    this.notificationDataSubscription = this.authService.notificationData$.subscribe(data => {
      this.latestNotificationData = data;
      this.applyNotificationData(data);
    });
    this.employeeDirectorySubscription = this.authService.getEmployeeList().subscribe({
      next: response => {
        this.employeeDirectory = extractNotificationEmployeeDirectory(response);
        this.applyNotificationData(this.latestNotificationData);
      },
      error: () => {
        this.employeeDirectory = [];
      }
    });
    this.authService.loadNotificationCount();
  }

  ngOnDestroy(): void {
    this.notificationRangeSubscription?.unsubscribe();
    this.notificationDataSubscription?.unsubscribe();
    this.employeeDirectorySubscription?.unsubscribe();
  }

  getSelectedLabel(): string {
    switch (this.selectedPreset) {
      case 'weekly': return 'Weekly';
      case 'bi-weekly': return 'Bi-Weekly';
      case 'monthly': return 'This Month';
      case 'custom': return 'Custom Range';
      default: return 'Select Filter';
    }
  }

  private applyNotificationData(res: any): void {
    if (!res) return;

    const isAdmin = this.storageService.roles.isAdmin;
    const viewerRole = this.getNotificationViewerRole();
    const currentUser = this.getLoggedInEmployeeRecord();
    const currentEmployeeId = this.storageService.getEmpId();
    const rawTickets = Array.isArray(res?.tickets) ? res.tickets : [];
    const rawNotSentTickets = Array.isArray(res?.not_send_ticket) ? res.not_send_ticket : [];
    const rawNotSentDsr = Array.isArray(res?.not_send_dsr) ? res.not_send_dsr : [];
    const isManager = viewerRole === 'manager';
    this.canSeeTickets = isAdmin || isManager || isNotificationRecordInDepartments(
      currentUser,
      this.employeeDirectory,
      [1, 2, 3, 4, 6, 11],
      ['Ridapps', 'Software Development Team', 'SQA', 'Hardware', 'Headend', 'Head end', 'Accounts']
    );
    this.canSeeNotSentTickets = isAdmin || isManager || isNotificationRecordInDepartments(
      currentUser,
      this.employeeDirectory,
      [4, 6, 11],
      ['Hardware', 'Headend', 'Head end', 'Account', 'Accounts']
    );
    this.canSeeIssueAndReleaseNotifications = isAdmin || isManager || isNotificationRecordInDepartments(
      currentUser,
      this.employeeDirectory,
      [1, 2, 3, 11],
      ['Ridapps', 'Software Development Team', 'SQA', 'Accounts']
    );
    this.tickets = filterNotificationRecordsForViewer(
      rawTickets, viewerRole, currentEmployeeId, currentUser, this.employeeDirectory,
      [1, 2, 3, 4, 6, 11],
      ['Ridapps', 'Software Development Team', 'SQA', 'Hardware', 'Headend', 'Head end', 'Accounts']
    );
    this.loadedTicketCount = this.tickets.length;
    this.ticket_count = this.canSeeTickets
      ? (isManager ? this.loadedTicketCount : this.toNumber(res?.ticket_count ?? this.loadedTicketCount))
      : 0;
    this.notSentTickets = filterNotificationRecordsForViewer(
      rawNotSentTickets, viewerRole, currentEmployeeId, currentUser, this.employeeDirectory,
      [4, 6, 11], ['Hardware', 'Headend', 'Head end', 'Account', 'Accounts']
    );
    this.loadedNotSentTicketCount = this.notSentTickets.length;
    this.notSentTicketCount = this.canSeeNotSentTickets
      ? (isManager ? this.loadedNotSentTicketCount : this.toNumber(res?.not_send_ticket_count ?? this.loadedNotSentTicketCount))
      : 0;
    const projectCounts = Array.isArray(res.project_counts) ? res.project_counts : [];
    this.projects = isManager
      ? filterNotificationRecordsForViewer(
        projectCounts, viewerRole, currentEmployeeId, currentUser, this.employeeDirectory, [], []
      )
      : projectCounts;
    this.issues = this.canSeeIssueAndReleaseNotifications
      ? (isManager ? this.projects.reduce((sum, project) => sum + this.toNumber(project?.issue_count), 0) : this.toNumber(res?.total_issue_count))
      : 0;
    this.release = this.canSeeIssueAndReleaseNotifications
      ? (isManager ? this.projects.reduce((sum, project) => sum + this.toNumber(project?.release_count), 0) : this.toNumber(res?.total_release_count))
      : 0;
    this.canSeeNotSentDsr = this.canSeeIssueAndReleaseNotifications;
    this.dsr = filterNotificationRecordsForViewer(
      rawNotSentDsr, viewerRole, currentEmployeeId, currentUser, this.employeeDirectory,
      [1, 2, 3, 11], ['Ridapps', 'Software Development Team', 'SQA', 'Accounts']
    );
    this.loadedDsrCount = this.dsr.length;
    this.dsrCount = this.canSeeNotSentDsr
      ? (isManager ? this.loadedDsrCount : this.toNumber(res?.not_send_dsr_count ?? this.loadedDsrCount))
      : 0;
    const rawDsrRequests = Array.isArray(res?.not_send_dsr_requests) ? res.not_send_dsr_requests : [];
    this.dsrRequests = filterNotificationRecordsForViewer(
      rawDsrRequests, viewerRole, currentEmployeeId, currentUser, this.employeeDirectory,
      [1, 2, 3, 11], ['Ridapps', 'Software Development Team', 'SQA', 'Accounts']
    );
    this.dsrRequestCount = this.canSeeIssueAndReleaseNotifications
      ? (isManager ? this.dsrRequests.length : this.toNumber(res?.not_send_dsr_request_count ?? this.dsrRequests.length))
      : 0;
    this.total = this.ticket_count
      + this.notSentTicketCount
      + (this.canSeeIssueAndReleaseNotifications
        ? this.issues
          + this.release
          + this.dsrCount
          + this.dsrRequestCount
        : 0);

  }

  private getLoggedInEmployeeRecord(): any {
    const user = this.storageService.getUser() || {};
    return {
      ...user,
      department_name: user?.department_name
        ?? user?.departmentName
        ?? user?.dept_name
        ?? user?.deptName
        ?? this.storageService.getDept()
        ?? user?.department
    };
  }

  private getNotificationViewerRole(): 'admin' | 'manager' | 'employee' | 'other' {
    if (this.storageService.roles.isAdmin) return 'admin';
    if (this.storageService.roles.isManager) return 'manager';
    if (this.storageService.roles.isEmployee) return 'employee';
    return 'other';
  }

  // Getter for projects with issues (filters out 0 issues)
  get projectsWithIssues() {
    return this.projects.filter((t: any) => t.issue_count && t.issue_count > 0);
  }

  toggleProjectExpand(projectId: number, event: Event) {
    event.stopPropagation();
    this.expandedProjects[projectId] = !this.expandedProjects[projectId];
  }

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.isReleaseExpanded = false;
      this.isTicketExpanded = false;
      this.isNotSentTicketExpanded = false;
      this.isDsrExpanded = false;
      this.isDsrRequestExpanded = false;
    }
  }

  toggleReleaseExpand() {
    this.isReleaseExpanded = !this.isReleaseExpanded;
    if (this.isReleaseExpanded) {
      this.isExpanded = false;
      this.isTicketExpanded = false;
      this.isNotSentTicketExpanded = false;
      this.isDsrExpanded = false;
      this.isDsrRequestExpanded = false;
    }
  }

  toggleTicketExpand() {
    this.isTicketExpanded = !this.isTicketExpanded;
    if (this.isTicketExpanded) {
      this.isExpanded = false;
      this.isReleaseExpanded = false;
      this.isNotSentTicketExpanded = false;
      this.isDsrExpanded = false;
      this.isDsrRequestExpanded = false;
    }
  }
  toggleNotSentTicketExpand() {
    this.isNotSentTicketExpanded = !this.isNotSentTicketExpanded;
    if (this.isNotSentTicketExpanded) {
      this.isExpanded = false;
      this.isReleaseExpanded = false;
      this.isTicketExpanded = false;
      this.isDsrExpanded = false;
      this.isDsrRequestExpanded = false;
    }
  }
  navigate(path: string) {
    this.navigateAndClose(['/main', path]);
  }

  navigateToProject(projectId: any, tab: string = 'issues') {
    if (projectId) {
      sessionStorage.setItem("activeProjectTab", tab);
      const category: NotificationNavigationCategory = tab === 'release' ? 'release' : 'issue';
      const context = this.createNavigationContext(category, projectId, projectId);
      this.router.navigate(['/main/projects/project-content', projectId], {
        state: this.notificationNavigationService.navigationState(context)
      }).finally(() => this.drawerService.close());
    }
  }

  navigateToRelease(project: any): void {
    const projectId = project?.project_id ?? project?.projectId ?? project?.id;
    if (!projectId) return;

    const nestedRelease = Array.isArray(project?.releases) && project.releases.length === 1
      ? project.releases[0]
      : null;
    const releaseId = project?.release_id ?? project?.releaseId ?? project?.latest_release_id
      ?? project?.latestReleaseId ?? nestedRelease?.release_id ?? nestedRelease?.releaseId ?? nestedRelease?.id ?? null;
    sessionStorage.setItem("activeProjectTab", "release");
    const context = this.createNavigationContext("release", releaseId, projectId);
    this.router.navigate(["/main/projects/project-content", projectId], {
      state: this.notificationNavigationService.navigationState(context)
    }).finally(() => this.drawerService.close());
  }

  navigateToIssue(projectId: any, issueId: any) {
    if (projectId && issueId) {
      sessionStorage.setItem('activeProjectTab', 'issues');
      const context = this.createNavigationContext('issue', issueId, projectId);
      this.router.navigate(['/main/projects/project-content', projectId, issueId], {
        state: this.notificationNavigationService.navigationState(context)
      }).finally(() => this.drawerService.close());
    }
  }

  // Getter to filter projects that have releases
  get projectsWithReleases() {
    return this.projects.filter((t: any) => t.release_count && t.release_count > 0);
  }


  selectPreset(preset: string) {
    this.selectedPreset = preset;
    this.isDropdownOpen = false;

    if (preset !== 'custom') {
      this.isCustomOpen = false;
    }

    const today = new Date();
    let start = new Date();
    let end = new Date();

    if (preset === 'weekly') {
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

      // Calculate distance to this week's Sunday
      const diffToSunday = -dayOfWeek;

      start = new Date(today);
      start.setDate(today.getDate() + diffToSunday);

      // Sunday + 6 days = Saturday
      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      this.filterStartDate = start;
      this.filterEndDate = end;
      this.filterTask();
    }
    else if (preset === 'bi-weekly') {
      // Find current day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      const dayOfWeek = today.getDay();

      // Calculate distance to this week's Sunday (if Sunday, diff is 0, else go back the number of days since Sunday)
      const diffToSunday = dayOfWeek === 0 ? 0 : -dayOfWeek;

      // Set start to this week's Sunday
      start = new Date(today);
      start.setDate(today.getDate() + diffToSunday);

      // Set end to next week's Saturday (Sunday + 13 days = next week Saturday, total 14 days)
      const end = new Date(start);
      end.setDate(start.getDate() + 13);

      this.filterStartDate = start;
      this.filterEndDate = end;
      this.filterTask();
    }
    else if (preset === 'monthly') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);

      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      this.filterStartDate = start;
      this.filterEndDate = end;
      this.filterTask();
    }
    else if (preset === 'custom') {
      this.isCustomOpen = !this.isCustomOpen;
    }
  }

  applyCustomFilter() {
    if (this.filterStartDate && this.filterEndDate) {
      this.filterTask();
      this.isCustomOpen = false;
    }
  }

  filterTask() {
    if (this.filterStartDate && this.filterEndDate) {
      let startDateObj = new Date(this.filterStartDate);
      let endDateObj = new Date(this.filterEndDate);

      if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
        if (startDateObj > endDateObj) {
          [startDateObj, endDateObj] = [endDateObj, startDateObj];
          this.filterStartDate = startDateObj;
          this.filterEndDate = endDateObj;
        }

        const formattedStartDate = this.formatDateLocal(startDateObj);
        const formattedEndDate = this.formatDateLocal(endDateObj);

        const range: NotificationDateRange = {
          preset: this.selectedPreset === 'custom' ? 'custom' : this.selectedPreset === 'weekly' ? 'weekly' : this.selectedPreset === 'bi-weekly' ? 'bi-weekly' : 'monthly',
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          label: this.getSelectedLabel()
        };

        this.notificationDateRangeService.setRange(range);
        this.authService.refreshNotificationCount(range);
      }
    }
  }

  private applyRangeFromService(range: NotificationDateRange): void {
    this.selectedPreset = range.preset;
    this.filterStartDate = this.parseDateLocal(range.startDate);
    this.filterEndDate = this.parseDateLocal(range.endDate);
  }

  private parseDateLocal(value: string): Date | null {
    const parts = value.split('-').map(part => Number(part));
    if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) {
      return null;
    }

    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  private formatDateLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getNavigationDateRange(): { startDate: string | null; endDate: string | null } {
    const startDate = this.filterStartDate ? this.formatDateLocal(this.filterStartDate) : null;
    const endDate = this.filterEndDate ? this.formatDateLocal(this.filterEndDate) : null;

    return { startDate, endDate };
  }

  private createNavigationContext(category: NotificationNavigationCategory, targetId: any, projectId: any = null, targetDate?: string | null, targetLabel?: string | null): NotificationNavigationContext {
    const { startDate, endDate } = this.getNavigationDateRange();
    const context = this.notificationNavigationService.create(category, targetId, projectId, startDate, endDate, targetDate, targetLabel);
    this.notificationNavigationService.store(context);
    return context;
  }

  private navigateAndClose(commands: any[], context?: NotificationNavigationContext): void {
    this.router.navigate(commands, context ? {
      state: this.notificationNavigationService.navigationState(context)
    } : undefined).finally(() => this.drawerService.close());
  }

  private toNumber(value: any): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  navigateToTicket(ticket: any) {
    sessionStorage.setItem('activeTicketTab', 'raisedtickets')
    const ticketId = ticket?.ticket_id ?? ticket?.ticketId ?? ticket?.ticketid ?? ticket?.id ?? null;
    const context = this.createNavigationContext('ticket', ticketId);
    this.navigateAndClose(ticketId ? ['/main/ticket-info', ticketId] : ['/main/ticket-info'], context);
  }
  toggleDsrExpand() {
    this.isDsrExpanded = !this.isDsrExpanded;
    if (this.isDsrExpanded) {
      this.isExpanded = false;
      this.isReleaseExpanded = false;
      this.isTicketExpanded = false;
      this.isNotSentTicketExpanded = false;
      this.isDsrRequestExpanded = false;
    }
  }
  toggleDsrRequestExpand() {
    this.isDsrRequestExpanded = !this.isDsrRequestExpanded;
    if (this.isDsrRequestExpanded) {
      this.isExpanded = false;
      this.isReleaseExpanded = false;
      this.isTicketExpanded = false;
      this.isDsrExpanded = false;
      this.isNotSentTicketExpanded = false;
    }
  }
  navigateTodsr(d?: any, event?: Event) {
    event?.stopPropagation();
    this.navigateToNotSentDsrRecord(d);
  }

  navigateToNotSentTicket(ticket: any, event?: Event): void {
    event?.stopPropagation();
    this.navigateToNotSentDsrRecord(ticket);
  }

  private navigateToNotSentDsrRecord(record: any): void {
    const employeeId = this.resolveNotificationEmployeeId(record);
    const employeeName = record?.employee_name ?? record?.employeeName ?? record?.name ?? null;
    const targetDate = record?.date ?? record?.missing_date ?? record?.missingDate ?? null;
    const context = this.createNavigationContext('not-send-dsr', employeeId, null, targetDate, employeeName);
    this.navigateAndClose(employeeId ? ['/main/notsenddsr', employeeId] : ['/main/notsenddsr'], context);
  }

  navigateToDsrRequest(request: any) {
    const date = request?.date ?? request?.missing_date ?? request?.missingDate ?? null;
    const employeeId = this.resolveNotificationEmployeeId(request);
    const context = this.createNavigationContext('not-send-dsr', employeeId, null, date);
    this.router.navigate(['/main/notsenddsr'], {
      queryParams: {
        requestId: request?.request_id ?? request?.requestId ?? request?.id ?? null
      },
      state: this.notificationNavigationService.navigationState(context)
    }).finally(() => this.drawerService.close());
  }

  private resolveNotificationEmployeeId(record: any): string | number | null {
    return record?.employee_id ?? record?.employeeId ?? record?.employeeid
      ?? record?.emp_id ?? record?.empId ?? record?.empid
      ?? record?.selected_employee_id ?? record?.selectedEmployeeId
      ?? record?.selected_emp_id ?? record?.user_employee_id ?? null;
  }

  getDsrRequestStatus(request: any): string {
    return `${request?.request_status ?? request?.status ?? 'PENDING'}`.trim().toUpperCase().replace(/[\s-]+/g, '_');
  }
}
