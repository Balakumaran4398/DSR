import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { getStatusPillClass } from 'src/app/_core/utils/status-pill.util';
import { APP_TABLE_DEFAULT_PAGE_SIZE, APP_TABLE_PAGE_SIZE_OPTIONS, APP_TABLE_VISIBLE_ROW_COUNT, buildTablePageNumbers, normalizeTablePageSize } from 'src/app/_core/utils/tabulator-pagination.util';

interface OverallDetailsColumn {
  label: string;
  keys: string[];
  type?: 'text' | 'status';
}

interface OverallDetailsDialogData {
  title: string;
  icon: string;
  rows: any[];
  columns: OverallDetailsColumn[];
  pageSize?: number;
  useReleaseStylePagination?: boolean;
  alwaysShowTableScrollbars?: Boolean;
}

type OverallDetailsSortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-overall-details-dialog',
  templateUrl: './overall-details-dialog.component.html',
  styleUrls: ['./overall-details-dialog.component.scss']
})
export class OverallDetailsDialogComponent {
  rows: any[] = [];
  pagedRows: any[] = [];
  columns: OverallDetailsColumn[] = [];
  scrollbarVisible = false;
  pageIndex = 0;
  pageSize = APP_TABLE_DEFAULT_PAGE_SIZE;
  readonly tableVisibleRowCount = APP_TABLE_VISIBLE_ROW_COUNT;
  readonly pageSizeOptions = APP_TABLE_PAGE_SIZE_OPTIONS;
  totalPages = 1;
  pageNumbers: number[] = [];
  showingFrom = 0;
  showingTo = 0;
  sortColumn: OverallDetailsColumn | null = null;
  sortDirection: OverallDetailsSortDirection = 'asc';
  private scrollbarHideTimer?: ReturnType<typeof setTimeout>;
  alwaysShowTableScrollbars?: Boolean;
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: OverallDetailsDialogData,
    public matDialog: MatDialog
  ) {
    this.rows = Array.isArray(data?.rows) ? data.rows : [];
    this.columns = Array.isArray(data?.columns) ? data.columns : [];
    this.pageSize = this.normalizePageSize(data?.pageSize);
    this.rebuildPagination();
  }

  getCellValue(row: any, column: OverallDetailsColumn): string {
    const rawValue = this.getFirstValue(row, column.keys);

    if (column.type === 'status') {
      return this.formatStatus(rawValue);
    }

    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return '-';
    }

    if (typeof rawValue === 'object') {
      const displayValue = this.getFirstValue(rawValue, ['department_name', 'departmentName', 'dept_name', 'deptName', 'name', 'title', 'label', 'value', 'code', 'id']);
      return displayValue !== null && displayValue !== undefined && displayValue !== '' ? String(displayValue) : '-';
    }

    return String(rawValue);
  }

  isActiveStatus(row: any, column: OverallDetailsColumn): boolean {
    if (column.type !== 'status') {
      return false;
    }

    const rawValue = this.getFirstValue(row, column.keys);

    if (typeof rawValue === 'boolean') {
      return rawValue;
    }

    const status = `${rawValue ?? ''}`.trim().toLowerCase();
    return !['false', '0', 'inactive', 'relieved', 'deleted'].includes(status);
  }

  getStatusClass(row: any, column: OverallDetailsColumn): string {
    if (column.type !== 'status') {
      return '';
    }

    return getStatusPillClass(this.getCellValue(row, column));
  }

  trackByColumn = (_index: number, column: OverallDetailsColumn): string => {
    return column.label;
  };

  trackByRow = (index: number, row: any): string => {
    const id = this.getFirstValue(row, ['id', 'ticket_id', 'ticketid', 'code', 'employee_id', 'employeeid', 'user_id', 'username']);
    return id !== null && id !== undefined ? String(id) : String(index);
  };

  trackByNumber = (_index: number, value: number): number => {
    return value;
  };

  goToPage(pageIndex: number): void {
    const nextPageIndex = Math.max(0, Math.min(this.totalPages - 1, pageIndex));

    if (nextPageIndex === this.pageIndex) {
      return;
    }

    this.pageIndex = nextPageIndex;
    this.rebuildPagination();
  }

  onPageSizeChange(event: Event): void {
    this.pageSize = normalizeTablePageSize((event.target as HTMLSelectElement).value);
    this.pageIndex = 0;
    this.rebuildPagination();
  }

  sortByColumn(column: OverallDetailsColumn): void {
    if (this.sortColumn?.label === column.label) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.pageIndex = 0;
    this.rebuildPagination();
  }

  getSortIcon(column: OverallDetailsColumn): string {
    if (this.sortColumn?.label !== column.label) {
      return 'ri-arrow-up-down-line';
    }

    return this.sortDirection === 'asc' ? 'ri-arrow-up-line' : 'ri-arrow-down-line';
  }

  showTableScrollbar(): void {
    this.scrollbarVisible = true;

    if (this.scrollbarHideTimer) {
      clearTimeout(this.scrollbarHideTimer);
    }

    this.scrollbarHideTimer = setTimeout(() => {
      this.scrollbarVisible = false;
    }, 700);
  }

  private rebuildPagination(): void {
    const sortedRows = this.getSortedRows();
    this.totalPages = Math.max(1, Math.ceil(sortedRows.length / this.pageSize));
    this.pageIndex = Math.max(0, Math.min(this.pageIndex, this.totalPages - 1));

    const startIndex = this.pageIndex * this.pageSize;
    this.pagedRows = sortedRows.slice(startIndex, startIndex + this.pageSize);
    this.showingFrom = sortedRows.length ? startIndex + 1 : 0;
    this.showingTo = sortedRows.length ? Math.min(startIndex + this.pageSize, sortedRows.length) : 0;
    this.pageNumbers = this.buildPageNumbers();
  }

  private getSortedRows(): any[] {
    if (!this.sortColumn) {
      return [...this.rows];
    }

    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return [...this.rows].sort((first, second) => this.compareCellValues(first, second, this.sortColumn as OverallDetailsColumn) * direction);
  }

  private compareCellValues(first: any, second: any, column: OverallDetailsColumn): number {
    const firstValue = this.getComparableValue(first, column);
    const secondValue = this.getComparableValue(second, column);

    if (typeof firstValue === 'number' && typeof secondValue === 'number') {
      return firstValue - secondValue;
    }

    return String(firstValue).localeCompare(String(secondValue), undefined, { numeric: true, sensitivity: 'base' });
  }

  private getComparableValue(row: any, column: OverallDetailsColumn): string | number {
    const rawValue = this.getFirstValue(row, column.keys);

    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return '';
    }

    if (typeof rawValue === 'number') {
      return rawValue;
    }

    const numericValue = Number(rawValue);
    if (!Number.isNaN(numericValue) && `${rawValue}`.trim() !== '') {
      return numericValue;
    }

    const dateValue = new Date(rawValue);
    if (!Number.isNaN(dateValue.getTime())) {
      return dateValue.getTime();
    }

    return this.getCellValue(row, column).toLowerCase();
  }

  private buildPageNumbers(): number[] {
    return buildTablePageNumbers(this.totalPages);
  }

  private normalizePageSize(value: any): number {
    return normalizeTablePageSize(value);
  }

  private getFirstValue(row: any, keys: string[]): any {
    for (const key of keys) {
      const value = row?.[key];

      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }

    return null;
  }

  private formatStatus(value: any): string {
    if (value === null || value === undefined || value === '') {
      return 'Active';
    }

    if (typeof value === 'boolean') {
      return value ? 'Active' : 'Inactive';
    }

    return String(value);
  }

}
