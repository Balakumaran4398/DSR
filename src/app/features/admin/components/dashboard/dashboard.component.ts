import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  empId: any = 0;
  data: any;
  constructor(private authService: AuthService, public storageService: StorageService, private router: Router) { }
  ngOnInit(): void {
    this.empId = this.storageService.getEmpId();
    this.getDashboardDetailsByEmployeeId(this.empId)
  }

  getDashboardDetailsByEmployeeId(empId: any) {
    this.authService.getDashboardDetailsByEmployeeId(empId, 0).subscribe({
      next: (res) => {
        this.data = res;

      }, error: (err) => { }
    })
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

  navigateTo(type: any) {
    this.router.navigate([`/main/${type}`]);
  }
}
