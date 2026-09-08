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

  fileName: string | null = null;
  isSubmitting: boolean = false;
	readonly maxDocumentTitleLength = 150;

  uploadForm: FormGroup = this.fb.group({
		title: ['', [Validators.required, Validators.maxLength(this.maxDocumentTitleLength)]],
    file: [null, [Validators.required]],
    projectId: [null, [Validators.required]],
    userId: [null, [Validators.required]]
  });

  get formValueString(): string {
    const val = this.uploadForm.value;
    return JSON.stringify({
      title: val.title,
      hasFile: !!val.fileSource,
      fileName: this.fileName
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
  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    if (file) {
      this.fileName = file.name;
      this.uploadForm.patchValue({ file: file });
      this.uploadForm.get('file')?.markAsTouched();
    }
  }

  clearFile(event: Event): void {
    event.stopPropagation();
    this.fileName = null;
    this.uploadForm.patchValue({ file: null });
  }

  onReset(): void {
    this.fileName = null;
    this.uploadForm.reset({
      title: '',
      file: null,
      projectId: this.projectid,
      userId: this.storageService.getEmpId()
    });
  }

  onSubmit() {
    if (this.isSubmitting) return;

    if (this.uploadForm.invalid) {
      this.uploadForm.markAllAsTouched();
      return;
    }

    if (this.uploadForm.valid) {
      this.isSubmitting = true;
      const formData = new FormData();

      // append normal form fields
      Object.keys(this.uploadForm.value).forEach(key => {
        formData.append(key, this.uploadForm.value[key]);
      });


      this.authService.uploadDocument(formData)
        .pipe(finalize(() => {
          this.isSubmitting = false;
        }))
        .subscribe({
          next: (res: any) => {
            this.toasterService.success(res?.message)
            this.dialogRef.close({ uploaded: true } as DocUploadDialogResult);
          },
          error: (err) => {
            this.toasterService.error(err?.error?.message);
          }
        })

    }
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

}
