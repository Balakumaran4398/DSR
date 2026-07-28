import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface OverviewTaskViewDialogData {
  task: any;
}

@Component({
  selector: 'app-overview-task-view-dialog',
  templateUrl: './overview-task-view-dialog.component.html',
  styleUrls: ['./overview-task-view-dialog.component.scss']
})
export class OverviewTaskViewDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: OverviewTaskViewDialogData,
    private dialogRef: MatDialogRef<OverviewTaskViewDialogComponent>
  ) { }

  get task(): any {
    return this.data?.task ?? {};
  }

  get overviewItems(): Array<{ label: string; value: string; icon: string }> {
    return [
      { label: 'Project', value: this.displayValue(this.task?.project_title), icon: 'ri-briefcase-4-line' },
      { label: 'Phase', value: this.displayValue(this.task?.phase_title), icon: 'ri-git-branch-line' },
      { label: 'Task Type', value: this.displayValue(this.task?.task_type), icon: 'ri-price-tag-3-line' },
      { label: 'Version', value: this.displayValue(this.task?.version), icon: 'ri-stack-line' }
    ];
  }

  get peopleItems(): Array<{ label: string; value: string; icon: string }> {
    return [
      { label: 'Assigned By', value: this.displayValue(this.task?.assigned_from_name), icon: 'ri-user-shared-line' },
      { label: 'Assigned To', value: this.displayValue(this.task?.assigned_to_name), icon: 'ri-user-received-line' },
      { label: 'Priority', value: this.displayValue(this.task?.priority), icon: 'ri-flag-2-line' },
      { label: 'Status', value: this.displayValue(this.task?.status), icon: 'ri-loader-4-line' }
    ];
  }

  get timelineItems(): Array<{ label: string; value: string; icon: string }> {
    return [
      { label: 'Start Date', value: this.formatDate(this.task?.start_date), icon: 'ri-calendar-event-line' },
      { label: 'End Date', value: this.formatDate(this.task?.end_date), icon: 'ri-calendar-check-line' },
      { label: 'Estimated Hours', value: this.displayValue(this.task?.estimated_hours), icon: 'ri-timer-line' },
      { label: 'Worked Hours', value: this.displayValue(this.task?.worked_hours), icon: 'ri-time-line' }
    ];
  }

  get metaItems(): Array<{ label: string; value: string; icon: string }> {
    return [
      { label: 'Task Code', value: this.displayValue(this.task?.taskcode), icon: 'ri-hashtag' },
      { label: 'Created', value: this.formatDateTime(this.task?.created_date), icon: 'ri-add-circle-line' },
      { label: 'Updated', value: this.formatDateTime(this.task?.updated_date), icon: 'ri-refresh-line' },
      { label: 'Remark', value: this.displayValue(this.task?.remark), icon: 'ri-chat-1-line' }
    ];
  }

  close(): void {
    this.dialogRef.close();
  }

  trackByLabel(_: number, item: { label: string }): string {
    return item.label;
  }

  private displayValue(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return 'Not available';
    }

    return String(value);
  }

  private formatDate(value: unknown): string {
    if (!value) {
      return 'Not available';
    }

    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return this.displayValue(value);
    }

    return new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
  }

  private formatDateTime(value: unknown): string {
    if (!value) {
      return 'Not available';
    }

    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return this.displayValue(value);
    }

    return new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }
}
