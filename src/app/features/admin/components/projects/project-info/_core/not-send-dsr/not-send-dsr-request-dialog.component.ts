import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export type NotSendDsrDialogMode = 'request' | 'approve' | 'reject';

export interface NotSendDsrDialogData {
  mode: NotSendDsrDialogMode;
  employeeName: string;
  date: string;
  existingReason?: string;
}

export interface NotSendDsrDialogResult {
  confirmed: boolean;
  reason?: string;
}

@Component({
  selector: 'app-not-send-dsr-request-dialog',
  templateUrl: './not-send-dsr-request-dialog.component.html',
  styleUrls: ['./not-send-dsr-request-dialog.component.scss']
})
export class NotSendDsrRequestDialogComponent {
  readonly form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<NotSendDsrRequestDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: NotSendDsrDialogData
  ) {
    this.form = this.fb.group({
      reason: [data.existingReason || '', this.requiresReason ? [Validators.required, Validators.pattern(/\S/)] : []]
    });
  }

  get requiresReason(): boolean {
    return this.data.mode === 'request' || this.data.mode === 'reject';
  }

  get title(): string {
    if (this.data.mode === 'approve') return 'Approve DSR request';
    if (this.data.mode === 'reject') return 'Reject DSR request';
    return 'Request task entry';
  }

  get description(): string {
    if (this.data.mode === 'approve') return 'Confirm that the requester can add the missing task.';
    if (this.data.mode === 'reject') return 'Tell the requester why this request cannot be approved.';
    return 'Explain why a task must be added for this missing DSR date.';
  }

  get icon(): string {
    if (this.data.mode === 'approve') return 'ri-checkbox-circle-line';
    if (this.data.mode === 'reject') return 'ri-close-circle-line';
    return 'ri-mail-send-line';
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.dialogRef.close({
      confirmed: true,
      reason: `${this.form.value.reason || ''}`.trim() || undefined
    } as NotSendDsrDialogResult);
  }

  close(): void {
    this.dialogRef.close({ confirmed: false } as NotSendDsrDialogResult);
  }
}
