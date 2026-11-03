import { FormControl } from '@angular/forms';
import { BehaviorSubject, NEVER, of, Subject } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { NotSendDsrComponent } from './not-send-dsr.component';

describe('Not Send DSR initial loading', () => {
  const paramMap = (values: Record<string, string | null> = {}) => ({
    get: (key: string) => values[key] ?? null
  });

  function createComponent(): any {
    const component = Object.create(NotSendDsrComponent.prototype) as any;
    component.destroyed = false;
    component.empid = 42;
    component.selected_emp_id = null;
    component.requestedEmployeeId = null;
    component.startDate = null;
    component.endDate = null;
    component.datesInitialized = false;
    component.navigationInitialized = false;
    component.notSentDsrRequestVersion = 0;
    component.activeNotSentDsrRequestKey = null;
    component.loadedNotSentDsrRequestKey = null;
    component.tableData = [];
    component.allEmployeesValue = '__all_employees__';
    component.myControl = new FormControl('');
    component.authService = jasmine.createSpyObj('AuthService', ['getNotsendTasks']);
    component.authService.getNotsendTasks.and.returnValue(NEVER);
    component.toasterService = jasmine.createSpyObj('ToasterService', ['error']);
    component.notificationNavigationService = {
      context$: of(null),
      consumePendingNavigationContext: jasmine.createSpy('consumePendingNavigationContext').and.returnValue(null)
    };
    component.route = {
      paramMap: of(paramMap()),
      queryParamMap: of(paramMap())
    };
    return component;
  }

  it('extracts DSR rows from supported nested API response shapes', () => {
    const component = createComponent();
    const rows = [{ employee_id: 19, date: '2026-09-12' }];

    expect(component.extractNotSentDsrRows(rows)).toEqual(rows);
    expect(component.extractNotSentDsrRows({ data: { rows } })).toEqual(rows);
    expect(component.extractNotSentDsrRows({ result: { results: rows } })).toEqual(rows);
    expect(component.extractNotSentDsrRows({ data: { count: 0 } })).toEqual([]);
  });

  it('loads the current week immediately when the route has no date range', () => {
    const component = createComponent();
    const week = component.getCurrentWeekRange();

    component.initializeDatesFromQueryParams();

    expect(component.startDate).toBe(week.startDate);
    expect(component.endDate).toBe(week.endDate);
    expect(component.datesInitialized).toBeTrue();
    expect(component.authService.getNotsendTasks).toHaveBeenCalledOnceWith({
      employee_id: 42,
      selected_employee_id: '0',
      fromdate: week.startDate,
      todate: week.endDate
    }, true);
  });

  it('keeps route dates authoritative over the current-week default', () => {
    const component = createComponent();
    component.route.queryParamMap = of(paramMap({
      startDate: '2026-09-01',
      endDate: '2026-09-07'
    }));

    component.initializeDatesFromQueryParams();

    expect(component.startDate).toBe('2026-09-01');
    expect(component.endDate).toBe('2026-09-07');
    expect(component.authService.getNotsendTasks).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        fromdate: '2026-09-01',
        todate: '2026-09-07'
      }),
      true
    );
  });

  it('ignores a previous notification employee and date on a later page visit', () => {
    const component = createComponent();
    const week = component.getCurrentWeekRange();
    component.route.paramMap = of(paramMap({ employeeId: '19' }));
    component.route.queryParamMap = of(paramMap({
      startDate: '2026-09-12',
      endDate: '2026-09-12',
      fromdate: '2026-09-12',
      todate: '2026-09-12',
      requestId: '501'
    }));

    component.initializeDatesFromQueryParams();

    expect(component.startDate).toBe(week.startDate);
    expect(component.endDate).toBe(week.endDate);
    expect(component.requestedEmployeeId).toBeNull();
    expect(component.requestedHighlightId).toBeNull();
    expect(component.authService.getNotsendTasks).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ fromdate: week.startDate, todate: week.endDate }),
      true
    );
  });

  it('keeps all employees selected, fetches only the notification date, and highlights its employee', () => {
    const component = createComponent();
    const context = {
      category: 'not-send-dsr', targetId: '19', targetLabel: 'Jane Doe',
      targetDate: '2026-09-12', startDate: '2026-09-01', endDate: '2026-09-30', createdAt: 1
    };
    component.selected_emp_id = 42;
    component.selectedEmployeeName = 'Current Employee';
    component.myControl.setValue({ employee_id: 42, employee_name: 'Current Employee' });
    component.route.paramMap = of(paramMap({ employeeId: '19' }));
    component.notificationNavigationService = {
      context$: of(context),
      consumePendingNavigationContext: jasmine.createSpy('consumePendingNavigationContext').and.returnValue(context)
    };
    component.ensureNotificationTable = jasmine.createSpy('ensureNotificationTable');

    component.initializeDatesFromQueryParams();

    expect(component.selected_emp_id).toBeNull();
    expect(component.selectedEmployeeName).toBeNull();
    expect(component.myControl.value).toBe(component.allEmployeesValue);
    expect(component.requestedEmployeeId).toBe('19');
    expect(component.requestedEmployeeName).toBe('Jane Doe');
    expect(component.startDate).toBe('2026-09-12');
    expect(component.endDate).toBe('2026-09-12');
    expect(component.authService.getNotsendTasks).toHaveBeenCalledOnceWith({
      employee_id: 42,
      selected_employee_id: '0',
      fromdate: '2026-09-12',
      todate: '2026-09-12'
    }, true);
  });

  it('forces a new request for a later click on the same notification target', () => {
    const component = createComponent();
    const firstContext = {
      category: 'not-send-dsr', targetId: '19', targetLabel: 'Jane Doe',
      targetDate: '2026-09-12', startDate: '2026-09-01', endDate: '2026-09-30', createdAt: 1
    };
    const contextSubject = new BehaviorSubject(firstContext);
    let pendingContext: any = firstContext;
    component.route.paramMap = of(paramMap({ employeeId: '19' }));
    component.notificationNavigationService = {
      context$: contextSubject.asObservable(),
      consumePendingNavigationContext: jasmine.createSpy('consumePendingNavigationContext').and.callFake(() => {
        const pending = pendingContext;
        pendingContext = null;
        return pending;
      })
    };
    component.ensureNotificationTable = jasmine.createSpy('ensureNotificationTable');
    component.getNotsendTasksOverview = jasmine.createSpy('getNotsendTasksOverview');

    component.initializeDatesFromQueryParams();
    pendingContext = { ...firstContext, createdAt: 2 };
    contextSubject.next({ ...firstContext, createdAt: 2 });

    expect(component.getNotsendTasksOverview).toHaveBeenCalledTimes(2);
    expect(component.getNotsendTasksOverview).toHaveBeenCalledWith(true);
    expect(component.getNotsendTasksOverview.calls.argsFor(1)).toEqual([true]);
  });

  it('does not duplicate the initial request when the date filter emits the same range', () => {
    const component = createComponent();
    component.startDate = '2026-09-29';
    component.endDate = '2026-09-29';
    component.datesInitialized = true;

    component.getNotsendTasksOverview();
    component.onRangeChange({
      startDate: new Date(2026, 8, 29),
      endDate: new Date(2026, 8, 29)
    });

    expect(component.authService.getNotsendTasks).toHaveBeenCalledTimes(1);
  });

  it('shows the first cached response and accepts the later fresh response', () => {
    const component = createComponent();
    const response = new Subject<any>();
    component.startDate = '2026-09-29';
    component.endDate = '2026-09-29';
    component.authService.getNotsendTasks.and.returnValue(response);

    component.getNotsendTasksOverview();
    expect(component.notSentDsrLoading).toBeTrue();

    response.next([{ date: '2026-09-29', employee_name: 'Cached Employee' }]);
    expect(component.notSentDsrLoading).toBeFalse();
    expect(component.tableData[0].employee_name).toBe('Cached Employee');

    response.next([{ date: '2026-09-29', employee_name: 'Fresh Employee' }]);
    expect(component.tableData[0].employee_name).toBe('Fresh Employee');
  });

  it('normalizes rejection reason aliases returned for employee, manager, and admin rows', () => {
    const reasonAliases = ['rejection_reason', 'rejectionReason', 'decision_reason', 'decisionReason', 'reject_reason', 'remarks'];

    reasonAliases.forEach(alias => {
      const component = createComponent();
      component.startDate = '2026-09-29';
      component.endDate = '2026-09-29';
      component.authService.getNotsendTasks.and.returnValue(of([{
        employee_id: 42,
        date: '2026-09-29',
        request_status: 'REJECTED',
        [alias]: `Reason from ${alias}`
      }]));

      component.getNotsendTasksOverview(true);

      expect(component.tableData[0].rejection_reason).toBe(`Reason from ${alias}`);
    });
  });

  it('keeps all target-date rows when fresh data replaces an empty cached response', () => {
    const component = createComponent();
    const response = new Subject<any>();
    component.startDate = '2026-09-12';
    component.endDate = '2026-09-12';
    component.selected_emp_id = null;
    component.selectedEmployeeName = null;
    component.requestedEmployeeId = '19';
    component.requestedDate = '2026-09-12';
    component.authService.getNotsendTasks.and.returnValue(response);

    component.getNotsendTasksOverview(true);
    response.next([]);
    expect(component.tableData).toEqual([]);

    response.next([
      { employee_id: 19, employee_name: 'Jane Doe', date: '2026-09-12' },
      { employee_id: 20, employee_name: 'Other Employee', date: '2026-09-12' },
      { employee_id: 21, employee_name: 'Different Day', date: '2026-09-13' }
    ]);

    expect(component.tableData.map((row: any) => row.employee_id)).toEqual([19, 20]);
    expect(component.authService.getNotsendTasks.calls.mostRecent().args[0].selected_employee_id).toBe('0');
  });

  it('defaults Hardware and Headend to the signed-in employee ID in the API filter', () => {
    [4, 6].forEach(departmentId => {
      const component = createComponent();
      component.empid = 42;
      component.storageService = {
        getUser: () => ({ department_id: departmentId }),
        getDept: () => departmentId === 4 ? 'Hardware' : 'Headend',
        getEmpName: () => 'Current Employee'
      };
      component.startDate = '2026-09-12';
      component.endDate = '2026-09-12';

      component.initializeDepartmentDefaultEmployee();
      component.getNotsendTasksOverview();

      expect(component.selected_emp_id).toBe(42);
      expect(component.myControl.value).toEqual({ employee_id: 42, employee_name: 'Current Employee' });
      expect(component.authService.getNotsendTasks.calls.mostRecent().args[0].selected_employee_id).toBe(42);
    });
  });

  it('keeps the default selected employee ID at zero outside Hardware and Headend', () => {
    const component = createComponent();
    component.storageService = {
      getUser: () => ({ department_id: 1 }),
      getDept: () => 'Software Development Team',
      getEmpName: () => 'Current Employee'
    };
    component.startDate = '2026-09-12';
    component.endDate = '2026-09-12';

    component.initializeDepartmentDefaultEmployee();
    component.getNotsendTasksOverview();

    expect(component.selected_emp_id).toBeNull();
    expect(component.authService.getNotsendTasks.calls.mostRecent().args[0].selected_employee_id).toBe('0');
  });

  it('allows the same request to retry after an initial API failure', () => {
    const component = createComponent();
    const firstResponse = new Subject<any>();
    component.startDate = '2026-09-29';
    component.endDate = '2026-09-29';
    component.authService.getNotsendTasks.and.returnValues(firstResponse, NEVER);

    component.getNotsendTasksOverview();
    firstResponse.error({ error: { message: 'Failed' } });
    component.getNotsendTasksOverview();

    expect(component.authService.getNotsendTasks).toHaveBeenCalledTimes(2);
    expect(component.notSentDsrLoading).toBeTrue();
  });

  it('forces a fresh request after a workflow mutation', () => {
    const component = createComponent();
    component.startDate = '2026-09-29';
    component.endDate = '2026-09-29';
    component.loadedNotSentDsrRequestKey = JSON.stringify([42, '0', '2026-09-29', '2026-09-29']);

    component.getNotsendTasksOverview(true);

    expect(component.authService.getNotsendTasks).toHaveBeenCalledOnceWith(
      jasmine.any(Object),
      true
    );
  });

  it('keeps workflow refresh silent and calls completion after fresh data arrives', () => {
    const component = createComponent();
    const response = new Subject<any>();
    const onComplete = jasmine.createSpy('onComplete');
    component.startDate = '2026-09-29';
    component.endDate = '2026-09-29';
    component.authService.getNotsendTasks.and.returnValue(response);

    component.getNotsendTasksOverview(true, { showPageLoading: false, onComplete });

    expect(component.notSentDsrLoading).toBeFalse();
    expect(onComplete).not.toHaveBeenCalled();
    response.next([{ employee_id: 42, date: '2026-09-29', request_status: 'PENDING' }]);
    expect(component.tableData[0].request_status).toBe('PENDING');
    expect(onComplete).not.toHaveBeenCalled();

    response.complete();

    expect(component.notSentDsrLoading).toBeFalse();
    expect(onComplete).toHaveBeenCalledOnceWith();
  });

  it('retains optimistic table data and completes a silent refresh after API failure', () => {
    const component = createComponent();
    const response = new Subject<any>();
    const onComplete = jasmine.createSpy('onComplete');
    const optimisticRow = { employee_id: 42, date: '2026-09-29', request_status: 'PENDING' };
    component.startDate = '2026-09-29';
    component.endDate = '2026-09-29';
    component.tableData = [optimisticRow];
    component.authService.getNotsendTasks.and.returnValue(response);

    component.getNotsendTasksOverview(true, { showPageLoading: false, onComplete });
    response.error({ error: { message: 'Refresh failed' } });

    expect(component.tableData).toEqual([optimisticRow]);
    expect(component.notSentDsrLoading).toBeFalse();
    expect(onComplete).toHaveBeenCalledOnceWith();
    expect(component.toasterService.error).toHaveBeenCalledWith('Refresh failed');
  });
});

