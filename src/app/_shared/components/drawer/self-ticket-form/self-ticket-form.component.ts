import { Component, inject, Input, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

@Component({
  selector: 'app-self-ticket-form',
  templateUrl: './self-ticket-form.component.html',
  styleUrls: ['./self-ticket-form.component.scss']
})
export class SelfTicketFormComponent {

  @Input() data: any;
  private fb = inject(FormBuilder);
  ticketForm!: FormGroup;
  isEditMode = false;
  clients: any[] = [];
  filteredClients: any[] = [];
  projectList: any[] = [];
  filteredProjects: any[] = [];
  clientSearchText = '';
  productList: any[] = [];
  filteredProducts: any[] = [];
  productSearchText = '';
  empid: any = 0;
  availableVersions: string[] = [];
  submitted = false;
  types = [
    'Client Support',
    'Requirement',
    'Bug',
    'Business'
  ];

  statusList: any[] = [];
  dept: any[] = [];

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
    this.empid = this.storageService.getEmpId();
    this.initializeForm();
  }

  private initializeForm(): void {
    this.ticketForm = this.fb.group({
      clientId: [null, Validators.required],
      project_id: [''],
      projectName: [''],
      productId: [null, Validators.required],
      product_version: [null],
      type: ['', Validators.required],
      clientName: ['', Validators.required],
      ticket_name: ['', Validators.required],
      ticketDescription: [''],
      client_comments: [''],
      solution: [''],
      status: [1, Validators.required],
      priority: [2, Validators.required],
      worked_hours: ['08:00', Validators.required],
      // stbModel: [''],
      // stbVersion: ['']
    });
  }

  ngOnInit(): void {
    this.getAllClients();
    this.getStatus();
    this.getAllDepartments();
    this.getProjects();
    this.getAllproducts();
  }

  getAllproducts(): void {
    this.authService.getAllProducts().subscribe({
      next: (res: any) => {
        const products = this.normalizeProductsResponse(res);
        this.productList = products;
        this.filteredProducts = products;

        // Once products are fetched, if we have input data, run patchFormData
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

  private patchFormData(): void {
    if (!this.data) return;

    this.isEditMode = true;

    const clientId = this.data.clientUserId || this.data.clientsId || this.data.clients_id;
    const targetProductId = this.data.productId ?? this.data.product_id;

    // Resolve and populate available versions FIRST so dropdown recognizes the value
    const selectedProduct = this.productList.find(
      product => String(product.id) === String(targetProductId)
    );

    if (selectedProduct) {
      this.availableVersions = this.getProductVersions(selectedProduct);
    }

    const selectedVersion = this.normalizeSelectedVersion(this.data.version ?? this.data.product_version);

    this.ticketForm.patchValue({
      clientId: clientId || null,
      productId: targetProductId ? Number(targetProductId) : null,
      product_version: selectedVersion && this.availableVersions.includes(selectedVersion) ? selectedVersion : null,
      type: this.data.type || '',
      ticket_name: this.data.ticket_name || this.data.ticketName || '',
      ticketDescription: this.data.description || '',
      client_comments: this.data.reason_f_issue || this.data.reasonFIssue || '',
      solution: this.data.solution || '',
      status: this.data.status !== undefined ? this.data.status : 1,
      priority: this.data.priority !== undefined ? this.data.priority : 2,
      worked_hours: this.formatWorkedHours(this.data.worked_hours || this.data.workedHours),
    });

    // Trigger name patches if lists are already loaded
    this.patchSelectedClientName();
    this.patchSelectedProjectName();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.isEditMode = true;
      if (this.productList.length > 0) {
        this.patchFormData();
      }
    }
  }

  getAllClients(): void {
    this.authService.getAllClients().subscribe({
      next: (res: any[]) => {
        this.clients = res;
        this.filteredClients = res;
        if (this.isEditMode && this.data) {
          const clientId = this.data.clients_id ?? this.data.client_user_id ?? this.data.clientUserId ?? this.data.clientsId;
          const client = this.clients.find(c => `${this.getClientValue(c)}` === `${clientId}`);
          if (client) {
            this.ticketForm.patchValue({
              clientId: this.getClientValue(client),
              clientName: client.company_name
            });
          }
        }
        this.patchSelectedClientName();
      },
      error: (err: any) => {
        console.error('Get clients error:', err);
        this.toasterService.error('Failed to load clients');
      }
    });
  }

  getProjects(callback?: Function) {
    this.authService.getAllProjectsByEmployeeId(this.empid).subscribe({
      next: (res: any) => {
        this.projectList = res;
        this.filteredProjects = res;
        this.patchSelectedProjectName();
        if (callback) callback();
      }
    });
  }

  getStatus(): void {
    this.authService.getStatusList().subscribe({
      next: (res: any[]) => {
        this.statusList = res.map((status, index) => ({
          id: index,
          name: status
        }));
      },
      error: (err: any) => {
        console.error('Get status error:', err);
      }
    });
  }

  filterClients(event: Event): void {
    this.clientSearchText = (event.target as HTMLInputElement).value;
    const value = this.clientSearchText.toLowerCase().trim();
    this.filteredClients = value
      ? this.clients.filter(client =>
        client.company_name?.toLowerCase().includes(value)
      )
      : this.clients;
  }

  onClientSelectOpened(opened: boolean): void {
    if (!opened) return;

    this.clientSearchText = '';
    this.filteredClients = this.clients;
  }

  onClientSelectionChange(clientId: any): void {
    if (clientId === null || clientId === undefined) {
      this.ticketForm.patchValue({
        clientId: null,
        clientName: ''
      });
      return;
    }

    const client = this.clients.find(item => `${this.getClientValue(item)}` === `${clientId}`);
    if (!client) return;

    this.ticketForm.patchValue({
      clientId: this.getClientValue(client),
      clientName: client.company_name
    });
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

  onProductChange(productId: any, resetVersion = true): void {
    const selectedProduct = this.productList.find(
      product => String(product.id) === String(productId)
    );

    this.availableVersions = selectedProduct ? this.getProductVersions(selectedProduct) : [];

    if (resetVersion) {
      this.ticketForm.patchValue({
        product_version: null
      });
    }
  }

  onProductSelectionChange(productId: any): void {
    if (productId === null || productId === undefined) {
      this.ticketForm.patchValue({
        project_id: null,
        projectName: ''
      });
      return;
    }

    const project = this.productList.find(item => `${item.id}` === `${productId}`);
    if (!project) return;

    this.ticketForm.patchValue({
      project_id: project.id,
      projectName: project.project_title
    });
  }

  private patchSelectedProjectName(): void {
    const selectedProjectId = this.ticketForm.get('project_id')?.value;
    if (!selectedProjectId) return;

    const selectedProject = this.projectList.find(project => `${project.id}` === `${selectedProjectId}`);
    if (selectedProject) {
      this.ticketForm.patchValue({
        projectName: selectedProject.project_title
      });
    }
  }

  private patchSelectedClientName(): void {
    const selectedClientId = this.ticketForm.get('clientId')?.value;
    if (!selectedClientId) return;

    const selectedClient = this.clients.find(client => `${this.getClientValue(client)}` === `${selectedClientId}`);
    if (selectedClient) {
      this.ticketForm.patchValue({
        clientName: selectedClient.company_name
      });
    }
  }

  get rf() {
    return {
      clientId: this.ticketForm.get('clientId'),
      product: this.ticketForm.get('productId'),
      type: this.ticketForm.get('type'),
      product_version: this.ticketForm.get('product_version'),
      clientName: this.ticketForm.get('clientName'),
      ticket_name: this.ticketForm.get('ticket_name'),
      ticketDescription: this.ticketForm.get('ticketDescription'),
      client_comments: this.ticketForm.get('client_comments'),
      priority: this.ticketForm.get('priority'),
      solution: this.ticketForm.get('solution'),
      status: this.ticketForm.get('status'),
      worked_hours: this.ticketForm.get('worked_hours'),
      // stbModel: this.ticketForm.get('stbModel'),
      // stbVersion: this.ticketForm.get('stbVersion')
    };
  }

  onCancel(): void {
    this.resetForm();
    this.drawerService.close();
  }

  private resetForm(): void {
    this.isEditMode = false;
    this.ticketForm.reset({
      clientId: null,
      project_id: null,
      projectName: '',
      productId: null,
      product_version: null,
      type: '',
      clientName: '',
      ticket_name: '',
      ticketDescription: '',
      client_comments: '',
      solution: '',
      status: 1,
      priority: 2,
      worked_hours: '00:00',
      stbModel: '',
      stbVersion: ''
    });
    this.ticketForm.markAsPristine();
    this.ticketForm.markAsUntouched();
  }

  onSubmit(): void {
    this.submitted = true;
    if (!this.ticketForm.valid || this.isWorkedHoursZero()) {
      this.ticketForm.markAllAsTouched();
      return;
    }

    const formValue = this.ticketForm.value;
    const empId = this.storageService.getEmpId();
    const deptId = this.dept.find(d => d.department_name === this.storageService.getDept())?.id ?? 2;
    const companyId = this.storageService.getCompanyId();

    const payload = {
      clientUserId: formValue.clientId,
      clientsId: formValue.clientId,
      productId: formValue.productId,
      version: this.normalizeSelectedVersion(formValue.product_version),
      type: formValue.type,
      project_id: formValue.project_id,
      empId: empId,
      ticketName: formValue.ticket_name,
      priority: formValue.priority,
      ticketCategoryId: 3,
      description: formValue.ticketDescription,
      status: formValue.status,
      workedHours: formValue.worked_hours || '00:00',
      reasonFIssue: formValue.client_comments || '',
      isreassign: false,
      deptId: deptId,
      solution: formValue.solution,
      stbModel: formValue.stbModel || '',
      stbVersion: formValue.stbVersion || '',
      deptHead: 4,
      deptHeadStatus: 0,
      updatedBy: this.storageService.getEmpId(),
      path: '',
      ...(!this.isEditMode && {
        assignedFrom: empId
      })
    };

    console.log('Ticket Payload:', payload);

    if (this.isEditMode && this.data?.id) {
      const updatePayload = {
        ...payload,
        id: this.data.id
      };

      this.authService.updateTicket(updatePayload).subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message || 'Ticket updated successfully');
          this.drawerService.notifyAction({
            source: 'ticket',
            action: 'updated',
            payload: res
          });
          this.onCancel();
        },
        error: (err: any) => {
          console.error('Update error:', err?.error);
          this.toasterService.error(
            err?.error?.message || 'Failed to update ticket'
          );
        }
      });
    } else {
      this.authService.createTicket(payload).subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message || 'Ticket created successfully');
          this.drawerService.notifyAction({
            source: 'ticket',
            action: 'created',
            payload: res
          });
          this.onCancel();
        },
        error: (err: any) => {
          console.error('Create error:', err?.error);
          this.toasterService.error(
            err?.error?.message || 'Failed to create ticket'
          );
        }
      });
    }
  }

  formatWorkedHours(value: any): string {
    if (!value) {
      return '00:00';
    }

    if (value.includes(':')) {
      return value.substring(0, 5);
    }

    const hours = Number(value);

    return hours < 10
      ? `0${hours}:00`
      : `${hours}:00`;
  }

  getAllDepartments() {
    this.authService.getAllDepartments().subscribe({
      next: (res: any[]) => {
        this.dept = res;
      }
    });
  }
  isWorkedHoursZero(): boolean {
    if (!this.submitted) return false;

    const value = this.ticketForm.get('worked_hours')?.value;
    if (!value) return true;

    if (typeof value === 'string' && value.startsWith('00:00')) {
      return true;
    }

    return Number(value) === 0;
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
