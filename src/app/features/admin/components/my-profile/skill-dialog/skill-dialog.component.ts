import { Component, Inject, Optional } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

export interface SkillDialogResult {
  saved: boolean;
  mode: 'create' | 'edit';
}

export interface SkillDialogPayload {
  id: number;
  employeeid: number;
  skill: string;
  experience: string;
  created_date: string;
  updated_date: string;
}

export interface SkillDialogData {
  skill?: Partial<SkillDialogPayload> | null;
}

@Component({
  selector: 'app-skill-dialog',
  templateUrl: './skill-dialog.component.html',
  styleUrls: ['./skill-dialog.component.scss']
})
export class SkillDialogComponent {
  skillForm: FormGroup;
  empid = 0;
  submitting = false;

  constructor(
    private fb: FormBuilder,
    private apiService: AuthService,
    private storageService: StorageService,
    private toasterService: ToasterService,
    private dialogRef: MatDialogRef<SkillDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: SkillDialogData
  ) {
    this.empid = Number(this.storageService.getEmpId()) || 0;

    this.skillForm = this.fb.group({
      skill: ['', [Validators.required, this.noWhitespaceValidator]],
      experience: ['', [Validators.required, Validators.maxLength(20)]]
    });

    if (this.data?.skill) {
      this.skillForm.patchValue({
        skill: (this.data.skill.skill || '').trim(),
        experience: (this.data.skill.experience || '').trim()
      });
    }
  }

  get sf() {
    return {
      skill: this.skillForm.get('skill'),
      experience: this.skillForm.get('experience')
    };
  }

  get isEditMode(): boolean {
    return !!this.data?.skill?.id;
  }

  submit(): void {
    if (this.skillForm.invalid) {
      this.skillForm.markAllAsTouched();
      return;
    }

    const now = new Date().toISOString();
    const payload: SkillDialogPayload = {
      id: Number(this.data?.skill?.id) || 0,
      employeeid: Number(this.data?.skill?.employeeid) || this.empid,
      skill: this.skillForm.value.skill.trim(),
      experience: this.skillForm.value.experience.trim(),
      created_date: this.data?.skill?.created_date || now,
      updated_date: now
    };

    this.submitting = true;

    this.apiService.updateskills(payload)
      .pipe(finalize(() => {
        this.submitting = false;
      }))
      .subscribe({
        next: (res: any) => {
          this.toasterService.success(
            res?.message || `Skill ${this.isEditMode ? 'updated' : 'saved'} successfully.`
          );
          this.dialogRef.close({
            saved: true,
            mode: this.isEditMode ? 'edit' : 'create'
          } as SkillDialogResult);
        },
        error: (err) => {
          this.toasterService.error(err?.error?.message || `Unable to ${this.isEditMode ? 'update' : 'save'} skill.`);
        }
      });
  }

  close(): void {
    this.dialogRef.close();
  }

  private noWhitespaceValidator(control: AbstractControl): ValidationErrors | null {
    const value = `${control.value ?? ''}`.trim();
    return value ? null : { required: true };
  }
}
