import { DocumentsComponent } from './documents.component';

describe('DocumentsComponent column sizing', () => {
  function componentFor(compact: boolean): any {
    const component = Object.create(DocumentsComponent.prototype) as any;
    component.isCompactViewport = () => compact;
    return component;
  }

  it('allocates the most available width to Title and File and keeps Actions compact', () => {
    const columns = componentFor(false).getDocumentColumns(false);
    const byField = (field: string) => columns.find((column: any) => column.field === field);

    expect(byField('title').widthGrow).toBe(3);
    expect(byField('filepath').widthGrow).toBe(3);
    expect(byField('employee_name').widthGrow).toBe(2);
    expect(byField('createddate').widthGrow).toBe(2);
    expect(byField('file_url').widthGrow).toBe(0);
    expect(byField('file_url').width).toBe(96);
  });

  it('uses smaller minimum widths for compact viewports', () => {
    const columns = componentFor(true).getDocumentColumns(false);
    const byField = (field: string) => columns.find((column: any) => column.field === field);

    expect(byField('title').minWidth).toBe(40);
    expect(byField('filepath').minWidth).toBe(40);
    expect(byField('employee_name').minWidth).toBe(52);
    expect(byField('createddate').minWidth).toBe(48);
    expect(byField('file_url').width).toBe(56);
  });

  it('replaces refreshed data without measuring or setting individual column widths', () => {
    const component = componentFor(false);
    const rows = [{ title: 'A refreshed document', filepath: '/files/a.pdf' }];
    const table = { replaceData: jasmine.createSpy('replaceData') };

    component.safeReplaceData(table, rows);

    expect(table.replaceData).toHaveBeenCalledWith(rows);
  });

  it('renders image thumbnails and file-type icons from the file URL', () => {
    const component = componentFor(false);

    const imagePreview = component.titleFormatter({ title: 'Project image', file_url: '/uploads/site-photo.jpg' });
    const pdfPreview = component.titleFormatter({ title: 'Report', file_url: '/uploads/report.pdf' });
    const excelPreview = component.titleFormatter({ title: 'Budget', file_url: '/uploads/budget.xlsx' });
    const genericPreview = component.titleFormatter({ title: 'Archive', file_url: '/uploads/archive.zip' });

    expect(imagePreview).toContain('<img');
    expect(imagePreview).toContain('/uploads/site-photo.jpg');
    expect(pdfPreview).toContain('ri-file-pdf-2-fill');
    expect(excelPreview).toContain('ri-file-excel-2-fill');
    expect(genericPreview).toContain('ri-file-line');
  });

  it('escapes document titles before rendering them in the table', () => {
    const component = componentFor(false);
    const preview = component.titleFormatter({ title: '<script>alert(1)</script>', file_url: '/uploads/file.pdf' });

    expect(preview).not.toContain('<script>');
    expect(preview).toContain('&lt;script&gt;');
  });
});
