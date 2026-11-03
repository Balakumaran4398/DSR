import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export type NotSendDsrDialogMode = 'request' | 'approve' | 'reject' | 'view';

export interface NotSendDsrDialogData {
  mode: NotSendDsrDialogMode;
  employeeName: string;
  date: string;
  workType?: 'DSR' | 'Ticket';
  existingReason?: string;
  requestReason?: string;
  rejectionReason?: string;
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
    if (this.data.mode === 'view') return 'Request reasons';
    if (this.data.workType === 'DSR') {
      if (this.data.mode === 'approve') return 'Approve DSR request';
      if (this.data.mode === 'reject') return 'Reject DSR request';
      return 'Request task entry';
    }
    if (this.data.workType === 'Ticket') {
      if (this.data.mode === 'approve') return 'Approve Ticket request';
      if (this.data.mode === 'reject') return 'Reject Ticket request';
      return 'Request Ticket entry';
    }
    if (this.data.mode === 'approve') return 'Approve work entry request';
    if (this.data.mode === 'reject') return 'Reject work entry request';
    return 'Request work entry';
  }

  get description(): string {
    if (this.data.mode === 'view') return 'Review the reason submitted with this request and any rejection reason.';
    if (this.data.workType === 'DSR') {
      if (this.data.mode === 'approve') return 'Confirm that the requester can add the missing task.';
      if (this.data.mode === 'reject') return 'Tell the requester why this task request cannot be approved.';
      return 'Explain why a task must be added for this missing DSR date.';
    }
    if (this.data.workType === 'Ticket') {
      if (this.data.mode === 'approve') return 'Confirm that the requester can add the missing Ticket.';
      if (this.data.mode === 'reject') return 'Tell the requester why this Ticket request cannot be approved.';
      return 'Explain why a Ticket must be added for this missing Ticket date.';
    }
    if (this.data.mode === 'approve') return 'Confirm that the requester can add the missing work entry.';
    if (this.data.mode === 'reject') return 'Tell the requester why this work entry request cannot be approved.';
    return 'Explain why a work entry must be added for this missing date.';
  }

  get icon(): string {
    if (this.data.mode === 'view') return 'ri-file-list-3-line';
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
