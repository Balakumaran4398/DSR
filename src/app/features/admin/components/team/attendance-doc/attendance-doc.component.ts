import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

@Component({
  selector: 'app-attendance-doc',
  templateUrl: './attendance-doc.component.html',
  styleUrls: ['./attendance-doc.component.scss']
})
export class AttendanceDocComponent {
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);

  fileName: string | null = null;
  isSubmitting: boolean = false;

  uploadForm: FormGroup = this.fb.group({
    // title: ['', [Validators.required, Validators.minLength(3)]],
    file: [null, [Validators.required]],
    // projectId: [null, [Validators.required]],
    // userId: [null, [Validators.required]]
  });

  get formValueString(): string {
    const val = this.uploadForm.value;
    return JSON.stringify({
      // title: val.title,
      hasFile: !!val.fileSource,
      fileName: this.fileName
    }, null, 2);
  }
  projectid: any = 0;
  projectDetails: any;
  constructor(private storageService: StorageService, private toasterService: ToasterService, private authService: AuthService, private matDialog: MatDialog) {
    const stored = localStorage.getItem('projectDetails');
    this.projectDetails = stored ? JSON.parse(stored) : null;
    this.projectid = this.projectDetails?.id;
    // this.uploadForm.get('projectId')?.setValue(this.projectid)
    // this.uploadForm.get('userId')?.setValue(storageService.getEmpId())
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
    this.uploadForm.reset();
    this.fileName = null;
  }

  onSubmit() {
    if (this.uploadForm.valid) {
      this.isSubmitting = true;
      console.log(this.uploadForm);
      const formData = new FormData();
      Object.keys(this.uploadForm.value).forEach(key => {
        formData.append(key, this.uploadForm.value[key]);
      });
      this.authService.LoadAttendance(formData).subscribe((res: any) => {
        this.toasterService.success(res?.message)
        this.onReset();
        this.isSubmitting = false;
      }, err => {
        this.toasterService.error(err?.error?.message);
        this.isSubmitting = false;
      })

    }
  }

  close() {
    this.matDialog.closeAll()
  }

}
