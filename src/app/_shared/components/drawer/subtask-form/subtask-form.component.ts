import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

@Component({
  selector: 'app-subtask-form',
  templateUrl: './subtask-form.component.html',
  styleUrls: ['./subtask-form.component.scss']
})
export class SubtaskFormComponent implements OnInit, OnChanges {
  isEditMode = false;
  formTitle = 'Create New Sub-Task';
  subTaskForm: FormGroup;
  projectid: any = 0;
  @Input() data: any;
  minDate = new Date();
  statusList: any[] = [];
  task: any;
  constructor(private storageService: StorageService, private route: ActivatedRoute, private drawerService: DrawerService, private toasterService: ToasterService, private authService: AuthService) {
    this.task = storageService.getTaskItem();
    this.subTaskForm = new FormGroup({
      id: new FormControl(null),
      taskid: new FormControl(this.task?.id, Validators.required),
      task: new FormControl('', Validators.required),
      priority: new FormControl('Medium', Validators.required),
      status: new FormControl('Open', Validators.required),
      start_date: new FormControl(null, Validators.required),
      end_date: new FormControl(null, Validators.required),
      description: new FormControl(''),
      employeeid: new FormControl(this.storageService.getEmpId()),
      username: new FormControl(storageService.getUsername())
    });

  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.formTitle = this.data?.drawerTitle ?? 'Create New Sub-Task';

      if (this.hasEditData()) {
        this.task = this.storageService.getTaskItem();
        this.patchTaskForm(this.data)
      } else {
        this.resetForCreateMode();
      }
    }
  }
  ngOnInit() {
    this.getStatusList();
  }

  getStatusList() {
    this.authService.getStatusList().subscribe({
      next: (res: any) => {
        this.statusList = res;
      }
    });
  }

  onSubmit() {
    if (this.subTaskForm.valid) {
      const raw = this.subTaskForm.value;
      const payload = {
        ...raw,
        employeeid: raw.employeeid?.id ?? raw.employeeid,
        start_date: this.storageService.toLocalDate(raw.start_date),
        end_date: this.storageService.toLocalDate(raw.end_date)
      };

      console.log('Form Submitted:', payload);
      if (this.hasEditData() && this.isEditMode) {
        this.updateTask(payload);
      } else {
        this.authService.createSubtask(payload).subscribe({
          next: (res: any) => {
            this.toasterService.success(res?.message);
            this.drawerService.notifyAction({
              source: 'sub-task',
              action: 'created',
              payload: res
            });
            this.onCancel();
          },
          error: (err: any) => {
            this.toasterService.error(err?.error?.message);
          }
        });
      }

    } else {
      this.subTaskForm.markAllAsTouched();
    }
  }


  onCancel() {
    this.resetForCreateMode();
    this.drawerService.close();

  }

  private hasEditData(): boolean {
    return this.data?.mode === 'edit';
  }

  private resetForCreateMode(): void {
    this.task = this.storageService.getTaskItem();
    const taskId = this.data?.taskid ?? this.task?.id ?? null;
    this.subTaskForm.reset({
      id: null,
      task: '',
      status: 'Open',
      priority: 'Medium',
      taskid: taskId,
      start_date: null,
      end_date: null,
      description: '',
      employeeid: this.storageService.getEmpId(),
      username: this.storageService.getUsername()
    });
    this.isEditMode = false;
    this.formTitle = this.data?.drawerTitle ?? 'Create New Sub-Task';
    this.subTaskForm.markAsPristine();
    this.subTaskForm.markAsUntouched();
  }

  patchTaskForm(data: any): void {
    if (!this.subTaskForm || !data) return;
    this.isEditMode = true;
    this.formTitle = data?.drawerTitle ?? 'Update Sub-Task';
    this.subTaskForm.patchValue({
      id: data.id,
      task: data.task ?? '',
      priority: data.priority ?? null,
      start_date: data.start_date ? new Date(data.start_date) : null,
      end_date: data.end_date ? new Date(data.end_date) : null,
      status: data.status ?? null,
      description: data.description ?? '',
      username: this.storageService.getUsername(),
      taskid: data.taskid ?? ''
    });


  }

  updateTask(selectTask: any) {
    selectTask.username = this.storageService.getUsername();
    selectTask = { ...this.data, ...selectTask }
    if (selectTask.employeeid?.value !== undefined) {
      selectTask.employeeid = selectTask.employeeid.value;
    }
    this.authService.updateSubtask(selectTask).subscribe({
      next: ((res: any) => {
        this.toasterService.success(res?.message);
        this.drawerService.notifyAction({
          source: 'sub-task',
          action: 'updated',
          payload: res
        });
        this.onCancel();
      }),
      error: (err: any) => {
        this.toasterService.error(err?.error?.message);
      }
    })
  }

  normalizeDate(date: Date): Date {
    if (!date) return date;
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
  }

}
