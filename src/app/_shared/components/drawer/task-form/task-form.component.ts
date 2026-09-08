import { Component, inject, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService, DrawerTaskFormType } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

@Component({
  selector: 'app-task-form',
  templateUrl: './task-form.component.html',
  styleUrls: ['./task-form.component.scss']
})
export class TaskFormComponent implements OnInit, OnChanges {
  private fb = inject(FormBuilder);
  taskForm: FormGroup;
  readonly priorityOptions = [
    { value: 'High', dotClass: 'bg-red-500' },
    { value: 'Medium', dotClass: 'bg-amber-500' },
    { value: 'Low', dotClass: 'bg-green-500' }
  ];
  readonly categoryOptions = [
    { value: 'High', dotClass: 'bg-red-500' },
    { value: 'Medium', dotClass: 'bg-amber-500' },
    { value: 'Low', dotClass: 'bg-green-500' },
    { value: 'Critical', dotClass: 'bg-rose-600' },
    { value: 'Blocked', dotClass: 'bg-slate-500' },
    { value: 'Random', dotClass: 'bg-violet-500' },
    { value: 'Regression', dotClass: 'bg-sky-500' }
  ];
  // Logic Variables
  isEditMode = false;
  isTimelogs = false;
  private _type: DrawerTaskFormType = 'requirement';
  @Input()
  set type(value: any) {
    this._type = this.normalizeTaskType(value);
    this.syncTaskType();
  }
  get type(): DrawerTaskFormType {
    return this._type;
  }
  @Input() data: any;
  // Mock Data
  projectList: any[] = [];
  phaseList: any[] = [];
  versionList: any[] = [];
  employeeList: any[] = [];
  filteredEmployees: any[] = [];
  employeeFilterControl = new FormControl('');
  taskCategory : any[] = [];
  statusList: any = [];
  empid: any = 0;
  projectid: any = 0;
  todayDate = this.getTodayDate();
  projectDetails: any;
  selectedFiles: File[] = [];
  selectedFileName: string = '';
  private originalAssignedFrom: any = null;
  submitting:boolean = false;
  constructor(private authService: AuthService, private drawerService: DrawerService, private route: ActivatedRoute, private toasterService: ToasterService, private storageService: StorageService) {
    this.empid = this.storageService.getEmpId();
    const stored = localStorage.getItem('projectDetails');
    this.projectDetails = stored ? JSON.parse(stored) : null;
    this.projectid = this.projectDetails?.id
    this.loadData({ value: this.projectid })
    this.taskForm = this.fb.group({
      projectid: [this.projectid, Validators.required],
      phaseid: [null],
      task: ['', Validators.required],
      priority: ['Medium', Validators.required],
      start_date: [this.getTodayDate(), Validators.required],
      end_date: [this.getTodayDate(), Validators.required],
      assigned_to: [this.empid, Validators.required],
      status: ['Open', Validators.required],
      category: [''],
      description: ['', Validators.required],
      task_type: [this.type],
      username: [this.storageService.getUsername()],
      assigned_from: [this.storageService.getEmpId(), Validators.required],
      version: ['', Validators.required],
      task_category : ['',Validators.required],
      file_url: [null],
      file_name: [null],
      files: [[]],
    });

    this.employeeFilterControl.valueChanges.subscribe(value => {
      this.applyEmployeeFilter(value);
    });
  }
  ngOnChanges(changes: SimpleChanges): void {
    const stored = localStorage.getItem('projectDetails');
    this.projectDetails = stored ? JSON.parse(stored) : null;
    const projectId = this.projectDetails?.id ?? this.projectid;

    this.taskForm.patchValue({
      projectid: projectId,
    });

    this.getEmployees(projectId);

    if (changes['data']) {
      if (this.data) {
        this.patchTaskForm(this.data);
      } else {
        this.resetTaskForm();
      }
    }

    if (changes['type']) {
      this.syncTaskType();
    }
  }


  get isBugType(): boolean {
    return this.type === 'bug';
  }

