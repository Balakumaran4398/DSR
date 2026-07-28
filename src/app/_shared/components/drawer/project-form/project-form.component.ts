import { AfterViewInit, Component, ElementRef, inject, Input, OnChanges, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { map, Observable, startWith } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

@Component({
  selector: 'app-project-form',
  templateUrl: './project-form.component.html',
  styleUrls: ['./project-form.component.scss']
})
export class ProjectFormComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() data: any;
  projectForm: FormGroup;
  submittedData: any = null;
  isEditMode: any = false;
  employeeList: any = [];
  managerList: any = []
  departmentList: any = [];
  filteredManagerList: any[] = [];
  filteredOwnerList: any[] = [];
  filteredDepartmentList: any[] = [];

  // Search Control for Autocomplete
  searchControl = new FormControl(' ');
  managerFilterControl = new FormControl('');
  ownerFilterControl = new FormControl('');
  departmentFilterControl = new FormControl('');
  filteredEmployees: Observable<any[]>;

  @ViewChild('employeeInput') employeeInput!: ElementRef<HTMLInputElement>;
  constructor(private authService: AuthService, private drawerService: DrawerService, private fb: FormBuilder, private storageService: StorageService, private toasterService: ToasterService) {
    this.projectForm = this.fb.group({
      project_title: ['', Validators.required],
      client: ['', Validators.required],
      start_date: ['', Validators.required],
      end_date: ['', Validators.required],
      assigned_manager: [null, Validators.required],
      project_owner: [null, Validators.required],
      ispublic: [false],
      deptid: [null, Validators.required],
      employee_list: [[], Validators.required],
      description: [''],
      username: [storageService.getUsername()]
    });

    this.projectForm.get('ispublic')?.valueChanges.subscribe(isPublic => {
      this.applyPublicProjectValidation(!!isPublic);
    });

    this.managerFilterControl.valueChanges.subscribe(value => {
      this.applyManagerFilter(value);
    });

    this.ownerFilterControl.valueChanges.subscribe(value => {
      this.applyOwnerFilter(value);
    });
    this.departmentFilterControl.valueChanges.subscribe(value => {
      this.applyDepartmentFilter(value);
    });

    // Setup Autocomplete Filter
    this.filteredEmployees = this.searchControl.valueChanges.pipe(
      startWith(null),
      map((empName: string | null) => this._filter(empName)),
    );

  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.applyInputData();
    }
  }
  ngAfterViewInit(): void {

  }
  loadData() {
    this.getAllDepartments();
    this.getManagers();

  }

  getManagers() {
    this.authService.getManagerList().subscribe({
      next: (res: any) => {
        this.managerList = Array.isArray(res) ? res : [];
        this.applyManagerFilter(this.managerFilterControl.value);
      }
    });
  }

  getEmployees() {
    this.authService.getEmployeeList().subscribe({
      next: (res: any) => {
        this.employeeList = Array.isArray(res) ? res : [];
        this.applyOwnerFilter(this.ownerFilterControl.value);
        this.filteredEmployees = this.searchControl.valueChanges.pipe(
          startWith(null),
          map((empName: string | null) => this._filter(empName)),
        );
      }
    });
  }
  getAllDepartments() {
    this.authService.getAllDepartments().subscribe({
      next: (res: any) => {
        this.departmentList = Array.isArray(res) ? res : [];
        // Apply initial department filter
        this.applyDepartmentFilter(this.departmentFilterControl.value);
      }
    });
  }
  onDepartmentOpenedChange(isOpen: boolean): void {
  if (isOpen) {
    this.applyDepartmentFilter(this.departmentFilterControl.value);
  }
}
  ngOnInit() {
    this.loadData();
    this.getEmployees();
    this.applyInputData();
  }

  private hasEditData(): boolean {
    return !!this.data && typeof this.data === 'object';
  }

  private applyInputData(): void {
    if (!this.projectForm) return;

    if (this.hasEditData()) {
      this.isEditMode = true;
      this.patchProjectForm(this.data);
    } else {
      this.resetForCreateMode();
    }
  }

  private applyPublicProjectValidation(isPublic: boolean): void {
    const deptControl = this.projectForm.get('deptid');
    const empControl = this.projectForm.get('employee_list');

    if (isPublic) {
      deptControl?.clearValidators();
      empControl?.clearValidators();
      deptControl?.disable({ emitEvent: false });
      this.searchControl.disable({ emitEvent: false });
    } else {
      deptControl?.setValidators([Validators.required]);
      empControl?.setValidators([Validators.required]);
      deptControl?.enable({ emitEvent: false });
      this.searchControl.enable({ emitEvent: false });
    }

    deptControl?.updateValueAndValidity({ emitEvent: false });
    empControl?.updateValueAndValidity({ emitEvent: false });
  }

  // The requested rf getter
  get rf() {
    return {
      project_title: this.projectForm.get('project_title'),
      client: this.projectForm.get('client'),
      start_date: this.projectForm.get('start_date'),
      end_date: this.projectForm.get('end_date'),
      assigned_manager: this.projectForm.get('assigned_manager'),
      project_owner: this.projectForm.get('project_owner'),
      ispublic: this.projectForm.get('ispublic'),
      deptid: this.projectForm.get('deptid'),
      employee_list: this.projectForm.get('employee_list'),
      description: this.projectForm.get('description'),
      username: this.projectForm.get('username')
    };
  }

  get isPublic() { return this.projectForm.get('ispublic')?.value; }

  get selectedEmployeeIds(): number[] {
    return this.projectForm.get('employee_list')?.value || [];
  }

  // Autocomplete Logic
  selected(event: any): void {
    const selectedEmp = event.option.value;
    this.toggleEmployee(selectedEmp.id);

    // Reset Input
    this.employeeInput.nativeElement.value = '';
    this.searchControl.setValue(null);
  }

  private _filter(value: any): any[] {

    const filterValue = typeof value === 'string' ? value.toLowerCase() : '';
    return this.employeeList.filter((emp: any) =>
      emp.employee_name.toLowerCase().includes(filterValue) &&
      !this.selectedEmployeeIds.includes(emp.id)
    );
  }

  // Add/Remove ID from Array
  toggleEmployee(id: number) {
    const currentList = this.selectedEmployeeIds;
    const idx = currentList.indexOf(id);
    let newList;

    if (idx > -1) {
      newList = currentList.filter(x => x !== id); // Remove
    } else {
      newList = [...currentList, id]; // Add
    }

    this.projectForm.patchValue({ employee_list: newList });
    this.projectForm.get('employee_list')?.markAsDirty();

    // Trigger update on searchControl to refresh the list options immediately
    this.searchControl.setValue(this.searchControl.value);
  }

  // Helpers
  getEmployeeName(id: number): string {
    return this.employeeList.find((e: any) => e.id === id)?.employee_name || 'Unknown';
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  getAvatarColor(id: number): string {
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'];
    return colors[id % colors.length];
  }

  onSelectSearchKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  onManagerOpenedChange(isOpen: boolean): void {
    if (isOpen) {
      this.applyManagerFilter(this.managerFilterControl.value);
    }
  }

  onOwnerOpenedChange(isOpen: boolean): void {
    if (isOpen) {
      this.applyOwnerFilter(this.ownerFilterControl.value);
    }
  }

  onSubmit() {
    if (this.projectForm.valid) {
      // Date Formatting Logic
      const formData = { ...this.projectForm.value };
      const formatDate = (date: any) => {
        if (!date) return null;
        const d = new Date(date);
        if (isNaN(d.getTime())) return date;
        const month = '' + (d.getMonth() + 1);
        const day = '' + d.getDate();
        const year = d.getFullYear();
        return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
      };

      formData.start_date = formatDate(formData.start_date);
      formData.end_date = formatDate(formData.end_date);
      this.submittedData = formData;
      this.submittedData.username = this.storageService.getUsername();
      if (this.hasEditData() && this.isEditMode) {
        this.updateProject()
      } else {
        this.authService.createProject(this.submittedData).subscribe({
          next: ((res: any) => {
            this.toasterService.success(res?.message);
            this.drawerService.notifyAction({
              source: 'project',
              action: 'created',
              payload: res
            });
            this.closeProjectForm();
          }),
          error: (err: any) => {
            this.toasterService.error(err?.error?.message);
          }
        })
      }
    } else {
      this.projectForm.markAllAsTouched();
    }
  }

  patchProjectForm(data: any): void {
    if (!data) return;

    this.projectForm.patchValue({
      project_title: data?.project_title ?? '',
      client: data?.client ?? '',
      start_date: data?.start_date
        ? new Date(data.start_date).toISOString().split('T')[0]
        : '',
      end_date: data?.end_date
        ? new Date(data.end_date).toISOString().split('T')[0]
        : '',
      assigned_manager: data?.assigned_manager ?? null,
      project_owner: data?.project_owner ?? null,
      ispublic: data?.ispublic ?? false,
      deptid: data?.deptid ?? null,
      employee_list: data?.employee_list ?? [],
      description: data?.description ?? '',
    });

    this.projectForm.markAllAsTouched();
    this.projectForm.updateValueAndValidity();
  }

  updateProject() {

    this.data.username = this.storageService.getUsername();
    this.data = { ...this.data, ...this.submittedData }
    this.authService.updateProject(this.data).subscribe({
      next: ((res: any) => {
        this.toasterService.success(res?.message);
        this.drawerService.notifyAction({
          source: 'project',
          action: 'updated',
          payload: res
        });
        this.closeProjectForm();
      }),
      error: (err: any) => {
        this.toasterService.error(err?.error?.message);
      }
    })
  }
  resetForCreateMode() {
    this.isEditMode = false;
    this.submittedData = null;
    this.projectForm.reset({
      project_title: '',
      client: '',
      start_date: '',
      end_date: '',
      assigned_manager: null,
      project_owner: null,
      ispublic: false,
      deptid: null,
      employee_list: [],
      description: '',
      username: this.storageService.getUsername()
    });
    this.searchControl.setValue(null, { emitEvent: false });
    this.managerFilterControl.setValue('', { emitEvent: false });
    this.ownerFilterControl.setValue('', { emitEvent: false });
    this.applyManagerFilter('');
    this.applyOwnerFilter('');
    this.applyDepartmentFilter('');
    this.applyPublicProjectValidation(false);
    this.projectForm.markAsPristine();
    this.projectForm.markAsUntouched();
  }

  closeProjectForm() {
    this.resetForCreateMode();
    this.drawerService.close();
  }

  private applyManagerFilter(value: string | null): void {
    const filterValue = (value ?? '').toLowerCase().trim();
    this.filteredManagerList = this.managerList.filter((manager: any) =>
      (manager?.employee_name ?? '').toLowerCase().includes(filterValue)
    );
  }

  private applyOwnerFilter(value: string | null): void {
    const filterValue = (value ?? '').toLowerCase().trim();
    this.filteredOwnerList = this.employeeList.filter((employee: any) =>
      (employee?.employee_name ?? '').toLowerCase().includes(filterValue)
    );
  }
  private applyDepartmentFilter(value: string | null): void {
    const filterValue = (value ?? '').toLowerCase().trim();
   
    this.filteredDepartmentList = this.departmentList.filter((department: any) =>
      (department?.department_name ?? '').toLowerCase().includes(filterValue)
    );
  }
}
