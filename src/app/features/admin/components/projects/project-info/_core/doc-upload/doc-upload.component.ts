import { Component, Inject, Optional, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

export interface DocUploadDialogData {
  projectId?: number | string | null;
}

export interface DocUploadDialogResult {
  uploaded: boolean;
}

@Component({
  selector: 'app-doc-upload',
  templateUrl: './doc-upload.component.html',
  styleUrls: ['./doc-upload.component.scss']
})
export class DocUploadComponent {
  private fb = inject(FormBuilder);

  selectedFiles: File[] = [];
  isSubmitting: boolean = false;
  validationSubmitted = false;
	readonly maxDocumentTitleLength = 200;
	readonly acceptedDocumentFileTypes = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg';
	private readonly allowedDocumentExtensions = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg']);

  uploadForm: FormGroup = this.fb.group({
		title: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(this.maxDocumentTitleLength)]],
    file: [null, [Validators.required]],
    projectId: [null, [Validators.required]],
    userId: [null, [Validators.required]]
  });

  get formValueString(): string {
    const val = this.uploadForm.value;
    return JSON.stringify({
      title: val.title,
      hasFile: !!val.fileSource,
      fileNames: this.selectedFiles.map(file => file.name)
    }, null, 2);
  }
  projectid: any = 0;
  projectDetails: any;
  constructor(
    private storageService: StorageService,
    private toasterService: ToasterService,
    private authService: AuthService,
    private dialogRef: MatDialogRef<DocUploadComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) private dialogData: DocUploadDialogData | null
  ) {
    const stored = localStorage.getItem('projectDetails');
    this.projectDetails = stored ? JSON.parse(stored) : null;
    this.projectid = this.dialogData?.projectId ?? this.projectDetails?.id;
    this.setContextFields();
  }
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;

    const allowedFiles = files.filter(file => this.isAllowedDocumentFile(file));
    const rejectedFiles = files.filter(file => !this.isAllowedDocumentFile(file));
    this.selectedFiles = [...this.selectedFiles, ...allowedFiles];
    this.syncFileControl();
    this.uploadForm.get('file')?.markAsTouched();

    if (rejectedFiles.length) {
      this.toasterService.error(`Unsupported file type: ${rejectedFiles.map(file => file.name).join(', ')}`);
    }
    // Allow selecting the same file again after removing it or correcting an invalid selection.
    input.value = '';
  }

  clearFile(event: Event): void {
    event.stopPropagation();
    this.selectedFiles = [];
    this.syncFileControl();
  }

  removeFile(index: number): void {
    this.selectedFiles = this.selectedFiles.filter((_, fileIndex) => fileIndex !== index);
    this.syncFileControl();
  }

  onReset(): void {
    this.validationSubmitted = false;
    this.selectedFiles = [];
    this.uploadForm.reset({
      title: '',
      file: null,
      projectId: this.projectid,
      userId: this.storageService.getEmpId()
    });
  }

  onSubmit() {
    if (this.isSubmitting) return;
    this.validationSubmitted = true;

    const titleControl = this.uploadForm.get('title');
    titleControl?.markAsTouched();
    titleControl?.updateValueAndValidity();

    if (this.uploadForm.invalid) {
      this.uploadForm.markAllAsTouched();
      return;
    }

    if (!this.selectedFiles.length) {
      this.uploadForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const title = `${this.uploadForm.get('title')?.value ?? ''}`.trim();
    const userId = this.storageService.getEmpId();
    const formData = this.buildUploadFormData(this.selectedFiles, title, userId);
    this.authService.uploadDocument(formData)
      .pipe(finalize(() => this.isSubmitting = false))
      .subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message || `${this.selectedFiles.length} file(s) uploaded successfully.`);
          this.dialogRef.close({ uploaded: true } as DocUploadDialogResult);
        },
        error: (err: any) => {
          // Keep the entire selection so the user can retry the same batch.
          this.toasterService.error(err?.error?.message || 'Unable to upload the selected files. Please retry.');
        }
      });
  }

  close() {
    this.dialogRef.close()
  }

  private setContextFields(): void {
    this.uploadForm.patchValue({
      projectId: this.projectid,
      userId: this.storageService.getEmpId()
    });
  }

  private buildUploadFormData(files: File[], title: string, userId: number | string | null): FormData {
    const formData = new FormData();
    formData.append('title', title);
    files.forEach(file => formData.append('file', file));
    formData.append('projectId', `${this.projectid}`);
    formData.append('userId', `${userId ?? ''}`);
    return formData;
  }

  private isAllowedDocumentFile(file: File): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    return this.allowedDocumentExtensions.has(extension);
  }

  private syncFileControl(): void {
    const fileControl = this.uploadForm.get('file');
    fileControl?.setValue(this.selectedFiles.length ? this.selectedFiles : null);
    fileControl?.setErrors(null);
    fileControl?.updateValueAndValidity();
  }

}
