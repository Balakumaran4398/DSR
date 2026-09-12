import { Component, HostListener, OnInit, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
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
  filterStartDate: Date | null = null;
  filterEndDate: Date | null = null;
  selectedPreset: string = '';
  isCustomOpen: boolean = false;

  // Inject ElementRef of the whole component host to check boundaries universally
  constructor(
    private authService: AuthService,
    public storageService: StorageService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef
  ) {
    this.projectid = this.route.snapshot.paramMap.get('projectid');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isCustomOpen) return;

    const target = event.target as HTMLElement;

    // 1. If clicked inside the material datepicker calendar overlay, keep it open
    if (target.closest('.mat-datepicker-content, .cdk-overlay-container, .cdk-overlay-pane')) {
      return;
    }

    // 2. Check if the click occurred anywhere inside our custom container wrapper component
    const containerWrapper = this.elementRef.nativeElement.querySelector('.custom-filter-container');
    if (containerWrapper && containerWrapper.contains(target)) {
      return;
    }

    // 3. Otherwise, it's a true outside click -> close the popup!
    this.isCustomOpen = false;
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    this.empId = this.storageService.getEmpId();
    this.selectPreset('monthly');
  }

  selectPreset(preset: string) {
    this.selectedPreset = preset;

    if (preset !== 'custom') {
      this.isCustomOpen = false;
    } else {
      // Toggle cleanly
      this.isCustomOpen = !this.isCustomOpen;
    }

    const today = new Date();
    let start = new Date();
    let end = new Date();

    if (preset === 'weekly') {
      const dayOfWeek = today.getDay();
      const diffToSunday = -dayOfWeek;
      start = new Date(today);
      start.setDate(today.getDate() + diffToSunday);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      this.filterStartDate = start;
      this.filterEndDate = end;
      this.filterTask();
    }
    else if (preset === 'bi-weekly') {
      const dayOfWeek = today.getDay();
      const diffToSunday = dayOfWeek === 0 ? 0 : -dayOfWeek;
      start = new Date(today);
      start.setDate(today.getDate() + diffToSunday);
      const end = new Date(start);
      end.setDate(start.getDate() + 13);

      this.filterStartDate = start;
      this.filterEndDate = end;
      this.filterTask();
    }
    else if (preset === 'monthly') {
      const monthRange = this.getCurrentMonthBounds(today);
      start = monthRange.startDate;
      end = monthRange.endDate;

      this.filterStartDate = start;
      this.filterEndDate = end;
      this.filterTask();
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
      const startDateObj = new Date(this.filterStartDate);
      const endDateObj = new Date(this.filterEndDate);

      if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
        const formatDateLocal = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const formattedStartDate = formatDateLocal(startDateObj);
        const formattedEndDate = formatDateLocal(endDateObj);

        this.getDashboardDetailsByEmployeeId(this.empId, formattedStartDate, formattedEndDate);
      }
    }
  }

  getDashboardDetailsByEmployeeId(empId: any, fromDate?: string, toDate?: string) {
    const start = fromDate || '';
    const end = toDate || '';
    this.authService.getDashboardDetailsByEmployeeId(empId, this.projectid, start, end).subscribe({
      next: (res) => {
        this.dashboardData = res;
      },
      error: (err) => {
        console.error("Error fetching dashboard data", err);
      }
    });
  }

  navigateToPage(type: any) {
    this.router.navigate(["main/" + type]);
  }

  activeMenuId: number | null = null;

  toggleMenu(event: Event, id: number) {
    event.stopPropagation();
    this.activeMenuId = this.activeMenuId === id ? null : id;
  }

  // @HostListener('document:click')
  // closeMenu() {
  //   this.activeMenuId = null;
  // }

  private getCurrentMonthBounds(referenceDate = new Date()) {
    const startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  }
}