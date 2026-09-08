import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';

type DatePreset = 'weekly' | 'bi-weekly' | 'monthly' | 'custom';

interface DateRange {
  startDate: Date;
  endDate: Date;
}

@Component({
  selector: 'app-prj-dashboard',
  templateUrl: './prj-dashboard.component.html',
  styleUrls: ['./prj-dashboard.component.scss']
})
export class PrjDashboardComponent implements OnInit, OnDestroy {
  isAdmin: any = true;
  empId: any = 0;
  today = new Date();
  dashboardData: any = null;
  mytask: any = [];
  projectid: any = 0;
  filterStartDate: Date | null = null;
  filterEndDate: Date | null = null;
  selectedPreset: DatePreset = 'monthly';
  isCustomOpen = false;
  loading = false;
  loadError = '';
  currentDateRangeLabel = '';
  activeMenuId: number | null = null;

  private appliedStartDate: Date | null = null;
  private appliedEndDate: Date | null = null;
  private formattedStartDate = '';
  private formattedEndDate = '';
  private dashboardRequest?: Subscription;
  private requestSequence = 0;

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

  ngOnInit(): void {
    this.empId = this.storageService.getEmpId();
    this.selectPreset('monthly');
  }

  ngOnDestroy(): void {
    this.dashboardRequest?.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isCustomOpen) return;

    const target = event.target as HTMLElement;
    if (target.closest('.mat-datepicker-content, .cdk-overlay-container, .cdk-overlay-pane')) {
      return;
    }

    const filterContainer = this.elementRef.nativeElement.querySelector('.custom-filter-container');
    if (filterContainer?.contains(target)) return;

    this.isCustomOpen = false;
    this.restoreCustomDraftFromAppliedRange();
    this.cdr.markForCheck();
  }

  selectPreset(preset: DatePreset): void {
    if (preset === 'custom') {
      this.toggleCustomFilter();
      return;
    }

    this.isCustomOpen = false;
    const range = this.getPresetRange(preset, new Date());
    this.applyDateRange(range.startDate, range.endDate, preset);
  }

  applyCustomFilter(): void {
    if (!this.filterStartDate || !this.filterEndDate) return;

    this.applyDateRange(this.filterStartDate, this.filterEndDate, 'custom');
    this.isCustomOpen = false;
  }

  filterTask(): void {
    if (!this.filterStartDate || !this.filterEndDate) return;
    this.applyDateRange(this.filterStartDate, this.filterEndDate, this.selectedPreset);
  }

  retryLoad(): void {
    if (!this.formattedStartDate || !this.formattedEndDate) return;

    this.getDashboardDetailsByEmployeeId(this.empId, this.formattedStartDate, this.formattedEndDate);
  }

  getDashboardDetailsByEmployeeId(empId: any, fromDate = '', toDate = ''): void {
    const requestId = ++this.requestSequence;
    this.dashboardRequest?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    this.dashboardData = null;

    this.dashboardRequest = this.authService
      .getDashboardDetailsByEmployeeId(empId, this.projectid, fromDate, toDate)
      .subscribe({
        next: response => {
          if (requestId !== this.requestSequence) return;
          this.dashboardData = response;
        },
        error: error => {
          if (requestId !== this.requestSequence) return;
          console.error('Error fetching project dashboard data', error);
          this.dashboardData = null;
          this.loadError = error?.error?.message || 'Unable to load dashboard details for this date range.';
          this.loading = false;
        },
        complete: () => {
          if (requestId === this.requestSequence) this.loading = false;
        }
      });
  }

  navigateToPage(type: any): void {
    this.router.navigate(['main/' + type]);
  }

  toggleMenu(event: Event, id: number): void {
    event.stopPropagation();
    this.activeMenuId = this.activeMenuId === id ? null : id;
  }

  private toggleCustomFilter(): void {
    if (this.isCustomOpen) {
      this.isCustomOpen = false;
      this.restoreCustomDraftFromAppliedRange();
      return;
    }

    this.restoreCustomDraftFromAppliedRange();
    this.isCustomOpen = true;
  }

  private restoreCustomDraftFromAppliedRange(): void {
    this.filterStartDate = this.appliedStartDate ? new Date(this.appliedStartDate) : null;
    this.filterEndDate = this.appliedEndDate ? new Date(this.appliedEndDate) : null;
  }

  private applyDateRange(startValue: Date, endValue: Date, preset: DatePreset): void {
    let startDate = this.normalizeDate(startValue);
    let endDate = this.normalizeDate(endValue);
    if (!startDate || !endDate) return;

    if (startDate > endDate) {
      [startDate, endDate] = [endDate, startDate];
    }

    this.selectedPreset = preset;
    this.appliedStartDate = new Date(startDate);
    this.appliedEndDate = new Date(endDate);
    this.filterStartDate = new Date(startDate);
    this.filterEndDate = new Date(endDate);
    this.formattedStartDate = this.formatDateLocal(startDate);
    this.formattedEndDate = this.formatDateLocal(endDate);
    this.currentDateRangeLabel = `${this.formatDisplayDate(startDate)} - ${this.formatDisplayDate(endDate)}`;

    this.getDashboardDetailsByEmployeeId(this.empId, this.formattedStartDate, this.formattedEndDate);
  }

  private getPresetRange(preset: Exclude<DatePreset, 'custom'>, referenceDate: Date): DateRange {
    if (preset === 'monthly') return this.getCurrentMonthBounds(referenceDate);

    const startDate = this.normalizeDate(referenceDate) as Date;
    startDate.setDate(startDate.getDate() - startDate.getDay());
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + (preset === 'weekly' ? 6 : 13));

    return { startDate, endDate };
  }

  private getCurrentMonthBounds(referenceDate = new Date()): DateRange {
    return {
      startDate: new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1),
      endDate: new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0)
    };
  }

  private normalizeDate(value: Date): Date | null {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private formatDateLocal(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private formatDisplayDate(date: Date): string {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
