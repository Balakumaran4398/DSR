import { Component, Input, OnInit, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
export type ReleaseStatus = 'Upcoming-Release' | 'On-Hold' | 'Open' | 'In-Progress' | 'To-be-Tested' | 'In-Review' | 'Rejected' | 'Pass' | 'Failed';
@Component({
  selector: 'app-release-form',
  templateUrl: './release-form.component.html',
  styleUrls: ['./release-form.component.scss']
})
export class ReleaseFormComponent implements OnInit {
  isEditMode = false;
  statusList = ['Upcoming-Release', 'To-be-Tested', 'On-Hold', 'In-Progress', 'Rejected', 'Pass', 'Failed'];
  private readonly closedStatuses: ReleaseStatus[] = ['Pass', 'Rejected', 'Failed'];
  private lastManualStatus: ReleaseStatus = 'Upcoming-Release';
  projectList: any = [];
  versionList: any[] = [];
  releaseList: any[] = [];
  parentReleaseId: number | null = null;
  parentReleaseMailData: any[] = [];
  parentReleaseMailContent = '';
  projectDetails: any;
  employeeList: any = [];
  @Input() data: any
  releaseForm: FormGroup;
  empid: any = 0;
  userRole: any;
  private canModifyExistingReleaseDates = false;
  projectid: any = 0;
  closed_date: any;
  released_date: any;
  planned_date: any;
  isOverdue = false;
  isAdmin = false;
  clients: any;
  searchControl = new FormControl('');
  selectedFiles: File[] = [];
  selectedFileName = '';
  todayDate = this.getTodayDate();
  constructor(private authService: AuthService, private toasterService: ToasterService, private drawerService: DrawerService, private storageService: StorageService) {
    this.empid = this.storageService.getEmpId();
    this.userRole = this.storageService.getRoleNames();
    this.canModifyExistingReleaseDates = this.storageService.roles.isAdmin || this.storageService.roles.isManager;
    const stored = localStorage.getItem('projectDetails');
    this.projectDetails = stored ? JSON.parse(stored) : null;
    this.projectid = this.projectDetails?.id
    this.releaseForm = new FormGroup({
      id: new FormControl(0),
      title: new FormControl('', Validators.required),
      projectid: new FormControl<number | null>(this.projectid, Validators.required),
      version: new FormControl('', Validators.required),
      planned_date: new FormControl(
        { value: this.getTodayDate(), disabled: !this.canModifyReleaseDates },
        Validators.required
      ),
      released_date: new FormControl(
        { value: this.getTodayDate(), disabled: !this.canModifyReleaseDates },
        Validators.required
      ),
      closed_date: new FormControl(
        { value: '', disabled: !this.canModifyReleaseDates },
      ),
      assigned_to: new FormControl<number | null>(this.empid, Validators.required),
      assigned_from: new FormControl<number | null>(this.empid),
      status: new FormControl<ReleaseStatus>('Upcoming-Release', { nonNullable: true, validators: Validators.required }),
      reject_reason: new FormControl(''),
      mail_content: new FormControl(''),
      file_url: new FormControl(''),
      file_name: new FormControl(''),
      ismail: new FormControl(false),
      release_type: new FormControl('Internal'),
      username: new FormControl(storageService.getUsername()),
      parent_version: new FormControl(''),
      client: new FormControl(''),
    });

  }

  get showParentReleaseMailContent(): boolean {
    return this.releaseForm.get('release_type')?.value === 'External' && !!this.parentReleaseMailContent.trim();
  }

  get isRejectedStatus(): boolean {
    return this.releaseForm.get('status')?.value === 'Rejected';
  }

  get canModifyReleaseDates(): boolean {
    return !this.isEditMode || this.canModifyExistingReleaseDates;
  }

  get isCommunicationEnabled(): boolean {
    return !!this.releaseForm.get('ismail')?.value;
  }

  get selectedFileNames(): string[] {
    if (this.selectedFiles.length) {
      return this.selectedFiles.map(file => file.name);
    }

    return this.selectedFileName
      .split(',')
      .map(fileName => fileName.trim())
      .filter(fileName => !!fileName);
  }

  ngOnInit() {

    this.isAdmin = this.storageService.roles?.isAdmin || false;
    this.isOverdue = this.data?.isOverdue || false;


    this.releaseForm.get('ismail')?.valueChanges.subscribe(checked => {
      this.toggleCommunicationControls(!!checked);
      this.syncStatusWithMailCheckbox(!!checked);
    });

    this.releaseForm.get('status')?.valueChanges.subscribe(status => {
      if (status && !this.releaseForm.get('ismail')?.value && status !== 'To-be-Tested') {
        this.lastManualStatus = status as ReleaseStatus;
      }
      this.toggleReasonValidator(status === 'Rejected');
      this.syncClosedDateWithStatus(status as ReleaseStatus | null);
    });

    this.releaseForm.get('release_type')?.valueChanges.subscribe(type => {
      const parentControl = this.releaseForm.get('parent_version');
      const clientControl = this.releaseForm.get('client');
      if (type === 'External') {
        parentControl?.setValidators([Validators.required]);
        clientControl?.setValidators([Validators.required]);
        this.getAllClients();
        this.loadParentReleaseMailData(parentControl?.value);
      } else {
        parentControl?.clearValidators();
        parentControl?.setValue('');
        clientControl?.clearValidators();
        clientControl?.setValue([]);
        this.clearParentReleaseContext();
      }
      parentControl?.updateValueAndValidity();
      clientControl?.updateValueAndValidity();
    });

    this.releaseForm.get('parent_version')?.valueChanges.subscribe(version => {
      this.loadParentReleaseMailData(version);
    });
    this.releaseForm.get('version')?.valueChanges.subscribe(value => {
      if (!value) return;
      const normalized = value.replace(/^V/, 'v');
      if (normalized !== value) {
        this.releaseForm.get('version')?.setValue(normalized, {
          emitEvent: false
        });
      }
    });
    this.loadData({ value: this.projectid });
    this.getAllClients();
    this.applyInputData();
    this.toggleReasonValidator(this.isRejectedStatus);
    this.syncClosedDateWithStatus(this.releaseForm.get('status')?.value);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    this.selectedFiles = Array.from(input.files);
    this.selectedFileName = this.selectedFiles.map(file => file.name).join(',');
    this.releaseForm.patchValue({
      file_url: '',
      file_name: this.selectedFileName
    });
    this.releaseForm.get('file_name')?.markAsDirty();
    this.releaseForm.get('file_url')?.markAsDirty();
  }

  clearSelectedFiles(fileInput?: HTMLInputElement | null): void {
    this.selectedFiles = [];
    this.selectedFileName = '';
    this.releaseForm.patchValue({
      file_url: '',
      file_name: ''
    });
    this.releaseForm.get('file_name')?.markAsPristine();
    this.releaseForm.get('file_url')?.markAsPristine();

    if (fileInput) {
      fileInput.value = '';
    }
  }

  onProjectChange(event: any): void {
    this.projectid = event?.value ?? this.projectid;
    this.getEmployees(event);
    this.getVersions(this.projectid);
    this.getReleases(this.projectid);
    this.clearParentReleaseContext();
    this.releaseForm.patchValue(
      {
        parent_version: '',
        client: ''
      },
      { emitEvent: false }
    );
  }


  toggleEditMode() {
    if (this.isEditMode) {
      this.patchReleaseForm(this.data);
    }
  }

  async onSubmit() {
    if (this.releaseForm.valid) {
      const raw = this.releaseForm.getRawValue();
      let payload: any;
      try {
        payload = await this.buildReleaseRequestPayload(raw);
      } catch {
        this.toasterService.error('Unable to process the selected attachments.');
        return;
      }
      if (this.isEditMode && this.hasEditData()) {
        const updatePayload = { ...this.data, ...payload };
        updatePayload.username = this.storageService.getUsername();
        if (this.selectedFiles.length) {
          delete updatePayload.file_url;
          delete updatePayload.file_name;
          delete updatePayload.file_type;
        }
        this.data = updatePayload;
        this.authService.updateRelease(updatePayload).subscribe({
          next: (res: any) => {
            if (res.mail_status === 'FAILED' && this.releaseForm.get('ismail')?.value === true) {
              this.toasterService.warning(
                `Release not updated, emails not sent
                 ${res.failed_recipients}`,
                `Failed:`
              );
              this.drawerService.notifyAction({
                source: 'release',
                action: 'updated',
                payload: res
              });
              this.onCancel();
            }
            else {
              this.toasterService.success(res?.message);
              this.drawerService.notifyAction({
                source: 'release',
                action: 'updated',
                payload: res
              });
              this.onCancel();
            }
          }, error: (err) => {
            this.toasterService.error(err?.error?.message);
          }
        })
      } else {
        this.releaseForm.value.username = this.storageService.getUsername();
        this.authService.createRelease(payload).subscribe({
          next: (res: any) => {
            if (res.mail_status === 'FAILED' && this.releaseForm.get('ismail')?.value === true) {
              this.toasterService.warning(
                `Release Created, but email not sent
                 ${res.failed_recipients}`,
                `Failed:`
              );
              this.drawerService.notifyAction({
                source: 'release',
                action: 'updated',
                payload: res
              });
              this.onCancel();
            } else {
              this.toasterService.success(res?.message);
              this.drawerService.notifyAction({
                source: 'release',
                action: 'created',
                payload: res
              });
              this.onCancel();
            }
          }, error: (err) => {
            this.toasterService.error(err?.error?.message);
          }
        })
      }
    } else {
      this.releaseForm.markAllAsTouched();
    }
  }

  onCancel() {
    this.resetForCreateMode();
    this.drawerService.close();
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.applyInputData();
    }
  }

  private hasEditData(): boolean {
    return !!this.data && typeof this.data === 'object' && this.data?.mode !== 'create';
  }

  private applyInputData(): void {
    if (!this.releaseForm) return;

    this.projectid = this.data?.projectid ?? this.data?.projectId ?? this.projectid;
    this.releaseList = Array.isArray(this.data?.releaseList) ? this.data.releaseList : this.releaseList;

    if (this.projectid) {
      this.getEmployees({ value: this.projectid });
      this.getVersions(this.projectid);
      this.getReleases(this.projectid);
    }

    if (this.hasEditData()) {
      this.isEditMode = true;
      this.patchReleaseForm(this.data);
      const projectId = this.data?.projectid ?? this.data?.projectId;
      if (projectId) {
        this.projectid = projectId;
        this.getEmployees({ value: projectId });
        this.getVersions(projectId);
      }
    } else {
      this.resetForCreateMode();
    }

    this.toggleCommunicationControls(this.isCommunicationEnabled);
    this.applyReleaseDatePermissions();
    this.loadParentReleaseMailData(this.releaseForm.get('parent_version')?.value);
  }

  private applyReleaseDatePermissions(): void {
    const controls = ['planned_date', 'released_date', 'closed_date'];

    controls.forEach(controlName => {
      const control = this.releaseForm.get(controlName);
      if (!control) return;

      if (this.canModifyReleaseDates) {
        control.enable({ emitEvent: false });
      } else {
        control.disable({ emitEvent: false });
      }
    });
  }

  private resetForCreateMode(): void {
    this.isEditMode = false;
    this.releaseForm.reset({
      id: 0,
      title: '',
      reason: '',
      version: '',
      status: 'Upcoming-Release',
      release_type: 'Internal',
      ismail: false,
      planned_date: this.getTodayDate(),
      released_date: this.getTodayDate(),
      closed_date: '',
      projectid: this.projectid,
      assigned_to: this.empid,
      assigned_from: this.empid,
      mail_content: '',
      file_url: '',
      file_name: '',
      parent_version: '',
      client: "",
      username: this.storageService.getUsername()
    });
    this.lastManualStatus = 'Upcoming-Release';
    this.selectedFiles = [];
    this.selectedFileName = '';
    this.toggleCommunicationControls(false);
    this.syncClosedDateWithStatus(this.releaseForm.get('status')?.value);
    this.applyReleaseDatePermissions();
    this.releaseForm.markAsPristine();
    this.releaseForm.markAsUntouched();
  }

  private patchReleaseForm(data: any): void {
    if (!data) return;

    const patchedStatus = (data.status ?? 'Upcoming-Release') as ReleaseStatus;
    if (patchedStatus !== 'To-be-Tested') {
      this.lastManualStatus = patchedStatus;
    }

    const fileNames = Array.isArray(data.file_names)
      ? data.file_names.join(',')
      : data.file_name ?? data.filename ?? '';

    this.releaseForm.patchValue({
      id: data.id ?? 0,
      title: data.title ?? '',
      reject_reason: data.reject_reason ?? '',
      projectid: data.projectid ?? data.projectId ?? this.projectid,
      version: data.version ?? '',
      planned_date: data.planned_date ,
      released_date: data.released_date ,
      closed_date: data.closed_date ?? '',
      assigned_to: data.assigned_to ?? this.empid,
      assigned_from: data.assigned_from ?? this.empid,
      status: patchedStatus,
      mail_content: data.mail_content ?? data.message ?? '',
      file_url: data.file_url ?? data.file_path ?? data.filepath ?? '',
      file_name: fileNames,
      ismail: data.ismail ?? false,
      release_type: data.release_type ?? 'Internal',
      username: this.storageService.getUsername(),
      parent_version: data.parent_version ?? '',
      client: this.parseClientListForForm(data.client),
    });
    this.selectedFiles = [];
    this.selectedFileName = fileNames;
    this.toggleCommunicationControls(this.isCommunicationEnabled);
    this.syncClosedDateWithStatus(patchedStatus);
    this.applyReleaseDatePermissions();
    this.releaseForm.markAsPristine();
    this.releaseForm.markAsUntouched();
  }

  private syncStatusWithMailCheckbox(isMailChecked: boolean): void {
    if (this.isEditMode) {
      return;
    }

    const statusControl = this.releaseForm.get('status');
    if (!statusControl) {
      return;
    }

    const currentStatus = statusControl.value as ReleaseStatus | null;

    if (isMailChecked) {
      if (currentStatus && currentStatus !== 'To-be-Tested') {
        this.lastManualStatus = currentStatus;
      }
      statusControl.setValue('To-be-Tested', { emitEvent: false });
      this.syncClosedDateWithStatus('To-be-Tested');
      return;
    }

    if (currentStatus === 'To-be-Tested') {
      statusControl.setValue(this.lastManualStatus || 'Upcoming-Release', { emitEvent: false });
      this.syncClosedDateWithStatus(this.lastManualStatus || 'Upcoming-Release');
    }
  }
  private toggleReasonValidator(isRejected: boolean): void {
    const reasonControl = this.releaseForm.get('reject_reason');
    if (!reasonControl) {
      return;
    }

    if (isRejected) {
      reasonControl.setValidators([Validators.required]);
    } else {
      reasonControl.clearValidators();
      reasonControl.setValue('', { emitEvent: false });
    }

    reasonControl.updateValueAndValidity({ emitEvent: false });
  }

  private syncClosedDateWithStatus(status: ReleaseStatus | null | undefined): void {
    const closedDateControl = this.releaseForm.get('closed_date');
    if (!closedDateControl) {
      return;
    }

    if (this.isClosedStatus(status)) {
      closedDateControl.setValidators([Validators.required]);
      if (!closedDateControl.value) {
        closedDateControl.setValue(this.getTodayDate(), { emitEvent: false });
      }
    } else {
      closedDateControl.clearValidators();
      closedDateControl.setValue('', { emitEvent: false });
    }

    closedDateControl.updateValueAndValidity({ emitEvent: false });
  }

  private loadParentReleaseMailData(version: string | null | undefined): void {
    if (this.releaseForm.get('release_type')?.value !== 'External') {
      this.clearParentReleaseContext();
      return;
    }

    const matchedRelease = this.findParentReleaseByVersion(version);
    if (!matchedRelease?.id) {
      this.clearParentReleaseContext();
      return;
    }

    this.parentReleaseId = Number(matchedRelease.id);
    this.authService.getReleaseMailById(this.parentReleaseId).subscribe({
      next: (res: any) => {
        this.parentReleaseMailData = Array.isArray(res) ? res : [];
        this.parentReleaseMailContent = this.extractParentMailContent();
      },
      error: () => {
        this.parentReleaseMailData = [];
        this.parentReleaseMailContent = '';
      }
    });
  }

  private findParentReleaseByVersion(version: string | null | undefined): any {
    const normalizedVersion = this.normalizeVersion(version);
    if (!normalizedVersion) {
      return null;
    }

    return this.releaseList.find((release: any) =>
      this.normalizeVersion(release?.version) === normalizedVersion
    );
  }

  private clearParentReleaseContext(): void {
    this.parentReleaseId = null;
    this.parentReleaseMailData = [];
    this.parentReleaseMailContent = '';
  }

  private extractParentMailContent(): string {
    return this.parentReleaseMailData
      .map((mail: any) => (mail?.message ?? mail?.mail_content ?? '').trim())
      .filter((content: string) => !!content)
      .join('\n\n');
  }

  private buildMailContent(currentMailContent: string | null | undefined): string {
    const newReleaseMailContent = (currentMailContent ?? '').trim();
    const parentMailContent = this.parentReleaseMailContent.trim();

    if (!parentMailContent) {
      return newReleaseMailContent;
    }

    if (!newReleaseMailContent) {
      return parentMailContent;
    }

    if (newReleaseMailContent.includes(parentMailContent)) {
      return newReleaseMailContent;
    }

    return [parentMailContent, newReleaseMailContent].filter(Boolean).join('\n\n');
  }

  private async buildReleaseRequestPayload(raw: any): Promise<any> {
    const { file_url, file_name, file_type, ...requestPayload } = raw;
    const closedDate = this.isClosedStatus(raw.status)
      ? raw.closed_date || this.getTodayDate()
      : null;

    const payload: any = {
      ...requestPayload,
      client: this.formatClientListForPayload(raw.client),
      mail_content: this.buildMailContent(raw.mail_content),
      planned_date: this.storageService.toLocalDate(raw.planned_date),
      released_date: this.storageService.toLocalDate(raw.released_date),
      closed_date: this.storageService.toLocalDate(closedDate)
    };

    if (!this.selectedFiles.length) {
      return payload;
    }

    payload.file_urls = await Promise.all(this.selectedFiles.map(file => this.readFileAsBase64(file)));
    payload.file_names = this.selectedFiles.map(file => file.name);

    return payload;
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = `${reader.result || ''}`;
        const separatorIndex = result.indexOf(',');
        resolve(separatorIndex === -1 ? result : result.substring(separatorIndex + 1));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private formatClientListForPayload(clientList: unknown): string {
    if (!Array.isArray(clientList)) {
      return '';
    }

    return clientList
      .filter(clientId => clientId !== null && clientId !== undefined && clientId !== '')
      .join(',');
  }

  private parseClientListForForm(clientList: unknown): number[] {
    if (Array.isArray(clientList)) {
      return clientList
        .map((client: any) => Number(client?.id ?? client))
        .filter(clientId => !Number.isNaN(clientId));
    }

    if (typeof clientList === 'string') {
      return clientList
        .split(',')
        .map(clientId => Number(clientId.trim()))
        .filter(clientId => !Number.isNaN(clientId));
    }

    return [];
  }

  private normalizeVersion(version: string | null | undefined): string {
    return (version ?? '').trim().toLowerCase();
  }

  private getTodayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private isClosedStatus(status: ReleaseStatus | null | undefined): boolean {
    return this.closedStatuses.includes(status as ReleaseStatus);
  }

  private toggleCommunicationControls(isEnabled: boolean): void {
    const mailControl = this.releaseForm.get('mail_content');
    const fileNameControl = this.releaseForm.get('file_name');
    const fileUrlControl = this.releaseForm.get('file_url');

    if (isEnabled) {
      mailControl?.enable({ emitEvent: false });
      fileNameControl?.enable({ emitEvent: false });
      fileUrlControl?.enable({ emitEvent: false });
    } else {
      mailControl?.disable({ emitEvent: false });
      fileNameControl?.disable({ emitEvent: false });
      fileUrlControl?.disable({ emitEvent: false });
    }

    mailControl?.clearValidators();
    mailControl?.updateValueAndValidity({ emitEvent: false });
  }

  loadData(e: any) {
    this.getProjects();
    this.getEmployees(e);
    this.getVersions(e?.value ?? this.projectid);
    this.getReleases(e?.value ?? this.projectid);

  }

  getProjects(callback?: Function) {
    this.authService.getAllProjectsByEmployeeId(this.empid).subscribe({
      next: (res: any) => {
        this.projectList = res
        if (callback) callback();
      }
    });
  }

  getVersions(projectid: any = this.projectid) {
    this.authService.getVersionsById(projectid).subscribe({
      next: (res: any) => {
        this.versionList = [...new Set(res ?? [])];
      }
    });
  }

  getReleases(projectid: any = this.projectid) {
    this.authService.getReleaseByProjectId(projectid).subscribe({
      next: (res: any) => {
        this.releaseList = Array.isArray(res) ? res : [];
        this.loadParentReleaseMailData(this.releaseForm.get('parent_version')?.value);
      }
    });
  }
  getEmployees(e: any) {
    this.authService.getEmployeelistByProjectId(e.value).subscribe({
      next: (res: any) => {
        this.employeeList = res?.assigned_employee_list
      }
    });
  }
  closeDate() {
    return this.isClosedStatus(this.releaseForm.get('status')?.value);
  }

  getAllClients() {
    this.authService.getAllClients().subscribe({
      next: (res: any[]) => {
        this.clients = res;
      },
      error: () => {
        this.toasterService.error('Failed to load clients');
      }
    });
  }

  get filteredClients(): any[] {
    const search = this.searchControl.value?.toLowerCase().trim() || '';
    const selectedIds = this.releaseForm.get('client')?.value || [];

    if (!search) {
      return this.clients;
    }

    return this.clients
      .filter((client: any) => {
        const matchesSearch = client.company_name
          ?.toLowerCase()
          .includes(search);

        const isSelected =
          Array.isArray(selectedIds) &&
          selectedIds.includes(client.id);

        return matchesSearch || isSelected;
      })
      .sort((a: any, b: any) => {
        const aMatches = a.company_name?.toLowerCase().includes(search);
        const bMatches = b.company_name?.toLowerCase().includes(search);

        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
  }
}
