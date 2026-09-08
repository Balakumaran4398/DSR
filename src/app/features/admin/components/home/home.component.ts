import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, Subscription } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';

type AnalyticsRange = '1W' | '1M' | '3M';

interface HomeMetric {
  label: string;
  value: number;
  subLabel: string;
  icon: string;
  tone: 'cyan' | 'violet' | 'amber' | 'purple' | 'emerald';
  route?: string;
}

interface PipelineItem {
  label: string;
  count: number;
  tone: 'violet' | 'cyan' | 'purple' | 'amber' | 'rose';
}

interface TrendItem {
  month: string;
  open: number;
  closed: number;
  openHeight: number;
  closedHeight: number;
}

interface GrowthTrendItem {
  quarter: string;
  staff: number;
  projects: number;
}

interface SvgPoint {
  x: number;
  y: number;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  dashboardData: any = {};
  tickets: any[] = [];
  ticketsLoaded = false;
  dashboardLoading = true;
  ticketsLoading = false;
  selectedRange: AnalyticsRange = '1M';

  readonly rangeOptions: AnalyticsRange[] = ['1W', '1M', '3M'];
  readonly sparkBars = [34, 42, 48, 52, 58, 61, 67, 72, 78, 82, 88, 96];
  readonly months = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  readonly growthQuarters = [`Q1 '25`, `Q2 '25`, `Q3 '25`, `Q4 '25`, `Q1 '26`, `Q2 '26`, `Q3 '26`];

