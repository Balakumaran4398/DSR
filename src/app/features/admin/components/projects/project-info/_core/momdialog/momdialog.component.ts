import { Component, Inject, Input, OnChanges, OnInit, Optional, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { FormGroupDirective, NgForm } from '@angular/forms';

class MomDialogErrorStateMatcher implements ErrorStateMatcher {
  constructor(private readonly isSubmitted: () => boolean) { }

  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    return !!(
      control &&
      control.invalid &&
      (control.touched || control.dirty || form?.submitted || this.isSubmitted())
    );
  }
}

interface MomPayload {
  id?: number;
  companyid: number;
  title: string;
  date: string;
  starttime: string;
  endtime: string;
  attendees: string;
  agenda: string;
  discussion: string;
  decisions: string;
  created_by: number;
  empid: number;
}

interface MomRequestPayload extends MomPayload {
  file_url?: string;
  file_name?: string;
  file_type?: string;
}

interface ProjectEmployee {
  id: number;
  employee_name: string;
}

export interface MomDialogData {
  projectid?: number;
  mom?: Partial<MomPayload> | null;
}

@Component({
  selector: 'app-momdialog',
  templateUrl: './momdialog.component.html',
  styleUrls: ['./momdialog.component.scss']
})
export class MomdialogComponent implements OnInit, OnChanges {
  @Input() data: MomDialogData | null = null;

