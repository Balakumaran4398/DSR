import * as XLSX from 'xlsx';
import { ExcelService } from './excel.service';

describe('ExcelService release overview export', () => {
  it('merges Holiday and Week Off detail columns and applies their event colors', () => {
    const service = new ExcelService();
    let downloadedFile: ArrayBuffer | null = null;
    spyOn<any>(service, 'downloadWorkbook').and.callFake((file: ArrayBuffer) => {
      downloadedFile = file;
    });

    service.generateDsrCalendarExcel('Test Employee', new Date(2026, 0, 1), new Date(2026, 0, 2), [
      { date: '01-01-2026', day: 'Thursday', isHoliday: true, holiday_name: 'New Year', statusText: 'Holiday' },
      { date: '02-01-2026', day: 'Friday', isWeekOff: true, holiday_name: 'Office Weekly Off', statusText: 'Week Off' }
    ]);

    const workbook = XLSX.read(new Uint8Array(downloadedFile!), { type: 'array' });
    const sheet = workbook.Sheets['DSR Calendar'];
    expect(sheet['!merges']).toContain(jasmine.objectContaining({ s: { r: 5, c: 2 }, e: { r: 5, c: 10 } }));
    expect(sheet['!merges']).toContain(jasmine.objectContaining({ s: { r: 6, c: 2 }, e: { r: 6, c: 10 } }));
    expect(sheet['C6'].v).toBe('New Year');
    expect(sheet['L6'].v).toBe('Holiday');
    expect(sheet['C7'].v).toBe('Office Weekly Off');
    expect(sheet['L7'].v).toBe('Week Off');
  });

  it('shows Sunday in a centered merged detail cell and normalizes its status to Week Off', () => {
    const service = new ExcelService();
    let downloadedFile: ArrayBuffer | null = null;
    spyOn<any>(service, 'downloadWorkbook').and.callFake((file: ArrayBuffer) => {
      downloadedFile = file;
    });

    service.generateDsrCalendarExcel('Test Employee', new Date(2026, 0, 4), new Date(2026, 0, 4), [
      { date: '04-01-2026', day: 'Sunday', isSunday: true, isWeekOff: true, statusText: 'Holiday', holiday_name: 'Sunday' }
    ]);

    const sheet = XLSX.read(new Uint8Array(downloadedFile!), { type: 'array' }).Sheets['DSR Calendar'];
    expect(sheet['B6']?.v || '').toBe('');
    expect(sheet['C6'].v).toBe('Sunday');
    expect(sheet['L6'].v).toBe('Week Off');
    expect(sheet['!merges']).toContain(jasmine.objectContaining({ s: { r: 5, c: 2 }, e: { r: 5, c: 10 } }));
  });

  it('keeps future working-day rows white with only a centered dash in Status', () => {
    const service = new ExcelService();
    let downloadedFile: ArrayBuffer | null = null;
    spyOn<any>(service, 'downloadWorkbook').and.callFake((file: ArrayBuffer) => {
      downloadedFile = file;
    });

    service.generateDsrCalendarExcel('Test Employee', new Date(2026, 0, 5), new Date(2026, 0, 5), [
      { date: '05-01-2026', day: 'Monday', project_title: 'Project A', task: 'Future work', statusText: '-', isFuture: true }
    ]);

    const file = new Uint8Array(downloadedFile!);
    const sheet = XLSX.read(file, { type: 'array' }).Sheets['DSR Calendar'];
    const archive = XLSX.CFB.read(file, { type: 'buffer' });
    const sheetXml = new TextDecoder().decode(XLSX.CFB.find(archive, 'sheet1.xml')!.content);
    expect(sheet['A6'].v).toBe('05-01-2026');
    expect(sheet['B6'].v).toBe('Monday');
    expect(sheet['C6'].v || '').toBe('');
    expect(sheet['L6'].v).toBe('-');
    expect(sheetXml).toContain('<c r="L6" s="32"');
  });

  it('keeps regular data neutral and uses blue, red, warning, and pink status styles', () => {
    const service = new ExcelService();
    let downloadedFile: ArrayBuffer | null = null;
    spyOn<any>(service, 'downloadWorkbook').and.callFake((file: ArrayBuffer) => {
      downloadedFile = file;
    });

    service.generateDsrCalendarExcel('Test Employee', new Date(2026, 0, 1), new Date(2026, 0, 5), [
      { date: '01-01-2026', day: 'Thursday', statusText: 'Present' },
      { date: '02-01-2026', day: 'Friday', statusText: 'Absent' },
      { date: '03-01-2026', day: 'Saturday', statusText: 'Week Off', isWeekOff: true },
      { date: '05-01-2026', day: 'Monday', statusText: 'Holiday', isHoliday: true }
    ]);

    const archive = XLSX.CFB.read(new Uint8Array(downloadedFile!), { type: 'buffer' });
    const sheetXml = new TextDecoder().decode(XLSX.CFB.find(archive, 'sheet1.xml')!.content);
    expect(sheetXml).toContain('<c r="C6" s="8"');
    expect(sheetXml).toContain('<c r="L6" s="38"');
    expect(sheetXml).toContain('<c r="L7" s="20"');
    expect(sheetXml).toContain('<c r="L8" s="22"');
    expect(sheetXml).toContain('<c r="L9" s="28"');
  });

  it('exports a calendar ordered DSR worksheet with distinct Sunday, holiday, and leave fills', () => {
    const service = new ExcelService();
    let downloadedFile: ArrayBuffer | null = null;
    let downloadedName = '';
    spyOn<any>(service, 'downloadWorkbook').and.callFake((file: ArrayBuffer, filename: string) => {
      downloadedFile = file;
      downloadedName = filename;
    });

    service.generateDsrCalendarExcel('Test Employee', new Date(2026, 0, 1), new Date(2026, 0, 4), [
      { date: '02-01-2026', day: 'Friday', task: 'Holiday - Pongal', statusText: 'Holiday' },
      { date: '03-01-2026', day: 'Saturday', task: 'Leave - Casual Leave', statusText: 'Leave' },
      { date: '04-01-2026', day: 'Sunday', task: 'Sunday - Weekly Off', statusText: 'Sunday' }
    ]);

    expect(downloadedName).toBe('RIDSYS_DSR_Test_Employee_2026-01-01_to_2026-01-04.xlsx');
    const workbook = XLSX.read(new Uint8Array(downloadedFile!), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['DSR Calendar'], { header: 1, defval: '' }) as any[][];
    expect(rows[4]).not.toContain('HOLIDAY / LEAVE NAME');
    expect(rows[5][0]).toBe('02-01-2026');
    expect(rows[6][11]).toBe('Leave');
    expect(rows[6][6]).toBe('Leave - Casual Leave');

    const archive = XLSX.CFB.read(new Uint8Array(downloadedFile!), { type: 'buffer' });
    const sheetXml = new TextDecoder().decode(XLSX.CFB.find(archive, 'sheet1.xml')!.content);
    expect(sheetXml).toContain('<c r="A5" s="5"');
    expect(sheetXml).toContain('<c r="A6" s="28"');
    expect(sheetXml).toContain('<c r="A7" s="26"');
    expect(sheetXml).toContain('<c r="A8" s="22"');
  });

  it('creates the fifteen-column all-departments workbook shown in the release report', () => {
    const service = new ExcelService();
    let downloadedFile: ArrayBuffer | null = null;
    let downloadedName = '';

    spyOn<any>(service, 'getStatusStyleId').and.returnValue(13);
    spyOn<any>(service, 'getReleaseOverdueDate').and.returnValue('2026-09-10');
    spyOn<any>(service, 'getReleaseOverdueStyleId').and.returnValue(12);
    spyOn<any>(service, 'downloadWorkbook').and.callFake((file: ArrayBuffer, filename: string) => {
      downloadedFile = file;
      downloadedName = filename;
    });

    service.generateReleaseOverviewExcel(
      {
        generatedBy: 'VIJAYASANTHI U',
        filteredProject: 'All Projects',
        releaseType: 'All',
        department: 'All Departments',
        departmentWiseReleaseReport: false,
        departmentSections: []
      },
      '2026-09-14',
      '2026-09-20',
      [{
        project_name: 'Billing CRM',
        title: 'Internal Release',
        version: '1.2.2',
        assignee_from_name: 'PRASADARAO GAJULA',
        released_date: '2026-09-10',
        assignee_to_name: 'ABINAYA G',
        closed_date: '2026-09-17T12:30:00',
        company_name: '-',
        status: 'Failed',
        release_type: 'Internal'
      }]
    );

    expect(downloadedFile).not.toBeNull();
    expect(downloadedName).toBe('RELEASE_REPORT_2026-09-14_to_2026-09-20.xlsx');

    const workbook = XLSX.read(new Uint8Array(downloadedFile!), { type: 'array' });
    const worksheet = workbook.Sheets['Release Overview'];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

    expect(rows[3]).toEqual(jasmine.arrayContaining([
      'GENERATED BY', 'VIJAYASANTHI U', 'REPORTING PERIOD', '2026-09-14 to 2026-09-20'
    ]));
    expect(rows[4]).toEqual(jasmine.arrayContaining(['PROJECT', 'All Projects', 'RELEASE TYPE', 'All']));
    expect(rows[5]).toEqual(jasmine.arrayContaining(['TOTAL RELEASES', 1, 'INTERNAL RELEASES', 1]));
    expect(rows[6][0]).toBe('EXTERNAL RELEASES');
    expect(rows[6][1]).toBe(0);
    expect(rows[6][4]).toBe('EXPORTED AT');
    expect(`${rows[6][5]}`.trim()).not.toBe('');
    expect(rows[8]).toEqual([
      'PROJECT', 'TITLE', 'VERSION', 'MANAGER / TL', 'WORKED BY / RELEASED BY', 'PLANNED DATE',
      'RELEASED DATE', 'OVERDUE', 'TESTED BY', 'QC START DATE', 'QC RELEASE DATE', 'STATUS',
      'RELEASE TYPE', 'REMARKS', 'CLIENT'
    ]);
    expect(rows[9]).toEqual([
      'Billing CRM', 'Internal Release', '1.2.2', '-', 'PRASADARAO GAJULA', '-',
      '2026-09-10', '2026-09-10', 'ABINAYA G', '', '2026-09-17', 'Released', 'Internal', '-', '-'
    ]);

    const archive = XLSX.CFB.read(new Uint8Array(downloadedFile!), { type: 'buffer' });
    const sheetFile = XLSX.CFB.find(archive, 'sheet1.xml');
    const sheetXml = new TextDecoder().decode(sheetFile!.content);
    expect(sheetXml).toContain('<c r="H10" s="12"');
    expect(sheetXml).toContain('<c r="L10" s="13"');
  });

  it('keeps department sections on the existing grouped workbook path', () => {
    const service = new ExcelService();
    const groupedExport = spyOn<any>(service, 'generateDepartmentWiseReleaseOverviewExcel');

    service.generateReleaseOverviewExcel(
      {
        departmentWiseReleaseReport: true,
        departmentSections: [{ departmentName: 'Software', releases: [{ id: 1 }] }]
      },
      '2026-09-14',
      '2026-09-20',
      [{ id: 1 }]
    );

    expect(groupedExport).toHaveBeenCalled();
  });

  it('exports selected departments with the requested fifteen columns in order', () => {
    const service = new ExcelService();
    let downloadedFile: ArrayBuffer | null = null;
    spyOn<any>(service, 'applyProfessionalReleaseStyles').and.callFake((file: ArrayBuffer) => file);
    spyOn<any>(service, 'downloadWorkbook').and.callFake((file: ArrayBuffer) => {
      downloadedFile = file;
    });

    service.generateReleaseOverviewExcel(
      {
        departmentWiseReleaseReport: true,
        department: 'Software',
        departmentSections: [{
          departmentName: 'Software',
          releases: [{ project_name: 'Portal', title: 'Launch', version: 'V1.0', manager_name: 'Manager',
            assignee_from_name: 'Developer', planned_date: '2026-09-01', released_date: '2026-09-02',
            assignee_to_name: 'Tester', qc_testing_start_date: '2026-09-03', closed_date: '2026-09-04',
            status: 'Pass', release_type: 'Internal', remarks: 'Done', company_name: 'Client A' }]
        }]
      },
      '2026-09-01', '2026-09-07', []
    );

    expect(downloadedFile).not.toBeNull();
    const workbook = XLSX.read(new Uint8Array(downloadedFile!), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Release Overview'], { header: 1, defval: '' }) as any[][];
    const headers = [
      'PROJECT', 'TITLE', 'VERSION', 'MANAGER / TL', 'WORKED BY / RELEASED BY', 'PLANNED DATE',
      'RELEASED DATE', 'OVERDUE', 'TESTED BY', 'QC START DATE', 'QC RELEASE DATE', 'STATUS',
      'RELEASE TYPE', 'REMARKS', 'CLIENT'
    ];
    const headerIndex = rows.findIndex(row => row[0] === 'PROJECT' && row[1] === 'TITLE');
    expect(rows[headerIndex].slice(0, 15)).toEqual(headers);
    expect(rows[headerIndex + 1].slice(0, 15)).toEqual([
      'Portal', 'Launch', 'V1.0', 'Manager', 'Developer', '2026-09-01', '2026-09-02',
      '2026-09-04', 'Tester', '2026-09-03', '2026-09-04', 'Pass', 'Internal', 'Done', 'Client A'
    ]);
  });
});