describe('AuthService Not Send DSR caching', () => {
  let http: jasmine.SpyObj<any>;
  let service: AuthService;
  const payload = {
    employee_id: 42,
    selected_employee_id: 0,
    fromdate: '2026-09-29',
    todate: '2026-09-29'
  };

  beforeEach(() => {
    localStorage.clear();
    http = jasmine.createSpyObj('HttpClient', ['get']);
    service = new AuthService(http, {} as any, {} as any, {} as any);
  });

  afterEach(() => localStorage.clear());

  it('emits cached rows first and then refreshes from the API', () => {
    const cacheKey = `dsr-api-cache:v1:not-send-dsr:${encodeURIComponent(JSON.stringify([
      42, 0, '2026-09-29', '2026-09-29'
    ]))}`;
    localStorage.setItem(cacheKey, JSON.stringify({
      value: [{ employee_name: 'Cached Employee' }]
    }));
    http.get.and.returnValue(of([{ employee_name: 'Fresh Employee' }]));
    const emissions: any[] = [];

    service.getNotsendTasks(payload).subscribe(value => emissions.push(value));

    expect(emissions).toEqual([
      [{ employee_name: 'Cached Employee' }],
      [{ employee_name: 'Fresh Employee' }]
    ]);
    expect(http.get.calls.mostRecent().args[1].headers.get('X-Skip-Loader')).toBe('true');
  });

  it('bypasses cached emission when force refresh is requested', () => {
    http.get.and.returnValue(of([{ employee_name: 'Fresh Employee' }]));
    const emissions: any[] = [];

    service.getNotsendTasks(payload, true).subscribe(value => emissions.push(value));

    expect(emissions).toEqual([[{ employee_name: 'Fresh Employee' }]]);
    expect(http.get.calls.mostRecent().args.length).toBe(1);
  });
});