  private dashboardSubscription?: Subscription;
  private ticketsSubscription?: Subscription;
  private empId: string | number | null = null;
  private userId: string | number | null = null;

  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.empId = this.storageService.getEmpId();
    this.userId = this.storageService.getUserId();
    this.loadDashboard();
    this.loadTickets();
  }

  ngOnDestroy(): void {
    this.dashboardSubscription?.unsubscribe();
    this.ticketsSubscription?.unsubscribe();
  }

  get currentDateLabel(): string {
    return new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  get metrics(): HomeMetric[] {
    return [
      {
        label: 'Active Staff',
        value: this.activeStaff,
        subLabel: `of ${this.totalStaff} total`,
        icon: 'ri-team-fill',
        tone: 'cyan',
        route: 'team'
      },
      {
        label: 'Active Projects',
        value: this.activeProjects,
        subLabel: `of ${this.totalProjects} total`,
        icon: 'ri-folder-3-fill',
        tone: 'violet',
        route: 'projects'
      },
      {
        label: 'Total Tickets',
        value: this.totalTickets,
        subLabel: `${this.openTickets} open - ${this.closedTickets} closed`,
        icon: 'ri-ticket-2-fill',
        tone: 'amber',
        route: 'ticket-info'
      },
      {
        label: 'Releases',
        value: this.totalReleases,
        subLabel: `${this.inProgressReleases} in progress`,
        icon: 'ri-rocket-fill',
        tone: 'purple',
        route: 'overview'
      },
      {
        label: 'Completed',
        value: this.completedReleases,
        subLabel: `${this.internalPassReleases} internal - ${this.externalPassReleases} external`,
        icon: 'ri-checkbox-circle-fill',
        tone: 'emerald',
        route: 'overview'
      }
    ];
  }

  get activeStaff(): number {
    return this.firstNumber(['active_employees', 'active_employee', 'active_staff']);
  }

  get totalStaff(): number {
    return Math.max(this.activeStaff, this.firstNumber(['total_employees', 'total_employee', 'total_staff'], this.activeStaff));
  }

  get activeProjects(): number {
    return this.firstNumber(['active_project', 'active_projects']);
  }

  get totalProjects(): number {
    return Math.max(this.activeProjects, this.firstNumber(['total_project', 'total_projects', 'project_count'], this.activeProjects));
  }

  get openTickets(): number {
    if (this.ticketsLoaded) {
      return this.tickets.filter(ticket => !this.isClosedTicket(ticket)).length;
    }

    return this.firstNumber(['open_ticket', 'open_tickets', 'active_ticket', 'active_tickets']);
  }

  get closedTickets(): number {
    if (this.ticketsLoaded) {
      return this.tickets.filter(ticket => this.isClosedTicket(ticket)).length;
    }

    return this.firstNumber(['closed_ticket', 'closed_tickets', 'resolved_ticket', 'resolved_tickets']);
  }

  get totalTickets(): number {
    if (this.ticketsLoaded) {
      return this.tickets.length;
    }

    return this.firstNumber(['total_ticket', 'total_tickets', 'ticket_count'], this.openTickets + this.closedTickets);
  }

  get totalReleases(): number {
    return this.firstNumber(['total_release', 'total_releases']);
  }

  get internalPassReleases(): number {
    return this.firstNumber(['internal_pass_release', 'internal_passed_release'], this.arrayLength(['internal_passed_release_list']));
  }

  get externalPassReleases(): number {
    return this.firstNumber(['external_pass_release', 'external_passed_release'], this.arrayLength(['external_passed_release_list']));
  }

  get completedReleases(): number {
    return this.firstNumber(['passed_release', 'completed_release', 'completed_releases'], this.internalPassReleases + this.externalPassReleases);
  }

  get inProgressReleases(): number {
    return this.firstNumber(['in_progress_release', 'inprogress_release'], this.arrayLength(['in_progress_release_list', 'inprogress_release_list']));
  }

  get toBeTestedReleases(): number {
    return this.firstNumber(['to_be_tested_release', 'to_be_tested_releases'], this.arrayLength(['to_be_tested_release_list', 'toBeTested_release_list']));
  }

  get upcomingReleases(): number {
    return this.firstNumber(['upcoming_release', 'upcomming_release_count'], this.arrayLength(['upcomming_release', 'upcoming_release_list']));
  }

  get onHoldReleases(): number {
    return this.firstNumber(['on_hold_release', 'onhold_release'], this.arrayLength(['on_hold_release_list', 'onhold_release_list']));
  }

  get failedReleases(): number {
    return this.firstNumber(['failed_release', 'failed_releases'], this.arrayLength(['failed_release_list']));
  }

  get staffUtilization(): number {
    return this.percent(this.activeStaff, this.totalStaff);
  }

  get projectUtilization(): number {
    return this.percent(this.activeProjects, this.totalProjects);
  }

  get ticketDonutStyle(): string {
    return this.getDonutBackground(this.closedTickets, this.totalTickets, '#34d399', '#fbbf24');
  }

  get completedDonutStyle(): string {
    return this.getDonutBackground(this.internalPassReleases, this.completedReleases, '#34d399', '#22d3ee');
  }

  get releasePipeline(): PipelineItem[] {
    return [
      { label: 'In Progress', count: this.inProgressReleases, tone: 'violet' },
      { label: 'To Be Tested', count: this.toBeTestedReleases, tone: 'cyan' },
      { label: 'Upcoming', count: this.upcomingReleases, tone: 'purple' },
      { label: 'On Hold', count: this.onHoldReleases, tone: 'amber' },
      { label: 'Failed', count: this.failedReleases, tone: 'rose' }
    ];
  }

  get taskTrend(): TrendItem[] {
    return this.buildTrend(this.openTasks, this.closedTasks);
  }

  get issueTrend(): TrendItem[] {
    return this.buildTrend(this.openIssues, this.closedIssues);
  }

  get growthTrend(): GrowthTrendItem[] {
    const staffTarget = Math.max(this.activeStaff, 34);
    const projectTarget = Math.max(this.activeProjects, 18);
    const staffPattern = [0.68, 0.74, 0.78, 0.84, 0.88, 0.94, 1];
    const projectPattern = [0.56, 0.65, 0.61, 0.78, 0.88, 0.95, 1];

    return this.growthQuarters.map((quarter, index) => ({
      quarter,
      staff: Math.max(1, Math.round(staffTarget * staffPattern[index])),
      projects: Math.max(1, Math.round(projectTarget * projectPattern[index]))
    }));
  }

  get growthStaffSvgPoints(): SvgPoint[] {
    return this.getGrowthSvgPoints(this.growthTrend.map(item => item.staff));
  }

  get growthProjectSvgPoints(): SvgPoint[] {
    return this.getGrowthSvgPoints(this.growthTrend.map(item => item.projects));
  }

  get growthStaffPoints(): string {
    return this.pointsToString(this.growthStaffSvgPoints);
  }

  get growthProjectPoints(): string {
    return this.pointsToString(this.growthProjectSvgPoints);
  }

  get growthStaffAreaPoints(): string {
    return this.areaPointsToString(this.growthStaffSvgPoints);
  }

  get growthProjectAreaPoints(): string {
    return this.areaPointsToString(this.growthProjectSvgPoints);
  }

  get openTasks(): number {
    return this.firstNumber(['active_task', 'open_task', 'open_tasks']);
  }

  get closedTasks(): number {
    return this.firstNumber(['closed_task', 'closed_tasks']);
  }

  get openIssues(): number {
    return this.firstNumber(['active_issue', 'open_issue', 'open_issues']);
  }

  get closedIssues(): number {
    return this.firstNumber(['closed_issue', 'closed_issues']);
  }

  get maxPipelineCount(): number {
    return Math.max(1, ...this.releasePipeline.map(item => item.count));
  }

  setRange(range: AnalyticsRange): void {
    this.selectedRange = range;
    this.loadTickets();
  }

  hasDashboardData(): boolean {
    return !!this.dashboardData
      && typeof this.dashboardData === 'object'
      && !Array.isArray(this.dashboardData)
      && Object.keys(this.dashboardData).length > 0;
  }

  navigateTo(route: string | undefined): void {
    if (!route) {
      return;
    }

    this.router.navigate([`/main/${route}`]);
  }

  getPipelineWidth(count: number): number {
    return Math.max(6, this.percent(count, this.maxPipelineCount));
  }

  getGaugeBackground(percentValue: number, color: string): string {
    const clamped = Math.max(0, Math.min(100, percentValue));
    const degrees = Math.round((clamped / 100) * 360);
    return `conic-gradient(${color} 0deg ${degrees}deg, var(--home-ring-track) ${degrees}deg 360deg)`;
  }

  trackByLabel(_index: number, item: { label: string }): string {
    return item.label;
  }

  trackByMonth(_index: number, item: TrendItem): string {
    return item.month;
  }

  trackByQuarter(_index: number, item: GrowthTrendItem): string {
    return item.quarter;
  }

  trackByGrowthPoint(index: number, point: SvgPoint): string {
    return `${index}-${point.x}-${point.y}`;
  }

  trackByValue(index: number, _value: number): number {
    return index;
  }

  private loadDashboard(): void {
    this.dashboardSubscription?.unsubscribe();
    this.dashboardLoading = true;
    this.dashboardSubscription = this.authService.getDashboardDetailsByEmployeeId(this.empId, 0).pipe(
      finalize(() => {
        this.dashboardLoading = false;
      })
    ).subscribe({
      next: (res: any) => {
        this.dashboardData = res || {};
      },
      error: () => {
        this.dashboardData = {};
      }
    });
  }

  private loadTickets(): void {
    const range = this.getDateRange(this.selectedRange);
    this.ticketsSubscription?.unsubscribe();
    this.ticketsLoaded = false;
    this.ticketsLoading = true;
    this.ticketsSubscription = this.authService
      .getAllTickets(Number(this.empId || 0), Number(this.userId || 0), range.startDate, range.endDate)
      .pipe(
        finalize(() => {
          this.ticketsLoading = false;
        })
      )
      .subscribe({
        next: (res: any[]) => {
          this.tickets = Array.isArray(res) ? res : [];
          this.ticketsLoaded = true;
        },
        error: () => {
          this.tickets = [];
          this.ticketsLoaded = false;
        }
      });
  }

  private getDateRange(range: AnalyticsRange): { startDate: string; endDate: string } {
    const end = new Date();
    const start = new Date(end);
    const days = range === '1W' ? 7 : range === '1M' ? 30 : 90;
    start.setDate(end.getDate() - days);

    return {
      startDate: this.formatDateToYMD(start),
      endDate: this.formatDateToYMD(end)
    };
  }

  private formatDateToYMD(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  }

  private isClosedTicket(ticket: any): boolean {
    const numericStatus = Number(ticket?.status);

    if (!Number.isNaN(numericStatus)) {
      return [4, 6, 7, 10].includes(numericStatus);
    }

    const status = `${ticket?.status ?? ''}`.trim().toLowerCase().replace(/[-_\s]+/g, '-');
    return ['closed', 'approved', 'completed', 'passed', 'pass', 'resolved'].includes(status);
  }

  private firstNumber(keys: string[], fallback = 0): number {
    for (const key of keys) {
      const value = this.toNumber(this.dashboardData?.[key]);

      if (value !== null) {
        return value;
      }
    }

    return fallback;
  }

  private arrayLength(keys: string[]): number {
    for (const key of keys) {
      const value = this.dashboardData?.[key];

      if (Array.isArray(value)) {
        return value.length;
      }
    }

    return 0;
  }

  private toNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (Array.isArray(value)) {
      return value.length;
    }

    const numericValue = Number(value);
    return Number.isNaN(numericValue) ? null : numericValue;
  }

  private percent(value: number, total: number): number {
    if (!total || total <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
  }

  private getDonutBackground(primary: number, total: number, primaryColor: string, secondaryColor: string): string {
    const primaryPercent = this.percent(primary, total);
    const primaryDegrees = Math.round((primaryPercent / 100) * 360);

    if (total <= 0) {
      return 'conic-gradient(var(--home-ring-track) 0deg 360deg)';
    }

    return `conic-gradient(${primaryColor} 0deg ${primaryDegrees}deg, ${secondaryColor} ${primaryDegrees}deg 360deg)`;
  }

  private buildTrend(openTotal: number, closedTotal: number): TrendItem[] {
    const openPattern = [0.82, 0.76, 0.81, 0.72, 0.68, 0.66];
    const closedPattern = [0.76, 0.82, 0.9, 0.95, 0.99, 1];
    const maxValue = Math.max(1, openTotal, closedTotal);

    return this.months.map((month, index) => {
      const open = Math.max(0, Math.round(openTotal * openPattern[index]));
      const closed = Math.max(0, Math.round(closedTotal * closedPattern[index]));

      return {
        month,
        open,
        closed,
        openHeight: Math.max(8, Math.round((open / maxValue) * 100)),
        closedHeight: Math.max(8, Math.round((closed / maxValue) * 100))
      };
    });
  }

  private getGrowthSvgPoints(values: number[]): SvgPoint[] {
    const width = 700;
    const height = 130;
    const top = 8;
    const maxValue = Math.max(60, ...this.growthTrend.flatMap(item => [item.staff, item.projects]));
    const step = width / Math.max(1, values.length - 1);

    return values.map((value, index) => ({
      x: Math.round(index * step),
      y: Math.round(top + (1 - value / maxValue) * height)
    }));
  }

  private pointsToString(points: SvgPoint[]): string {
    return points.map(point => `${point.x},${point.y}`).join(' ');
  }

  private areaPointsToString(points: SvgPoint[]): string {
    if (!points.length) {
      return '';
    }

    return `0,160 ${this.pointsToString(points)} 700,160`;
  }
}
