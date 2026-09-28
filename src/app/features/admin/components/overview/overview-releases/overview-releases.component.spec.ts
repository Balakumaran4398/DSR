import { OverviewReleasesComponent, ReleaseStatus } from './overview-releases.component';
import { FormControl } from '@angular/forms';
import { ExcelService } from 'src/app/_core/services/excel.service';
import { PdfService } from 'src/app/_core/services/pdf.service';

describe('OverviewReleasesComponent view persistence', () => {
  let component: OverviewReleasesComponent;

  beforeEach(() => {
    sessionStorage.removeItem('overviewReleaseCurrentView');
    component = Object.create(OverviewReleasesComponent.prototype);
    component.currentView = 'table';
  });

  afterEach(() => {
    sessionStorage.removeItem('overviewReleaseCurrentView');
  });

  it('stores the selected card view for a page refresh', () => {
    component.setActiveTab('kanban');

    expect(component.currentView).toBe('kanban');
    expect(sessionStorage.getItem('overviewReleaseCurrentView')).toBe('kanban');
  });

  it('stores the selected table view for a page refresh', () => {
    (component as any).getReleaseOverviewByEmp = jasmine.createSpy('getReleaseOverviewByEmp');

    component.setActiveTab('table');

    expect(component.currentView).toBe('table');
    expect(sessionStorage.getItem('overviewReleaseCurrentView')).toBe('table');
  });

  it('restores valid views and falls back to table for an invalid value', () => {
    expect((component as any).restoreCurrentView()).toBe('table');

    sessionStorage.setItem('overviewReleaseCurrentView', 'kanban');
    expect((component as any).restoreCurrentView()).toBe('kanban');

    sessionStorage.setItem('overviewReleaseCurrentView', 'invalid');
    expect((component as any).restoreCurrentView()).toBe('table');
  });

  it('does not change the selected view when the release type changes', () => {
    component.currentView = 'kanban';
    (component as any).releaseTypeOptions = ['All', 'Internal', 'External'];
    component.releaseTypeControl = new FormControl('All');
    (component as any).resetPdfPreviewState = jasmine.createSpy('resetPdfPreviewState');
    component.applyFilters = jasmine.createSpy('applyFilters');

    component.setReleaseType('External');

    expect(component.currentView).toBe('kanban');
  });
});

describe('OverviewReleasesComponent release day status', () => {
  it('uses the same day count and color in the table and export services', () => {
    const component = Object.create(OverviewReleasesComponent.prototype) as OverviewReleasesComponent;
    const excel = new ExcelService();
    const pdf = new PdfService();
    const release = {
      released_date: '2026-09-25',
      release_transition_date: '2026-09-22',
      status_changed_date: '2026-09-24',
      status: 'In-Progress'
    };

    expect((component as any).getReleaseTableOverdue(release)).toBe('2026-09-22 (3 days before)');
    expect(component.getReleaseDisplayStatus(release as any)).toBe('In-Progress');
    expect((excel as any).getReleaseOverdueDate(release)).toBe('2026-09-22 (3 days before)');
    expect((excel as any).getReleaseOverdueStyleId(release)).toBe(11);
    expect((pdf as any).getReleaseOverdueDate(release)).toBe('2026-09-22 (3 days before)');
    expect((pdf as any).getReleaseOverdueTextColor('green')).toEqual([22, 163, 74]);
  });

  it('uses the earliest logged transition away from Upcoming', () => {
    const component = Object.create(OverviewReleasesComponent.prototype) as OverviewReleasesComponent;
    const logs = [
      { status: 'Pass', logdate: '2026-09-25' },
      { status: 'In-Progress', logdate: '2026-09-22' },
      { status: 'Upcoming-Release', logdate: '2026-09-20' },
      { status: 'Failed', logdate: '2026-09-27' }
    ];

    expect((component as any).getFirstNonUpcomingTimelineDate(logs)).toBe('2026-09-22');
  });
});

