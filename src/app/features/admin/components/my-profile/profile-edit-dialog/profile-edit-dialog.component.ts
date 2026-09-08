import { Component, Inject, Optional } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { StorageService } from 'src/app/_core/services/storage.service';

export interface ProfileEditDialogResult {
  saved: boolean;
  payload: any;
}

export interface ProfileEditDialogData {
  profile: any;
}

@Component({
  selector: 'app-profile-edit-dialog',
  templateUrl: './profile-edit-dialog.component.html',
  styleUrls: ['./profile-edit-dialog.component.scss']
})
export class ProfileEditDialogComponent {
  profileForm: FormGroup;
  bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
  role:any;
  constructor(
    private fb: FormBuilder,
    private storageService: StorageService,
    private dialogRef: MatDialogRef<ProfileEditDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: ProfileEditDialogData
  ) {
    this.role=storageService.getRoleNames()?.[0];
   
    const p = this.data?.profile || {};

    this.profileForm = this.fb.group({
      firstname: [p.firstname || '', Validators.required],
      lastname: [p.lastname || '', Validators.required],
      gender: [p.gender || ''],
      date_of_birth: [p.date_of_birth ? new Date(p.date_of_birth) : '', Validators.required],
      blood_group: [p.blood_group || ''],
      marital_status: [p.marital_status || ''],
      email: [p.email || '', [Validators.required, Validators.email]],
      alternate_email: [p.alternate_email || '', Validators.email],
      mobile: [p.mobile || '', Validators.required]
    });
  }

  get pf() {
    return {
      firstname: this.profileForm.get('firstname'),
      lastname: this.profileForm.get('lastname'),
      gender: this.profileForm.get('gender'),
      date_of_birth: this.profileForm.get('date_of_birth'),
      blood_group: this.profileForm.get('blood_group'),
      marital_status: this.profileForm.get('marital_status'),
      email: this.profileForm.get('email'),
      alternate_email: this.profileForm.get('alternate_email'),
      mobile: this.profileForm.get('mobile')
    };
  }

  isInvalid(fieldName: string): boolean {
    const field = this.profileForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  submit(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const values = this.profileForm.value;
    const payload = {
      ...(this.data?.profile || {}),
      firstname: (values.firstname || '').trim(),
      lastname: (values.lastname || '').trim(),
      gender: values.gender,
      date_of_birth: this.formatDate(values.date_of_birth),
      blood_group: values.blood_group,
      marital_status: values.marital_status,
      email: (values.email || '').trim(),
      alternate_email: (values.alternate_email || '').trim(),
      mobile: (values.mobile || '').trim(),
      role:this.role,
      username: this.storageService.getUsername()
    };

    this.dialogRef.close({
      saved: true,
      payload
    } as ProfileEditDialogResult);
  }

  close(): void {
    this.dialogRef.close({ saved: false });
  }

  private formatDate(date: any): string {
    if (!date) {
      return '';
    }

    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) {
      return date;
    }

    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }
}
