import { ElementRef } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { PrjDashboardComponent } from './prj-dashboard.component';

describe('PrjDashboardComponent date filtering', () => {
  let component: PrjDashboardComponent;
  let authService: jasmine.SpyObj<any>;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['getDashboardDetailsByEmployeeId']);
    authService.getDashboardDetailsByEmployeeId.and.returnValue(of({}));

    component = new PrjDashboardComponent(
      authService,
      { getEmpId: () => 17 } as any,
      { navigate: jasmine.createSpy('navigate') } as any,
      { snapshot: { paramMap: { get: () => '42' } } } as any,
      { markForCheck: jasmine.createSpy('markForCheck') } as any,
      new ElementRef({ querySelector: () => null })
    );
    component.empId = 17;
  });

  it('builds the current Sunday-to-Saturday weekly range', () => {
    const range = (component as any).getPresetRange('weekly', new Date(2026, 8, 9));

    expect((component as any).formatDateLocal(range.startDate)).toBe('2026-09-06');
    expect((component as any).formatDateLocal(range.endDate)).toBe('2026-09-12');
  });

  it('builds the current and following week for bi-weekly', () => {
    const range = (component as any).getPresetRange('bi-weekly', new Date(2026, 8, 9));

    expect((component as any).formatDateLocal(range.startDate)).toBe('2026-09-06');
    expect((component as any).formatDateLocal(range.endDate)).toBe('2026-09-19');
  });

  it('uses the full current month for 28, 29, 30, and 31-day months', () => {
    const cases = [
      { reference: new Date(2023, 1, 14), start: '2023-02-01', end: '2023-02-28' },
      { reference: new Date(2024, 1, 14), start: '2024-02-01', end: '2024-02-29' },
      { reference: new Date(2026, 3, 14), start: '2026-04-01', end: '2026-04-30' },
      { reference: new Date(2026, 0, 14), start: '2026-01-01', end: '2026-01-31' }
    ];

    cases.forEach(testCase => {
      const range = (component as any).getPresetRange('monthly', testCase.reference);
      expect((component as any).formatDateLocal(range.startDate)).toBe(testCase.start);
      expect((component as any).formatDateLocal(range.endDate)).toBe(testCase.end);
    });
  });

  it('normalizes a reversed custom range and sends local dates to the API', () => {
    component.filterStartDate = new Date(2026, 8, 10);
    component.filterEndDate = new Date(2026, 8, 3);

    component.applyCustomFilter();

    expect(component.selectedPreset).toBe('custom');
    expect((component as any).formatDateLocal(component.filterStartDate)).toBe('2026-09-03');
    expect((component as any).formatDateLocal(component.filterEndDate)).toBe('2026-09-10');
    expect(authService.getDashboardDetailsByEmployeeId).toHaveBeenCalledWith(
      17,
      '42',
      '2026-09-03',
      '2026-09-10'
    );
  });

  it('allows a same-day custom range', () => {
    component.filterStartDate = new Date(2026, 8, 5);
    component.filterEndDate = new Date(2026, 8, 5);

    component.applyCustomFilter();

    expect(authService.getDashboardDetailsByEmployeeId).toHaveBeenCalledWith(
      17,
      '42',
      '2026-09-05',
      '2026-09-05'
    );
  });

  it('does not apply an incomplete custom range', () => {
    component.filterStartDate = new Date(2026, 8, 5);
    component.filterEndDate = null;

    component.applyCustomFilter();

    expect(authService.getDashboardDetailsByEmployeeId).not.toHaveBeenCalled();
    expect(component.selectedPreset).toBe('monthly');
  });

  it('shows a load error and retries the last applied range', () => {
    authService.getDashboardDetailsByEmployeeId.and.returnValue(
      throwError(() => ({ error: { message: 'Dashboard unavailable' } }))
    );
    component.filterStartDate = new Date(2026, 8, 5);
    component.filterEndDate = new Date(2026, 8, 5);

    component.applyCustomFilter();

    expect(component.loading).toBeFalse();
    expect(component.loadError).toBe('Dashboard unavailable');
    expect(component.dashboardData).toBeNull();

    authService.getDashboardDetailsByEmployeeId.and.returnValue(of({ active_task: 3 }));
    component.retryLoad();

    expect(authService.getDashboardDetailsByEmployeeId).toHaveBeenCalledTimes(2);
    expect(component.dashboardData).toEqual({ active_task: 3 });
    expect(component.loadError).toBe('');
  });

  it('cancels an older request so only the latest response is displayed', () => {
    const firstResponse = new Subject<any>();
    const secondResponse = new Subject<any>();
    authService.getDashboardDetailsByEmployeeId.and.returnValues(firstResponse, secondResponse);

    component.getDashboardDetailsByEmployeeId(17, '2026-09-01', '2026-09-07');
    component.getDashboardDetailsByEmployeeId(17, '2026-09-01', '2026-09-30');

    expect(firstResponse.observers.length).toBe(0);
    firstResponse.next({ active_task: 99 });
    secondResponse.next({ active_task: 4 });
    secondResponse.complete();

    expect(component.dashboardData).toEqual({ active_task: 4 });
    expect(component.loading).toBeFalse();
  });
});
