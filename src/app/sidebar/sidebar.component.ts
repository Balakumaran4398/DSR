import { Component, HostListener, OnInit } from '@angular/core';
import { AuthService } from '../_core/services/auth.service';
import { StorageService } from '../_core/services/storage.service';
import { Router } from '@angular/router';
import { DrawerService } from '../_core/services/drawer.service';
import Swal from 'sweetalert2';
import { ToasterService } from '../_core/services/toaster.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {
  private readonly routeRoles: Record<string, string[]> = {
    dashboard: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    projects: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    team: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    overview: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    mom: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    'task-overview': ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    notsenddsr: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    hierarchy: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    'theme-settings': ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    hardware: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    'my-profile': ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'],
    'admin-documents': ['ROLE_ADMIN']
  };

  isOpen = false;
  isCollapsed = false;
  isMobileOpen = false;
  activeLink = 'dashboard';
  openSubmenu: string | null = null;
  isUserMenuOpen = false;
  private submenuMap: { [key: string]: string[] } = {
    'leads': ['new-leads', 'qualified', 'junk'],
    'contacts': ['all-contacts', 'my-contacts', 'companies'],
    'settings': ['general', 'security', 'billing']
  };
  constructor(private authService: AuthService, private toasterService: ToasterService, public storageService: StorageService, private drawerService: DrawerService, private router: Router) { }
  ngOnInit() {
    const currentRoute = this.getCurrentRoute();
    const savedLink = sessionStorage.getItem('dsr-active-link');

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

  activateLink(linkId: string) {
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
    const fallbackOrder = ['dashboard', 'projects', 'task-overview', 'my-profile'];
    return fallbackOrder.find(route => this.canAccess(route)) ?? 'dashboard';
  }

  private getCurrentRoute(): string | null {
    const segments = this.router.url.split('?')[0].split('/').filter(Boolean);
    const currentRoute = segments[1];

    return currentRoute && currentRoute !== 'main' ? currentRoute : null;
  }
}
