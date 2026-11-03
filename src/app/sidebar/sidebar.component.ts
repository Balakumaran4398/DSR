import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { AuthService } from '../_core/services/auth.service';
import { StorageService } from '../_core/services/storage.service';
import { Router } from '@angular/router';
import { DrawerService } from '../_core/services/drawer.service';
import Swal from 'sweetalert2';
import { ToasterService } from '../_core/services/toaster.service';
import { ThemeService } from '../_core/services/theme.service';
import { Subscription } from 'rxjs';
import { NotificationDateRangeService } from '../_core/services/notification-date-range.service';
import { URL } from '../api.base';
import {
  extractNotificationEmployeeDirectory,
  filterNotificationRecordsForViewer,
  isNotificationRecordInDepartments
} from '../_core/utils/notification-department.util';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit, OnDestroy {
  readonly version = URL.CURRENT_VERSION();

  private readonly routeRoles: Record<string, string[]> = {
    home: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    overall: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    dashboard: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    projects: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    team: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    overview: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    mom: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    'task-overview': ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    notsenddsr: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    attendance: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    hierarchy: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    'theme-settings': ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    hardware: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    'my-profile': ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    'admin-documents': ['ROLE_ADMIN'],
    performance: ['ROLE_ADMIN', 'ROLE_MANAGER'],
    'google-sheet': ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    'holiday-calendar': ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    reports: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE']
  };

  isOpen = false;
  isCollapsed = false;
  isMobileOpen = false;
  activeLink = 'home';
  openSubmenu: string | null = null;
  isUserMenuOpen = false;
  isDarkMode$ = this.themeService.isDarkMode$;
  private submenuMap: { [key: string]: string[] } = {
    'leads': ['new-leads', 'qualified', 'junk'],
    'contacts': ['all-contacts', 'my-contacts', 'companies'],
    'attendance-holidays': ['attendance', 'holiday-calendar'],
    'settings': ['theme-settings', 'hardware']
  };
  total: number = 0;
  notificationLoading = false;
  profileImage = '';
  initials = '';
  private notificationDataSubscription?: Subscription;
  private notificationLoadingSubscription?: Subscription;
  private employeeDirectorySubscription?: Subscription;
  private employeeDirectory: any[] = [];
  private notificationData: any = null;
  constructor(
    private authService: AuthService,
    private toasterService: ToasterService,
    public storageService: StorageService,
    private drawerService: DrawerService,
    private router: Router,
    private themeService: ThemeService,
    private notificationDateRangeService: NotificationDateRangeService
  ) { }
  ngOnInit() {
    const currentRoute = this.getCurrentRoute();
    const savedLink = this.normalizeRouteLink(sessionStorage.getItem('dsr-active-link'));

    if (currentRoute && this.canAccess(currentRoute)) {
      this.activeLink = currentRoute;
      this.autoExpandSubmenu(currentRoute);
    } else if (savedLink && this.canAccess(savedLink)) {
      this.activeLink = savedLink;
      this.autoExpandSubmenu(savedLink);
    } else {
      this.activeLink = this.getDefaultRoute();
    }

    if (currentRoute && !this.canAccess(currentRoute)) {
      this.router.navigate(['/main/' + this.activeLink]);
    }

    if (this.isMobileOpen) {
      this.closeSidebar()
    }
    this.profilePic();
    this.notificationDataSubscription = this.authService.notificationData$.subscribe(data => {
      this.notificationData = data;
      this.updateNotificationTotal();
    });
    this.employeeDirectorySubscription = this.authService.getEmployeeList().subscribe({
      next: response => {
        this.employeeDirectory = extractNotificationEmployeeDirectory(response);
        this.updateNotificationTotal();
      },
      error: () => {
        this.employeeDirectory = [];
      }
    });
    this.notificationLoadingSubscription = this.authService.notificationLoading$.subscribe(isLoading => {
      this.notificationLoading = isLoading;
    });
    this.authService.loadNotificationCount();
  }

  ngOnDestroy(): void {
    this.notificationDataSubscription?.unsubscribe();
    this.notificationLoadingSubscription?.unsubscribe();
    this.employeeDirectorySubscription?.unsubscribe();
  }

  private updateNotificationTotal(): void {
    const data = this.notificationData;
    const isAdmin = this.storageService.roles.isAdmin;
    const viewerRole = isAdmin
      ? 'admin'
      : this.storageService.roles.isManager
        ? 'manager'
        : this.storageService.roles.isEmployee
          ? 'employee'
          : 'other';
    const currentUser = this.getLoggedInEmployeeRecord();
    const employeeId = this.storageService.getEmpId();
    const ticketDepartmentIds = [4, 6, 11];
    const ticketDepartmentNames = ['Hardware', 'Headend', 'Head end', 'Account', 'Accounts'];
    const dsrDepartmentIds = [1, 2, 3, 8, 11];
    const dsrDepartmentNames = ['Ridapps', 'Software Development Team', 'SQA', 'Accounts'];
    const visibleTicketDepartmentIds = [...ticketDepartmentIds, ...dsrDepartmentIds];
    const visibleTicketDepartmentNames = [...ticketDepartmentNames, ...dsrDepartmentNames];
    const isManager = viewerRole === 'manager';
    const canSeeNotSentTickets = isAdmin || isManager || isNotificationRecordInDepartments(
      currentUser,
      this.employeeDirectory,
      ticketDepartmentIds,
      ticketDepartmentNames
    );
    const canSeeNotSentDsr = isAdmin || isManager || isNotificationRecordInDepartments(
      currentUser,
      this.employeeDirectory,
      dsrDepartmentIds,
      dsrDepartmentNames
    );
    const canSeeIssueAndReleaseNotifications = canSeeNotSentDsr;
    const canSeeTickets = isAdmin || isManager || isNotificationRecordInDepartments(
      currentUser,
      this.employeeDirectory,
      visibleTicketDepartmentIds,
      visibleTicketDepartmentNames
    );
    const visibleTickets = filterNotificationRecordsForViewer(
      Array.isArray(data?.tickets) ? data.tickets : [],
      viewerRole,
      employeeId,
      currentUser,
      this.employeeDirectory,
      visibleTicketDepartmentIds,
      visibleTicketDepartmentNames
    );
    const visibleNotSentTickets = filterNotificationRecordsForViewer(
      Array.isArray(data?.not_send_ticket) ? data.not_send_ticket : [],
      viewerRole,
      employeeId,
      currentUser,
      this.employeeDirectory,
      ticketDepartmentIds,
      ticketDepartmentNames
    );
    const visibleNotSentDsr = filterNotificationRecordsForViewer(
      Array.isArray(data?.not_send_dsr) ? data.not_send_dsr : [],
      viewerRole,
      employeeId,
      currentUser,
      this.employeeDirectory,
      dsrDepartmentIds,
      dsrDepartmentNames
    );
    const ticketCount = !canSeeTickets
      ? 0
      : isManager
        ? visibleTickets.length
        : this.toNumber(data?.ticket_count ?? visibleTickets.length);
    const notSentTicketCount = !canSeeNotSentTickets
      ? 0
      : isManager
        ? visibleNotSentTickets.length
        : this.toNumber(data?.not_send_ticket_count ?? visibleNotSentTickets.length);
    const notSentDsrCount = !canSeeNotSentDsr
      ? 0
      : isManager
        ? visibleNotSentDsr.length
        : this.toNumber(data?.not_send_dsr_count ?? visibleNotSentDsr.length);
    const visibleProjects = filterNotificationRecordsForViewer(
      Array.isArray(data?.project_counts) ? data.project_counts : [],
      viewerRole,
      employeeId,
      currentUser,
      this.employeeDirectory,
      [],
      []
    );
    const issueCount = isManager
      ? visibleProjects.reduce((sum: number, project: any) => sum + this.toNumber(project?.issue_count), 0)
      : this.toNumber(data?.total_issue_count);
    const releaseCount = isManager
      ? visibleProjects.reduce((sum: number, project: any) => sum + this.toNumber(project?.release_count), 0)
      : this.toNumber(data?.total_release_count);
    const dsrRequestRows = Array.isArray(data?.not_send_dsr_requests) ? data.not_send_dsr_requests : [];
    const visibleDsrRequests = filterNotificationRecordsForViewer(
      dsrRequestRows, viewerRole, employeeId, currentUser, this.employeeDirectory,
      dsrDepartmentIds, dsrDepartmentNames
    );
    const dsrRequestCount = isManager
      ? visibleDsrRequests.length
      : this.toNumber(data?.not_send_dsr_request_count ?? visibleDsrRequests.length);
    this.total = ticketCount
      + notSentTicketCount
      + (canSeeIssueAndReleaseNotifications
        ? issueCount
          + releaseCount
          + notSentDsrCount
          + dsrRequestCount
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

  closeSidebar() {
    // Mobile
    this.isMobileOpen = false;

    // Desktop
    this.isCollapsed = true;

    // Reset UI state
    this.openSubmenu = null;
    this.isUserMenuOpen = false;

    // Optional: persist state
    sessionStorage.setItem('dsr-sidebar-collapsed', 'true');
  }

  // --- Nav Logic ---
  autoExpandSubmenu(linkId: string) {
    for (const [parentId, children] of Object.entries(this.submenuMap)) {
      if (children.includes(linkId)) {
        this.openSubmenu = parentId;
        break;
      }
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    if (window.innerWidth > 768) {
      this.isMobileOpen = false;
      this.closeSidebar()
    }
  }

  toggleSidebar() {
    if (window.innerWidth <= 768) {
      this.isMobileOpen = !this.isMobileOpen;
    } else {
      this.isCollapsed = !this.isCollapsed;
      if (this.isCollapsed) {
        this.openSubmenu = null;
        this.isUserMenuOpen = false;
      }
    }
  }

  toggleSubmenu(menuId: string) {
    if (this.isCollapsed) {
      this.toggleSidebar();
      setTimeout(() => {
        this.openSubmenu = menuId;
      }, 150);
      return;
    }
    if (this.openSubmenu === menuId) {
      this.openSubmenu = null;
    } else {
      this.openSubmenu = menuId;
    }
  }

  toggleUserMenu() {
    if (this.isCollapsed) {
      this.toggleSidebar();
      setTimeout(() => {
        this.isUserMenuOpen = true;
      }, 150);
      return;
    }
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  toggleThemeMode(event?: Event) {
    event?.stopPropagation();
    this.themeService.toggleDarkMode();
  }

  activateLink(linkId: string) {
    linkId = this.normalizeRouteLink(linkId) || linkId;

    if (!this.canAccess(linkId)) {
      this.router.navigate(['/main/' + this.getDefaultRoute()]);
      return;
    }

    this.activeLink = linkId;
    sessionStorage.setItem('dsr-active-link', linkId);
    if (window.innerWidth <= 768) {
      this.closeMobileSidebar();
    }

    this.router.navigate(['/main/' + this.activeLink]).then(() => {

    });
  }

  openProfile() {
    this.activeLink = 'my-profile';
    sessionStorage.setItem('dsr-active-link', this.activeLink);
    this.isUserMenuOpen = false;
    this.closeMobileSidebar();
    this.router.navigate(['/main/my-profile']);
  }

  closeMobileSidebar() {
    this.isMobileOpen = false;
  }

  confirmLogOut() {
    this.showAlert = true;;
  }
  showAlert = false;
  logOut() {
    Swal.fire({
      title: 'Confirm Logout',
      text: 'Are you sure you want to log out?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, log out',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        sessionStorage.removeItem('dsr-active-link');
        this.authService.logout()
        this.toasterService.success('You have been logged out successfully.')
      }
    });


  }
  openNewTask(type: any) {
    if ((type === 'project' || type === 'member') && !this.canManageAdminActions) {
      return;
    }

    this.drawerService.open(type, '', type == 'task' ? 'requirement' : '');
    this.activeMenuId = null;
  }

  // Tracks which menu is currently open
  activeMenuId: number | null = null;

  /**
   * Toggles the menu for a specific card.
   * Stops propagation so the document listener doesn't immediately close it.
   */
  toggleMenu(event: Event, id: number) {
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

  getInitials(name: any): string {
    if (!name) return '??';
    return name.split(' ').map((n: any) => n[0]).join('').substring(0, 2).toUpperCase();
  }

  canAccess(linkId: string): boolean {
    return this.storageService.hasAnyRole(this.routeRoles[linkId] ?? []);
  }

  get canManageAdminActions(): boolean {
    return this.storageService.roles.isAdmin || this.storageService.roles.isManager;
  }

  get canCreateTask(): boolean {
    return this.storageService.isLoggedIn();
  }

  private getDefaultRoute(): string {
    const fallbackOrder = ['overall', 'home', 'dashboard', 'projects', 'task-overview', 'my-profile'];
    return fallbackOrder.find(route => this.canAccess(route)) ?? 'overall';
  }

  private getCurrentRoute(): string | null {
    const segments = this.router.url.split('?')[0].split('/').filter(Boolean);
    const currentRoute = segments[1];

    return currentRoute && currentRoute !== 'main' ? this.normalizeRouteLink(currentRoute) : null;
  }

  private normalizeRouteLink(linkId: string | null): string | null {
    if (linkId === 'general' || linkId === 'settings' || linkId === 'security') {
      return 'theme-settings';
    }

    return linkId;
  }
    onImageError() {
    this.profileImage = '';
  }
  openNotification() {
    this.drawerService.open('notification', this.notificationDateRangeService.currentRange);
  }
  profilePic() {
    const empName = this.storageService.getEmpName();
    this.initials = this.getInitials(empName);

    const user = this.storageService.getUser();
    if (!user?.email) return;

    this.authService.getemployeedetails(user.email).subscribe({
      next: (res: any) => {
        console.log(res);

        if (res && res.image_url && res.image_url.trim() !== '') {
          this.profileImage = res.image_url;
        } else {
          this.profileImage = '';
        }
      },
      error: () => {
        this.profileImage = '';
      }
    });
  }
  private toNumber(value: any): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }
}
