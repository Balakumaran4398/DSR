import { Component, inject, Input, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, FormControl, Validators } from '@angular/forms';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

@Component({
  selector: 'app-assign-ticket-form',
  templateUrl: './assign-ticket-form.component.html',
  styleUrls: ['./assign-ticket-form.component.scss']
})
export class AssignTicketFormComponent {
  @Input() data: any;
  private fb = inject(FormBuilder);
  assignForm!: FormGroup;
  isEditMode = false;
  departments: any[] = [];
  filteredDepartmentList: any[] = [];
  employeeFilterControl = new FormControl('');
  allEmployees: any[] = [];
  employees: any[] = [];
  filteredEmployees: any[] = [];
  clients: any[] = [];
  filteredClients: any[] = [];
  productList: any[] = [];
  filteredProducts: any[] = [];
  clientSearchText = '';
  productSearchText = '';
  empid: any = 0;
  filteredEmployeesList:any[] =[];
  departmentFilterControl = new FormControl('');
  availableVersions: string[] = [];
  statusList: any[] = [];
  private readonly hiddenStatusNames = new Set([
    'tobetested',
    'approved',
    'delayed',
    'failed',
    'pass',
    'passed'
  ]);
  private readonly hiddenStatusIds = new Set([2, 3, 6, 9, 10]);
  submitted = false;

  types = [
    'Support',
    'Requirement',
    'Bug',
    'Business'
  ];

  readonly priorityOptions = [
    { id: 1, value: 'High', dotClass: 'bg-red-500' },
    { id: 2, value: 'Medium', dotClass: 'bg-amber-500' },
    { id: 3, value: 'Low', dotClass: 'bg-green-500' }
  ];

  constructor(
    private authService: AuthService,
    private drawerService: DrawerService,
    private toasterService: ToasterService,
    private storageService: StorageService
  ) {
    this.empid = storageService.getEmpId();
    this.initializeForm();
    this.departmentFilterControl.valueChanges.subscribe(value => {
      this.applyDepartmentFilter(value);
    });
    this.employeeFilterControl.valueChanges.subscribe(value => {
      this.applyEmployeeFilter(value);
    });
  }

 private initializeForm(): void {
    this.assignForm = this.fb.group({
      department: [null, Validators.required],
      assigned_to: [null, Validators.required], // This handles the employee ID dropdown selection
      clientId: [null, Validators.required],
      productId: [null, Validators.required],
      product_version: [null],
      type: ['', Validators.required],
      clientName: ['', Validators.required],
      ticket_name: ['', [Validators.required, Validators.pattern(/.*\S.*/)]],
      ticketDescription: [''],
      employeeName: [''], // Can be optional or populated programmatically
      priority: [2, Validators.required],
      status: ['', Validators.required],
      comments: ['']
    });
  }

