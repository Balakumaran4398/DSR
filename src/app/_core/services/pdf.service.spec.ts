import { PdfService } from './pdf.service';

describe('PdfService ticket monthly summary', () => {
  let originalJspdf: any;

  beforeEach(() => {
    originalJspdf = (window as any).jspdf;
  });

  afterEach(() => {
    (window as any).jspdf = originalJspdf;
  });

  it('renders calendar status columns and uses text colors without status-cell fills', () => {
    const autoTable = jasmine.createSpy('autoTable');
    const doc = {
      internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 }, getNumberOfPages: () => 1 },
      setTextColor: jasmine.createSpy('setTextColor'), setFont: jasmine.createSpy('setFont'),
      setFontSize: jasmine.createSpy('setFontSize'), text: jasmine.createSpy('text'), autoTable,
      setDrawColor: jasmine.createSpy('setDrawColor'), setLineWidth: jasmine.createSpy('setLineWidth'),
      line: jasmine.createSpy('line'), save: jasmine.createSpy('save')
    };
    autoTable.and.callFake(() => {
      (doc as any).lastAutoTable = { finalY: 100 };
    });
    (window as any).jspdf = { jsPDF: jasmine.createSpy('jsPDF').and.returnValue(doc) };

    new PdfService().generatePDF(
      { id: 7, employee_name: 'Test Employee' },
      new Date(2026, 0, 1),
      new Date(2026, 0, 4),
      [
        { date: '02-01-2026', day: 'Friday', task: 'Holiday - Pongal', statusText: 'Holiday' },
        { date: '03-01-2026', day: 'Saturday', task: 'Leave - Casual Leave', statusText: 'Leave' },
        { date: '04-01-2026', day: 'Sunday', task: 'Sunday - Weekly Off', statusText: 'Holiday', holiday_name: 'Sunday' },
        { date: '05-01-2026', day: 'Monday', task: 'Future task', project_title: 'Project A', statusText: '-', isFuture: true }
      ]
    );

    const table = autoTable.calls.argsFor(0)[0];
    expect((window as any).jspdf.jsPDF).toHaveBeenCalledWith('l', 'mm', 'a3');
    expect(table.showHead).toBe('firstPage');
    expect(table.margin).toEqual({ top: 18, right: 12, bottom: 16, left: 12 });
    expect(table.columns.map((column: any) => column.dataKey)).toContain('day');
    expect(table.columns.map((column: any) => column.dataKey)).toContain('sub_task');
    expect(table.columnStyles.sub_task.cellWidth).toBeGreaterThan(16);
    expect(table.columns.map((column: any) => column.header)).not.toContain('HOLIDAY / LEAVE NAME');
    expect(table.body.map((row: any) => row.project_title)).toEqual(['Holiday', undefined, 'Sunday', '']);
    expect(table.body[2].day).toBe('');
    expect(table.body[2].statusText).toBe('Week Off');
    expect(table.body[3].statusText).toBe('-');
    expect(table.body[3].task).toBe('');
    expect(table.columnStyles.day.cellWidth).toBeGreaterThan(16);
    expect(table.columnStyles.date.halign).toBe('center');
    expect(table.columnStyles.statusText.halign).toBe('center');

    const stylesFor = (statusText: string, dataKey = 'statusText') => {
      const cell = { styles: {} as any };
      table.didParseCell({ section: 'body', row: { raw: { statusText, isHoliday: statusText === 'Holiday', isWeekOff: statusText === 'Sunday' } }, column: { dataKey }, cell });
      return cell.styles;
    };
    expect(stylesFor('Sunday').textColor).toEqual([146, 64, 14]);
    expect(stylesFor('Sunday').fillColor).toBeUndefined();
    expect(stylesFor('Holiday').textColor).toEqual([157, 23, 77]);
    expect(stylesFor('Holiday').fillColor).toBeUndefined();
    expect(stylesFor('Present').textColor).toEqual([22, 101, 52]);
    expect(stylesFor('Present').fillColor).toBeUndefined();
    expect(stylesFor('Absent').textColor).toEqual([185, 28, 28]);
    expect(stylesFor('Absent').fillColor).toBeUndefined();
    expect(stylesFor('Leave').fillColor).toBeUndefined();
    const holidayLabelCell: any = { styles: {} as any };
    table.didParseCell({ section: 'body', row: { raw: { statusText: 'Holiday', isHoliday: true } }, column: { dataKey: 'project_title' }, cell: holidayLabelCell });
    expect(holidayLabelCell.colSpan).toBe(9);
    expect(holidayLabelCell.styles.textColor).toEqual([157, 23, 77]);

    const sundayLabelCell: any = { styles: {} as any };
    table.didParseCell({ section: 'body', row: { raw: { statusText: 'Week Off', isWeekOff: true, isSunday: true } }, column: { dataKey: 'project_title' }, cell: sundayLabelCell });
    expect(sundayLabelCell.colSpan).toBe(9);
    expect(sundayLabelCell.styles.halign).toBe('center');

    const futureStatusCell: any = { styles: {} as any };
    table.didParseCell({ section: 'body', row: { raw: { statusText: '-', isFuture: true } }, column: { dataKey: 'statusText' }, cell: futureStatusCell });
    expect(futureStatusCell.styles.fillColor).toEqual([255, 255, 255]);
    expect(futureStatusCell.styles.textColor).toEqual([51, 65, 85]);
  });

  it('renders only Month and Total Tickets columns in monthly summary mode', () => {
    const autoTable = jasmine.createSpy('autoTable');
    const save = jasmine.createSpy('save');
    const doc = {
      internal: {
        pageSize: {
          getWidth: () => 420,
          getHeight: () => 297
        },
        getNumberOfPages: () => 1
      },
      setTextColor: jasmine.createSpy('setTextColor'),
      setFont: jasmine.createSpy('setFont'),
      setFontSize: jasmine.createSpy('setFontSize'),
      text: jasmine.createSpy('text'),
      autoTable,
      setDrawColor: jasmine.createSpy('setDrawColor'),
      setLineWidth: jasmine.createSpy('setLineWidth'),
      line: jasmine.createSpy('line'),
      save
    };
    (window as any).jspdf = {
      jsPDF: jasmine.createSpy('jsPDF').and.returnValue(doc)
    };

    new PdfService().generateTicketsPDF(
      {
        generatedBy: 'Tester',
        reportTitle: 'All Departments Tickets',
        filename: 'SEPTEMBER_TICKETS.pdf',
        monthlySummary: true,
        monthLabel: 'September 2026'
      },
      '2026-09-01',
      '2026-09-30',
      [{ code: 'ONE' }, { code: 'TWO' }],
      'download'
    );

    const summaryTable = autoTable.calls.argsFor(1)[0];
    expect(summaryTable.columns).toEqual([
      { header: 'Month', dataKey: 'month' },
      { header: 'Total Tickets', dataKey: 'total_tickets' }
    ]);
    expect(summaryTable.body).toEqual([
      { month: 'September 2026', total_tickets: 2 }
    ]);
    expect(save).toHaveBeenCalledWith('SEPTEMBER_TICKETS.pdf');
  });
});
