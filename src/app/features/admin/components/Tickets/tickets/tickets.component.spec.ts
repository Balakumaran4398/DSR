import { of, Subject } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { TicketsComponent } from './tickets.component';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { ExcelService } from 'src/app/_core/services/excel.service';
import { PdfService } from 'src/app/_core/services/pdf.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

describe('TicketsComponent overall ticket scope and exports', () => {
  function createComponent(
    roles = { isAdmin: true, isManager: false, isEmployee: false },
    authOverrides: Record<string, any> = {}
  ): {
    component: TicketsComponent;
    authService: any;
    pdfService: jasmine.SpyObj<PdfService>;
    excelService: jasmine.SpyObj<ExcelService>;
  } {
    const authService = {
      getAllTickets: jasmine.createSpy('getAllTickets').and.returnValue(of([])),
      getTicketReportByDept: jasmine.createSpy('getTicketReportByDept').and.returnValue(of([])),
      getEmployeeList: jasmine.createSpy('getEmployeeList').and.returnValue(of([])),
      getEmployeeListByDepartment: jasmine.createSpy('getEmployeeListByDepartment').and.returnValue(of([])),
      getAllDepartments: jasmine.createSpy('getAllDepartments').and.returnValue(of([])),
      ...authOverrides
    };
    const storageService = {
      roles,
      getDept: () => 'Hardware',
      getUser: () => ({
        empid: 'EMP-8',
        employee_name: 'Signed In Employee',
        department_id: 8,
        department_name: 'Hardware'
      }),
      getEmpId: () => 'EMP-8',
      getUserId: () => 18,
      getEmpName: () => 'Signed In Employee',
      getUsername: () => 'signed.in',
      getRoleNames: () => roles.isAdmin
        ? ['ROLE_ADMIN']
        : roles.isManager
          ? ['ROLE_MANAGER']
          : ['ROLE_EMPLOYEE']
    };
    const pdfService = jasmine.createSpyObj<PdfService>('PdfService', ['generateTicketsPDF']);
    const excelService = jasmine.createSpyObj<ExcelService>('ExcelService', ['generateTableWorkbookExcel']);
    const toasterService = jasmine.createSpyObj<ToasterService>('ToasterService', ['success', 'error']);
    const drawerService = { drawerAction$: of(null) };
    const route = {
      snapshot: { queryParams: {} },
      queryParams: of({})
    };

    const component = new TicketsComponent(
      drawerService as unknown as DrawerService,
      authService as unknown as AuthService,
      toasterService,
      storageService as StorageService,
      pdfService,
      excelService,
      route as ActivatedRoute
    );

    component.isRaisedTickets = false;
    component.empId = 'EMP-8';
    component.userId = 18;
    component.startDate = '2026-09-01';
    component.endDate = '2026-09-30';

    return { component, authService, pdfService, excelService };
  }

  it('keeps admins on all departments by default while allowing department selection', () => {
    const { component } = createComponent();
    component.departments = [
      { filter_id: '7', id: 7, department_name: 'SQA' },
      { filter_id: '8', id: 8, department_name: 'Hardware' }
    ];

    (component as any).selectDefaultDepartment();

    expect(component.canSelectDepartment).toBeTrue();
    expect(component.canSelectEmployee).toBeTrue();
    expect(component.selectedDepartmentId).toBe('');
  });

  it('fixes managers to their department but keeps employee selection enabled', () => {
    const { component } = createComponent({ isAdmin: false, isManager: true, isEmployee: false });
    const departments = (component as any).getLoggedInDepartments([
      { filter_id: '7', id: 7, department_name: 'SQA' },
      { filter_id: '8', id: 8, department_name: 'Hardware' }
    ]);

    expect(component.canSelectDepartment).toBeFalse();
    expect(component.canSelectEmployee).toBeTrue();
    expect(departments.map((department: any) => department.department_name)).toEqual(['Hardware']);
  });

  it('locks employee users to their own department and employee scope', () => {
    const { component } = createComponent({ isAdmin: false, isManager: false, isEmployee: true });
    (component as any).apiEmployees = [];
    (component as any).ensureLoggedInEmployeeOption();
    (component as any).refreshEmployeeOptions();

    expect(component.canSelectDepartment).toBeFalse();
    expect(component.canSelectEmployee).toBeFalse();
    expect(component.selectedEmployeeId).toBe('EMP-8');
  });

  it('shows managers only their department tickets and preserves both assignment names', () => {
    const { component } = createComponent({ isAdmin: false, isManager: true, isEmployee: false });
    component.departments = [{ filter_id: '8', id: 8, department_name: 'Hardware' }];
    component.selectedDepartmentId = '8';
    (component as any).apiEmployees = [
      { id: 'EMP-8', employee_id: 'EMP-8', employee_name: 'Engineer' },
      { id: 'EMP-9', employee_id: 'EMP-9', employee_name: 'Manager' }
    ];
    component.allTickets = (component as any).normalizeTicketRows([
      { code: 'HW-1', department_id: 8, assigned_from: 'EMP-9', assigned_from_name: 'Manager', assigned_to: 'EMP-8', assigned_to_name: 'Engineer' },
      { code: 'HW-ASSIGNED', assigned_from: 'EMP-9', assigned_to: 'EMP-8' },
      { code: 'SQA-1', department_id: 7, assigned_from: 'EMP-100', assigned_to: 'EMP-101' }
    ]);

    (component as any).applyFilters();

    expect(component.tickets.map((ticket: any) => ticket.code)).toEqual(['HW-1', 'HW-ASSIGNED']);
    expect(component.tickets[0].assigned_from_name).toBe('Manager');
    expect(component.tickets[0].assigned_to_name).toBe('Engineer');
  });

  it('resolves manager Assigned From and Assigned To IDs to department employee names', () => {
    const employees = [
      { id: 'EMP-9', employee_name: 'Department Manager' },
      { id: 'EMP-10', employee_name: 'Department Engineer' }
    ];
    const getEmployeeListByDepartment = jasmine.createSpy('getEmployeeListByDepartment').and.returnValue(of(employees));
    const { component } = createComponent(
      { isAdmin: false, isManager: true, isEmployee: false },
      { getEmployeeListByDepartment }
    );
    component.allTickets = (component as any).normalizeTicketRows([{
      code: 'HW-1',
      department_id: 8,
      assigned_from: 'EMP-9',
      assigned_to: 'EMP-10'
    }]);

    (component as any).getEmployees(8);

    expect(getEmployeeListByDepartment).toHaveBeenCalledWith(8);
    expect(component.allTickets[0].assigned_from_name).toBe('Department Manager');
    expect(component.allTickets[0].assigned_to_name).toBe('Department Engineer');
  });

  it('shows employee tickets where they are either assigner or assignee', () => {
    const { component } = createComponent({ isAdmin: false, isManager: false, isEmployee: true });
    component.employees = [{ filter_id: 'EMP-8', employee_name: 'Signed In Employee' }];
    component.selectedEmployeeId = 'EMP-8';
    component.allTickets = (component as any).normalizeTicketRows([
      { code: 'ASSIGNED-TO', assigned_from: 'EMP-9', assigned_from_name: 'Colleague', assigned_to: 'EMP-8', assigned_to_name: 'Signed In Employee' },
      { code: 'ASSIGNED-FROM', assigned_from: 'EMP-8', assigned_from_name: 'Signed In Employee', assigned_to: 'EMP-9', assigned_to_name: 'Colleague' },
      { code: 'UNRELATED', assigned_from: 'EMP-9', assigned_to: 'EMP-10' }
    ]);

    (component as any).applyFilters();

    expect(component.tickets.map((ticket: any) => ticket.code)).toEqual(['ASSIGNED-TO', 'ASSIGNED-FROM']);
  });

  it('prevents overlapping exports and generates one file from one response', () => {
    const response = new Subject<any[]>();
    const getAllTickets = jasmine.createSpy('getAllTickets').and.returnValue(response);
    const { component, pdfService, excelService } = createComponent(undefined, { getAllTickets });

    component.generateTicketsPdf();
    component.generateTicketsExcel();
    expect(component.ticketPdfExporting).toBeTrue();
    expect(getAllTickets).toHaveBeenCalledTimes(1);

    response.next([{ code: 'CACHED', ticket_name: 'Cached ticket', assigned_from_name: 'Old assigner', assigned_to_name: 'Old assignee' }]);
    expect(pdfService.generateTicketsPDF).not.toHaveBeenCalled();

    response.next([{ code: 'FRESH', ticket_name: 'Fresh ticket', assigned_from_name: 'Assigner', assigned_to_name: 'Assignee' }]);
    response.complete();

    expect(pdfService.generateTicketsPDF).toHaveBeenCalledTimes(1);
    expect(pdfService.generateTicketsPDF.calls.mostRecent().args[3].map((ticket: any) => ticket.code)).toEqual(['FRESH']);
    expect(excelService.generateTableWorkbookExcel).not.toHaveBeenCalled();
    expect(component.ticketPdfExporting).toBeFalse();
  });

  it('uses only overall tickets for a filtered department PDF and creates a department filename', () => {
    const rows = [
      {
        code: 'MATCH-1',
        ticket_name: 'Matching ticket',
        department_id: 8,
        department_name: 'Hardware',
        assigned_to: 'EMP-8',
        assigned_to_name: 'Signed In Employee',
        status: 0,
        created_date: '2026-09-10T09:30:00'
      },
      {
        code: 'OTHER-1',
        ticket_name: 'Other ticket',
        department_id: 7,
        department_name: 'SQA',
        assigned_to: 'EMP-7',
        assigned_to_name: 'Other Employee',
        status: 0,
        created_date: '2026-09-10T10:30:00'
      }
    ];
    const getAllTickets = jasmine.createSpy('getAllTickets').and.returnValue(of(rows));
    const { component, authService, pdfService } = createComponent(undefined, { getAllTickets });
    component.departments = [{ filter_id: '8', id: 8, department_name: 'Hardware' }];
    component.employees = [{ filter_id: 'EMP-8', employee_name: 'Signed In Employee' }];
    component.selectedDepartmentId = '8';
    component.selectedEmployeeId = 'EMP-8';
    component.statusList = [{ id: 0, name: 'Open' }];
    component.selectedStatus = 'Open';
    component.searchTerm = 'matching';

    component.generateTicketsPdf();

    expect(authService.getTicketReportByDept).not.toHaveBeenCalled();
    expect(getAllTickets).toHaveBeenCalledWith('EMP-8', 18, '2026-09-01', '2026-09-30');
    expect(pdfService.generateTicketsPDF).toHaveBeenCalled();
    const [filters, , , exportedRows] = pdfService.generateTicketsPDF.calls.mostRecent().args;
    expect(filters.reportTitle).toBe('Hardware Tickets');
    expect(filters.filename).toBe('HARDWARE_TICKETS_2026-09-01_to_2026-09-30.pdf');
    expect(exportedRows.map((ticket: any) => ticket.code)).toEqual(['MATCH-1']);
  });

  it('creates an all-departments Excel workbook with the ticket report columns', () => {
    const getAllTickets = jasmine.createSpy('getAllTickets').and.returnValue(of([{
      code: 'ALL-1',
      ticket_name: 'All departments ticket',
      department_name: 'Hardware',
      assigned_to_name: 'Signed In Employee',
      status: 'Open',
      created_date: '2026-09-12T09:30:00'
    }]));
    const { component, authService, excelService } = createComponent(undefined, { getAllTickets });
    component.selectedDepartmentId = '';
    component.startDate = '2026-09-02';
    component.endDate = '2026-09-15';

    component.generateTicketsExcel();

    expect(authService.getTicketReportByDept).not.toHaveBeenCalled();
    expect(excelService.generateTableWorkbookExcel).toHaveBeenCalled();
    const [options, sections] = excelService.generateTableWorkbookExcel.calls.mostRecent().args;
    expect(options.workbookTitle).toBe('All Departments Tickets');
    expect(options.filename).toBe('ALL_DEPARTMENTS_TICKETS_2026-09-02_to_2026-09-15.xlsx');
    expect(sections[0].headers).toEqual([
      'S.No', 'Date', 'Day', 'Code', 'Ticket', 'Client', 'Product', 'Department',
      'Assigned From', 'Assigned To', 'Remarks', 'Worked Hrs', 'Entry Date', 'Status'
    ]);
  });
  it('expands a month preset to the full calendar month for PDF summary export', () => {
    const rows = [
      { code: 'SEP-1', ticket_name: 'First', status: 0, created_date: '2026-09-02T09:00:00' },
      { code: 'SEP-2', ticket_name: 'Second', status: 4, created_date: '2026-09-20T09:00:00' }
    ];
    const getAllTickets = jasmine.createSpy('getAllTickets').and.returnValue(of(rows));
    const { component, pdfService } = createComponent(undefined, { getAllTickets });
    component.onRangeChange({
      startDate: new Date(2026, 8, 1),
      endDate: new Date(2026, 8, 15),
      preset: 'This Month'
    });
    getAllTickets.calls.reset();

    component.generateTicketsPdf();

    expect(getAllTickets).toHaveBeenCalledWith('EMP-8', 18, '2026-09-01', '2026-09-30');
    const [filters, fromDate, toDate, exportedRows] = pdfService.generateTicketsPDF.calls.mostRecent().args;
    expect(filters.monthlySummary).toBeTrue();
    expect(filters.monthLabel).toBe('September 2026');
    expect(filters.filename).toBe('ALL_DEPARTMENTS_TICKETS_2026-09-01_to_2026-09-30.pdf');
    expect(fromDate).toBe('2026-09-01');
    expect(toDate).toBe('2026-09-30');
    expect(exportedRows.length).toBe(2);
  });

  it('keeps the detailed Excel format and exact selected dates for a full calendar month', () => {
    const rows = [
      { code: 'MATCH-1', ticket_name: 'Matching ticket', status: 0, created_date: '2026-09-02T09:00:00' },
      { code: 'OTHER-1', ticket_name: 'Other ticket', status: 0, created_date: '2026-09-03T09:00:00' }
    ];
    const getAllTickets = jasmine.createSpy('getAllTickets').and.returnValue(of(rows));
    const { component, excelService } = createComponent(undefined, { getAllTickets });
    component.searchTerm = 'matching';

    component.generateTicketsExcel();

    expect(getAllTickets).toHaveBeenCalledWith('EMP-8', 18, '2026-09-01', '2026-09-30');
    const [options, sections] = excelService.generateTableWorkbookExcel.calls.mostRecent().args;
    expect(options.fromDate).toBe('2026-09-01');
    expect(options.toDate).toBe('2026-09-30');
    expect(sections[0].sheetName).toBe('Tickets');
    expect(sections[0].highlightSundayRows).toBeTrue();
    expect(sections[0].headers).toEqual([
      'S.No', 'Date', 'Day', 'Code', 'Ticket', 'Client', 'Product', 'Department',
      'Assigned From', 'Assigned To', 'Remarks', 'Worked Hrs', 'Entry Date', 'Status'
    ]);
    expect(sections[0].rows.length).toBe(30);
    expect(sections[0].rows[0]).toEqual([
      1, '01-09-2026', 'TUE', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'
    ]);
    expect(sections[0].rows[1][1]).toBe('02-09-2026');
    expect(sections[0].rows[1][3]).toBe('MATCH-1');
    expect(sections[0].rows[29][1]).toBe('30-09-2026');
    expect(sections[0].summary).toContain(['Total Tickets', 1]);
  });

  it('keeps the selected month-to-date range for Excel without expanding it', () => {
    const getAllTickets = jasmine.createSpy('getAllTickets').and.returnValue(of([{
      code: 'MONTH-TO-DATE',
      ticket_name: 'Month-to-date ticket',
      status: 0,
      created_date: '2026-09-10T09:00:00'
    }]));
    const { component, excelService } = createComponent(undefined, { getAllTickets });
    component.startDate = '2026-09-01';
    component.endDate = '2026-09-15';
    (component as any).ticketRangePreset = 'This Month';

    component.generateTicketsExcel();

    expect(getAllTickets).toHaveBeenCalledWith('EMP-8', 18, '2026-09-01', '2026-09-15');
    const [options, sections] = excelService.generateTableWorkbookExcel.calls.mostRecent().args;
    expect(options.fromDate).toBe('2026-09-01');
    expect(options.toDate).toBe('2026-09-15');
    expect(sections[0].sheetName).toBe('Tickets');
    expect(sections[0].headers[0]).toBe('S.No');
    expect(sections[0].headers[1]).toBe('Date');
    expect(sections[0].rows.length).toBe(15);
    expect(sections[0].rows[0][1]).toBe('01-09-2026');
    expect(sections[0].rows[14][1]).toBe('15-09-2026');
  });

  it('keeps partial custom ranges in detailed export mode', () => {
    const { component } = createComponent();
    component.startDate = '2026-09-02';
    component.endDate = '2026-09-15';
    (component as any).ticketRangePreset = 'Custom';

    expect((component as any).resolveTicketExportRange()).toEqual({
      startDate: '2026-09-02',
      endDate: '2026-09-15',
      monthlySummary: false,
      monthLabel: ''
    });
  });

  it('does not generate a monthly export when there are no matching tickets', () => {
    const getAllTickets = jasmine.createSpy('getAllTickets').and.returnValue(of([]));
    const { component, pdfService, excelService } = createComponent(undefined, { getAllTickets });

    component.generateTicketsPdf();

    expect(pdfService.generateTicketsPDF).not.toHaveBeenCalled();
    expect(excelService.generateTableWorkbookExcel).not.toHaveBeenCalled();
    expect(component.ticketPdfExporting).toBeFalse();
  });
});