  momForm: FormGroup;
  readonly maxMeetingDate = this.getTodayDate();
  attendeeSearchControl = new FormControl('');
  employeeList: ProjectEmployee[] = [];
  submitting = false;
  submitted = false;
  selectedFile: File | null = null;
  selectedFileName = '';
  readonly errorStateMatcher = new MomDialogErrorStateMatcher(() => this.submitted);
  companyId = 0;
  projectId = 0;
  username: string = '';
  readonly employeeId: number;
  private readonly fallbackProjectId: number;
  private currentMom: Partial<MomPayload> | null = null;
  private pendingAttendeeValue: any = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private drawerService: DrawerService,
    private storageService: StorageService,
    private toasterService: ToasterService,
    @Optional() private dialogRef: MatDialogRef<MomdialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) private dialogData: MomDialogData | null
  ) {
    const storedProject = localStorage.getItem('projectDetails');
    const projectDetails = storedProject ? JSON.parse(storedProject) : null;

    this.fallbackProjectId =
      Number(projectDetails?.id) ||
      Number(projectDetails?.projectid) ||
      0;
    this.employeeId = Number(this.storageService.getEmpId()) || 0;
    this.username = this.storageService.getUsername() || '';
    this.momForm = this.fb.group({
      title: ['', [Validators.required, this.trimmedRequiredValidator(), Validators.maxLength(150)]],
      date: [this.getTodayDate(), [Validators.required, this.noFutureDateValidator()]],
      starttime: ['', [Validators.required, this.timeFormatValidator()]],
      endtime: ['', [Validators.required, this.timeFormatValidator()]],
      attendees: [[], [this.attendeesValidator()]],
      file_url: [null],
      agenda: ['', [Validators.required, this.trimmedRequiredValidator(), Validators.maxLength(2000)]],
      discussion: ['', [Validators.required, this.trimmedRequiredValidator(), Validators.maxLength(4000)]],
      decisions: ['', [Validators.required, this.trimmedRequiredValidator(), Validators.maxLength(4000)]],
      created_by: [this.employeeId],
      empid: [this.employeeId],

    }, {
      validators: [this.timeRangeValidator()]
    });
  }

  ngOnInit(): void {
    this.applyDialogData();
    this.getCompanyId();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.applyDialogData();
    }
  }

  getCompanyId() {
    const storedCompanyId = Number(this.storageService.getCompanyId()) || 0;
    if (storedCompanyId) {
      this.companyId = storedCompanyId;
      return;
    }

    this.authService.getemployeedetails(this.username).subscribe({
      next: (res: any) => {
        this.companyId = Number(res?.companyid) || 0;
      },
      error: (err: any) => {
        console.error('Error fetching employee details:', err);
        this.toasterService.error('Unable to fetch company details. Please try again later.');
      }
    })
  }

  get isEditMode(): boolean {
    return Number(this.currentMom?.id) > 0;
  }

  get filteredEmployees(): ProjectEmployee[] {
    const search = `${this.attendeeSearchControl.value ?? ''}`.trim().toLowerCase();
    const selectedIds = this.selectedAttendeeIds;

    if (!search) {
      return this.employeeList;
    }

    return this.employeeList
      .filter((employee) => {
        const matchesSearch = employee.employee_name.toLowerCase().includes(search);
        const isSelected = selectedIds.includes(employee.id);
        return matchesSearch || isSelected;
      })
      .sort((first, second) => {
        const firstMatches = first.employee_name.toLowerCase().includes(search);
        const secondMatches = second.employee_name.toLowerCase().includes(search);

        if (firstMatches && !secondMatches) {
          return -1;
        }

        if (!firstMatches && secondMatches) {
          return 1;
        }

        return 0;
      });
  }

  get selectedAttendeeIds(): number[] {
    const value = this.formControls.attendees?.value;
    return Array.isArray(value)
      ? value.map((item: any) => Number(item)).filter((item: number) => item > 0)
      : [];
  }

  get selectedAttendeeNames(): string[] {
    return this.selectedAttendeeIds
      .map((id) => this.employeeList.find((employee) => employee.id === id)?.employee_name || `Employee #${id}`)
      .filter(Boolean);
  }

  get formControls() {
    return {
      title: this.momForm.get('title'),
      date: this.momForm.get('date'),
      starttime: this.momForm.get('starttime'),
      endtime: this.momForm.get('endtime'),
      attendees: this.momForm.get('attendees'),
      file_url: this.momForm.get('file_url'),
      agenda: this.momForm.get('agenda'),
      discussion: this.momForm.get('discussion'),
      decisions: this.momForm.get('decisions'),
      created_by: this.momForm.get('created_by'),
      empid: this.momForm.get('empid'),
    };
  }

  onAttendeesOpenedChange(isOpen: boolean): void {
    if (isOpen) {
      this.attendeeSearchControl.setValue(this.attendeeSearchControl.value ?? '');
    }
  }

  submit(): void {
    this.submitted = true;
    this.normalizeTextField('title');
    this.normalizeTextField('agenda');
    this.normalizeTextField('discussion');
    this.normalizeTextField('decisions');
    this.normalizeTimeField('starttime');
    this.normalizeTimeField('endtime');
    this.normalizeAttendeesField();
    this.momForm.markAllAsTouched();
    this.momForm.updateValueAndValidity();

    if (this.momForm.invalid) {
      return;
    }

    console.log(this.momForm.value);
    const normalizedFormValue = this.momForm.getRawValue();

    const payload: MomPayload = {
      companyid: this.companyId,
      title: normalizedFormValue.title.trim(),
      date: this.toApiDateValue(normalizedFormValue.date),
      starttime: this.toApiTimeValue(normalizedFormValue.starttime),
      endtime: this.toApiTimeValue(normalizedFormValue.endtime),
      attendees: this.selectedAttendeeIds.join(','),
      agenda: normalizedFormValue.agenda.trim(),
      discussion: normalizedFormValue.discussion.trim(),
      decisions: normalizedFormValue.decisions.trim(),
      created_by: Number(this.currentMom?.created_by) || this.employeeId,
      empid: this.employeeId
    };

    if (this.isEditMode) {
      payload.id = Number(this.currentMom?.id);
    }

    this.submitting = true;
    this.buildRequestPayload(payload)
      .then((requestPayload) => {
        this.authService.createmom_1(requestPayload)
          .pipe(finalize(() => {
            this.submitting = false;
          }))
          .subscribe({
            next: (res: any) => {
              const action = this.isEditMode ? 'updated' : 'created';
              this.toasterService.success(res?.message || `MOM ${this.isEditMode ? 'updated' : 'created'} successfully.`);
              this.drawerService.notifyAction({
                source: 'mom',
                action
              });
              this.close({
                saved: true,
                mode: this.isEditMode ? 'edit' : 'create'
              });
            },
            error: (err: any) => {
              this.toasterService.error(err?.error?.message || `Unable to ${this.isEditMode ? 'update' : 'create'} MOM.`);
            }
          });
      })
      .catch(() => {
        this.submitting = false;
        this.toasterService.error('Unable to process the selected attachment.');
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;

    this.selectedFile = file;
    this.selectedFileName = file?.name || '';
    this.formControls.file_url?.setValue(file);
    this.formControls.file_url?.markAsDirty();
    this.formControls.file_url?.markAsTouched();
  }

  clearSelectedFile(fileInput?: HTMLInputElement | null): void {
    this.selectedFile = null;
    this.selectedFileName = '';
    this.formControls.file_url?.setValue(null);
    this.formControls.file_url?.markAsPristine();

    if (fileInput) {
      fileInput.value = '';
    }
  }

  close(result?: any): void {
    if (this.dialogRef) {
      this.dialogRef.close(result);
      return;
    }

    this.drawerService.close();
  }

  normalizeTimeField(fieldName: 'starttime' | 'endtime'): void {
    const control = this.momForm.get(fieldName);
    const normalizedValue = this.normalizeTimeString(control?.value);

    if (normalizedValue !== control?.value) {
      control?.setValue(normalizedValue);
    }
    control?.markAsTouched();
    control?.updateValueAndValidity({ onlySelf: true });
    this.momForm.updateValueAndValidity();
  }

  private normalizeTextField(fieldName: 'title' | 'agenda' | 'discussion' | 'decisions'): void {
    const control = this.momForm.get(fieldName);
    const normalizedValue = `${control?.value ?? ''}`.trim();

    if (normalizedValue !== control?.value) {
      control?.setValue(normalizedValue);
    }

    control?.updateValueAndValidity({ onlySelf: true });
  }

  private normalizeAttendeesField(): void {
    const control = this.formControls.attendees;
    const normalizedValue = this.resolveAttendeeIds(control?.value);

    if (!this.areNumberArraysEqual(normalizedValue, control?.value)) {
      control?.setValue(normalizedValue);
    }

    control?.updateValueAndValidity({ onlySelf: true });
  }

  getControlError(fieldName: 'title' | 'date' | 'starttime' | 'endtime' | 'attendees' | 'agenda' | 'discussion' | 'decisions'): string {
    const control = this.momForm.get(fieldName);
    const hasTimeRangeError = fieldName === 'endtime' && this.momForm.errors?.['invalidTimeRange'];

    if (!control || (!control.errors && !hasTimeRangeError)) {
      return '';
    }

    const errors = control.errors ?? {};

    if (errors['required'] || errors['trimmedRequired']) {
      switch (fieldName) {
        case 'title':
          return 'Meeting title is required.';
        case 'date':
          return 'Meeting date is required.';
        case 'starttime':
          return 'Start time is required.';
        case 'endtime':
          return 'End time is required.';
        case 'attendees':
          return 'Select at least one attendee.';
        case 'agenda':
          return 'Agenda is required.';
        case 'discussion':
          return 'Discussion details are required.';
        case 'decisions':
          return 'Decisions / action items are required.';
      }
    }

    if (errors['maxlength']) {
      const requiredLength = errors['maxlength'].requiredLength;
      return `Maximum ${requiredLength} characters allowed.`;
    }

    if (fieldName === 'date' && errors['matDatepickerParse']) {
      return 'Enter a valid meeting date.';
    }

    if (fieldName === 'date' && errors['futureDate']) {
      return 'Future meeting dates are not allowed.';
    }

    if (errors['invalidTime']) {
      return 'Enter time in HH:mm:ss format.';
    }

    if (hasTimeRangeError) {
      return 'End time must be after start time.';
    }

    return 'Invalid value.';
  }

  hasControlError(fieldName: 'title' | 'date' | 'starttime' | 'endtime' | 'attendees' | 'agenda' | 'discussion' | 'decisions'): boolean {
    const control = this.momForm.get(fieldName);
    const hasTimeRangeError = fieldName === 'endtime' && this.momForm.errors?.['invalidTimeRange'];

    if (!control) {
      return false;
    }

    return !!(control.errors || hasTimeRangeError) && (this.submitted || control.touched || control.dirty);
  }

  private applyDialogData(): void {
    const resolvedData = this.data || this.dialogData || null;
    this.currentMom = resolvedData?.mom || null;
    this.companyId = this.companyId || 0;
    this.projectId = Number(resolvedData?.projectid) || this.fallbackProjectId || 0;
    this.pendingAttendeeValue = this.currentMom?.attendees ?? (this.currentMom as any)?.attendee_ids ?? (this.currentMom as any)?.employee_list ?? null;

    this.momForm.reset(this.getDefaultFormValue());
    this.attendeeSearchControl.setValue('');
    this.clearSelectedFile();
    this.loadEmployees();

    if (this.currentMom) {
      this.momForm.patchValue({
        title: (this.currentMom.title || '').trim(),
        date: this.toDateInputValue(this.currentMom.date),
        starttime: this.toTimeInputValue(this.currentMom.starttime),
        endtime: this.toTimeInputValue(this.currentMom.endtime),
        agenda: (this.currentMom.agenda || '').trim(),
        discussion: (this.currentMom.discussion || '').trim(),
        decisions: (this.currentMom.decisions || '').trim()
      });
    }

    this.momForm.markAsPristine();
    this.momForm.markAsUntouched();
    this.submitting = false;
    this.submitted = false;
  }

  private getDefaultFormValue() {
    return {
      title: '',
      date: this.getTodayDate(),
      starttime: '',
      endtime: '',
      attendees: [],
      file_url: null,
      agenda: '',
      discussion: '',
      decisions: ''
    };
  }

  private async buildRequestPayload(payload: MomPayload): Promise<MomRequestPayload> {
    if (!this.selectedFile) {
      return payload;
    }

    const encodedFile = await this.readFileAsBase64(this.selectedFile);
    return {
      ...payload,
      file_url: encodedFile,
      file_name: this.selectedFile.name,
      file_type: this.selectedFile.type || 'application/octet-stream'
    };
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(`${reader.result || ''}`);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private getTodayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private toApiDateValue(value: any): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toApiTimeValue(value: string): string {
    const normalizedValue = this.normalizeTimeString(value) || '00:00:00';
    const [hour = '0', minute = '0', second = '0'] = normalizedValue.split(':');
    const safeHour = `${Number(hour) || 0}`.padStart(2, '0');
    const safeMinute = `${Number(minute) || 0}`.padStart(2, '0');
    const safeSecond = `${Number(second) || 0}`.padStart(2, '0');
    return `${safeHour}:${safeMinute}:${safeSecond}`;
  }

  private toTimeInputValue(time: any): string {
    if (!time && time !== 0) {
      return '';
    }

    if (typeof time === 'string') {
      const timePart = time.includes('T') ? time.split('T')[1] : time;
      const normalizedTime = timePart.slice(0, 8);
      return normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime;
    }

    if (typeof time === 'object') {
      const hour = `${Number(time.hour) || 0}`.padStart(2, '0');
      const minute = `${Number(time.minute) || 0}`.padStart(2, '0');
      const second = `${Number(time.second) || 0}`.padStart(2, '0');
      return `${hour}:${minute}:${second}`;
    }

    return '';
  }

  private normalizeTimeString(value: any): string {
    const rawValue = `${value ?? ''}`.trim();
    if (!rawValue) {
      return '';
    }

    const parts = rawValue.split(':');
    if (parts.length < 2 || parts.length > 3) {
      return rawValue;
    }

    const [hour = '0', minute = '0', second = '0'] = parts;
    const safeHour = `${Number(hour) || 0}`.padStart(2, '0');
    const safeMinute = `${Number(minute) || 0}`.padStart(2, '0');
    const safeSecond = `${Number(second) || 0}`.padStart(2, '0');
    return `${safeHour}:${safeMinute}:${safeSecond}`;
  }

  private toDateInputValue(value: any): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
  }

  private isEndTimeValid(starttime: string, endtime: string): boolean {
    const start = this.toSeconds(starttime);
    const end = this.toSeconds(endtime);
    return end > start;
  }

  private trimmedRequiredValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = `${control.value ?? ''}`.trim();
      return value ? null : { trimmedRequired: true };
    };
  }

  private noFutureDateValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }

      const selectedDate = this.toDateInputValue(control.value);
      if (!selectedDate) {
        return null;
      }

      return selectedDate.getTime() > this.maxMeetingDate.getTime()
        ? { futureDate: true }
        : null;
    };
  }

  private attendeesValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const selectedIds = this.resolveAttendeeIds(control.value);
      return selectedIds.length > 0 ? null : { required: true };
    };
  }

  private timeFormatValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = `${control.value ?? ''}`.trim();
      if (!value) {
        return null;
      }

      return /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(this.normalizeTimeString(value))
        ? null
        : { invalidTime: true };
    };
  }

  private timeRangeValidator(): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const starttime = `${group.get('starttime')?.value ?? ''}`.trim();
      const endtime = `${group.get('endtime')?.value ?? ''}`.trim();

      if (!starttime || !endtime) {
        return null;
      }

      const starttimeControl = group.get('starttime');
      const endtimeControl = group.get('endtime');
      if (starttimeControl?.errors?.['invalidTime'] || endtimeControl?.errors?.['invalidTime']) {
        return null;
      }

      return this.isEndTimeValid(starttime, endtime) ? null : { invalidTimeRange: true };
    };
  }

  private toSeconds(value: string): number {
    const [hour = '0', minute = '0', second = '0'] = `${value || '00:00:00'}`.split(':');
    return ((Number(hour) || 0) * 60 * 60) + ((Number(minute) || 0) * 60) + (Number(second) || 0);
  }

  private loadEmployees(): void {
    this.authService.getEmployeeList().subscribe({
      next: (res: any) => {
        const list = this.extractEmployeeCollection(res);
        this.employeeList = list
          .map((employee: any) => this.mapProjectEmployee(employee))
          .filter((employee: ProjectEmployee) => employee.id > 0 && !!employee.employee_name);
        this.applyAttendeeSelection();
      },
      error: (err: any) => {
        this.employeeList = [];
        this.toasterService.error(err?.error?.message || 'Unable to load employees.');
      }
    });
  }

  private applyAttendeeSelection(): void {
    const selectedIds = this.resolveAttendeeIds(this.pendingAttendeeValue);
    this.formControls.attendees?.setValue(selectedIds);
    this.formControls.attendees?.markAsPristine();
    this.formControls.attendees?.markAsUntouched();
  }

  private resolveAttendeeIds(value: any): number[] {
    if (!value && value !== 0) {
      return [];
    }

    if (Array.isArray(value)) {
      return value
        .map((item: any) => {
          if (typeof item === 'number' || /^\d+$/.test(`${item}`.trim())) {
            return Number(item);
          }

          const employeeId = Number(item?.id ?? item?.employee_id ?? item?.employeeid);
          if (employeeId > 0) {
            return employeeId;
          }

          const employeeName = `${item?.employee_name ?? item?.name ?? item ?? ''}`.trim().toLowerCase();
          return this.employeeList.find((employee) => employee.employee_name.trim().toLowerCase() === employeeName)?.id || 0;
        })
        .filter((item: number, index: number, list: number[]) => item > 0 && list.indexOf(item) === index);
    }

    return `${value}`
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        if (/^\d+$/.test(item)) {
          return Number(item);
        }

        return this.employeeList.find((employee) => employee.employee_name.trim().toLowerCase() === item.toLowerCase())?.id || 0;
      })
      .filter((item: number, index: number, list: number[]) => item > 0 && list.indexOf(item) === index);
  }

  private extractEmployeeCollection(response: any): any[] {
    if (Array.isArray(response)) {
      return response;
    }

    const nestedList =
      response?.assigned_employee_list ??
      response?.employee_list ??
      response?.team_members ??
      response?.project_members ??
      response?.members ??
      response?.data?.assigned_employee_list ??
      response?.data?.employee_list ??
      response?.data?.team_members ??
      response?.data?.project_members ??
      response?.data?.members ??
      response?.data;

    if (Array.isArray(nestedList)) {
      return nestedList;
    }

    if (response && typeof response === 'object') {
      return [response];
    }

    return [];
  }

  private mapProjectEmployee(employee: any): ProjectEmployee {
    return {
      id: Number(employee?.employee_id ?? employee?.employeeid ?? employee?.empid ?? employee?.id) || 0,
      employee_name:
        employee?.employee_name ||
        employee?.name ||
        `${employee?.firstname ?? ''} ${employee?.lastname ?? ''}`.trim() ||
        ''
    };
  }

  private areNumberArraysEqual(first: any, second: any): boolean {
    const firstList = Array.isArray(first) ? first.map((item) => Number(item)).filter((item) => item > 0) : [];
    const secondList = Array.isArray(second) ? second.map((item) => Number(item)).filter((item) => item > 0) : [];

    if (firstList.length !== secondList.length) {
      return false;
    }

    return firstList.every((item, index) => item === secondList[index]);
  }

  updateEndTime(): void {
    const startTime = this.momForm.get('starttime')?.value;
    const endTime = this.momForm.get('endtime')?.value;

    if (!startTime || !endTime) {
      return;
    }

    const [startHour, startMinute] = startTime.split(':').map(Number);
    let [endHour, endMinute] = endTime.split(':').map(Number);

    const startTotalMinutes = (startHour * 60) + startMinute;
    let endTotalMinutes = (endHour * 60) + endMinute;

    // If end time is less than start time, add 12 hours
    if (endTotalMinutes < startTotalMinutes) {
      endTotalMinutes += 12 * 60;

      endHour = Math.floor(endTotalMinutes / 60);
      endMinute = endTotalMinutes % 60;

      const adjustedTime =
        `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;

      this.momForm.get('endtime')?.setValue(adjustedTime, {
        emitEvent: false
      });
    }
  }

}
