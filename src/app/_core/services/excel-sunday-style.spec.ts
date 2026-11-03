import * as XLSX from 'xlsx';
import { ExcelService } from './excel.service';

describe('ExcelService Sunday row styling', () => {
  it('applies the light fill only to Sunday rows in generic table workbooks', () => {
    const service = new ExcelService();
    let downloadedFile: ArrayBuffer | null = null;

    spyOn<any>(service, 'downloadWorkbook').and.callFake((file: ArrayBuffer) => {
      downloadedFile = file;
    });

    service.generateTableWorkbookExcel(
      {
        workbookTitle: 'Tickets',
        fromDate: '2026-09-06',
        toDate: '2026-09-07',
        filename: 'TICKETS.xlsx'
      },
      [{
        title: 'Tickets',
        headers: ['S.No', 'Date', 'Day', 'Remarks'],
        rows: [
          [1, '06-09-2026', 'SUN', '-'],
          [2, '07-09-2026', 'MON', '-']
        ],
        highlightSundayRows: true
      }]
    );

    expect(downloadedFile).not.toBeNull();
    const archive = XLSX.CFB.read(new Uint8Array(downloadedFile!), { type: 'buffer' });
    const sheetFile = XLSX.CFB.find(archive, 'sheet1.xml');
    const stylesFile = XLSX.CFB.find(archive, 'styles.xml');
    const sheetXml = new TextDecoder().decode(sheetFile!.content);
    const stylesXml = new TextDecoder().decode(stylesFile!.content);

    expect(sheetXml).toContain('<c r="A10" s="27"');
    expect(sheetXml).toContain('<c r="D10" s="26"');
    expect(sheetXml).not.toContain('<c r="A11" s="27"');
    expect(stylesXml).toContain('rgb="FFFFF7ED"');
  });
});
