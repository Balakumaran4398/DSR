import { Component, Input, OnDestroy, OnInit, ElementRef, ViewChild, HostListener, ChangeDetectorRef } from '@angular/core';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { Router } from '@angular/router';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { Subscription } from 'rxjs';
import { NotificationDateRange, NotificationDateRangeService } from 'src/app/_core/services/notification-date-range.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss'],
})
export class NotificationsComponent implements OnInit, OnDestroy {
  @Input() data: any;
  tickets: any[] = [];
  ticket_count: number = 0;
  isTicketExpanded = false;
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

  // Expansion states
  isExpanded: boolean = false;
  isReleaseExpanded: boolean = false;
  isDsrExpanded: boolean = false;
  dsrCount = 0;
  dsr: any[] = [];
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
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit() {
    this.empId = this.storageService.getEmpId();
    this.applyRangeFromService(this.notificationDateRangeService.currentRange);
    this.notificationRangeSubscription = this.notificationDateRangeService.range$.subscribe(range => {
      this.applyRangeFromService(range);
    });
    this.notificationDataSubscription = this.authService.notificationData$.subscribe(data => {
      this.applyNotificationData(data);
    });
    this.authService.loadNotificationCount();
  }

  ngOnDestroy(): void {
    this.notificationRangeSubscription?.unsubscribe();
    this.notificationDataSubscription?.unsubscribe();
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

    this.ticket_count = res.ticket_count;
    this.issues = res.total_issue_count;
    this.release = res.total_release_count;
    this.tickets = res.tickets;
    this.dsrCount = res.not_send_dsr_count;
    this.dsr = res.not_send_dsr;
    this.total = this.toNumber(res?.ticket_count)
      + this.toNumber(res?.total_issue_count)
      + this.toNumber(res?.total_release_count)
    + this.toNumber(res?.not_send_dsr_count);

    // Store ALL projects so releases and issues can filter independently.
    this.projects = res.project_counts || [];
  }

  // Getter for projects with issues (filters out 0 issues)
  get projectsWithIssues() {
    return this.projects.filter((t: any) => t.issue_count && t.issue_count > 0);
  }

  // toggleExpand() {
  //   this.isExpanded = !this.isExpanded;
  // }

  // toggleReleaseExpand() {
  //   this.isReleaseExpanded = !this.isReleaseExpanded;
  // }

  toggleProjectExpand(projectId: number, event: Event) {
    event.stopPropagation();
    this.expandedProjects[projectId] = !this.expandedProjects[projectId];
  }

  // toggleTicketExpand() {
  //   this.isTicketExpanded = !this.isTicketExpanded;
  // }

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.isReleaseExpanded = false;
      this.isTicketExpanded = false;
    }
  }

  toggleReleaseExpand() {
    this.isReleaseExpanded = !this.isReleaseExpanded;
    if (this.isReleaseExpanded) {
      this.isExpanded = false;
      this.isTicketExpanded = false;
    }
  }

  toggleTicketExpand() {
    this.isTicketExpanded = !this.isTicketExpanded;
    if (this.isTicketExpanded) {
      this.isExpanded = false;
      this.isReleaseExpanded = false;
    }
  }
  navigate(path: string) {
    this.storeNotificationDateRange();
    this.router.navigate(['/main', path], {
      queryParams: this.getNavigationDateQueryParams()
    });
    this.drawerService.close();
  }

  // Unified method to navigate to project and set the active tab dynamically
  navigateToProject(projectId: any, tab: string = 'issues') {
    if (projectId) {
      sessionStorage.setItem("activeProjectTab", tab);
      this.storeNotificationDateRange();
      this.router.navigate(['/main/projects/project-content', projectId], {
        queryParams: this.getNavigationDateQueryParams()
      });
      this.drawerService.close();
    }
  }
  //   navigateToProject(projectId: any, tab: string = 'issues') {
  //   if (projectId) {
  //     sessionStorage.setItem("activeProjectTab", tab);
  //     this.router.navigate(['/main/projects/project-content', projectId]).then(() => {
  //       this.drawerService.close();
  //       window.location.reload();
  //     });
  //   }
  // }

  navigateToIssue(projectId: any, issueId: any) {
    if (projectId && issueId) {
      this.storeNotificationDateRange();
      this.router.navigate(['/main/projects/project-content', projectId, issueId], {
        queryParams: {
          ...this.getNavigationDateQueryParams(),
          tasktype: 'bug',
        }
      });
      this.drawerService.close();
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

  private getNavigationDateQueryParams(): Record<string, string | null> {
    const startDate = this.filterStartDate ? this.formatDateLocal(this.filterStartDate) : null;
    const endDate = this.filterEndDate ? this.formatDateLocal(this.filterEndDate) : null;

    return {
      from: 'notification',
      fromdate: startDate,
      todate: endDate,
      startDate,
      endDate
    };
  }

  private storeNotificationDateRange(): void {
    const { startDate, endDate } = this.getNavigationDateQueryParams();
    if (startDate && endDate) {
      sessionStorage.setItem('notificationStartDate', startDate);
      sessionStorage.setItem('notificationEndDate', endDate);
    }
  }

  private toNumber(value: any): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  navigateToTicket(ticket: any) {
    sessionStorage.setItem('activeTicketTab', 'raisedtickets')
    this.storeNotificationDateRange();
    this.router.navigate(['/main/ticket-info'], {
      queryParams: this.getNavigationDateQueryParams()
    });
    this.drawerService.close();
  }
  toggleDsrExpand() {
    this.isDsrExpanded = !this.isDsrExpanded;
    if (this.isDsrExpanded) {
      this.isExpanded = false;
      this.isReleaseExpanded = false;
      this.isTicketExpanded = false;
    }
  }
  navigateTodsr() {
    this.storeNotificationDateRange();
    this.router.navigate(['/main/notsenddsr'], {
      queryParams: this.getNavigationDateQueryParams()
    });
    this.drawerService.close();
  }
}
