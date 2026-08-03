import { Component, inject, Input, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
  employees: any[] = [];
  filteredEmployees: any[] = [];
  clients: any[] = [];
  filteredClients: any[] = [];
  productList: any[] = [];
  filteredProducts: any[] = [];
  clientSearchText = '';
  productSearchText = '';
  empid: any = 0;
  availableVersions: string[] = [];

  types = [
    'Client Support',
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
  }

  private initializeForm(): void {
    this.assignForm = this.fb.group({
      department: [null, Validators.required],
      employeeId: [null, Validators.required],
      clientId: [null, Validators.required],
      productId: [null, Validators.required],
      product_version: [null],
      type: ['', Validators.required],
      clientName: ['', Validators.required],
      ticket_name: ['', Validators.required],
      ticketDescription: [''],
      employeeName: ['', Validators.required],
      priority: [2, Validators.required],
      comments: ['']
    });
  }

  ngOnInit(): void {
    this.getDepartments();
    this.getEmployees();
    this.getAllClients();
    this.getAllproducts();
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


    const selectedProduct = this.productList.find(
      product => String(product.id) === String(targetProductId)
    );

    if (selectedProduct) {
      this.availableVersions = this.getProductVersions(selectedProduct);
    }

    const selectedVersion = this.normalizeSelectedVersion(this.data.version ?? this.data.product_version);

    this.assignForm.patchValue({
      clientId: this.data.clientUserId || this.data.clients_id,
      productId: targetProductId ? Number(targetProductId) : null,
      product_version: selectedVersion && this.availableVersions.includes(selectedVersion) ? selectedVersion : null,
      type: this.data.type,
      clientName: this.data.company_name,
      ticket_name: this.data.ticket_name,
      ticketDescription: this.data.description,
      department: this.data.dept_id,
      employeeId: this.data.emp_id,
      employeeName: this.data.assigned_to_name || '',
      priority: this.data.priority,
      comments: this.data.clientComments || ''
    });

    if (this.data.dept_id) {
      this.getEmployeeListByDepartment(this.data.dept_id);
    }
  }

  getDepartments(): void {
    this.authService.getAllDepartments().subscribe({
      next: (res: any[]) => { this.departments = res; },
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
        this.employees = res;
        this.filteredEmployees = res;
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
    if (deptId) {
      this.getEmployeeListByDepartment(deptId);
    } else {
      this.filteredEmployees = [];
    }
    this.assignForm.patchValue({
      employeeId: null,
      employeeName: ''
    });
  }

  filterEmployees(event: Event): void {
    const value = (event.target as HTMLInputElement).value.toLowerCase().trim();
    this.filteredEmployees = value
      ? this.employees.filter(emp => emp.employee_name?.toLowerCase().includes(value))
      : this.employees;
  }

  selectEmployee(event: MatAutocompleteSelectedEvent): void {
    const employee = event.option.value;
    this.assignForm.patchValue({
      employeeId: employee.id || employee.emp_id,
      employeeName: employee.employee_name
    });
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

  getEmployeeListByDepartment(id: number): void {
    this.authService.getEmployeeListByDepartment(id).subscribe({
      next: (res: any[]) => {
        this.employees = res;
        this.filteredEmployees = res;
      },
      error: (err: any) => { console.error('Filter error:', err); }
    });
  }

  get rf() {
    return {
      department: this.assignForm.get('department'),
      employeeId: this.assignForm.get('employeeId'),
      employeeName: this.assignForm.get('employeeName'),
      clientId: this.assignForm.get('clientId'),
      product: this.assignForm.get('productId'),
      type: this.assignForm.get('type'),
      product_version: this.assignForm.get('product_version'),
      clientName: this.assignForm.get('clientName'),
      ticket_name: this.assignForm.get('ticket_name'),
      priority: this.assignForm.get('priority'),
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
    this.assignForm.reset({
      department: null,
      employeeId: null,
      clientId: null,
      productId: null,
      product_version: null,
      type: '',
      clientName: '',
      employeeName: '',
      ticket_name: '',
      ticketDescription: '',
      priority: 2,
      comments: ''
    });
    this.assignForm.markAsPristine();
    this.assignForm.markAsUntouched();
  }

  onSubmit(): void {
    if (!this.assignForm.valid) {
      this.assignForm.markAllAsTouched();
      return;
    }

    const formValue = this.assignForm.value;
    const payload = {
      clientUserId: formValue.clientId,
      clientsId: formValue.clientId,
      productId: formValue.productId,
      version: this.normalizeSelectedVersion(formValue.product_version),
      type: formValue.type,
      empId: formValue.employeeId,
      ticketName: formValue.ticket_name,
      priority: formValue.priority,
      ticketCategoryId: this.data?.ticket_category_id || 3,
      description: formValue.ticketDescription,
      status: this.data?.status || 0,
      workedHours: this.data?.worked_hours || "00:00",
      clientComments: formValue.comments || "",
      isreassign: true,
      deptId: formValue.department,
      // assignedFrom: this.storageService.getEmpId(),
      updatedBy: this.storageService.getEmpId(),
      ...(!this.isEditMode && {
        assignedFrom: this.storageService.getEmpId()
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
    const empId = this.assignForm.get('employeeId')?.value;
    const emp = this.employees.find(e => e.id === empId || e.emp_id === empId);
    return emp?.employee_name || '';
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
}
