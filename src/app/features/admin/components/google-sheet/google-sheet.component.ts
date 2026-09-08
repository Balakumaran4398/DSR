import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

interface GoogleSheetEmployee {
  employeeId: string | number;
  employeeName: string;
  designation: string;
  department: string;
  email: string;
  sheetUrl: string;
  initials: string;
}

@Component({
  selector: 'app-google-sheet',
  templateUrl: './google-sheet.component.html',
  styleUrls: ['./google-sheet.component.scss']
})
export class GoogleSheetComponent implements OnInit {
  employees: GoogleSheetEmployee[] = [];
  filteredEmployees: GoogleSheetEmployee[] = [];
  ownSheet: GoogleSheetEmployee | null = null;
  searchTerm = '';
  loading = false;
  openingEmployeeId: string | number | null = null;

  constructor(
    private authService: AuthService,
    public storageService: StorageService,
    private toasterService: ToasterService
  ) {}

  ngOnInit(): void {
    this.loadGoogleSheets();
  }

  get canViewEmployees(): boolean {
    return this.storageService.roles.isAdmin || this.storageService.roles.isManager;
  }

  get employeeTabLabel(): string {
    return this.storageService.roles.isAdmin ? 'Employees' : 'Teammates';
  }

  loadGoogleSheets(): void {
    const employeeId = this.storageService.getEmpId();
    if (!employeeId) {
      this.toasterService.error('Employee ID is unavailable. Please sign in again.');
      return;
    }

    this.loading = true;
    const request = this.storageService.roles.isAdmin
      ? this.authService.getAllGoogleSheetLinks()
      : this.authService.getGoogleSheetLinksByEmployeeId(employeeId);

    request.pipe(finalize(() => this.loading = false)).subscribe({
      next: response => {
        const rows = this.uniqueEmployees(this.extractRows(response)
          .map((item, index) => this.normalizeEmployee(item, index))
          .filter((item): item is GoogleSheetEmployee => !!item));

        this.ownSheet = rows.find(row => `${row.employeeId}` === `${employeeId}`) || null;
        if (!this.ownSheet && !this.canViewEmployees && rows.length === 1) {
          this.ownSheet = rows[0];
        }

        this.employees = this.canViewEmployees
          ? rows.filter(row => `${row.employeeId}` !== `${employeeId}`)
          : [];
        this.applyFilter();
      },
      error: error => {
        this.ownSheet = null;
        this.employees = [];
        this.filteredEmployees = [];
        this.toasterService.error(error?.error?.message || 'Unable to load Google Sheet links.');
      }
    });
  }

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.applyFilter();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.applyFilter();
  }

  openSheet(employee: GoogleSheetEmployee): void {
    if (employee.sheetUrl) {
      this.openExternalUrl(employee.sheetUrl);
      return;
    }

    this.openingEmployeeId = employee.employeeId;
    this.authService.getGoogleSheetLinksByEmployeeId(employee.employeeId)
      .pipe(finalize(() => this.openingEmployeeId = null))
      .subscribe({
        next: response => {
          const record = this.extractRows(response)
            .map((item, index) => this.normalizeEmployee(item, index))
            .find(item => !!item?.sheetUrl);

          if (record?.sheetUrl) {
            employee.sheetUrl = record.sheetUrl;
            this.openExternalUrl(record.sheetUrl);
          } else {
            this.toasterService.error('No Google Sheet link is configured for this employee.');
          }
        },
        error: error => this.toasterService.error(error?.error?.message || 'Unable to open the Google Sheet.')
      });
  }

  trackByEmployee(_: number, employee: GoogleSheetEmployee): string | number {
    return employee.employeeId;
  }

  private applyFilter(): void {
    const query = this.searchTerm.trim().toLowerCase();
    this.filteredEmployees = !query
      ? [...this.employees]
      : this.employees.filter(employee => [
          employee.employeeName,
          employee.designation,
          employee.department,
          employee.email,
          `${employee.employeeId}`
        ].some(value => value.toLowerCase().includes(query)));
  }

  private extractRows(response: any): any[] {
    if (Array.isArray(response)) return response;

    const payload = response?.data ?? response?.result ?? response?.details ?? response;
    if (Array.isArray(payload)) return payload;

    if (typeof payload === 'string') {
      return [{
        employeeid: this.storageService.getEmpId(),
        employee_name: this.storageService.getEmpName(),
        google_sheet_link: payload
      }];
    }

    const listKeys = [
      'google_sheet_links', 'googleSheetLinks', 'googlesheetlinks', 'sheet_links',
      'employees', 'employee_list', 'team_members', 'teammates', 'links'
    ];
    const rows: any[] = [];
    for (const key of listKeys) {
      if (Array.isArray(payload?.[key])) rows.push(...payload[key]);
    }

    const ownRecord = payload?.own_sheet ?? payload?.ownSheet ?? payload?.own_link ?? payload?.ownLink;
    if (ownRecord && typeof ownRecord === 'object') rows.unshift(ownRecord);

    const hasDirectEmployeeData = payload && typeof payload === 'object' && [
      'employeeid', 'employee_id', 'empid', 'emp_id', 'google_sheet_link',
      'google_sheet_url', 'googlesheetlink', 'sheet_link', 'sheet_url'
    ].some(key => payload[key] !== undefined && payload[key] !== null);
    if (hasDirectEmployeeData) rows.unshift(payload);

    return rows;
  }

  private normalizeEmployee(item: any, index: number): GoogleSheetEmployee | null {
    if (!item || typeof item !== 'object') return null;

    const employeeId = item.employeeid ?? item.employee_id ?? item.empid ?? item.emp_id ?? item.id;
    const employeeName = item.employee_name ?? item.employeename ?? item.employee ?? item.name ?? item.username;
    const sheetUrl = item.google_sheet_link ?? item.googleSheetLink ?? item.google_sheet_url
      ?? item.googleSheetUrl ?? item.googlesheetlink ?? item.googlesheet_link ?? item.googlesheeturl
      ?? item.sheet_link ?? item.sheetLink ?? item.sheet_url ?? item.sheetUrl ?? item.sheetlink
      ?? item.link ?? item.url ?? '';

    if ((employeeId === null || employeeId === undefined) && !employeeName && !sheetUrl) return null;

    const resolvedName = `${employeeName || `Employee ${employeeId ?? index + 1}`}`.trim();
    return {
      employeeId: employeeId ?? `row-${index}`,
      employeeName: resolvedName,
      designation: `${item.designation ?? item.position ?? item.role ?? ''}`.trim(),
      department: `${item.department_name ?? item.department ?? item.dept_name ?? ''}`.trim(),
      email: `${item.email ?? item.official_email ?? item.username ?? ''}`.trim(),
      sheetUrl: `${sheetUrl}`.trim(),
      initials: this.getInitials(resolvedName)
    };
  }

  private openExternalUrl(url: string): void {
    const normalizedUrl = /^(https?:\/\/)/i.test(url) ? url : `https://${url}`;
    window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
  }

  private uniqueEmployees(rows: GoogleSheetEmployee[]): GoogleSheetEmployee[] {
    const seen = new Set<string>();
    return rows.filter(row => {
      const key = `${row.employeeId}|${row.sheetUrl}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private getInitials(name: string): string {
    return name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'NA';
  }
}
