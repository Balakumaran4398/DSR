import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';

@Component({
  selector: 'app-prj-dashboard',
  templateUrl: './prj-dashboard.component.html',
  styleUrls: ['./prj-dashboard.component.scss']
})
export class PrjDashboardComponent implements OnInit {
  isAdmin: any = true;
  empId: any = 0;
  today = new Date();
  dashboardData: any;
  mytask: any = []
  projectid: any = 0
  constructor(private authService: AuthService, public storageService: StorageService, private router: Router, private route: ActivatedRoute) {
    this.projectid = this.route.snapshot.paramMap.get('projectid');
  }
  ngOnInit(): void {
    this.empId = this.storageService.getEmpId();
    this.getDashboardDetailsByEmployeeId(this.empId)
  }
  getDashboardDetailsByEmployeeId(empId: any) {
    this.authService.getDashboardDetailsByEmployeeId(empId, this.projectid).subscribe({
      next: (res) => {
        this.dashboardData = res;

      }, error: (err) => { }
    })
  }
  navigateToPage(type: any) {
    this.router.navigate(["main/" + type])
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
}
