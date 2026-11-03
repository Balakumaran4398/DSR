import { of, throwError } from 'rxjs';
import { DocUploadComponent } from './doc-upload.component';

describe('DocUploadComponent multi-file upload', () => {
  function componentFor(files: File[]): any {
    const component = Object.create(DocUploadComponent.prototype) as any;
    component.selectedFiles = files;
    component.projectid = 42;
    component.isSubmitting = false;
    component.validationSubmitted = false;
    component.allowedDocumentExtensions = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg']);

    const titleControl = { value: 'Project files', markAsTouched: jasmine.createSpy(), updateValueAndValidity: jasmine.createSpy() };
    const fileControl = {
      markAsTouched: jasmine.createSpy(),
      setValue: jasmine.createSpy(),
      setErrors: jasmine.createSpy(),
      updateValueAndValidity: jasmine.createSpy()
    };
    component.uploadForm = {
      invalid: false,
      get: (name: string) => name === 'title' ? titleControl : fileControl,
      markAllAsTouched: jasmine.createSpy()
    };
    component.storageService = { getEmpId: () => 7 };
    component.toasterService = { success: jasmine.createSpy(), error: jasmine.createSpy() };
    component.dialogRef = { close: jasmine.createSpy() };
    return component;
  }

  it('accepts PDF, Excel, Word, and image files and rejects other extensions', () => {
    const component = componentFor([]);

    expect(component.isAllowedDocumentFile(new File(['x'], 'sheet.xlsx'))).toBeTrue();
    expect(component.isAllowedDocumentFile(new File(['x'], 'report.docx'))).toBeTrue();
    expect(component.isAllowedDocumentFile(new File(['x'], 'archive.zip'))).toBeFalse();
  });

  it('uploads every selected file in one API request with the project context', () => {
    const pdfFile = new File(['pdf'], 'report.pdf');
    const excelFile = new File(['excel'], 'budget.xlsx');
    const component = componentFor([pdfFile, excelFile]);
    component.authService = {
      uploadDocument: jasmine.createSpy('uploadDocument')
        .and.returnValue(of({ message: 'Uploaded' }))
    };

    component.onSubmit();

    expect(component.authService.uploadDocument).toHaveBeenCalledTimes(1);
    expect(component.dialogRef.close).toHaveBeenCalledWith({ uploaded: true });

    const request = component.authService.uploadDocument.calls.argsFor(0)[0] as FormData;
    expect(request.get('title')).toBe('Project files');
    expect(request.get('projectId')).toBe('42');
    expect(request.get('userId')).toBe('7');
    expect(request.getAll('file')).toEqual([pdfFile, excelFile]);
  });

  it('keeps all selected files available when the batch request fails', () => {
    const files = [new File(['pdf'], 'report.pdf'), new File(['excel'], 'budget.xlsx')];
    const component = componentFor(files);
    component.authService = {
      uploadDocument: jasmine.createSpy('uploadDocument')
        .and.returnValue(throwError(() => ({ error: { message: 'Upload failed' } })))
    };

    component.onSubmit();

    expect(component.selectedFiles).toEqual(files);
    expect(component.toasterService.error).toHaveBeenCalledWith('Upload failed');
    expect(component.dialogRef.close).not.toHaveBeenCalled();
  });
});