describe('OverviewReleasesComponent weekly release range', () => {
  let component: any;

  beforeEach(() => {
    component = Object.create(OverviewReleasesComponent.prototype);
    component.startDate = '2026-09-07';
    component.endDate = '2026-09-13';
    component.currentView = 'kanban';
    component.searchQuery = '';
    component.getSelectedDepartmentOption = () => ({ filter_id: 'all' });
    component.isAllDepartment = () => true;
    component.applySelectedProjectFilter = (releases: any[]) => releases;
    component.applySelectedEmployeeFilter = (releases: any[]) => releases;
    component.applySelectedReleaseTypeFilter = (releases: any[]) => releases;
  });

  it('shows a release in every week touched by its planned-to-release interval', () => {
    const release = { planned_date: '2026-09-01', released_date: '2026-09-18' };
    component.releaseList = [release];

    component.startDate = '2026-08-31';
    component.endDate = '2026-09-06';
    component.filterData();
    expect(component.filteredReleases).toEqual([release]);

    component.startDate = '2026-09-07';
    component.endDate = '2026-09-13';
    component.filterData();
    expect(component.filteredReleases).toEqual([release]);

    component.startDate = '2026-09-14';
    component.endDate = '2026-09-20';
    component.filterData();
    expect(component.filteredReleases).toEqual([release]);

    component.startDate = '2026-09-21';
    component.endDate = '2026-09-27';
    component.filterData();
    expect(component.filteredReleases).toEqual([]);
  });

  it('includes both boundary days and excludes releases outside the selected week', () => {
    component.releaseList = [
      { id: 'starts-on-sunday', planned_date: '2026-09-13', released_date: '2026-09-18' },
      { id: 'ends-on-monday', planned_date: '2026-09-01', released_date: '2026-09-07' },
      { id: 'before', planned_date: '2026-09-01', released_date: '2026-09-06' },
      { id: 'after', planned_date: '2026-09-14', released_date: '2026-09-18' }
    ];

    component.filterData();

    expect(component.filteredReleases.map((release: any) => release.id)).toEqual([
      'starts-on-sunday', 'ends-on-monday'
    ]);
  });

  it('shows Pass and Failed releases only in the range containing closed_date', () => {
    component.releaseList = [
      { id: 'pass-inside', status: 'Pass', planned_date: '2026-08-01', released_date: '2026-08-10', closed_date: '2026-09-07' },
      { id: 'failed-inside', status: 'Failed', planned_date: '2026-08-01', released_date: '2026-08-10', closedDate: '2026-09-13' },
      { id: 'pass-outside', status: 'Pass', planned_date: '2026-09-08', released_date: '2026-09-10', closed_date: '2026-09-14' },
      { id: 'failed-missing', status: 'Failed', planned_date: '2026-09-08', released_date: '2026-09-10' }
    ];

    component.filterData();

    expect(component.filteredReleases.map((release: any) => release.id)).toEqual([
      'pass-inside', 'failed-inside'
    ]);
  });

  it('requests the full timeline so adjacent weeks can see spanning releases', () => {
    component.empid = 42;
    component.projectid = 0;
    component.getSelectedEmployeeIdParam = () => 0;
    component.getSelectedDepartmentApiId = () => '';
    component.getSelectedManagerNameParam = () => '';

    const payload = component.getReleaseOverviewPayload();

    expect(payload.fromdate).toBe('1900-01-01');
    expect(payload.todate).toBe('9999-12-31');
  });
});

describe('OverviewReleasesComponent edit permissions', () => {
  let component: OverviewReleasesComponent;
  let storageService: any;
  let drawerService: jasmine.SpyObj<any>;
  let toasterService: jasmine.SpyObj<any>;

  beforeEach(() => {
    storageService = {
      roles: { isAdmin: false, isManager: false, isEmployee: true },
      getEmpId: () => 42
    };
    drawerService = jasmine.createSpyObj('DrawerService', ['open']);
    toasterService = jasmine.createSpyObj('ToasterService', ['error']);

    component = Object.create(OverviewReleasesComponent.prototype);
    (component as any).storageService = storageService;
    (component as any).drawerService = drawerService;
    (component as any).toasterService = toasterService;
    (component as any).employeeDirectory = [];
    component.employeeList = [];
    component.projectid = 10;
    component.releaseList = [];
  });

  it('allows the assigning employee to edit an upcoming release assigned to someone else', () => {
    expect(component.canEditRelease({ status: 'Upcoming-Release', assign_from: 42, assign_to: 7 })).toBeTrue();
    expect(component.canEditRelease({ status: 'Upcoming-Release', assigned_from: 42, assigned_to: 7 })).toBeTrue();
    expect(component.canEditRelease({ status: 'Upcoming-Release', assignedFromId: '42', assignedToId: 7 })).toBeTrue();
  });

  it('does not allow a different assigned-to employee to edit an upcoming release', () => {
    storageService.getEmpId = () => 7;

    expect(component.canEditRelease({ status: 'Upcoming-Release', assigned_from: 42, assigned_to: 7 })).toBeFalse();
  });

  it('allows assigned-from employees for statuses other than Upcoming-Release', () => {
    expect(component.canEditRelease({ status: 'In-Progress', assigned_from: 42, assigned_to: 7 })).toBeTrue();
    expect(component.canEditRelease({ status: 'Pass', assignedFromId: '42', assignedToId: 7 })).toBeTrue();
  });

  it('allows a self-assigned employee to edit regardless of release status', () => {
    const statuses: ReleaseStatus[] = [
      'Upcoming-Release', 'To-be-Tested', 'On-Hold', 'In-Progress', 'Rejected', 'Pass', 'Failed'
    ];

    statuses.forEach(status => {
      expect(component.canEditRelease({ status, assigned_from: 42, assigned_to: '42' }))
        .withContext(status)
        .toBeTrue();
    });
  });

  it('allows the employee assigned to the release to edit', () => {
    expect(component.canEditRelease({ assigned_to: '42' })).toBeTrue();
    expect(component.canEditRelease({ assignedToId: 42 })).toBeTrue();
  });

  it('allows managers and admins to edit regardless of assignment', () => {
    storageService.roles = { isAdmin: false, isManager: true };
    expect(component.canEditRelease({ status: 'Upcoming-Release', assigned_from: 7, assigned_to: 8 })).toBeTrue();

    storageService.roles = { isAdmin: true, isManager: false };
    expect(component.canEditRelease({ status: 'Upcoming-Release', assigned_from: 7, assigned_to: 8 })).toBeTrue();
  });

  it('denies unrelated employees and releases without assignments', () => {
    expect(component.canEditRelease({ assigned_from: 7, assigned_to: 8 })).toBeFalse();
    expect(component.canEditRelease({})).toBeFalse();

    storageService.getEmpId = () => null;
    expect(component.canEditRelease({ assigned_from: 42, assigned_to: 42 })).toBeFalse();
  });

  it('allows the assignee at every release status', () => {
    const statuses: ReleaseStatus[] = [
      'Upcoming-Release',
      'To-be-Tested',
      'On-Hold',
      'In-Progress',
      'Rejected',
      'Pass',
      'Failed'
    ];

    statuses.forEach(status => {
      expect(component.canEditRelease({ status, assigned_to: 42 })).withContext(status).toBeTrue();
      expect(component.canEditRelease({ status, assigned_from: 7, assigned_to: 8 })).withContext(status).toBeFalse();
    });
  });

  it('blocks unauthorized drawer access and shows an error', () => {
    component.openDrawer({ id: 1, status: 'Upcoming-Release', assigned_from: 7, assigned_to: 42 });

    expect(drawerService.open).not.toHaveBeenCalled();
    expect(toasterService.error).toHaveBeenCalledOnceWith('You are Not Allowed.');
  });

  it('opens the edit drawer for the assign_from employee', () => {
    component.openDrawer({ id: 1, status: 'Upcoming-Release', assign_from: 42, assign_to: 8 });

    expect(toasterService.error).not.toHaveBeenCalled();
    expect(drawerService.open).toHaveBeenCalledWith('release', jasmine.objectContaining({
      id: 1,
      mode: 'edit'
    }));
  });

  it('shows the assignee name supplied by the initial release response', () => {
    const name = (component as any).getReleaseAssigneeDisplayName({
      assigned_to: 17,
      assignee_to_name: 'Initial Assignee'
    });

    expect(name).toBe('Initial Assignee');
  });

  it('resolves the assignee after the employee directory loads', () => {
    (component as any).employeeDirectory = [
      { id: 17, employee_name: 'Directory Assignee' }
    ];

    const name = (component as any).getReleaseAssigneeDisplayName({ assigned_to: '17' });

    expect(name).toBe('Directory Assignee');
  });
});

