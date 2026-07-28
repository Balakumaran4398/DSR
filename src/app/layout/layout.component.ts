import { Component, HostListener, OnInit } from '@angular/core';
import { StorageService } from '../_core/services/storage.service';
import { AuthService } from '../_core/services/auth.service';
import Swal from 'sweetalert2';
import { Router } from '@angular/router';

@Component({
  selector: 'app-layout',
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit {
  // State
  isCollapsed = false;
  isMobileOpen = false;
  activeLink = 'dashboard';
  openSubmenu: string | null = null;
  isUserMenuOpen = false;

  // Map of submenus to their children for auto-expansion
  private submenuMap: { [key: string]: string[] } = {
    'leads': ['new-leads', 'qualified', 'junk'],
    'contacts': ['all-contacts', 'my-contacts', 'companies'],
    'settings': ['general', 'security', 'billing']
  };
  constructor(private authService: AuthService, private storageService: StorageService, private router: Router) { }
  ngOnInit() {
    // 1. Recover active state from local storage
    const savedLink = localStorage.getItem('dsr-active-link');
    if (savedLink) {
      this.activeLink = savedLink;
      this.autoExpandSubmenu(savedLink);
    }

  }

  autoExpandSubmenu(linkId: string) {
    // Check if the link belongs to any submenu
    for (const [parentId, children] of Object.entries(this.submenuMap)) {
      if (children.includes(linkId)) {
        this.openSubmenu = parentId;
        break;
      }
    }
  }

  // Window Resize Listener to reset mobile states on desktop
  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    if (window.innerWidth > 768) {
      this.isMobileOpen = false;
    }
  }

  toggleSidebar() {
    if (window.innerWidth <= 768) {
      // Mobile Toggle
      this.isMobileOpen = !this.isMobileOpen;
    } else {
      // Desktop Collapse
      this.isCollapsed = !this.isCollapsed;

      // If collapsing, close all menus
      if (this.isCollapsed) {
        this.openSubmenu = null;
        this.isUserMenuOpen = false;
      }
    }
  }

  toggleSubmenu(menuId: string) {
    // If collapsed on desktop, expand first
    if (this.isCollapsed) {
      this.toggleSidebar();
      // Small delay to allow sidebar to expand before opening menu (visual polish)
      setTimeout(() => {
        this.openSubmenu = menuId;
      }, 150);
      return;
    }

    // Toggle logic (Accordion style)
    if (this.openSubmenu === menuId) {
      this.openSubmenu = null;
    } else {
      this.openSubmenu = menuId;
    }
  }

  toggleUserMenu() {
    // If collapsed on desktop, expand first
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
    this.activeLink = linkId;

    // 2. Save state to local storage
    localStorage.setItem('dsr-active-link', linkId);

    // Close sidebar on mobile when a link is clicked
    if (window.innerWidth <= 768) {
      this.closeMobileSidebar();
    }

    this.router.navigate(['/main/' + this.activeLink]).then(() => {

    });
  }

  closeMobileSidebar() {
    this.isMobileOpen = false;
  }

  confirmLogOut() {
    this.showAlert = true;;
  }
  showAlert = false;
  logOut() {
    this.authService.logout()
  }
}