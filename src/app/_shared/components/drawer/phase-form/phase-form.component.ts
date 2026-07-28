import { Component, Input, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

@Component({
  selector: 'app-phase-form',
  templateUrl: './phase-form.component.html',
  styleUrls: ['./phase-form.component.scss']
})
export class PhaseFormComponent {
  isEditMode = false;
  phaseForm: FormGroup;
  @Input() data: any

  projectList: any[] = [];
  statusList: any = [];
  employeeList: any[] = [];
  empid: any = 0;
  projectid: any = 0;
  projectDetails: any;
  constructor(private authService: AuthService, private toasterService: ToasterService, private drawerService: DrawerService, private storageService: StorageService) {
    this.empid = this.storageService.getEmpId();
    const stored = localStorage.getItem('projectDetails');
    this.projectDetails = stored ? JSON.parse(stored) : null;
    this.projectid = this.projectDetails?.id
    // Manually constructing FormGroup instead of using FormBuilder via DI
    this.phaseForm = new FormGroup({
      id: new FormControl(null),
      phase_title: new FormControl('', Validators.required),
      phase_type: new FormControl('Internal', Validators.required),
      projectid: new FormControl(this.projectid, Validators.required),

      version: new FormControl(null), // Optional

      start_date: new FormControl(null, Validators.required),
      end_date: new FormControl(null, Validators.required), // Mandatory

      status: new FormControl('Open', Validators.required),
      assignee: new FormControl(this.empid, Validators.required), // Mandatory
      remark: new FormControl(''), // Optional
      // Mocking storageService.getUsername()
      username: new FormControl(storageService.getUsername())
    });
  }

  ngOnInit() {
    this.loadData({ value: this.projectid })
    this.applyInputData();
  }

  toggleEditMode() {
    if (this.isEditMode) {
      this.patchPhaseForm(this.data);
    } else {
      this.phaseForm.reset({
        status: 'Open',
        phase_type: 'Internal',
        username: this.storageService.getUsername()
      });
    }
  }




  onSubmit() {
    console.log('taskForm Data:', this.phaseForm.value);
    
    if (!this.phaseForm.valid) {
      this.phaseForm.markAllAsTouched();
      return;
    }
    const raw = this.phaseForm.value;
    const payload = {
      ...raw,
      start_date: this.storageService.toLocalDate(raw.start_date),
      end_date: this.storageService.toLocalDate(raw.end_date),
      username: this.storageService.getUsername()
    };
    if (this.isEditMode && this.hasEditData()) {
      // this.data = { ...this.data, ...payload }
      // this.data.username = this.storageService.getUsername();
      const updatePayload = {...this.data,   ...payload    };
      this.authService.updatePhase(updatePayload).subscribe({
        next: ((res: any) => {
          this.toasterService.success(res?.message);
          this.drawerService.notifyAction({
            source: 'phases',
            action: 'updated',
            payload: res
          });
          this.onCancel();
        }),
        error: (err: any) => {
          this.toasterService.error(err?.error?.message);
        }
      })
    } else {
      // this.data.username = this.storageService.getUsername();
      this.authService.createPhase(payload).subscribe({
        next: ((res: any) => {
          this.toasterService.success(res?.message);
          this.drawerService.notifyAction({
            source: 'phases',
            action: 'created',
            payload: res
          });
          this.onCancel();
        }),
        error: (err: any) => {
          this.toasterService.error(err?.error?.message);
        }
      })
    }
  }


  onCancel() {
    this.resetForCreateMode();
    this.drawerService.close();
  }

  private hasEditData(): boolean {
    return !!this.data && typeof this.data === 'object';
  }

  private applyInputData(): void {
    if (!this.phaseForm) return;

    if (this.hasEditData()) {
      this.isEditMode = true;
      this.patchPhaseForm(this.data);
      const projectId = this.data?.projectid;
      if (projectId) {
        this.projectid = projectId;
        this.getEmployees({ value: projectId });
      }
    } else {
      this.resetForCreateMode();
    }
  }

  private resetForCreateMode(): void {
    this.phaseForm.reset({
      id: null,
      phase_title: '',
      status: 'Open',
      phase_type: 'Internal',
      username: this.storageService.getUsername(),
      projectid: this.projectid,
      version: null,
      start_date: null,
      end_date: null,
      assignee: this.empid,
      remark: ''
    });
    this.isEditMode = false;
    this.phaseForm.markAsPristine();
    this.phaseForm.markAsUntouched();
  }

  loadData(e: any) {
    this.getProjects();
    this.getEmployees(e);
    this.getStatusList()
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
  getStatusList() {
    this.authService.getStatusList().subscribe({
      next: (res: any) => {
        this.statusList = res;
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
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.applyInputData();
    }
  }
  patchPhaseForm(data: any) {
    if (!data) return;
    this.phaseForm.patchValue({
      id: data.id,
      code: data.code,
      phase_title: data.phase_title,
      phase_type: data.phase_type,
      projectid: data.projectid,
      version: data.version,
      start_date: data.start_date,
      end_date: data.end_date,
      status: data.status,
      assignee: data.assignee,
      remark: data.remark
    });

  }
}
