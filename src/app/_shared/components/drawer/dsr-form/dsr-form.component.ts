import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import Swal from 'sweetalert2';

interface DsrDrawerTask {
  id?: number;
  taskid?: number | string;
  task_id?: number | string;
  task?: string;
  projectid?: number | string;
  project_id?: number | string;
  projectId?: number | string;
  projectTitle?: string;
  project_title?: string;
  completion_percentage?: number;
  entryMode?: 'sub-task' | 'dsr-entries';
  editMode?: boolean;
  selectedEntryId?: number | string | null;
  dsrRecord?: DsrLogEntry | null;
  fixedDsrDate?: string | null;
  notSendDsrRequestId?: string | number | null;
  not_send_dsr_request_id?: string | number | null;
  request_id?: string | number | null;
  requestId?: string | number | null;
  generatedTaskId?: string | number | null;
  employeeId?: string | number | null;
  employeeName?: string | null;
  dsrDraft?: {
    formValue?: Record<string, any>;
    editId?: number | null;
    selectedDsr?: DsrLogEntry | null;
  } | null;
}

interface DsrTaskItem {
  id: number | string;
  task: string;
  completion_percentage?: number;
  projectid?: number | string;
  project_id?: number | string;
  [key: string]: any;
}

interface DsrLogEntry {
  id: number;
  subtaskid: number;
  taskid?: number | string;
  task: string;
  comments: string;
  worked_hours: string;
  date: string;
  completion_percentage: number;
}
interface DsrTaskLogEntry {
  id?: number;
  subtaskid: number;
  taskid: number | string;
  task: string;
  comments: string;
  worked_hours: string;
  date: string;
  completion_percentage: number;
  username?: string;
  request_id?: number | string;
}

interface DsrApiMessage {
  message?: string;
}

