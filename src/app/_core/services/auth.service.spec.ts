import { of } from 'rxjs';
import { AuthService } from './auth.service';

describe('AuthService dashboard endpoints', () => {
  let http: jasmine.SpyObj<any>;
  let service: AuthService;

  beforeEach(() => {
    http = jasmine.createSpyObj('HttpClient', ['get']);
    http.get.and.returnValue(of({}));
    service = new AuthService(
      http,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('uses the general dashboard endpoint without department or manager parameters', () => {
    service.getDashboardDetailsByEmployeeId(987654, 0, '2026-09-01', '2026-09-07').subscribe();

    const url = http.get.calls.mostRecent().args[0] as string;
    expect(url).toContain('/common/dashboarddetails?');
    expect(url).toContain('employee_id=987654');
    expect(url).toContain('project_id=0');
    expect(url).toContain('fromDate=2026-09-01');
    expect(url).toContain('toDate=2026-09-07');
    expect(url).not.toContain('department_id=');
    expect(url).not.toContain('manager_name=');
  });

  it('uses the department-wise endpoint with the department parameter', () => {
    service.getDashboardDetailsByEmployeeIdDeptwise(
      987655,
      0,
      '2026-09-01',
      '2026-09-07',
      'Software & QA'
    ).subscribe();

    const url = http.get.calls.mostRecent().args[0] as string;
    expect(url).toContain('/common/dashboarddetails_deptwise?');
    expect(url).toContain('employee_id=987655');
    expect(url).toContain('project_id=0');
    expect(url).toContain('fromDate=2026-09-01');
    expect(url).toContain('toDate=2026-09-07');
    expect(url).toContain('department_id=Software%20%26%20QA');
    expect(url).not.toContain('manager_name=');
  });

  it('uses one comma-separated department value for a grouped dashboard request', () => {
    service.getDashboardDetailsByEmployeeIdDeptwise(
      987655,
      0,
      '2026-09-01',
      '2026-09-07',
      [1, 2, 3]
    ).subscribe();

    const url = http.get.calls.mostRecent().args[0] as string;
    expect(url).toContain('department_id=1,2,3');
  });

  it('serializes scalar, zero, and multiple department values for release overview requests', () => {
    const createPayload = (departmentId: number | number[]) => ({
      employee_id: 987656,
      projectid: 0,
      fromdate: '2026-09-01',
      todate: '2026-09-07',
      department_id: departmentId
    });

    service.getReleaseOverviewListByEmp(createPayload(0)).subscribe();
    expect(http.get.calls.mostRecent().args[0]).toContain('department_id=0');

    service.getReleaseOverviewListByEmp(createPayload(1)).subscribe();
    expect(http.get.calls.mostRecent().args[0]).toContain('department_id=1');

    service.getReleaseOverviewListByEmp(createPayload([1, 2, 3])).subscribe();
    expect(http.get.calls.mostRecent().args[0]).toContain('department_id=1,2,3');
  });

  it('refreshes notifications using the active notification date range by default', () => {
    const activeRange = {
      preset: 'weekly' as const,
      startDate: '2026-09-07',
      endDate: '2026-09-13',
      label: 'Weekly'
    };
    (service as any).notificationDateRangeService = { currentRange: activeRange };
    const requestNotificationCount = spyOn<any>(service, 'requestNotificationCount');

    service.refreshNotificationCount();

    expect(requestNotificationCount).toHaveBeenCalledOnceWith(activeRange, true);
  });
});