describe('OverviewReleasesComponent Excel export', () => {
  function createComponent(allDepartments: boolean): { component: any; excelService: jasmine.SpyObj<any> } {
    const component = Object.create(OverviewReleasesComponent.prototype) as any;
    const excelService = jasmine.createSpyObj('ExcelService', ['generateReleaseOverviewExcel']);
    const reportData = [{ id: 1, project_name: 'Project A', title: 'Release A' }];

    component.excelExporting = false;
    component.startDate = '2026-09-14';
    component.endDate = '2026-09-20';
    component.selectedReleaseType = 'All';
    component.storageService = {
      getEmpName: () => 'Report User',
      getUsername: () => 'report@example.com'
    };
    component.excelService = excelService;
    component.toasterService = jasmine.createSpyObj('ToasterService', ['error']);
    component.getReleaseOverviewListByEmp = (success: Function) => success(reportData);
    component.getReportableReleases = (data: any[], success: Function) => success(data);
    component.getSelectedProjectNameLabel = () => 'All Projects';
    component.getSelectedDepartmentOption = () => ({
      filter_id: allDepartments ? 'all' : '2',
      department_name: allDepartments ? 'All' : 'Software'
    });
    component.isAllDepartment = () => allDepartments;
    component.getSelectedDepartmentLabel = () => allDepartments ? 'All Departments' : 'Software';
    component.getSelectedManagerNameLabel = () => allDepartments ? 'All Managers' : 'Software Manager';
    component.buildReleaseOverviewExportSections = () => [{
      departmentName: 'Software',
      managerName: 'Software Manager',
      releases: reportData
    }];

    return { component, excelService };
  }

  it('uses the flat workbook for the default All department selection', () => {
    const { component, excelService } = createComponent(true);

    component.generateReleaseOverviewExcel();

    const filters = excelService.generateReleaseOverviewExcel.calls.mostRecent().args[0];
    expect(filters.departmentWiseReleaseReport).toBeFalse();
    expect(filters.departmentSections).toEqual([]);
  });

  it('keeps the department-wise workbook for a selected department', () => {
    const { component, excelService } = createComponent(false);

    component.generateReleaseOverviewExcel();

    const filters = excelService.generateReleaseOverviewExcel.calls.mostRecent().args[0];
    expect(filters.departmentWiseReleaseReport).toBeTrue();
    expect(filters.departmentSections).toEqual([jasmine.objectContaining({
      departmentName: 'Software'
    })]);
  });
});