  ngOnInit(): void {
    this.getDepartments();
    this.getEmployees();
    this.getAllClients();
    this.getAllproducts();
    this.getStatus();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.isEditMode = true;

      if (this.productList.length > 0) {
        this.patchFormData();
      }
    }
  }

  private patchFormData(): void {
    if (!this.data) return;

    const targetProductId = this.data.productId ?? this.data.product_id;
    const departmentId = this.getDepartmentId();


    const selectedProduct = this.productList.find(
      product => String(product.id) === String(targetProductId)
    );

    if (selectedProduct) {
      this.availableVersions = this.getProductVersions(selectedProduct);
    }

    const selectedVersion = this.normalizeSelectedVersion(this.data.version ?? this.data.product_version);
    const assignedTo = this.getAssignedToId();

    this.assignForm.patchValue({
      clientId: this.data.clientUserId || this.data.clients_id,
      productId: targetProductId ? Number(targetProductId) : null,
      product_version: selectedVersion && this.availableVersions.includes(selectedVersion) ? selectedVersion : null,
      type: this.data.type,
      clientName: this.data.company_name,
      ticket_name: this.data.ticket_name,
      ticketDescription: this.data.description,
      department: departmentId,
      assigned_to: assignedTo,
      employeeName: this.data.assigned_to_name || this.getSelectedEmployeeName(assignedTo) || '',
      priority: this.data.priority,
      status: this.getVisibleStatusName(this.data.status, this.getStatusNameById(0)),
      // worked_hours: this.formatWorkedHours(this.data.worked_hours || this.data.workedHours),
      comments: this.data.clientComments || '',

    });

    if (departmentId) {
      this.getEmployeeListByDepartment(departmentId, true);
    }
  }

  getDepartments(): void {
    this.authService.getAllDepartments().subscribe({
      next: (res: any[]) => {
        this.departments = res;
        this.filteredDepartmentList = res;
        this.patchDepartmentAndEmployeeListFromData();
      },
      error: (err: any) => { this.toasterService.error('Failed to load departments'); }
    });
  }

  getAllClients(): void {
    this.authService.getAllClients().subscribe({
      next: (res: any[]) => {
        this.clients = res;
        this.filteredClients = res;
        this.patchSelectedClientName();
      },
      error: (err: any) => { this.toasterService.error('Failed to load clients'); }
    });
  }

  getEmployees(): void {
    this.authService.getEmployeeList().subscribe({
      next: (res: any[]) => {
        this.allEmployees = Array.isArray(res) ? res : [];

        if (!this.assignForm.get('department')?.value) {
          this.employees = this.allEmployees;
          this.filteredEmployees = this.allEmployees;
          this.filteredEmployeesList = this.allEmployees;
        }

        this.patchSelectedEmployeeName(true);
      },
      error: (err: any) => { this.toasterService.error('Failed to load employees'); }
    });
  }

  getAllproducts(): void {
    this.authService.getAllProducts().subscribe({
      next: (res: any) => {
        const products = this.normalizeProductsResponse(res);
        this.productList = products;
        this.filteredProducts = products;

        if (this.data) {
          this.isEditMode = true;
          this.patchFormData();
        }
      },
      error: (err: any) => {
        console.error('getAllproducts error', err);
      }
    });
  }

  onProductChange(productId: any, resetVersion = true): void {
    const selectedProduct = this.productList.find(
      product => String(product.id) === String(productId)
    );

    this.availableVersions = selectedProduct ? this.getProductVersions(selectedProduct) : [];

    if (resetVersion) {
      this.assignForm.patchValue({
        product_version: null
      });
    }
  }

  onDepartmentChange(): void {
    const deptId = this.assignForm.get('department')?.value;
    this.assignForm.patchValue({
      assigned_to: null,
      employeeName: ''
    });

    if (deptId) {
      this.getEmployeeListByDepartment(deptId);
    } else {
      this.employees = [];
      this.filteredEmployees = [];
    }
  }

  filterEmployees(event: Event): void {
    const value = (event.target as HTMLInputElement).value.toLowerCase().trim();
    this.assignForm.patchValue({ assigned_to: null }, { emitEvent: false });
    this.filteredEmployees = value
      ? this.employees.filter(emp => emp.employee_name?.toLowerCase().includes(value))
      : this.employees;
  }

  selectEmployee(event: MatAutocompleteSelectedEvent): void {
    const employee = event.option.value;
    const employeeId = employee.id ?? employee.emp_id;
    const departmentId = this.getDepartmentIdFromEmployee(employee);

    this.assignForm.patchValue({
      assigned_to: employeeId,
      employeeName: employee.employee_name
    });

    if (departmentId && String(this.assignForm.get('department')?.value) !== String(departmentId)) {
      this.assignForm.patchValue({ department: departmentId });
      this.getEmployeeListByDepartment(departmentId, true, employee);
    }
  }

  filterClients(event: Event): void {
    this.clientSearchText = (event.target as HTMLInputElement).value;
    const value = this.clientSearchText.toLowerCase().trim();
    this.filteredClients = value
      ? this.clients.filter(client => client.company_name?.toLowerCase().includes(value))
      : this.clients;
  }

  onClientSelectOpened(opened: boolean): void {
    if (!opened) return;
    this.clientSearchText = '';
    this.filteredClients = this.clients;
  }

  getClientValue(client: any): any {
    return client?.id ?? client?.clientUserId ?? client?.clientsId;
  }

  filterProducts(event: Event): void {
    this.productSearchText = (event.target as HTMLInputElement).value;
    const value = this.productSearchText.toLowerCase().trim();
    this.filteredProducts = value
      ? this.productList.filter(product => product.productName?.toLowerCase().includes(value))
      : this.productList;
  }

  onProjectSelectOpened(opened: boolean): void {
    if (!opened) return;
    this.productSearchText = '';
    this.filteredProducts = this.productList;
  }

  private patchSelectedClientName(): void {
    const selectedClientId = this.assignForm.get('clientId')?.value;
    if (!selectedClientId) return;

    const selectedClient = this.clients.find(client => `${this.getClientValue(client)}` === `${selectedClientId}`);
    if (selectedClient) {
      this.assignForm.patchValue({
        clientName: selectedClient.company_name
      });
    }
  }

  getEmployeeListByDepartment(id: number, keepSelectedEmployee = false, selectedEmployee?: any): void {
    this.authService.getEmployeeListByDepartment(id).subscribe({
      next: (res: any[]) => {
        this.employees = res;
        this.filteredEmployees = res;
        this.filteredEmployeesList = res; 
        this.patchSelectedEmployeeName(keepSelectedEmployee, selectedEmployee);
      },
      error: (err: any) => { console.error('Filter error:', err); }
    });
  }

  get rf() {
    return {
      department: this.assignForm.get('department'),
      employeeId: this.assignForm.get('assigned_to'),
      assigned_to: this.assignForm.get('assigned_to'),
      employeeName: this.assignForm.get('employeeName'),
      clientId: this.assignForm.get('clientId'),
      product: this.assignForm.get('productId'),
      type: this.assignForm.get('type'),
      product_version: this.assignForm.get('product_version'),
      clientName: this.assignForm.get('clientName'),
      status: this.assignForm.get('status'),
      ticket_name: this.assignForm.get('ticket_name'),
      priority: this.assignForm.get('priority'),
      // worked_hours: this.assignForm.get('worked_hours'),
      comments: this.assignForm.get('comments'),
      ticketDescription: this.assignForm.get('ticketDescription')
    };
  }

  onCancel(): void {
    this.resetForm();
    this.drawerService.close();
  }

  private resetForm(): void {
    this.isEditMode = false;
    this.submitted = false;
    this.assignForm.reset({
      department: null,
      assigned_to: null,
      clientId: null,
      productId: null,
      product_version: null,
      type: '',
      clientName: '',
      employeeName: '',
      ticket_name: '',
      ticketDescription: '',
      priority: 2,
      status: '',
      // worked_hours: '08:00',
      comments: ''
    });
    this.assignForm.markAsPristine();
    this.assignForm.markAsUntouched();
  }

  onSubmit(): void {
    this.submitted = true;
    if (!this.assignForm.valid) {
      this.assignForm.markAllAsTouched();
      return;
    }

    const formValue = this.assignForm.value;
    const assignedTo = formValue.assigned_to ?? this.getAssignedToId();
    const payload = {
      clientUserId: formValue.clientId,
      clientsId: formValue.clientId,
      productId: formValue.productId,
      version: this.normalizeSelectedVersion(formValue.product_version),
      type: formValue.type,
      assigned_to: assignedTo,
      empId: assignedTo,
      ticketName: formValue.ticket_name,
      priority: formValue.priority,
      ticketCategoryId: this.data?.ticket_category_id || 3,
      description: formValue.ticketDescription,
      status: formValue.status,
      // workedHours: this.isEditMode ? (formValue.worked_hours || "00:00") : "00:00",
      clientComments: formValue.comments || "",
      isreassign: true,
      deptId: formValue.department,
      assignedFrom: this.storageService.getEmpId(),
      updatedBy: this.storageService.getEmpId(),
      ...(!this.isEditMode && {
        assignedFrom: this.empid
      })
    };

    // if (!this.data) {
    //   payload.assignedFrom = this.storageService.getEmpId();
    // }

    if (this.isEditMode && this.data?.id) {
      const updatePayload = { ...payload, id: this.data.id };
      this.authService.updateTicket(updatePayload).subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message || 'Ticket assignment updated successfully');
          this.drawerService.notifyAction({ source: 'ticket', action: 'updated', payload: res });
          this.onCancel();
        },
        error: (err: any) => {
          this.toasterService.error(err?.error?.message || 'Failed to update ticket assignment');
        }
      });
    } else {
      this.authService.createTicketRise(payload).subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message || 'Ticket assigned successfully');
          this.drawerService.notifyAction({ source: 'ticket', action: 'created', payload: res });
          this.onCancel();
        },
        error: (err: any) => {
          this.toasterService.error(err?.error?.message || 'Failed to assign ticket');
        }
      });
    }
  }

  getSelectedEmployeeDisplay(): string {
    return this.getSelectedEmployeeName(this.assignForm.get('assigned_to')?.value);
  }
  onClientSelectionChange(clientId: any): void {
    if (clientId === null || clientId === undefined) {
      this.assignForm.patchValue({
        clientId: null,
        clientName: ''
      });
      return;
    }

    const client = this.clients.find(item => `${this.getClientValue(item)}` === `${clientId}`);
    if (!client) return;

    this.assignForm.patchValue({
      clientId: this.getClientValue(client),
      clientName: client.company_name
    });
  }

  onProductSelectionChange(productId: any): void {
    if (productId === null || productId === undefined) {
      this.assignForm.patchValue({
        project_id: null,
        projectName: ''
      });
      return;
    }

    const project = this.productList.find(item => `${item.id}` === `${productId}`);
    if (!project) return;

    this.assignForm.patchValue({
      project_id: project.id,
      projectName: project.project_title
    });
  }

  private normalizeProductsResponse(res: any): any[] {
    const list = Array.isArray(res)
      ? res
      : (res?.details ?? res?.data ?? res?.products ?? res?.productList ?? []);

    return Array.isArray(list) ? list : [];
  }

  private getProductVersions(product: any): string[] {
    const versions = product?.versionList ?? product?.versions ?? [];

    if (!Array.isArray(versions)) {
      return [];
    }

    return versions
      .map((versionItem: any) => typeof versionItem === 'string' ? versionItem : versionItem?.version)
      .filter((version: any) => version !== null && version !== undefined && String(version).trim() !== '')
      .map((version: any) => String(version).trim());
  }

  private normalizeSelectedVersion(value: any): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const version = String(value).trim();
    return version ? version : null;
  }

  private getAssignedToId(): any {
    return this.firstPresent(
      this.data?.assigned_to,
      this.data?.assignedTo,
      this.data?.assigned_to_id,
      this.data?.empId,
      this.data?.emp_id
    );
  }

  private getDepartmentId(): any {
    const rawDepartmentId = this.firstPresent(
      this.data?.dept_id,
      this.data?.deptId,
      this.data?.department_id,
      this.data?.departmentId
    );

    if (rawDepartmentId !== null) {
      const matchedDepartment = this.departments.find(dept => String(dept.id) === String(rawDepartmentId));
      return matchedDepartment?.id ?? rawDepartmentId;
    }

    const departmentName = this.firstPresent(
      this.data?.department_name,
      this.data?.departmentName,
      this.data?.dept_name,
      this.data?.deptName
    );

    if (!departmentName) {
      return null;
    }

    const matchedDepartment = this.departments.find(
      dept => String(dept.department_name ?? '').trim().toLowerCase() === String(departmentName).trim().toLowerCase()
    );

    return matchedDepartment?.id ?? null;
  }

  private getDepartmentIdFromEmployee(employee: any): any {
    const employeeId = this.firstPresent(employee?.id, employee?.emp_id);
    const employeeWithDepartment = this.findEmployeeById(employeeId, [employee, ...this.employees, ...this.allEmployees]);

    const rawDepartmentId = this.firstPresent(
      employeeWithDepartment?.dept_id,
      employeeWithDepartment?.deptId,
      employeeWithDepartment?.deptid,
      employeeWithDepartment?.department_id,
      employeeWithDepartment?.departmentId,
      employeeWithDepartment?.department?.id
    );

    if (rawDepartmentId !== null) {
      const matchedDepartment = this.departments.find(dept => String(dept.id) === String(rawDepartmentId));
      return matchedDepartment?.id ?? rawDepartmentId;
    }

    const departmentName = this.firstPresent(
      employeeWithDepartment?.department_name,
      employeeWithDepartment?.departmentName,
      employeeWithDepartment?.dept_name,
      employeeWithDepartment?.deptName,
      employeeWithDepartment?.department?.department_name,
      employeeWithDepartment?.department?.name
    );

    if (!departmentName) {
      return null;
    }

    const matchedDepartment = this.departments.find(
      dept => String(dept.department_name ?? '').trim().toLowerCase() === String(departmentName).trim().toLowerCase()
    );

    return matchedDepartment?.id ?? null;
  }

  private patchDepartmentAndEmployeeListFromData(): void {
    if (!this.data) return;

    const departmentId = this.getDepartmentId();
    if (!departmentId) return;

    this.assignForm.patchValue({ department: departmentId });
    this.getEmployeeListByDepartment(departmentId, true);
  }

  private firstPresent(...values: any[]): any {
    return values.find(value => value !== null && value !== undefined && `${value}`.trim() !== '') ?? null;
  }

  private patchSelectedEmployeeName(keepSelectedEmployee = false, selectedEmployee?: any): void {
    const assignedTo = this.assignForm.get('assigned_to')?.value;
    if (!assignedTo) return;

    const employeeName = this.getSelectedEmployeeName(assignedTo);
    if (employeeName) {
      this.assignForm.patchValue({ employeeName });
      return;
    }

    const fallbackEmployeeName = selectedEmployee?.employee_name || this.data?.assigned_to_name;
    if (!keepSelectedEmployee || !fallbackEmployeeName) {
      return;
    }

    const fallbackEmployee = {
      ...selectedEmployee,
      id: assignedTo,
      emp_id: assignedTo,
      employee_name: fallbackEmployeeName
    };

    this.employees = [fallbackEmployee, ...this.employees];
    this.filteredEmployees = this.employees;
    this.assignForm.patchValue({ employeeName: fallbackEmployeeName });
  }

  private getSelectedEmployeeName(empId: any): string {
    if (empId === null || empId === undefined) {
      return '';
    }

    const emp = this.findEmployeeById(empId, [...this.employees, ...this.allEmployees]);
    return emp?.employee_name || '';
  }

  private findEmployeeById(empId: any, employees: any[]): any {
    if (empId === null || empId === undefined) {
      return null;
    }

    return employees.find(e => String(e?.id) === String(empId) || String(e?.emp_id) === String(empId));
  }

  formatWorkedHours(value: any): string {
    if (!value) {
      return '00:00';
    }

    const workedHours = String(value);
    if (workedHours.includes(':')) {
      return workedHours.substring(0, 5);
    }

    const hours = Number(workedHours);
    if (Number.isNaN(hours)) {
      return '00:00';
    }

    return hours < 10
      ? `0${hours}:00`
      : `${hours}:00`;
  }

  private workedHoursValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;

      if (!value) {
        return { required: true };
      }

      if (typeof value === 'string') {
        const [hours = '0', minutes = '0'] = value.split(':');

        if (+hours === 0 && +minutes === 0) {
          return { zeroWorkedHours: true };
        }
      }

      return null;
    };
  }

  getStatus(): void {
    this.authService.getStatusList().subscribe({
      next: (res: any[]) => {
        this.statusList = res
          .map((status, index) => ({
            id: index,
            name: status
          }))
          .filter(status => this.isVisibleStatus(status.name, status.id));

        if (this.data) {
          this.isEditMode = true;
          this.patchFormData();
        }
      },
      error: (err: any) => {
        console.error('Get status error:', err);
      }
    });
  }

  private getVisibleStatusName(value: any, fallback = ''): string {
    if (value === undefined || value === null || String(value).trim() === '') {
      return fallback;
    }

    const normalizedValue = String(value).trim().toLowerCase().replace(/[^a-z]/g, '');
    const matchedStatus = this.statusList.find(status =>
      String(status.name ?? '').trim().toLowerCase().replace(/[^a-z]/g, '') === normalizedValue
    );

    if (matchedStatus && this.isVisibleStatus(matchedStatus.name, matchedStatus.id)) {
      return String(matchedStatus.name);
    }

    const statusId = Number(value);
    if (!Number.isFinite(statusId)) {
      return fallback;
    }

    const statusName = this.statusList.find(status => Number(status.id) === statusId)?.name;

    return this.isVisibleStatus(statusName, statusId) ? String(statusName) : fallback;
  }

  private getStatusNameById(id: number): string {
    return String(this.statusList.find(status => Number(status.id) === id)?.name ?? '');
  }

  private isVisibleStatus(status: any, id?: any): boolean {
    const normalizedStatus = String(status ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z]/g, '');

    return !this.hiddenStatusIds.has(Number(id)) && !this.hiddenStatusNames.has(normalizedStatus);
  }
  private applyDepartmentFilter(value: string | null): void {
    const filterValue = (value ?? '').toLowerCase().trim();

    this.filteredDepartmentList = this.departments.filter((department: any) =>
      (department?.department_name ?? '').toLowerCase().includes(filterValue)
    );
  }
  private applyEmployeeFilter(value: string | null): void {
    const filterValue = (value ?? '').toLowerCase().trim();
    this.filteredEmployees = this.employees.filter((emp: any) =>
      (emp?.employee_name ?? '').toLowerCase().includes(filterValue)
    );
    this.filteredEmployeesList = this.filteredEmployees;
  }
  onEmployeeOpenedChange(isOpen: boolean): void {
    if (isOpen) {
      this.employeeFilterControl.setValue('', { emitEvent: false });
      this.applyEmployeeFilter('');
      this.filteredEmployees = this.employees;
      this.filteredEmployeesList = this.employees;
    }
  }
  onEmployeeSelectionChange(empId: any): void {
    if (!empId) {
      this.assignForm.patchValue({ assigned_to: null, employeeName: '' });
      return;
    }
    const selectedEmp = [...this.employees, ...this.allEmployees].find(
      e => String(e.id) === String(empId) || String(e.emp_id) === String(empId)
    );
    if (selectedEmp) {
      this.assignForm.patchValue({
        assigned_to: selectedEmp.id ?? selectedEmp.emp_id,
        employeeName: selectedEmp.employee_name
      });
    }
  }
}
