import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type NotificationDateRangePreset = 'weekly' | 'bi-weekly' | 'monthly' | 'custom';

export interface NotificationDateRange {
  preset: NotificationDateRangePreset;
  startDate: string;
  endDate: string;
  label: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationDateRangeService {
  private readonly rangeSubject = new BehaviorSubject<NotificationDateRange>(this.getCurrentMonthRange());

  range$ = this.rangeSubject.asObservable();

  get currentRange(): NotificationDateRange {
    return this.rangeSubject.value;
  }

  setRange(range: NotificationDateRange): void {
    this.rangeSubject.next(range);
  }

  resetToCurrentMonth(): void {
    this.rangeSubject.next(this.getCurrentMonthRange());
  }

  private getCurrentMonthRange(): NotificationDateRange {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const start = new Date(today.getFullYear(), today.getMonth(), 1);

    return {
      preset: 'monthly',
      startDate: this.formatDateToYMD(start),
      endDate: this.formatDateToYMD(end),
      label: 'This Month'
    };
  }

  private formatDateToYMD(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