  get shouldShowCategory(): boolean {
    return this.isBugType && this.taskForm?.get('status')?.value === 'Failed';
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

  get filteredTaskCategory(): any[] {
    if (!this.isBugType) {
      return this.taskCategory;
    }

    return this.taskCategory.filter(category => `${category ?? ''}`.trim() !== 'Support');
  }

	getTaskCategory(){
    this.authService.getCateory().subscribe({
      next : (res : any[]) =>{
  this.taskCategory = res;
        this.syncTaskCategorySelection();
      },
      error : (err : any) => {
  console.log('task category ',err);
      }
    });
  }  

  private normalizeTaskType(value: any): DrawerTaskFormType {
    const rawType = `${value ?? 'requirement'}`.trim().toLowerCase();
    return rawType.includes('bug') ? 'bug' : 'requirement';
  }

  private syncTaskType(): void {
    this.taskForm?.get('task_type')?.setValue(this.type);
    this.setVersionValidation();
    this.setCategoryValidation();
    this.syncTaskCategorySelection();
  }

  private syncTaskCategorySelection(): void {
    const taskCategoryControl = this.taskForm?.get('task_category');
    if (!taskCategoryControl) return;

    const selectedCategory = `${taskCategoryControl.value ?? ''}`.trim();
    const allowedCategories = this.filteredTaskCategory.map(category => `${category ?? ''}`.trim());

    if (!allowedCategories.length) return;

    if (selectedCategory && !allowedCategories.includes(selectedCategory)) {
      taskCategoryControl.setValue('');
    }
  }

  setVersionValidation(): void {
    const versionControl = this.taskForm?.get('version');
    if (!versionControl) return;
    versionControl.setValidators([Validators.required]);
    versionControl.updateValueAndValidity();
  }

  setCategoryValidation(): void {
    const categoryControl = this.taskForm?.get('category');
    if (!categoryControl) return;

    if (this.shouldShowCategory) {
      categoryControl.setValidators([Validators.required]);
    } else {
      categoryControl.clearValidators();
      categoryControl.setValue('');
    }

    categoryControl.updateValueAndValidity();
  }


  ngOnInit() {
    this.setVersionValidation();
    this.setCategoryValidation();
    this.taskForm.get('status')?.valueChanges.subscribe(() => {
      this.setCategoryValidation();
    });
    if (this.data) {
      this.patchTaskForm(this.data);
    }
  }


  // Getter for easy access to form fields in template
  get rf() {
    return {
      projectid: this.taskForm.get('projectid'),
      phaseid: this.taskForm.get('phaseid'),
      task: this.taskForm.get('task'),
      priority: this.taskForm.get('priority'),
      start_date: this.taskForm.get('start_date'),
      end_date: this.taskForm.get('end_date'),
      assigned_to: this.taskForm.get('assigned_to'),
      status: this.taskForm.get('status'),
      category: this.taskForm.get('category'),
      description: this.taskForm.get('description'),
      version: this.taskForm.get('version'),
      task_category : this.taskForm.get('task_category')
    };
  }


  toggleSideTab() {
    console.log('Close clicked');
  }

  onCancel() {
    this.resetTaskForm();
    console.log('Cancel clicked');
    this.drawerService.close();
  }

  private resetTaskForm(): void {
    this.isEditMode = false;
    this.originalAssignedFrom = null;
    this.resetEmployeeFilter();
    const projectId = this.projectDetails?.id ?? this.projectid;
    this.projectid = projectId;
    this.taskForm.reset({
      projectid: projectId,
      phaseid: null,
      task: '',
      priority: 'Medium',
      start_date: this.getTodayDate(),
      end_date: this.getTodayDate(),
      assigned_to: this.empid,
      status: 'Open',
      category: '',
      description: '',
      task_type: this.type,
      username: this.storageService.getUsername(),
      assigned_from: this.storageService.getEmpId(),
      version: '',
      task_category: '',
      file_url: null,
      file_name: null,
      files: []
    });
    this.selectedFiles = [];
    this.selectedFileName = '';
    this.setVersionValidation();
    this.setCategoryValidation();
    this.syncTaskCategorySelection();
    this.taskForm.markAsPristine();
    this.taskForm.markAsUntouched();
  }

  async onSubmit() {
    if (this.submitting) return;

    if (this.taskForm.valid) {
      this.submitting = true;
      this.taskForm.get("task_type")?.setValue(this.type)
      console.log('Form Submitted:', this.taskForm.value);
      const raw = this.taskForm.value;
      const payload = {
        ...raw,
        start_date: this.storageService.toLocalDate(raw.start_date),
        end_date: this.storageService.toLocalDate(raw.end_date)
      };
      console.log(this.type);
      try {
        const requestPayload = await this.buildTaskRequestPayload(payload);
        if (this.data && this.isEditMode) {
          this.data = { ...this.data, ...requestPayload }
          this.updateTask(this.data)
        } else {
          this.authService.createTask(requestPayload)
            .pipe(finalize(() => {
              this.submitting = false;
            }))
            .subscribe({
            next: ((res: any) => {
              this.toasterService.success(res?.message);
              this.drawerService.notifyAction({
                source: 'task',
                action: 'created',
                payload: res
              });
              this.onCancel();
              // this.taskForm.reset();
            }),
            error: (err: any) => {
              this.toasterService.error(err?.error?.message);
            }
          })
        }
      } catch {
        this.submitting = false;
        this.toasterService.error('Unable to process the selected attachments.');
      }
    } else {
      this.taskForm.markAllAsTouched();
    }
  }

  loadData(e: any) {
    this.getProjects();
    this.getPhasesByProjectId(e);
    this.getStatusList();
    this.getEmployees(e.value);
    this.getVersions(e.value);
    this.getTaskCategory();

  }

  onProjectChange(projectid: any) {
    this.projectid = projectid;
    this.employeeFilterControl.setValue('', { emitEvent: false });
    this.taskForm.patchValue({
      phaseid: null,
      assigned_to: null,
      version: ''
    });
    this.getEmployees(projectid);
    this.getPhasesByProjectId({ value: projectid });
    this.getVersions(projectid);
  }


  getProjects(callback?: Function) {
    this.authService.getAllProjectsByEmployeeId(this.empid).subscribe({
      next: (res: any) => {
        this.projectList = res
        // this.viewOptions = this.commonService.getFieldLabels(this.projectList);
        if (callback) callback();
      }
    });
  }
  getPhasesByProjectId(e: any) {
    this.authService.getPhaseByProjectId(e?.value).subscribe({
      next: (res: any) => {
        this.phaseList = res
      }
    });
  }
  getVersions(projectid: any = this.projectid) {
    this.authService.getVersionsById(projectid).subscribe({
      next: (res: string[]) => {
        this.versionList = res;
      }
    });
  }
  getStatusList() {
    this.authService.getStatusList().subscribe({
      next: (res: any) => {
        this.statusList = res;
      }
    });
  }

  getEmployees(projectid: any) {
    this.authService.getEmployeelistByProjectId(projectid).subscribe({
      next: (res: any) => {
        this.employeeList = Array.isArray(res?.assigned_employee_list) ? res.assigned_employee_list : [];
        this.applyEmployeeFilter(this.employeeFilterControl.value);
      }
    });
  }

  patchTaskForm(data: any): void {
    if (!this.taskForm || !data) return;
    console.log(data);

    this.isEditMode = true;
    const taskType = this.normalizeTaskType(data.task_type ?? this.type);
    const projectId = data.projectid ?? this.projectid;
    const assignedFrom = this.resolveAssignedFrom(data);
    this._type = taskType;
    this.projectid = projectId;
    this.originalAssignedFrom = assignedFrom;
    this.employeeFilterControl.setValue('', { emitEvent: false });
    this.getPhasesByProjectId({ value: projectId });
    this.getEmployees(projectId);
    this.getVersions(projectId);
    this.setVersionValidation();

    this.taskForm.patchValue({
      projectid: projectId,
      phaseid: data.phaseid ?? null,
      task: data.task ?? '',
      priority: data.priority ?? null,
      start_date: data.start_date ? new Date(data.start_date) : null,
      end_date: data.end_date ? new Date(data.end_date) : null,
      assigned_to: data.assigned_to ?? null,
      status: data.status ?? null,
      category: data.category ?? '',
      description: data.description ?? '',
      task_type: taskType,
      username: this.storageService.getUsername(),
      assigned_from: assignedFrom,
      version: data.version ?? '',
      task_category: data.task_category ?? '',
      file_url: null,
      file_name: data.file_name ?? data.filename ?? null,
      files: []
    });
    this.selectedFiles = [];
    this.selectedFileName = data.file_name ?? data.filename ?? '';
    this.setCategoryValidation();
    this.syncTaskCategorySelection();
  }

  private getTodayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  updateTask(selectTask: any) {
    selectTask.username = this.storageService.getUsername();
    this.authService.updateTask(selectTask)
      .pipe(finalize(() => {
        this.submitting = false;
      }))
      .subscribe({
      next: ((res: any) => {
        this.toasterService.success(res?.message);
        this.drawerService.notifyAction({
          source: 'task',
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

  clearSelectedFile(fileInput?: HTMLInputElement | null): void {
    this.selectedFiles = [];
    this.selectedFileName = '';
    this.taskForm.get('file_url')?.setValue(null);
    this.taskForm.get('file_url')?.markAsPristine();
    this.taskForm.get('file_name')?.setValue(null);
    this.taskForm.get('file_name')?.markAsPristine();
    this.taskForm.get('files')?.setValue([]);
    this.taskForm.get('files')?.markAsPristine();

    if (fileInput) {
      fileInput.value = '';
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    if (!files.length) {
      return;
    }

    this.selectedFiles = files;
    this.selectedFileName = this.selectedFiles.map(file => file.name).join(',');
    this.taskForm.patchValue({
      file_url: null,
      file_name: this.selectedFileName,
      files: this.selectedFiles
    });
    this.taskForm.get('file_name')?.markAsDirty();
    this.taskForm.get('files')?.markAsDirty();
  }

  private async buildTaskRequestPayload(payload: any): Promise<any> {
    const { files, file_url, file_name, file_type, ...requestPayload } = payload;
    if (this.isEditMode) {
      requestPayload.assigned_from = this.getAssignedFromForUpdate(requestPayload.assigned_from);
    }

    if (!this.isBugType || !this.selectedFiles.length) {
      return requestPayload;
    }

    const encodedFiles = await Promise.all(this.selectedFiles.map(file => this.readFileAsBase64(file)));

    return {
      ...requestPayload,
      file_urls: encodedFiles,
      file_names: this.selectedFiles.map(file => file.name)
    };
  }

  private resolveAssignedFrom(data: any): any {
    return this.firstPresent(
      data?.assigned_from,
      data?.assignedFrom,
      data?.assigned_from_id,
      data?.assignedFromId,
      this.storageService.getEmpId()
    );
  }

  private getAssignedFromForUpdate(formAssignedFrom: any): any {
    return this.firstPresent(
      this.originalAssignedFrom,
      this.resolveAssignedFrom(this.data),
      formAssignedFrom,
      this.storageService.getEmpId()
    );
  }

  private firstPresent(...values: any[]): any {
    return values.find(value => value !== null && value !== undefined && value !== '');
  }

  getSelectedEmployeeName(): string {
    const selectedId = this.taskForm.get('assigned_to')?.value;
    if (!selectedId) return 'Select Owner';

    const foundEmployee = this.employeeList.find(employee =>
      `${this.firstPresent(employee?.id, employee?.emp_id, employee?.employee_id)}` === `${selectedId}`
    );

    return foundEmployee?.employee_name || 'Select Owner';
  }

  onAssignToOpenedChange(isOpen: boolean): void {
    if (!isOpen) {
      this.resetEmployeeFilter();
    }
  }

  private applyEmployeeFilter(value: string | null): void {
    const filterValue = (value ?? '').toLowerCase().trim();
    const employees = Array.isArray(this.employeeList) ? this.employeeList : [];

    if (!filterValue) {
      this.filteredEmployees = [...employees];
      return;
    }

    this.filteredEmployees = employees.filter((employee: any) =>
      `${employee?.employee_name ?? ''}`.toLowerCase().includes(filterValue)
    );
  }

  private resetEmployeeFilter(): void {
    this.employeeFilterControl.setValue('', { emitEvent: false });
    this.filteredEmployees = Array.isArray(this.employeeList) ? [...this.employeeList] : [];
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
}
