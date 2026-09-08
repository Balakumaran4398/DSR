import { DatePipe } from '@angular/common';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { AfterViewInit, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-date-range-filter',
  templateUrl: './date-range-filter.component.html',
  styleUrls: ['./date-range-filter.component.scss']
})
export class DateRangeFilterComponent implements AfterViewInit, OnChanges {

  @Input() initialStartDate: Date | string | null = null;
  @Input() initialEndDate: Date | string | null = null;
  @Input() navigationStep: 'range' | 'week' = 'range';

  /* ===== EMIT ONLY (ADDED) ===== */
  @Output() rangeChange = new EventEmitter<{ startDate: Date; endDate: Date }>();

  /* ===== STATE ===== */
  startDate: Date = new Date(new Date().setDate(new Date().getDate() - 7));
  endDate: Date = new Date();
  isOpen: boolean = false;
  activePreset: string | null = '';

  /* Temp state */
  tempStart: Date = new Date();
  tempEnd: Date = new Date();
  private isViewInitialized = false;
  overlayPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 8
    },
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 8
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -8
    }
  ];

  /* Configuration */
  presets = [
    { label: 'Today', days: 0 },
    { label: 'Yesterday', days: 1, offset: 1 },
    { label: 'Last 7 Days', days: 7 },
    { label: 'Last 30 Days', days: 30 },
    { label: 'This Month', type: 'month' },
    { label: 'This Week', type: 'week' },
    { label: 'Last Month', type: 'lastMonth' }
  ];

  constructor() {
    const week = this.getCurrentWeek();
    this.tempStart = week.start;
    this.tempEnd = week.end;
    this.startDate = this.tempStart;
    this.endDate = this.tempEnd;
  }
  ngAfterViewInit(): void {
    this.isViewInitialized = true;
    this.applyInitialRange();
    this.emitRange();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['initialStartDate'] && !changes['initialEndDate']) {
      return;
    }

    if (!this.applyInitialRange() || !this.isViewInitialized) {
      return;
    }

    this.emitRange();
  }

  /* ===== GETTERS ===== */

  get formattedRange(): string | null {
    const start = this.startDate;
    const end = this.endDate;
    const datePipe = new DatePipe('en-US');

    if (start.getFullYear() === end.getFullYear()) {
      return `${datePipe.transform(start, 'MMM d')} - ${datePipe.transform(end, 'MMM d, y')}`;
    }
    return `${datePipe.transform(start, 'MMM d, y')} - ${datePipe.transform(end, 'MMM d, y')}`;
  }

  get durationLabel(): string {
    const diff = Math.abs(this.endDate.getTime() - this.startDate.getTime());
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Same Day';
    if (days === 1 && this.activePreset === 'Yesterday') return '1 Day';
    if (days === 7) return 'Weekly';
    if (days >= 28 && days <= 31) return 'Monthly';
    return `${days} Days`;
  }

  get isFutureDisabled(): boolean {
    return false;
  }

  /* ===== EMIT METHOD (ADDED) ===== */
  private emitRange() {
    this.rangeChange.emit({
      startDate: this.startDate,
      endDate: this.endDate
    });
  }

  private applyInitialRange(): boolean {
    const start = this.parseInputDate(this.initialStartDate);
    const end = this.parseInputDate(this.initialEndDate);

    if (!start || !end) {
      return false;
    }

    this.startDate = start;
    this.endDate = end;
    this.tempStart = new Date(start);
    this.tempEnd = new Date(end);
    this.activePreset = 'Custom';
    return true;
  }

  private parseInputDate(value: Date | string | null): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return new Date(value);
    }

    const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (ymdMatch) {
      const [, year, month, day] = ymdMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /* ===== ACTIONS ===== */

  toggleDropdown() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.tempStart = new Date(this.startDate);
      this.tempEnd = new Date(this.endDate);
    }
  }

  closeDropdown(): void {
    this.isOpen = false;
  }

  updateTempDate(type: 'start' | 'end', dateStr: string) {
    if (!dateStr) return;
    const date = this.parseInputDate(dateStr);
    if (!date) return;

    if (type === 'start') this.tempStart = date;
    else this.tempEnd = date;
  }

  applyCustomRange() {
    const { start, end } = this.normalizeRangeOrder(this.tempStart, this.tempEnd);
    this.startDate = start;
    this.endDate = end;
    this.activePreset = 'Custom';
    this.isOpen = false;

    this.emitRange(); // ✅ emit
  }

  private normalizeRangeOrder(startDate: Date, endDate: Date): { start: Date; end: Date } {
    const start = new Date(startDate);
    const end = new Date(endDate);

    return start <= end
      ? { start, end }
      : { start: end, end: start };
  }

  applyPreset(preset: any) {
    const end = new Date();
    const start = new Date();

    if (preset.type === 'month') {
      start.setDate(1);
    } else if (preset.type === 'lastMonth') {
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      end.setDate(0);
    } else if (preset.label === 'Yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (preset.days !== undefined) {
      if (preset.days !== 0) {
        start.setDate(end.getDate() - preset.days);
      }
    }

    this.startDate = start;
    this.endDate = end;
    this.activePreset = preset.label;
    this.isOpen = false;

    this.emitRange(); // ✅ emit
  }

  navigate(direction: number) {
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);

    const diffTime = Math.abs(end.getTime() - start.getTime());

    if (this.activePreset === 'This Month' || this.activePreset === 'Last Month') {
      start.setMonth(start.getMonth() + direction);
      const newEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      start.setDate(1);

      this.startDate = start;
      this.endDate = newEnd;

      this.emitRange(); // ✅ emit
      return;
    }

    const diffDays = Math.round(diffTime / (1000 * 3600 * 24)) || 1;
    const stepDays = this.navigationStep === 'week' ? 7 : diffDays;

    start.setDate(start.getDate() + stepDays * direction);
    end.setDate(end.getDate() + stepDays * direction);

    this.startDate = start;
    this.endDate = end;

    this.emitRange(); // ✅ emit
  }

  getCurrentWeek(): { start: Date; end: Date } {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;

    const start = new Date(today);
    start.setDate(today.getDate() + diff);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

}
