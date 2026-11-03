import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { AuthService } from 'src/app/_core/services/auth.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

@Component({
  selector: 'app-attendance-doc',
  templateUrl: './attendance-doc.component.html',
  styleUrls: ['./attendance-doc.component.scss']
})
export class AttendanceDocComponent {
  fileName: string | null = null;
  isSubmitting = false;
  isDragOver = false;
  fileError = '';
  uploadError = '';
  uploadForm: FormGroup;
  private readonly acceptedExtensions = ['pdf', 'xls', 'xlsx', 'els', 'doc', 'docx', 'dat'];

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private toasterService: ToasterService,
    private dialogRef: MatDialogRef<AttendanceDocComponent>
  ) {
    this.uploadForm = this.formBuilder.group({
      file: [null, Validators.required]
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.setFile(file);
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onFileDropped(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setFile(file);
  }

  private setFile(file: File): void {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!this.acceptedExtensions.includes(extension)) {
      this.fileName = null;
      this.fileError = 'Unsupported file format. Choose a PDF, Excel, Word or DAT file.';
      this.uploadForm.patchValue({ file: null });
      this.uploadForm.get('file')?.markAsTouched();
      return;
    }

    this.fileError = '';
    this.uploadError = '';
    this.fileName = file.name;
    this.uploadForm.patchValue({ file });
    this.uploadForm.get('file')?.markAsTouched();
  }

  clearFile(input: HTMLInputElement): void {
    input.value = '';
    this.fileName = null;
    this.fileError = '';
    this.uploadError = '';
    this.uploadForm.patchValue({ file: null });
    this.uploadForm.get('file')?.markAsTouched();
  }

  onReset(): void {
    this.uploadForm.reset();
    this.fileName = null;
    this.fileError = '';
    this.uploadError = '';
    this.isDragOver = false;
  }

  onSubmit(): void {
    if (this.uploadForm.invalid || this.isSubmitting) {
      this.uploadForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formData = new FormData();
    formData.append('file', this.uploadForm.get('file')?.value);

    this.authService.LoadAttendance(formData).subscribe({
      next: (response: any) => {
        this.toasterService.success(response?.message || 'Attendance file uploaded successfully.');
        this.isSubmitting = false;
        this.dialogRef.close({ uploaded: true });
      },
      error: (error: any) => {
        this.uploadError = error?.error?.message || (error?.status === 0
          ? 'The browser could not reach the attendance API. Check the API connection and CORS settings.'
          : `Upload failed${error?.status ? ` (HTTP ${error.status})` : ''}. Please try again.`);
        this.toasterService.error(this.uploadError);
        this.isSubmitting = false;
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