@Component({
  selector: 'app-dsr-form',
  templateUrl: './dsr-form.component.html',
  styleUrls: ['./dsr-form.component.scss']
})
export class DsrFormComponent
  implements OnInit, OnChanges {
  @Input() data: DsrDrawerTask | null = null;
  taskForm: FormGroup;
  taskList: DsrTaskItem[] = [];
  taskListLoading = false;
  taskListError = '';
  projectList: any[] = [];
  projectsLoading = false;
  projectsError = '';
  selectedProjectId: number | string | null = null;
  private approvedProjectRequestVersion = 0;
  private approvedTaskRequestVersion = 0;
  private preserveDsrDraft = false;
  selectedDsr: DsrLogEntry | null = null;
  logEntries: DsrLogEntry[] = [];
  editId: number | null = null;
  initialDate = new Date();
  fromdate: string | null = null;
  todate: string | null = null;
  projectid: number | string = 0;
  empid: number | string | null = null;
  type: string = 'requirement';
  subtasks: any[] = [];
  taskid: any;
  task: any;
  constructor(private storageService: StorageService, private authService: AuthService, private route: ActivatedRoute, private toasterService: ToasterService, private drawerService: DrawerService) {
    this.task = this.storageService.getTaskItem();
    this.taskid = this.resolveTaskId();
    this.taskForm = new FormGroup({
      subtaskid: new FormControl(this.data?.id, Validators.required),
      worked_hours: new FormControl('08:00:00', Validators.required),
      comments: new FormControl('', Validators.required),
      completion_percentage: new FormControl(0, Validators.required),
      date: new FormControl(this.initialDate, Validators.required),
      username: new FormControl(storageService.getUsername())
    });
    this.projectid = this.resolveProjectId();
    this.empid = this.storageService.getEmpId();
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      if (this.data) {
        this.task = this.storageService.getTaskItem();
        this.projectid = this.resolveProjectId();
        this.taskid = this.resolveTaskId();
        this.selectedDsr = null;
        this.editId = null;
        this.taskForm.reset({
          date: this.getEntryDate(),
          worked_hours: '08:00:00',
          completion_percentage: this.data?.completion_percentage ?? 0,
          subtaskid: this.getInitialSelectionId(),
          comments: '',
          username: this.storageService.getUsername()
        });
        this.taskForm.markAsUntouched();
        this.loadFormOpenData();
      }
    }
  }
  ngOnInit() {
    this.taskForm.get('subtaskid')?.setValue(this.getInitialSelectionId());
    this.projectid = this.resolveProjectId();
    this.taskid = this.resolveTaskId();
    this.loadFormOpenData();
  }

  get isTaskEntryMode(): boolean {
    return this.data?.entryMode === 'dsr-entries';
  }

  get selectionLabel(): string {
    return this.isTaskEntryMode ? 'Select Task' : 'Select Sub Task';
  }

  get selectionPlaceholder(): string {
    return this.isTaskEntryMode ? 'Choose a task' : 'Choose a sub task';
  }

  get isApprovedRequestFlow(): boolean {
    return this.isTaskEntryMode && !!this.data?.notSendDsrRequestId;
  }

  get canCreateTaskFromApprovedDsr(): boolean {
    const projectId = `${this.selectedProjectId ?? ''}`.trim();
    return !!projectId && projectId !== '0';
  }

  openNewTask(): void {
    if (!this.isApprovedRequestFlow || !this.canCreateTaskFromApprovedDsr) return;

    const approvedDate = this.formatDateToYMD(this.getEntryDate());
    const draftValue = this.taskForm.getRawValue();
    const selectedTask = this.taskList.find(task => `${task.id}` === `${draftValue.subtaskid ?? ''}`);
    const returnToDsrContext: Record<string, any> = {
      entryMode: 'dsr-entries',
      employeeId: this.data?.employeeId,
      employeeName: this.data?.employeeName,
      project_id: this.selectedProjectId,
      fixedDsrDate: approvedDate,
      notSendDsrRequestId: this.resolveHistoricalRequestId(),
      selectedEntryId: draftValue.subtaskid,
      taskid: draftValue.subtaskid,
      task: selectedTask?.task ?? this.data?.task,
      completion_percentage: draftValue.completion_percentage,
      dsrDraft: {
        formValue: draftValue,
        editId: this.editId,
        selectedDsr: this.selectedDsr
      }
    };

    this.drawerService.open('task', {
      mode: 'create',
      project_id: this.selectedProjectId,
      employee_id: this.data?.employeeId,
      employee_name: this.data?.employeeName,
      start_date: approvedDate,
      end_date: approvedDate,
      locked_fields: ['start_date', 'end_date'],
      not_send_dsr_request_id: this.resolveHistoricalRequestId(),
      returnToDsrContext
    }, 'requirement');
  }

  get isEditMode(): boolean {
    return !!this.data?.editMode;
  }

  get isDateLocked(): boolean {
    return this.hasValidHistoricalTaskContext;
  }

  get isTaskSelectionLocked(): boolean {
    return this.isDateLocked && this.normalizeRequestId(this.data?.generatedTaskId) !== null;
  }

  private get hasValidHistoricalTaskContext(): boolean {
    if (this.isEditMode || !this.isTaskEntryMode) return false;

    const fixedDate = this.normalizeDsrDate(this.data?.fixedDsrDate);
    const generatedTaskId = this.normalizeRequestId(this.data?.generatedTaskId);
    if (!fixedDate || this.resolveHistoricalRequestId() === null) return false;
    if (generatedTaskId === null) return true;

    const taskId = this.normalizeRequestId(this.data?.taskid ?? this.data?.task_id ?? this.data?.id);
    const selectedTaskId = this.normalizeRequestId(this.data?.selectedEntryId ?? this.taskForm?.get('subtaskid')?.value);

    return taskId !== null
      && `${generatedTaskId}` === `${taskId}`
      && (selectedTaskId === null || `${selectedTaskId}` === `${generatedTaskId}`);
  }

  get isEmployee(): boolean {
    return !!this.storageService.roles?.isEmployee;
  }

  readonly dsrDateFilter = (date: Date | null): boolean => {
    if (!date || !this.isEmployee) return true;

    const candidate = this.normalizeDsrDate(date);
    if (!candidate) return false;

    if (this.isDateLocked) {
      const approvedDate = this.normalizeDsrDate(this.data?.fixedDsrDate);
      return !!approvedDate && candidate.getTime() === approvedDate.getTime();
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (candidate.getTime() >= today.getTime()) return true;

    if (!this.isEditMode) return false;

    const savedEditDate = this.normalizeDsrDate(
      this.selectedDsr?.date ?? this.data?.dsrRecord?.date
    );

    return !!savedEditDate && candidate.getTime() === savedEditDate.getTime();
  };

  private resolveProjectId(): number | string {
    return this.data?.projectid
      ?? this.data?.project_id
      ?? this.data?.projectId
      ?? this.route.snapshot.paramMap.get('projectid')
      ?? this.route.parent?.snapshot.paramMap.get('projectid')
      ?? 0;
  }

  private resolveTaskId(): number | string {
    return this.data?.taskid
      ?? this.data?.task_id
      ?? this.data?.id
      ?? this.task?.id
      ?? this.route.snapshot.paramMap.get('taskid')
      ?? this.route.parent?.snapshot.paramMap.get('taskid')
      ?? 0;
  }

  private getInitialSelectionId(): number | string | null {
    if (this.hasValidHistoricalTaskContext) return this.data?.generatedTaskId ?? null;
    if (this.isTaskEntryMode && this.data?.notSendDsrRequestId) {
      return this.data?.selectedEntryId ?? null;
    }
    return this.data?.selectedEntryId
      ?? (this.isTaskEntryMode ? this.resolveTaskId() : (this.data?.id ?? null));
  }

  private loadFormOpenData(): void {
    this.selectedDsr = null;
    this.editId = null;
    this.taskForm.get('subtaskid')?.setValue(this.getInitialSelectionId());
    this.taskForm.get('completion_percentage')?.setValue(this.data?.completion_percentage ?? 0);
    const entryDate = this.getEntryDate();
    this.taskForm.get('date')?.setValue(entryDate);
    this.fromdate = this.formatDateToYMD(entryDate);
    this.todate = this.formatDateToYMD(entryDate);

    if (this.isEditMode && this.data?.dsrRecord) {
      this.applyEditState(this.data.dsrRecord);
    }

    if (this.isTaskEntryMode) {
      if (this.isApprovedRequestFlow) {
        this.approvedTaskRequestVersion = (this.approvedTaskRequestVersion || 0) + 1;
        const requestedProjectId = this.data?.projectid ?? this.data?.project_id ?? this.data?.projectId;
        this.selectedProjectId = requestedProjectId !== null
          && requestedProjectId !== undefined
          && `${requestedProjectId}`.trim() !== ''
          && `${requestedProjectId}` !== '0'
          ? requestedProjectId
          : null;
        this.taskList = [];
        this.taskListError = '';
        this.logEntries = [];
        this.projectList = [];
        this.loadProjectsForApprovedRequest();
      } else {
        this.getTasksByProjectIdNdEmployeeId();
      }
    } else {
      this.getSubtasks();
      this.loadDsrDetails();
    }

    this.restoreDsrDraft();
  }

  private restoreDsrDraft(): void {
    const draft = this.data?.dsrDraft;
    if (!draft) return;

    const formValue = draft.formValue ?? {};
    const draftDate = this.normalizeDsrDate(formValue['date']);
    this.taskForm.patchValue({
      ...formValue,
      date: draftDate ?? this.getEntryDate(),
      subtaskid: formValue['subtaskid'] ?? this.data?.selectedEntryId ?? this.getInitialSelectionId()
    });
    this.editId = draft.editId ?? null;
    this.selectedDsr = draft.selectedDsr ?? null;
    this.selectedProjectId = this.data?.project_id ?? this.selectedProjectId;
    this.preserveDsrDraft = true;
  }

  private loadProjectsForApprovedRequest(): void {
    const requestVersion = this.approvedProjectRequestVersion = (this.approvedProjectRequestVersion || 0) + 1;
    const employeeId = this.data?.employeeId;
    if (!employeeId) {
      this.projectList = [];
      this.projectsLoading = false;
      this.projectsError = 'Employee id is missing';
      return;
    }

    this.projectsLoading = true;
    this.projectsError = '';
    const requestedProjectId = this.data?.projectid ?? this.data?.project_id ?? this.data?.projectId;
    this.authService.getAllProjectsByEmployeeId(employeeId).subscribe({
      next: (res: any) => {
        if (requestVersion !== this.approvedProjectRequestVersion) return;
        const rows = Array.isArray(res) ? res : (res?.data ?? res?.projects ?? res?.projectList ?? []);
        this.projectList = rows
          .map((project: any) => ({
            ...project,
            id: project?.id ?? project?.project_id ?? project?.projectid ?? project?.projectId,
            project_title: project?.project_title ?? project?.project_name ?? project?.projectName ?? project?.name ?? ''
          }))
          .filter((project: any) => project.id !== null && project.id !== undefined && `${project.id}`.trim() !== '');
        this.projectsLoading = false;
        const matchingProject = requestedProjectId === null || requestedProjectId === undefined
          ? null
          : this.projectList.find(project => `${project.id}` === `${requestedProjectId}`);
        if (matchingProject) {
          this.selectedProjectId = matchingProject.id;
        } else if (this.selectedProjectId !== null) {
          this.projectList = [
            { id: this.selectedProjectId, project_title: this.data?.projectTitle || this.data?.project_title || 'Request project' },
            ...this.projectList
          ];
        }
        if (this.selectedProjectId !== null) this.getTasksByProjectIdNdEmployeeId();
      },
      error: (err: any) => {
        if (requestVersion !== this.approvedProjectRequestVersion) return;
        this.projectsLoading = false;
        this.projectList = [];
        this.projectsError = err?.error?.message || 'Unable to load projects for this employee.';
      }
    });
  }

  onProjectSelectionChange(projectId: number | string | null): void {
    this.approvedTaskRequestVersion = (this.approvedTaskRequestVersion || 0) + 1;
    this.selectedProjectId = projectId;
    this.taskList = [];
    this.taskListError = '';
    this.taskListLoading = false;
    this.logEntries = [];
    this.taskForm.get('subtaskid')?.setValue(null);
    this.taskForm.get('completion_percentage')?.setValue(0);
    if (projectId === null || projectId === undefined || `${projectId}`.trim() === '') return;
    this.getTasksByProjectIdNdEmployeeId();
  }

  formatLabel(value: number): string {
    return `${value}%`;
  }

  get totalTime(): string {
    let totalMinutes = 0;
    this.logEntries.forEach(entry => {
      const value = entry?.worked_hours;
      if (typeof value === 'number' && Number.isFinite(value)) {
        totalMinutes += Math.round(value * 60);
        return;
      }

      const parts = `${value ?? ''}`.trim().split(':').map(Number);
      if (parts.length >= 2 && parts.every(Number.isFinite)) {
        totalMinutes += (parts[0] * 60) + parts[1];
      }
    });

    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
  }

  getProgressColor(): string {
    const val = this.taskForm.get('completion_percentage')?.value || 0;
    if (val === 100) return '#10b981'; // emerald-500
    if (val >= 50) return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
  }

  getStatus(percentage: number): string {
    if (percentage === 100) return 'green'; // Done
    if (percentage > 0 && percentage < 100) return 'amber'; // Pending/In Progress
    return 'red'; // On Track / Started
  }

  setCompletion(val: number): void {
    this.taskForm.patchValue({ completion_percentage: val });
  }

  onSelectionChange(e?: { value?: number | string }): void {
    this.preserveDsrDraft = false;
    const selectedId = e?.value ?? this.taskForm.get('subtaskid')?.value ?? this.getInitialSelectionId();
    if (!selectedId) {
      this.logEntries = [];
      return;
    }

    this.updateCompletionFromSelection(selectedId);
    this.loadDsrDetails(selectedId);
  }

  private loadDsrDetails(selectedId?: number | string | null): void {
    const itemId = selectedId ?? this.taskForm.get('subtaskid')?.value ?? this.getInitialSelectionId();
    if (!itemId) {
      this.logEntries = [];
      return;
    }

    const request$ = this.isTaskEntryMode
      ? this.authService.getdsrdetailsbytask(itemId)
      : this.authService.getDsrDetailsBySubtaskId(itemId);

    request$.subscribe({
      next: (value: any) => {
        const entries = Array.isArray(value)
          ? value
          : (value?.data ?? value?.dsr ?? value?.details ?? value?.dsr_details ?? []);
        this.logEntries = Array.isArray(entries) ? entries as DsrLogEntry[] : [];
        if (this.isEditMode && this.data?.dsrRecord?.id) {
          const matchedEntry = this.logEntries.find((item) => item.id === this.data?.dsrRecord?.id);
          if (matchedEntry) {
            this.applyEditState(matchedEntry);
          }
        }
      }
    });
  }

  private updateCompletionFromSelection(selectedId?: number | string | null): void {
    if (this.preserveDsrDraft) return;
    if (!selectedId) {
      this.taskForm.get('completion_percentage')?.setValue(0);
      return;
    }
    const list = this.isTaskEntryMode ? this.taskList : this.subtasks;
    const selectedItem = list.find((item: any) => item?.id == selectedId);
    this.taskForm.get('completion_percentage')?.setValue(selectedItem?.completion_percentage ?? 0);
  }


  resetForm(): void {
    this.taskForm.reset({
      date: this.getEntryDate(),
      worked_hours: '08:00:00',
      completion_percentage: 0,
      subtaskid: this.getInitialSelectionId(),
      comments: '',
      username: this.storageService.getUsername()
    });
    this.taskForm.markAsUntouched();
    this.editId = null;
    this.selectedDsr = null;

    if (this.isTaskEntryMode) {
      this.getTasksByProjectIdNdEmployeeId();
    } else {
      this.getSubtasks();
      this.loadDsrDetails();
    }
  }
  submit(): void {
    if (this.taskForm.invalid) return;
    const historicalWorkflowRequested = !!this.data?.fixedDsrDate || !!this.data?.generatedTaskId;
    if (this.isTaskEntryMode && historicalWorkflowRequested && !this.isDateLocked) {
      this.toasterService.error('The approved DSR task context is invalid. Please reopen the approved request.');
      return;
    }
    if (this.isTaskEntryMode && this.isDateLocked && this.resolveHistoricalRequestId() === null) {
      this.toasterService.error('The approved DSR request ID is missing. Please reopen the approved request.');
      return;
    }
    if (this.isDateLocked && this.data?.generatedTaskId
      && `${this.taskForm.get('subtaskid')?.value ?? ''}` !== `${this.data?.generatedTaskId}`) {
      this.toasterService.error('The selected task does not match the approved DSR request. Please reopen the approved request.');
      return;
    }
    this.taskForm.get('date')?.setValue(this.storageService.toLocalDate(this.taskForm.get('date')?.value));
    const formVal = this.taskForm.getRawValue();
    const payload = this.selectedDsr ? { ...this.selectedDsr, ...formVal } : formVal;

    if (this.editId) {
      if (this.isTaskEntryMode) {
        this.saveTaskDsr(this.buildTaskDsrPayload(payload));
      } else {
        this.saveSubtaskDsr(this.buildSubtaskDsrPayload(payload));
      }
      return;
    }

    if (this.isTaskEntryMode) {
      this.saveTaskDsr(this.buildTaskDsrPayload(payload));
      return;
    }

    this.saveSubtaskDsr(this.buildSubtaskDsrPayload(payload));
  }

  private buildSubtaskDsrPayload(payload: Partial<DsrLogEntry> & { username?: string }): Partial<DsrLogEntry> {
    const selectedSubtask = this.getSelectedSubtask();

    return {
      ...payload,
      taskid: selectedSubtask?.taskid
        ?? selectedSubtask?.task_id
        ?? payload.taskid
        ?? this.data?.taskid
        ?? this.data?.task_id
        ?? this.taskid,
      task: payload.task ?? selectedSubtask?.task ?? this.data?.task ?? ''
    };
  }

  private buildTaskDsrPayload(payload: Partial<DsrLogEntry> & { username?: string }): Partial<DsrTaskLogEntry> {
    const taskid = payload.taskid
      ?? payload.subtaskid
      ?? this.taskForm.get('subtaskid')?.value
      ?? this.getInitialSelectionId()
      ?? this.taskid;
    const selectedTask = this.taskList.find((item) => item?.id == taskid);
    const { subtaskid, ...taskPayload } = payload;
    const requestId = this.isDateLocked ? this.resolveHistoricalRequestId() : null;

    return {
      ...taskPayload,
      subtaskid: 0,
      taskid: this.isDateLocked && this.data?.generatedTaskId ? this.data.generatedTaskId : taskid,
      task: payload.task ?? selectedTask?.task ?? this.data?.task ?? '',
      ...(this.isDateLocked ? { date: this.storageService.toLocalDate(this.getEntryDate()) ?? this.formatDateToYMD(this.getEntryDate()) } : {}),
      ...(requestId !== null ? { request_id: requestId } : {})
    };
  }

  private normalizeRequestId(value: unknown): number | string | null {
    if (value === null || value === undefined || `${value}`.trim() === '') return null;
    const normalized = `${value}`.trim();
    const numericValue = Number(normalized);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : normalized;
  }

  private resolveHistoricalRequestId(): number | string | null {
    const candidates = [
      this.data?.notSendDsrRequestId,
      this.data?.not_send_dsr_request_id,
      this.data?.request_id,
      this.data?.requestId,
      this.route?.snapshot?.queryParamMap?.get('notSendDsrRequestId')
    ];

    for (const candidate of candidates) {
      const requestId = this.normalizeRequestId(candidate);
      if (requestId !== null) return requestId;
    }

    return null;
  }

  private getSelectedSubtask(): any | null {
    const selectedSubtaskId = this.taskForm.get('subtaskid')?.value;
    return this.subtasks.find((item: any) => item?.id == selectedSubtaskId) ?? null;
  }

  edit(item: DsrLogEntry): void {
    this.applyEditState(item);
  }

  delete(id: number): void {
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!"
    }).then((result) => {
      if (result.isConfirmed) {
        this.authService.deleteDsr(this.storageService.getUsername(), id).subscribe({
          next: (res: DsrApiMessage) => {
            this.toasterService.success(res?.message || 'DSR deleted successfully');
            this.logEntries = this.logEntries.filter((d) => d.id !== id);
            if (this.editId === id) {
              this.editId = null;
            }
          },
          error: (err) => {
            this.toasterService.error(err?.error?.message || 'Failed to delete DSR')
          }
        })
      }
    });
  }

  private saveSubtaskDsr(payload: Partial<DsrLogEntry>): void {
    this.authService.createDailyStatus(payload).subscribe({
      next: (res: DsrApiMessage) => {
        this.handleSaveSuccess(res, 'sub-task', 'created');
      },
      error: (err) => {
        this.toasterService.error(err?.error?.message || 'Failed to save DSR');
      }
    });
  }

  private saveTaskDsr(payload: Partial<DsrTaskLogEntry>): void {
    this.authService.createdailyDSR(payload).subscribe({
      next: (res: DsrApiMessage) => {
        this.handleSaveSuccess(res, 'dsr', 'created');
      },
      error: (err) => {
        this.toasterService.error(err?.error?.message || 'Failed to save DSR');
      }
    });
  }



  private handleSaveSuccess(res: DsrApiMessage, source: 'sub-task' | 'dsr', action: 'created' | 'updated'): void {
    this.toasterService.success(res?.message || (action === 'updated' ? 'DSR updated successfully' : 'DSR saved successfully'));
    this.drawerService.notifyAction({
      source,
      action,
      payload: source === 'dsr' && this.resolveHistoricalRequestId() !== null
        ? {
          ...res,
          request_id: this.resolveHistoricalRequestId(),
          not_send_dsr_request_id: this.resolveHistoricalRequestId(),
          employee_id: this.data?.employeeId ?? this.empid,
          date: this.formatDateToYMD(this.getEntryDate())
        }
        : res
    });
    this.drawerService.close();
    this.resetForm();
  }

  private applyEditState(item: DsrLogEntry): void {
    const selectedId = this.isTaskEntryMode
      ? (this.taskForm.get('subtaskid')?.value ?? this.getInitialSelectionId() ?? this.taskid)
      : (item.subtaskid ?? this.getInitialSelectionId());
    const editDate = this.normalizeDsrDate(item.date) ?? this.getEntryDate();

    this.selectedDsr = item;
    this.editId = item.id;
    this.fromdate = this.formatDateToYMD(editDate);
    this.todate = this.formatDateToYMD(editDate);
    this.taskForm.patchValue({
      subtaskid: selectedId,
      worked_hours: item.worked_hours,
      comments: item.comments,
      completion_percentage: item.completion_percentage,
      date: editDate,
      username: this.storageService.getUsername()
    });
  }

  formatDateToYMD(date: Date | string | null): string {
    if (!date) return 'null';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }

  private getEntryDate(): Date {
    return this.normalizeDsrDate(this.data?.fixedDsrDate) ?? new Date(this.initialDate);
  }

  private normalizeDsrDate(value: unknown): Date | null {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    const normalized = `${value ?? ''}`.trim();
    if (!normalized) return null;

    const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(normalized);
    const dmyMatch = /^(\d{2})[-/](\d{2})[-/](\d{4})(?:$|[T\s])/.exec(normalized);
    let year: number;
    let month: number;
    let day: number;

    if (ymdMatch) {
      [, year, month, day] = ymdMatch.map(Number);
    } else if (dmyMatch) {
      const [, parsedDay, parsedMonth, parsedYear] = dmyMatch.map(Number);
      year = parsedYear;
      month = parsedMonth;
      day = parsedDay;
    } else {
      const parsedValue = new Date(normalized);
      if (Number.isNaN(parsedValue.getTime())) return null;
      return new Date(parsedValue.getFullYear(), parsedValue.getMonth(), parsedValue.getDate());
    }

    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  getSubtasks() {
    const activeTaskId = this.resolveTaskId();
    if (!activeTaskId) {
      this.subtasks = [];
      this.logEntries = [];
      return;
    }

    this.authService.getSubtasks(activeTaskId).subscribe({
      next: (res: any) => {
        this.subtasks = Array.isArray(res) ? res : [];
        const selectedSubtaskId = this.taskForm.get('subtaskid')?.value;
        const hasSelectedSubtask = this.subtasks.some((item: any) => item?.id == selectedSubtaskId);

        if (!hasSelectedSubtask && this.subtasks.length > 0) {
          this.taskForm.get('subtaskid')?.setValue(this.subtasks[0].id);
          this.taskForm.get('completion_percentage')?.setValue(this.subtasks[0].completion_percentage ?? 0);
          this.loadDsrDetails(this.subtasks[0].id);
          return;
        }

        this.updateCompletionFromSelection(selectedSubtaskId);
        this.loadDsrDetails(selectedSubtaskId);
      }
    });
  }

  getTasksByProjectIdNdEmployeeId(): void {
    if (this.isTaskEntryMode && this.data?.notSendDsrRequestId) {
      const targetEmployeeId = this.data?.employeeId;
      if (!targetEmployeeId) {
        this.taskList = [];
        this.toasterService.error('Employee id is missing');
        return;
      }
      const targetProjectId = this.selectedProjectId;
      if (targetProjectId === null || targetProjectId === undefined || `${targetProjectId}`.trim() === '' || `${targetProjectId}` === '0') {
        this.taskList = [];
        return;
      }
      if (!this.fromdate || !this.todate) {
        this.taskList = [];
        this.taskListError = 'Approved DSR date is missing';
        return;
      }

      this.taskList = [];
      this.taskListError = '';
      this.taskListLoading = true;
      const requestVersion = this.approvedTaskRequestVersion = (this.approvedTaskRequestVersion || 0) + 1;
      this.authService.getProjectActiveTaskList(
        targetProjectId,
        targetEmployeeId,
        this.fromdate
      ).subscribe({
        next: (res: any) => {
          if (requestVersion !== this.approvedTaskRequestVersion) return;
          this.taskListLoading = false;
          const rows = Array.isArray(res) ? res : (res?.data ?? res?.tasks ?? []);
          this.taskList = rows
            .map((row: any) => ({
              ...row,
              id: row?.id ?? row?.taskid ?? row?.task_id,
              task: row?.task ?? row?.task_name ?? row?.taskname ?? '',
              completion_percentage: row?.completion_percentage ?? row?.completionPercentage ?? 0,
              projectid: row?.projectid ?? row?.project_id ?? row?.projectId
            }))
            .filter((task: DsrTaskItem) => task.id !== null
              && task.id !== undefined
              && `${task.id}`.trim() !== ''
              && !this.isClosedTask(task))
            .sort((first: DsrTaskItem, second: DsrTaskItem) =>
              Number(this.taskIncludesDate(second, this.data?.fixedDsrDate))
              - Number(this.taskIncludesDate(first, this.data?.fixedDsrDate))
            );
          const selectedTaskId = this.taskForm.get('subtaskid')?.value;
          this.ensureSelectedTaskInList(selectedTaskId);
          const hasSelectedTask = this.taskList.some((item) => item?.id == selectedTaskId);

          if (!hasSelectedTask && this.taskList.length > 0) {
            this.taskForm.get('subtaskid')?.setValue(this.taskList[0].id);
            this.taskForm.get('completion_percentage')?.setValue(this.taskList[0].completion_percentage ?? 0);
            this.loadDsrDetails(this.taskList[0].id);
            return;
          }

          this.updateCompletionFromSelection(selectedTaskId);
          this.loadDsrDetails(selectedTaskId);
        },
        error: (err: any) => {
          if (requestVersion !== this.approvedTaskRequestVersion) return;
          this.taskListLoading = false;
          this.taskList = [];
          this.logEntries = [];
          this.taskListError = err?.error?.message || 'Unable to load tasks for the approved DSR date and project.';
          this.toasterService.error(this.taskListError);
        }
      });
      return;
    }

    if (!this.projectid) {
      this.taskList = [];
      this.toasterService.error('Project id is missing');
      return;
    }

    if (!this.empid) {
      this.taskList = [];
      this.toasterService.error('Employee id is missing');
      return;
    }

    if (this.fromdate && this.todate) {
      this.authService.getTasksByProjectIdNdEmployeeId(this.projectid, this.empid, 0, this.type, this.fromdate, this.todate).subscribe((res: DsrTaskItem[] | { data?: DsrTaskItem[]; tasks?: DsrTaskItem[] }) => {
        this.taskList = Array.isArray(res) ? res : (res?.data ?? res?.tasks ?? []);
        const selectedTaskId = this.taskForm.get('subtaskid')?.value;
        this.ensureSelectedTaskInList(selectedTaskId);
        const hasSelectedTask = this.taskList.some((item) => item?.id == selectedTaskId);

        if (!hasSelectedTask && this.taskList.length > 0) {
          this.taskForm.get('subtaskid')?.setValue(this.taskList[0].id);
          this.taskForm.get('completion_percentage')?.setValue(this.taskList[0].completion_percentage ?? 0);
          this.loadDsrDetails(this.taskList[0].id);
          return;
        }

        this.updateCompletionFromSelection(selectedTaskId);
        this.loadDsrDetails(selectedTaskId);
      })
    }
  }

  private isClosedTask(task: DsrTaskItem): boolean {
    const rawStatus = task?.['status']
      ?? task?.['task_status']
      ?? task?.['taskStatus']
      ?? task?.['status_name'];
    const status = `${rawStatus?.name ?? rawStatus?.status_name ?? rawStatus ?? ''}`
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
    return status === 'closed';
  }

  private taskIncludesDate(task: DsrTaskItem, dateValue: unknown): boolean {
    const targetDate = this.normalizeDsrDate(dateValue);
    if (!targetDate) return false;
    const startDate = this.normalizeDsrDate(task?.['start_date'] ?? task?.['startDate'] ?? task?.['from_date']);
    const endDate = this.normalizeDsrDate(task?.['end_date'] ?? task?.['endDate'] ?? task?.['to_date']) ?? startDate;
    if (!startDate || !endDate) return false;
    const targetTime = targetDate.getTime();
    return startDate.getTime() <= targetTime && targetTime <= endDate.getTime();
  }

  private ensureSelectedTaskInList(selectedTaskId?: number | string | null): void {
    if (!this.isTaskEntryMode || !selectedTaskId) {
      return;
    }

    const hasSelectedTask = this.taskList.some((item) => item?.id == selectedTaskId);
    if (hasSelectedTask) {
      return;
    }

    this.taskList = [
      {
        id: Number(selectedTaskId),
        task: this.data?.task || `Task #${selectedTaskId}`,
        completion_percentage: this.data?.completion_percentage ?? 0
      },
      ...this.taskList
    ];
  }
}
