import { Directive, ElementRef, HostBinding, HostListener } from '@angular/core';

@Directive({
  selector: '[appDatePickerOnly]'
})
export class DatePickerOnlyDirective {
  constructor(private elementRef: ElementRef<HTMLInputElement>) {}

  @HostBinding('attr.readonly')
  get readonlyAttribute(): '' | null {
    return this.isNativeDateInput() ? null : '';
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.isNativeDateInput() && this.isDateEditingKey(event)) {
      event.preventDefault();
    }
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    if (this.isNativeDateInput()) {
      event.preventDefault();
    }
  }

  private isNativeDateInput(): boolean {
    return this.elementRef.nativeElement.type === 'date';
  }

  private isDateEditingKey(event: KeyboardEvent): boolean {
    return event.key.length === 1 || ['Backspace', 'Delete'].includes(event.key)
      || ((event.ctrlKey || event.metaKey) && ['a', 'v', 'x', 'z'].includes(event.key.toLowerCase()));
  }
}
