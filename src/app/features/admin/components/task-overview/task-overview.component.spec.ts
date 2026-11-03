import { of } from 'rxjs';
import { TaskOverviewComponent } from './task-overview.component';

describe('TaskOverviewComponent calendar export rows', () => {
  it('orders every date in the selected range and recognizes embedded holidays, leave, and Sundays', () => {
    const component = new TaskOverviewComponent(
      { getEmployeeList: () => of([]) } as any,
      { getEmpId: () => 5 } as any,
      {} as any,
      {} as any,
      { snapshot: { queryParamMap: { get: () => null } } } as any
    );
    component.filterStartDate = new Date(2026, 0, 1);
    component.filterEndDate = new Date(2026, 0, 4);
    component.taskData = [
      { date: '2026-01-03', status: 'Leave', leave_type: 'Casual Leave', task: 'Leave' },
      { date: '2026-01-04', day: 'Sunday', status: 'Holiday', holiday_name: 'Sunday', task: 'Work item' },
      { date: '2026-01-02', status: 'Holiday', holiday_name: 'Pongal', task: 'Holiday' }
    ];

    const rows = (component as any).getCalendarReportRows();
    expect(rows.map((row: any) => row.date)).toEqual([
      '01-01-2026', '02-01-2026', '03-01-2026', '04-01-2026'
    ]);
    expect(rows[0].statusText).toBe('Absent');
    expect(rows[1].statusText).toBe('Holiday');
    expect(rows[1].task).toBe('Holiday - Pongal');
    expect(rows[2].statusText).toBe('Leave');
    expect(rows[2].task).toBe('Leave - Casual Leave');
    expect(rows[3].statusText).toBe('Week Off');
    expect(rows[3].task).toBe('Week Off');
    expect(rows[3].day).toBe('');
    expect(rows[3].isSunday).toBeTrue();
  });

  it('marks future working days with a dash and keeps known future holidays visible', () => {
    const component = new TaskOverviewComponent(
      { getEmployeeList: () => of([]) } as any,
      { getEmpId: () => 5 } as any,
      {} as any,
      {} as any,
      { snapshot: { queryParamMap: { get: () => null } } } as any
    );
    const nextWeekday = (offset: number): Date => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      while (date.getDay() === 0) date.setDate(date.getDate() + 1);
      return date;
    };
    const workingDate = nextWeekday(1);
    const holidayDate = nextWeekday(2);
    const asYmd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    component.filterStartDate = workingDate;
    component.filterEndDate = holidayDate;

    const rows = (component as any).getCalendarReportRows([
      { date: asYmd(workingDate), status: 'Working Day', task: 'Future task', project_title: 'Project A', worked_hours: '3' },
      { date: asYmd(holidayDate), status: 'Holiday', holiday_name: 'Future Holiday' }
    ]);

    const dateKey = (date: Date) => `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
    const workingRow = rows.find((row: any) => row.date === dateKey(workingDate));
    const holidayRow = rows.find((row: any) => row.date === dateKey(holidayDate));
    expect(workingRow.statusText).toBe('-');
    expect(workingRow.isFuture).toBeTrue();
    expect(workingRow.day).toBeTruthy();
    expect(workingRow.project_title).toBe('');
    expect(workingRow.task).toBe('');
    expect(holidayRow.statusText).toBe('Holiday');
    expect(holidayRow.holiday_name).toBe('Future Holiday');
  });

  it('shows a named weekly off and marks a working day without DSR as absent', () => {
    const component = new TaskOverviewComponent(
      { getEmployeeList: () => of([]) } as any,
      { getEmpId: () => 5 } as any,
      {} as any,
      {} as any,
      { snapshot: { queryParamMap: { get: () => null } } } as any
    );
    component.filterStartDate = new Date(2026, 0, 5);
    component.filterEndDate = new Date(2026, 0, 7);

    const rows = (component as any).getCalendarReportRows([
      { date: '2026-01-05', status: 'Week Off', holiday_name: 'Company weekly off' },
      { date: '2026-01-06', status: 'Working Day', task: 'Working Day', project_title: '-', worked_hours: '-' },
      { date: '2026-01-07', status: 'Working Day', task: 'Feature work', project_title: 'Project A', worked_hours: '4' }
    ]);

    expect(rows[0].statusText).toBe('Week Off');
    expect(rows[0].holiday_name).toBe('Company weekly off');
    expect(rows[0].isWeekOff).toBeTrue();
    expect(rows[1].statusText).toBe('Absent');
    expect(rows[2].statusText).toBe('Present');
    expect(rows[2].task).toBe('Feature work');
  });

  it('loads list API data for the Excel export using the current employee and date range', () => {
    const listRequest = jasmine.createSpy('getDsrOverviewListByEmpIdNdFromToDateNdUserId').and.returnValue(of([
      { date: '2026-01-05', day: 'Monday', status: 'Holiday', holiday_name: 'Founders Day' }
    ]));
    const excelExport = jasmine.createSpy('generateDsrCalendarExcel');
    const component = new TaskOverviewComponent(
      { getEmployeeList: () => of([]), getDsrOverviewListByEmpIdNdFromToDateNdUserId: listRequest } as any,
      { getEmpId: () => 55 } as any,
      {} as any,
      { generateDsrCalendarExcel: excelExport } as any,
      { snapshot: { queryParamMap: { get: () => null } } } as any
    );
    component.selectedEmployee = { id: 7, employee_name: 'Taylor' };
    component.filterStartDate = new Date(2026, 0, 5);
    component.filterEndDate = new Date(2026, 0, 5);

    component.generateDSRExcel();

    expect(listRequest).toHaveBeenCalledWith(7, '2026-01-05', '2026-01-05', 55);
    const rows = excelExport.calls.mostRecent().args[3];
    expect(rows[0].statusText).toBe('Holiday');
    expect(rows[0].holiday_name).toBe('Founders Day');
  });
});
