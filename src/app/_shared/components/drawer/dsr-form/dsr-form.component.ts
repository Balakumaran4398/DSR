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
  completion_percentage?: number;
  entryMode?: 'sub-task' | 'dsr-entries';
  editMode?: boolean;
  selectedEntryId?: number | string | null;
  dsrRecord?: DsrLogEntry | null;
}

interface DsrTaskItem {
  id: number;
  task: string;
  completion_percentage?: number;
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
          date: this.initialDate,
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

  get isEditMode(): boolean {
    return !!this.data?.editMode;
  }

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
    return this.data?.selectedEntryId
      ?? (this.isTaskEntryMode ? this.resolveTaskId() : (this.data?.id ?? null));
  }

  private loadFormOpenData(): void {
    this.selectedDsr = null;
    this.editId = null;
    this.taskForm.get('subtaskid')?.setValue(this.getInitialSelectionId());
    this.taskForm.get('completion_percentage')?.setValue(this.data?.completion_percentage ?? 0);
    this.fromdate = this.formatDateToYMD(this.initialDate);
    this.todate = this.formatDateToYMD(this.initialDate);

    if (this.isEditMode && this.data?.dsrRecord) {
      this.applyEditState(this.data.dsrRecord);
    }

    if (this.isTaskEntryMode) {
      this.getTasksByProjectIdNdEmployeeId();
    } else {
      this.getSubtasks();
      this.loadDsrDetails();
    }
  }

  formatLabel(value: number): string {
    return `${value}%`;
  }

  get totalTime(): string {
    let totalMinutes = 0;
    this.logEntries.forEach(entry => {
      const [h, m] = entry.worked_hours.split(':').map(Number);
      totalMinutes += (h * 60) + m;
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
        this.logEntries = Array.isArray(value) ? value as DsrLogEntry[] : [];
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
      date: this.initialDate,
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
    this.taskForm.get('date')?.setValue(this.storageService.toLocalDate(this.taskForm.get('date')?.value));
    const formVal = this.taskForm.getRawValue();
    const payload = this.selectedDsr ? { ...this.selectedDsr, ...formVal } : formVal;

    if (this.editId) {
      this.saveTaskDsr(this.buildTaskDsrPayload(payload));
      return;
    }

    if (this.isTaskEntryMode) {
      this.saveTaskDsr(this.buildTaskDsrPayload(payload));
      return;
    }

    this.saveSubtaskDsr(payload);
  }

  private buildTaskDsrPayload(payload: Partial<DsrLogEntry> & { username?: string }): Partial<DsrTaskLogEntry> {
    const taskid = payload.taskid
      ?? payload.subtaskid
      ?? this.taskForm.get('subtaskid')?.value
      ?? this.getInitialSelectionId()
      ?? this.taskid;
    const selectedTask = this.taskList.find((item) => item?.id == taskid);
    const { subtaskid, ...taskPayload } = payload;

    return {
      ...taskPayload,
      subtaskid: 0,
      taskid,
      task: payload.task ?? selectedTask?.task ?? this.data?.task ?? ''
    };
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

  // private updateDsr(payload: Partial<DsrLogEntry>): void {
  //   this.authService.updatedsr(payload).subscribe({
  //     next: (res: DsrApiMessage) => {
  //       this.handleSaveSuccess(res, this.isTaskEntryMode ? 'dsr' : 'sub-task', 'updated');
  //     },
  //     error: (err) => {
  //       this.toasterService.error(err?.error?.message || 'Failed to update DSR');
  //     }
  //   });
  // }

  private handleSaveSuccess(res: DsrApiMessage, source: 'sub-task' | 'dsr', action: 'created' | 'updated'): void {
    this.toasterService.success(res?.message || (action === 'updated' ? 'DSR updated successfully' : 'DSR saved successfully'));
    this.drawerService.notifyAction({
      source,
      action,
      payload: res
    });
    this.drawerService.close();
    this.resetForm();
  }

  private applyEditState(item: DsrLogEntry): void {
    const selectedId = this.isTaskEntryMode
      ? (this.taskForm.get('subtaskid')?.value ?? this.getInitialSelectionId() ?? this.taskid)
      : (item.subtaskid ?? this.getInitialSelectionId());

    this.selectedDsr = item;
    this.editId = item.id;
    this.taskForm.patchValue({
      subtaskid: selectedId,
      worked_hours: item.worked_hours,
      comments: item.comments,
      completion_percentage: item.completion_percentage,
      date: item.date ? new Date(item.date) : this.initialDate,
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







// import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
// import { FormControl, FormGroup, Validators } from '@angular/forms';
// import { ActivatedRoute } from '@angular/router';
// import { AuthService } from 'src/app/_core/services/auth.service';
// import { DrawerService } from 'src/app/_core/services/drawer.service';
// import { StorageService } from 'src/app/_core/services/storage.service';
// import { ToasterService } from 'src/app/_core/services/toaster.service';
// import Swal from 'sweetalert2';

// interface DsrDrawerTask {
//   id: number;
//   projectid?: number | string;
//   project_id?: number | string;
//   projectId?: number | string;
//   completion_percentage?: number;
// }

// interface DsrTaskItem {
//   id: number;
//   task: string;
//   completion_percentage?: number;
// }

// interface DsrLogEntry {
//   id: number;
//   subtaskid: number;
//   task: string;
//   comments: string;
//   worked_hours: string;
//   date: string;
//   completion_percentage: number;
// }

// interface DsrApiMessage {
//   message?: string;
// }

// @Component({
//   selector: 'app-dsr-form',
//   templateUrl: './dsr-form.component.html',
//   styleUrls: ['./dsr-form.component.scss']
// })
// export class DsrFormComponent
//   implements OnInit, OnChanges {
//   @Input() data: DsrDrawerTask | null = null;
//   taskForm: FormGroup;
//   taskList: DsrTaskItem[] = [];
//   selectedDsr: DsrLogEntry | null = null;
//   logEntries: DsrLogEntry[] = [];
//   editId: number | null = null;
//   initialDate = new Date();
//   fromdate: string | null = null;
//   todate: string | null = null;
//   projectid: number | string = 0;
//   empid: number | string | null = null;
//   type: string = 'requirement';
//   subtasks: any[] = [];
//   taskid: any;
//   task: any;
//   constructor(private storageService: StorageService, private authService: AuthService, private route: ActivatedRoute, private toasterService: ToasterService, private drawerService: DrawerService) {
//     this.task = this.storageService.getTaskItem();
//     this.taskid = this.resolveTaskId();
//     this.taskForm = new FormGroup({
//       subtaskid: new FormControl(this.data?.id, Validators.required),
//       worked_hours: new FormControl('08:00:00', Validators.required),
//       comments: new FormControl('', Validators.required),
//       completion_percentage: new FormControl(0, Validators.required),
//       date: new FormControl(this.initialDate, Validators.required),
//       username: new FormControl(storageService.getUsername())
//     });
//     this.projectid = this.resolveProjectId();
//     this.empid = this.storageService.getEmpId();
//   }
//   ngOnChanges(changes: SimpleChanges): void {
//     if (changes['data']) {
//       if (this.data) {
//         this.projectid = this.resolveProjectId();
//         this.taskForm.reset({
//           date: this.initialDate,
//           worked_hours: '08:00:00',
//           completion_percentage: this.data?.completion_percentage,
//           subtaskid: this.data?.id,
//           comments: '',
//           username: this.storageService.getUsername()
//         });
//         this.taskForm.markAsUntouched();
//         this.loadFormOpenData();
//       }
//     }
//   }
//   ngOnInit() {
//     this.taskForm.get('subtaskid')?.setValue(this.data?.id);
//     this.projectid = this.resolveProjectId();
//     this.taskid = this.resolveTaskId();
//     this.loadFormOpenData();
//   }

//   private resolveProjectId(): number | string {
//     return this.data?.projectid
//       ?? this.data?.project_id
//       ?? this.data?.projectId
//       ?? this.route.snapshot.paramMap.get('projectid')
//       ?? this.route.parent?.snapshot.paramMap.get('projectid')
//       ?? 0;
//   }

//   private resolveTaskId(): number | string {
//     return this.task?.id
//       ?? this.route.snapshot.paramMap.get('taskid')
//       ?? this.route.parent?.snapshot.paramMap.get('taskid')
//       ?? 0;
//   }

//   private loadFormOpenData(): void {
//     this.taskForm.get('subtaskid')?.setValue(this.data?.id)
//     this.taskForm.get('completion_percentage')?.setValue(this.data?.completion_percentage)
//     this.fromdate = this.formatDateToYMD(this.initialDate);
//     this.todate = this.formatDateToYMD(this.initialDate);
//     this.getTasksByProjectIdNdEmployeeId();
//     this.getDsrDetailsBySubtaskId();
//     this.getSubtasks();
//   }

//   formatLabel(value: number): string {
//     return `${value}%`;
//   }

//   get totalTime(): string {
//     let totalMinutes = 0;
//     this.logEntries.forEach(entry => {
//       const [h, m] = entry.worked_hours.split(':').map(Number);
//       totalMinutes += (h * 60) + m;
//     });

//     const h = Math.floor(totalMinutes / 60);
//     const m = totalMinutes % 60;
//     return `${h}h ${m}m`;
//   }

//   getProgressColor(): string {
//     const val = this.taskForm.get('completion_percentage')?.value || 0;
//     if (val === 100) return '#10b981'; // emerald-500
//     if (val >= 50) return '#f59e0b'; // amber-500
//     return '#ef4444'; // red-500
//   }

//   getStatus(percentage: number): string {
//     if (percentage === 100) return 'green'; // Done
//     if (percentage > 0 && percentage < 100) return 'amber'; // Pending/In Progress
//     return 'red'; // On Track / Started
//   }

//   setCompletion(val: number): void {
//     this.taskForm.patchValue({ completion_percentage: val });
//   }

//   getDsrDetailsBySubtaskId(e?: { value?: number | string }): void {
//     const subtaskId = e?.value ?? this.taskForm.get('subtaskid')?.value ?? this.data?.id;
//     if (!subtaskId) {
//       this.logEntries = [];
//       return;
//     }

//     this.authService.getDsrDetailsBySubtaskId(subtaskId).subscribe({
//       next: (value: any) => {
//         this.logEntries = Array.isArray(value) ? value as DsrLogEntry[] : [];
//       }
//     })
//   }


//   resetForm(): void {
//     this.taskForm.reset({
//       date: this.initialDate,
//       worked_hours: '08:00:00',
//       completion_percentage: 0,
//       subtaskid: this.data?.id,
//       comments: '',
//       username: this.storageService.getUsername()
//     });
//     this.taskForm.markAsUntouched();
//     this.getDsrDetailsBySubtaskId();
//     this.editId = null;
//   }
//   submit(): void {
//     if (this.taskForm.invalid) return;
//     this.taskForm.get('date')?.setValue(this.storageService.toLocalDate(this.taskForm.get('date')?.value));
//     const formVal = this.taskForm.getRawValue();
//     const payload = {
//       ...formVal,
//       subtaskid: this.taskid || formVal.subtaskid
//     };
//     console.log("764784365743687   =", payload.subtaskid);

//     if (this.editId) {
//       const updatedPayload = this.selectedDsr ? { ...this.selectedDsr, ...payload } : payload;
//       this.createDailyStatus(updatedPayload);
//     } else {
//       this.createDailyStatus(payload)
//     }
//   }

//   edit(item: DsrLogEntry): void {
//     this.selectedDsr = item;
//     this.editId = item.id;
//     this.taskForm.patchValue({
//       subtaskid: this.taskid || item.subtaskid,
//       worked_hours: item.worked_hours,
//       comments: item.comments,
//       completion_percentage: item.completion_percentage,
//       date: new Date(item.date),
//       username: this.storageService.getUsername()
//     });
//   }

//   delete(id: number): void {
//     Swal.fire({
//       title: "Are you sure?",
//       text: "You won't be able to revert this!",
//       icon: "warning",
//       showCancelButton: true,
//       confirmButtonColor: "#3085d6",
//       cancelButtonColor: "#d33",
//       confirmButtonText: "Yes, delete it!"
//     }).then((result) => {
//       if (result.isConfirmed) {
//         this.authService.deleteDsr(this.storageService.getUsername(), id).subscribe({
//           next: (res: DsrApiMessage) => {
//             this.toasterService.success(res?.message || 'DSR deleted successfully');
//             this.logEntries = this.logEntries.filter((d) => d.id !== id);
//             if (this.editId === id) {
//               this.editId = null;
//             }
//           },
//           error: (err) => {
//             this.toasterService.error(err?.error?.message || 'Failed to delete DSR')
//           }
//         })
//       }
//     });
//   }
//   createDailyStatus(payload: Partial<DsrLogEntry>): void {
//     this.authService.createDailyStatus(payload).subscribe({
//       // this.authService.createdailyDSR(payload).subscribe({
//       next: (res: DsrApiMessage) => {
//         this.toasterService.success(res?.message || 'DSR saved successfully');
//         this.drawerService.notifyAction({
//           source: 'sub-task',
//           action: 'created',
//           payload: res
//         });
//         this.drawerService.close();
//         this.resetForm();
//       },
//       error: (err) => {
//         this.toasterService.error(err?.error?.message || 'Failed to save DSR');
//       }
//     });
//   }
//   formatDateToYMD(date: Date | string | null): string {
//     if (!date) return 'null';
//     const d = new Date(date);
//     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
//       d.getDate()
//     ).padStart(2, '0')}`;
//   }
//   getSubtasks() {
//     this.authService.getSubtasks(this.task?.id).subscribe({
//       next: (res: any) => {
//         this.subtasks = res;
//         console.log("Subtask List =", this.subtasks);
//         this.taskid = this.subtasks[0]?.id;
//         console.log("TASK   = ", this.taskid);

//       }
//     });
//   }

//   getTasksByProjectIdNdEmployeeId(): void {
//     if (!this.projectid) {
//       this.taskList = [];
//       this.toasterService.error('Project id is missing');
//       return;
//     }

//     if (!this.empid) {
//       this.taskList = [];
//       this.toasterService.error('Employee id is missing');
//       return;
//     }

//     if (this.fromdate && this.todate) {
//       this.authService.getTasksByProjectIdNdEmployeeId(this.projectid, this.empid, 0, this.type, this.fromdate, this.todate).subscribe((res: DsrTaskItem[] | { data?: DsrTaskItem[]; tasks?: DsrTaskItem[] }) => {
//         this.taskList = Array.isArray(res) ? res : (res?.data ?? res?.tasks ?? []);
//         const selectedTaskId = this.taskForm.get('subtaskid')?.value;
//         const hasSelectedTask = this.taskList.some((item) => item?.id == selectedTaskId);

//         if (!hasSelectedTask && this.taskList.length > 0) {
//           this.taskForm.get('subtaskid')?.setValue(this.taskList[0].id);
//           this.taskForm.get('completion_percentage')?.setValue(this.taskList[0].completion_percentage ?? 0);
//           this.getDsrDetailsBySubtaskId({ value: this.taskList[0].id });
//         }
//       })
//     }
//   }
// }
