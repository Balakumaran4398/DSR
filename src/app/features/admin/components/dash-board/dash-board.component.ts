import { Component, HostListener, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { OverdueComponent } from '../../core/charts/overdue/overdue.component';
import { ProjectStatusReportComponent } from '../../core/charts/project-status-report/project-status-report.component';

@Component({
  selector: 'app-dash-board',
  templateUrl: './dash-board.component.html',
  styleUrls: ['./dash-board.component.scss']
})
export class DashBoardComponent implements OnInit {
  empId: any = 0;
  data: any;
  constructor(private authService: AuthService, public storageService: StorageService, private router: Router, private matDialog: MatDialog) { }
  ngOnInit(): void {
    this.empId = this.storageService.getEmpId();
    this.getDashboardDetailsByEmployeeId(this.empId)
  }

  getDashboardDetailsByEmployeeId(empId: any) {
    this.authService.getDashboardDetailsByEmployeeId(empId, 0).subscribe({
      next: (res) => {
        this.data = res;
        console.log("dfsdfdsfds   ,",this.data);
        
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

  scrollToSection(type: string): void {

  }
  openMatDialog(data: any, type: boolean, title: any) {
    let component: any = type ? OverdueComponent : ProjectStatusReportComponent
     const dialogRef = this.matDialog.open(component,
      {
        data: { data: data, title: title },
        width: '96vw',
        height: '75vh',
        maxWidth: '1180px',
        panelClass: 'project-status-report-dialog-panel'
      }
    );

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // handle dialog result (refresh, API call, etc.)
        console.log('Dialog closed with:', result);
      }
    });
  }


}
