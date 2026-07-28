import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-confirm-alert',
  templateUrl: './confirm-alert.component.html',
  styleUrls: ['./confirm-alert.component.scss']
})
export class ConfirmAlertComponent {
  @Input() visible = false;
  @Input() title = 'Deactivate account';
  @Input() message =
    'Are you sure you want to deactivate your account? This action cannot be undone.';

  @Output() onConfirm = new EventEmitter<void>();
  @Output() onCancel = new EventEmitter<void>();

  confirm(): void {
    this.onConfirm.emit();
    this.visible = false;
  }

  cancel(): void {
    this.onCancel.emit();
    this.visible = false;
  }
}
