import { Component, inject, Input, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { AuthService, TicketCategoryData } from 'src/app/_core/services/auth.service';
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
  filteredVersions: string[] = [];
  submitted = false;
  isSubmitting = false;
  readonly todayDate = this.getLocalToday();
  readonly assignedDateFilter = (date: Date | null): boolean => {
    if (!date) return false;
    const selectedDate = this.ticketForm?.get('assigned_date')?.value;
    const selectedTime = selectedDate instanceof Date ? this.localDateTimestamp(selectedDate) : null;
    const dateTime = this.localDateTimestamp(date);
    // Keep a historical date already on an edited ticket visible/selectable so
    // leaving it unchanged does not invalidate the form.
    return dateTime >= this.localDateTimestamp(this.todayDate)
      || (selectedTime !== null && dateTime === selectedTime);
  };
  types = [
    'Support',
    'Requirement',
    'Bug',
    'Business'
  ];
  filteredTypes = [...this.types];

  statusList: any[] = [];
  filteredStatusList: any[] = [];
  private readonly hiddenStatusNames = new Set([
    'tobetested',
    'approved',
    'delayed',
    'failed',
    'pass',
    'passed'
  ]);
  private readonly hiddenStatusIds = new Set([2, 3, 6, 9, 10]);
  dept: any[] = [];

  readonly priorityOptions = [
    { id: 1, value: 'High', dotClass: 'bg-red-500' },
    { id: 2, value: 'Medium', dotClass: 'bg-amber-500' },
    { id: 3, value: 'Low', dotClass: 'bg-green-500' }
  ];
  filteredPriorityOptions = [...this.priorityOptions];
  selectSearch: Record<string, string> = {};

  isHardware = false;
  categories: TicketCategoryData[] = [];
  filteredCategories: TicketCategoryData[] = [];
  tickets: TicketCategoryData[] = [];
  ticketSearchText = '';
  filteredTickets: TicketCategoryData[] = [];
  categorySearchText = '';
  hardwareEmployeeName: string | null = '';
  modelNameList: any[] = [];
  filteredModelNames: any[] = [];
  modelNameSearchText = '';
  modelCodeList: any[] = [];
  filteredModelCodes: any[] = [];
  modelCodeSearchText = '';
  private modelCodeRequestSequence = 0;
  private ticketCategoryRequestSequence = 0;

  constructor(
    private authService: AuthService,
    private drawerService: DrawerService,
    private toasterService: ToasterService,
    private storageService: StorageService
  ) {
    this.empid = this.storageService.getEmpId();
    this.isHardware = this.storageService.getDept() === 'Hardware';
    this.initializeForm();
  }

  // private initializeForm(): void {
  //   this.ticketForm = this.fb.group({
  //     clientId: [null, Validators.required],
  //     project_id: [''],
  //     projectName: [''],
  //     productId: [null, Validators.required],
  //     product_version: [null],
  //     type: ['', Validators.required],
  //     clientName: ['', Validators.required],
  //     ticket_name: ['', Validators.required],
  //     ticketDescription: [''],
  //     client_comments: [''],
  //     solution: [''],
  //     status: [1, Validators.required],
  //     priority: [2, Validators.required],
  //     worked_hours: ['08:00', this.workedHoursValidator()],
  //     category: [null],
  //     // stbModel: [''],
  //     // stbVersion: ['']
  //   });
  // }

  private initializeForm(): void {
    this.ticketForm = this.fb.group({
      clientId: [null, Validators.required],
      project_id: [''],
      projectName: [''],
      productId: [null, this.isHardware ? null : Validators.required],
      product_version: [null],
      type: ['', this.isHardware ? null : Validators.required],
      clientName: [''],
      ticket_name: ['', [Validators.required, Validators.pattern(/\S/)]],
      ticketDescription: [''],
      client_comments: [''],
      solution: [''],
      status: ['', Validators.required],
      priority: [2, Validators.required],
      worked_hours: ['08:00', this.isHardware ? null : this.workedHoursValidator()],
      ticketCategoryId: [null, this.isHardware ? Validators.required : null],
      ticketCategoryDataId: [null, this.isHardware ? Validators.required : null],
      assigned_date: [this.todayDate],
      modelName: [],
      modelCode: [],
      // modelName: [null, this.isHardware ? Validators.required : null],
      // modelCode: [null, this.isHardware ? Validators.required : null],
      count: [null, this.isHardware ? [Validators.required, Validators.min(1), Validators.pattern(/^[1-9]\d*$/)] : null]
    });
  }

  ngOnInit(): void {
    this.getAllClients();
    this.getStatus();
    this.getAllDepartments();
    this.getProjects();
    this.getAllproducts();
    this.getStatus();
    if (this.isHardware) {
      this.getTicketCategory();
      this.getModelMaster();
    }

    this.hardwareEmployeeName = this.storageService.getEmpName();
  }

  getAllproducts(): void {
    this.authService.getAllProducts().subscribe({
      next: (res: any) => {
        const products = this.normalizeProductsResponse(res);
        this.productList = products;
        this.filteredProducts = products;

        // Once products are fetched, if we have input data, run patchFormData
        if (this.hasTicketEditData()) {
          this.isEditMode = true;
          this.patchFormData();
        }
      },
      error: (err: any) => {
        console.error('getAllproducts error', err);
      }
    });
  }
  getTicketCategory(): void {
    this.authService.getTicketCategory().subscribe({
      next: (res: any) => {
        const categories = this.normalizeTicketCategoryResponse(res);
        this.categories = categories;
        this.filteredCategories = [...categories];
      },
      error: (err: any) => {
        console.error('getTicketCategory error', err);
        this.categories = [];
        this.filteredCategories = [];
        this.toasterService.error('Failed to load ticket categories');
      }
    });
  }

  private normalizeTicketCategoryResponse(res: any): TicketCategoryData[] {
    const list = Array.isArray(res)
      ? res
      : (res?.data
        ?? res?.details
        ?? res?.categories
        ?? res?.ticketCategories
        ?? res?.ticketCategoryData
        ?? res?.tickets
        ?? []);

    if (!Array.isArray(list)) return [];

    return list
      .map(category => ({
        id: category?.id
          ?? category?.ticket_category_data_id
          ?? category?.ticketCategoryDataId
          ?? category?.ticket_category_id
          ?? category?.ticketCategoryId,
        name: String(
          category?.name
          ?? category?.ticket_name
          ?? category?.ticketName
          ?? category?.type
          ?? category?.category_name
          ?? category?.categoryName
          ?? ''
        ).trim()
      }))
      .filter(category => category.id !== null && category.id !== undefined && !!category.name);
  }

  getModelMaster(): void {
    this.authService.getModelMaster().subscribe({
      next: (res: any) => {
        const modelNames = this.normalizeModelMasterResponse(res);
        this.modelNameList = modelNames;
        this.filteredModelNames = modelNames;

        if (this.hasTicketEditData()) {
          this.patchModelFieldsFromData();
        }
      },
      error: (err: any) => {
        console.error('getModelMaster error', err);
        this.toasterService.error('Failed to load model names');
      }
    });
  }

  private patchFormData(): void {
    if (!this.hasTicketEditData()) return;

    this.isEditMode = true;

    const clientId = this.data.clientUserId || this.data.clientsId || this.data.clients_id;
    const targetProductId = this.data.productId ?? this.data.product_id;

    // Resolve and populate available versions FIRST so dropdown recognizes the value
    const selectedProduct = this.productList.find(
      product => String(product.id) === String(targetProductId)
    );

    if (selectedProduct) {
      this.availableVersions = this.getProductVersions(selectedProduct);
      this.filteredVersions = [...this.availableVersions];
    }

    const selectedVersion = this.normalizeSelectedVersion(this.data.version ?? this.data.product_version);

    this.ticketForm.patchValue({
      clientId: clientId || null,
      productId: targetProductId ? Number(targetProductId) : null,
      product_version: selectedVersion && this.availableVersions.includes(selectedVersion) ? selectedVersion : null,
      type: this.data.type || '',
      ticketCategoryId: this.data.ticket_category_id,
      ticketCategoryDataId: this.data.ticketCategoryDataId ?? this.data.ticket_category_data_id ?? null,
      count: this.getCountFromData(this.data),
      assigned_date: this.parseLocalDate(this.data.assigned_date ?? this.data.assignedDate) || this.todayDate,
      ticket_name: this.data.ticket_name || this.data.ticketName || '',
      ticketDescription: this.data.description || '',
      client_comments: this.data.reason_f_issue || this.data.reasonFIssue || '',
      solution: this.data.solution || '',
      status: this.getVisibleStatusName(this.data.status, this.getStatusNameById(1)),
      priority: this.data.priority !== undefined ? this.data.priority : 2,
      worked_hours: this.formatWorkedHours(this.data.worked_hours || this.data.workedHours),
    });

    // Trigger name patches if lists are already loaded
    this.patchSelectedClientName();
    this.patchSelectedProjectName();
    this.patchModelFieldsFromData();

    if (this.isHardware && this.data.ticket_category_id) {
      this.getTicketsByCategory(this.data.ticket_category_id, true);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.isEditMode = this.hasTicketEditData();
      if (!this.isEditMode) {
        this.ticketForm?.patchValue({
          assigned_date: this.parseLocalDate(this.data?.assigned_date ?? this.data?.assignedDate) || this.todayDate
        });
        return;
      }
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
        this.statusList = res
          .map((status, index) => ({
            id: index,
            name: status
          }))
          .filter(status => this.isVisibleStatus(status.name, status.id));
        this.filteredStatusList = [...this.statusList];

        if (this.hasTicketEditData()) {
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
    this.filteredVersions = [...this.availableVersions];

    if (resetVersion) {
      this.ticketForm.patchValue({
        product_version: null
      });
    }
  }

  filterSimpleSelect(event: Event, field: string): void {
    const input = event.target as HTMLInputElement;
    const query = (input.value ?? '').trim().toLowerCase();
    this.selectSearch[field] = input.value;

    if (field === 'version') {
      this.filteredVersions = this.filterByLabel(this.availableVersions, query, item => item);
    } else if (field === 'type') {
      this.filteredTypes = this.filterByLabel(this.types, query, item => item);
    } else if (field === 'priority') {
      this.filteredPriorityOptions = this.filterByLabel(this.priorityOptions, query, item => item.value);
    } else if (field === 'status') {
      this.filteredStatusList = this.filterByLabel(this.statusList, query, item => item?.name);
    }
  }

  resetSimpleSelectFilter(opened: boolean, field: string): void {
    if (!opened) return;
    this.selectSearch[field] = '';
    this.filterSimpleSelect({ target: { value: '' } } as unknown as Event, field);
  }

  private filterByLabel<T>(items: T[], query: string, label: (item: T) => any): T[] {
    const source = Array.isArray(items) ? items : [];
    return query ? source.filter(item => `${label(item) ?? ''}`.toLowerCase().includes(query)) : [...source];
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

  filterModelNames(event: Event): void {
    this.modelNameSearchText = (event.target as HTMLInputElement).value;
    const value = this.modelNameSearchText.toLowerCase().trim();
    this.filteredModelNames = value
      ? this.modelNameList.filter(model => this.getModelNameLabel(model).toLowerCase().includes(value))
      : this.modelNameList;
  }

  onModelNameSelectOpened(opened: boolean): void {
    if (!opened) return;

    this.modelNameSearchText = '';
    this.filteredModelNames = this.modelNameList;
  }

  onModelNameChange(modelMasterId: any, resetModelCode = true): void {
    this.modelCodeRequestSequence++;
    this.modelCodeList = [];
    this.filteredModelCodes = [];
    this.modelCodeSearchText = '';

    if (resetModelCode) {
      this.ticketForm.patchValue({
        modelCode: null
      });
    }

    if (modelMasterId === null || modelMasterId === undefined || String(modelMasterId).trim() === '') {
      return;
    }

    const requestSequence = this.modelCodeRequestSequence;
    this.authService.getModelCodeList(modelMasterId).subscribe({
      next: (res: any) => {
        if (requestSequence !== this.modelCodeRequestSequence) return;

        const modelCodes = this.normalizeModelCodeResponse(res);
        this.modelCodeList = modelCodes;
        this.filteredModelCodes = modelCodes;

        if (!resetModelCode && this.hasTicketEditData()) {
          const modelCodeValue = this.getModelCodeControlValueFromData(this.data);

          if (modelCodeValue !== null) {
            this.ticketForm.patchValue({
              modelCode: modelCodeValue
            });
          }
        }
      },
      error: (err: any) => {
        if (requestSequence !== this.modelCodeRequestSequence) return;

        console.error('getModelCodeList error', err);
        this.toasterService.error('Failed to load model codes');
      }
    });
  }

  filterModelCodes(event: Event): void {
    this.modelCodeSearchText = (event.target as HTMLInputElement).value;
    const value = this.modelCodeSearchText.toLowerCase().trim();
    this.filteredModelCodes = value
      ? this.modelCodeList.filter(modelCode => this.getModelCodeLabel(modelCode).toLowerCase().includes(value))
      : this.modelCodeList;
  }

  onModelCodeSelectOpened(opened: boolean): void {
    if (!opened) return;

    this.modelCodeSearchText = '';
    this.filteredModelCodes = this.modelCodeList;
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
      ticketCategoryId: this.ticketForm.get('ticketCategoryId'),
      ticketCategoryDataId: this.ticketForm.get('ticketCategoryDataId'),
      assigned_date: this.ticketForm.get('assigned_date'),
      modelName: this.ticketForm.get('modelName'),
      modelCode: this.ticketForm.get('modelCode'),
      count: this.ticketForm.get('count')
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
    this.submitted = false;
    this.isSubmitting = false;
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
      status: '',
      priority: 2,
      worked_hours: '00:00',
      stbModel: '',
      stbVersion: '',
      ticketCategoryId: '',
      ticketCategoryDataId: null,
      assigned_date: this.todayDate,
      modelName: null,
      modelCode: null,
      count: null
    });
    this.modelCodeRequestSequence++;
    this.ticketCategoryRequestSequence++;
    this.modelCodeList = [];
    this.filteredModelCodes = [];
    this.modelCodeSearchText = '';
    this.tickets = [];
    this.filteredTickets = [];
    this.ticketSearchText = '';
    this.ticketForm.markAsPristine();
    this.ticketForm.markAsUntouched();
  }

  onSubmit(): void {
    if (this.isSubmitting) return;

    this.submitted = true;
    if (!this.ticketForm.valid || this.isWorkedHoursZero()) {
      this.ticketForm.markAllAsTouched();
      this.toasterService.error('Please fill all required fields');
      return;
    }

    const formValue = this.ticketForm.value;
    const currentEmpId = this.storageService.getEmpId();
    const empId = this.isEditMode ? this.getTicketOwnerId() ?? currentEmpId : currentEmpId;
    const loggedInDeptId = this.dept.find(d => d.department_name === this.storageService.getDept())?.id ?? 2;
    const deptId = this.isEditMode ? this.getTicketDepartmentId() ?? loggedInDeptId : loggedInDeptId;
    const companyId = this.storageService.getCompanyId();
    const selectedModelName = this.isHardware ? this.getSelectedModelName() : '';
    const selectedModelCode = this.isHardware ? this.getSelectedModelCode() : '';
    const hardwarePayload = this.isHardware
      ? {
        count: Number(formValue.count),
        ticketCategoryDataId: formValue.ticketCategoryDataId,
        stbModel: selectedModelName || formValue.stbModel || '',
        stbVersion: selectedModelCode || formValue.stbVersion || '',
        stb_model: selectedModelName || formValue.stbModel || '',
        stb_version: selectedModelCode || formValue.stbVersion || ''
      }
      : {};

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
      ticketCategoryId: formValue.ticketCategoryId,
      description: formValue.ticketDescription,
      status: formValue.status,
      workedHours: formValue.worked_hours || '00:00',
      reasonFIssue: formValue.client_comments || '',
      isreassign: false,
      deptId: deptId,
      solution: formValue.solution,
      deptHead: 4,
      deptHeadStatus: 0,
      updatedBy: currentEmpId,
      path: '',
      assignedFrom: empId,
      assigned_date: this.formatDateForApi(formValue.assigned_date),
      ...(this.data?.source === 'not-send-dsr' && this.data?.not_send_dsr_request_id
        ? { not_send_dsr_request_id: this.data.not_send_dsr_request_id }
        : {}),
      ...hardwarePayload
    };

    console.log('Ticket Payload:', payload);

    this.isSubmitting = true;

    if (this.isEditMode && this.data?.id) {
      const updatePayload = {
        ...payload,
        id: this.data.id
      };

      this.authService.updateTicket(updatePayload).pipe(
        finalize(() => {
          this.isSubmitting = false;
        })
      ).subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message || 'Ticket updated successfully');
          this.refreshNotificationsWhenClosed(formValue.status);
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
      this.authService.createTicket(payload).pipe(
        finalize(() => {
          this.isSubmitting = false;
        })
      ).subscribe({
        next: (res: any) => {
          this.toasterService.success(
            res?.message || res?.data?.message || res?.response?.message || 'Ticket created successfully'
          );
          this.refreshNotificationsWhenClosed(formValue.status);
          this.drawerService.notifyAction({
            source: 'ticket',
            action: 'created',
            payload: {
              response: res,
              ...(this.data?.source === 'not-send-dsr' && this.data?.not_send_dsr_request_id
                ? { not_send_dsr_request_id: this.data.not_send_dsr_request_id }
                : {})
            }
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

  private getTicketOwnerId(): any {
    return this.data?.assigned_from
      ?? this.data?.assignedFrom
      ?? this.data?.assigned_from_id
      ?? this.data?.assignedFromId
      ?? this.data?.empId
      ?? this.data?.emp_id
      ?? null;
  }

  private getTicketDepartmentId(): any {
    return this.data?.dept_id
      ?? this.data?.deptId
      ?? this.data?.department_id
      ?? this.data?.departmentId
      ?? null;
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

  private refreshNotificationsWhenClosed(status: unknown): void {
    if (`${status ?? ''}`.trim().toLowerCase() === 'closed') {
      this.authService.refreshNotificationCount();
    }
  }

  getAllDepartments() {
    this.authService.getAllDepartments().subscribe({
      next: (res: any[]) => {
        this.dept = res;
      }
    });
  }
  isWorkedHoursZero(): boolean {
    if (this.isHardware) return false;
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

  private normalizeModelMasterResponse(res: any): any[] {
    const list = Array.isArray(res)
      ? res
      : (res?.details ?? res?.data ?? res?.modelMasterList ?? res?.modelMasters ?? res?.models ?? []);

    return Array.isArray(list) ? list : [];
  }

  private normalizeModelCodeResponse(res: any): any[] {
    const list = Array.isArray(res)
      ? res
      : (res?.details ?? res?.data ?? res?.modelCodeList ?? res?.modelCodes ?? res?.codes ?? []);

    return Array.isArray(list) ? list : [];
  }

  getModelNameValue(model: any): any {
    if (typeof model === 'string') {
      return model;
    }

    return model?.id ?? model?.model_master_id ?? model?.modelMasterId ?? model?.value ?? this.getModelNameLabel(model);
  }

  getModelNameLabel(model: any): string {
    if (typeof model === 'string') {
      return model;
    }

    return String(model?.modelName ?? model?.model_name ?? model?.name ?? '');
  }

  getModelCodeValue(modelCode: any): any {
    if (typeof modelCode === 'string') {
      return modelCode;
    }

    return modelCode?.id
      ?? modelCode?.model_code_id
      ?? modelCode?.modelCodeId
      ?? modelCode?.value
      ?? this.getModelCodeLabel(modelCode);
  }

  getModelCodeLabel(modelCode: any): string {
    if (typeof modelCode === 'string') {
      return modelCode;
    }

    return String(modelCode?.model_code ?? modelCode?.modelCode ?? modelCode?.code ?? modelCode?.name ?? '');
  }

  getSelectedModelName(): string {
    const selectedValue = this.ticketForm.get('modelName')?.value;
    const selectedModelName = this.modelNameList.find(model =>
      String(this.getModelNameValue(model)) === String(selectedValue)
    );

    return this.getModelNameLabel(selectedModelName) || String(selectedValue ?? '');
  }

  getSelectedModelCode(): string {
    const selectedValue = this.ticketForm.get('modelCode')?.value;
    const selectedModelCode = this.modelCodeList.find(modelCode =>
      String(this.getModelCodeValue(modelCode)) === String(selectedValue)
    );

    return this.getModelCodeLabel(selectedModelCode) || String(selectedValue ?? '');
  }

  private patchModelFieldsFromData(): void {
    if (!this.hasTicketEditData()) return;

    const modelMasterId = this.getModelMasterControlValueFromData(this.data);
    const modelCodeValue = this.getModelCodeControlValueFromData(this.data);

    this.ticketForm.patchValue({
      modelName: modelMasterId,
      modelCode: modelCodeValue,
      count: this.getCountFromData(this.data)
    });

    if (modelMasterId !== null) {
      this.onModelNameChange(modelMasterId, false);
    }
  }

  private hasTicketEditData(): boolean {
    return !!this.data && this.data.mode !== 'create';
  }

  private getLocalToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private localDateTimestamp(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  private parseLocalDate(value: any): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const text = String(value).trim();
    const datePart = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (datePart) {
      const [, year, month, day] = datePart;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime())
      ? null
      : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  private formatDateForApi(value: any): string | null {
    const date = this.parseLocalDate(value);
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getModelMasterControlValueFromData(data: any): any {
    const directValue = data?.model_master_id
      ?? data?.modelMasterId
      ?? data?.modelNameId
      ?? data?.model_name_id
      ?? data?.stbModelId
      ?? data?.stb_model_id;

    if (directValue !== null && directValue !== undefined && String(directValue).trim() !== '') {
      return directValue;
    }

    const modelName = data?.stb_model ?? data?.stbModel ?? data?.modelName ?? data?.model_name;
    if (modelName === null || modelName === undefined || String(modelName).trim() === '') {
      return null;
    }

    const normalizedModelName = this.normalizeComparableString(modelName);
    const matchedModel = this.modelNameList.find(model =>
      this.normalizeComparableString(this.getModelNameLabel(model)) === normalizedModelName
    );

    return matchedModel ? this.getModelNameValue(matchedModel) : null;
  }

  private getModelCodeControlValueFromData(data: any): any {
    const directValue = data?.model_code_id
      ?? data?.modelCodeId
      ?? data?.model_code_master_id
      ?? data?.modelCodeMasterId
      ?? data?.stbVersionId
      ?? data?.stb_version_id;

    if (directValue !== null && directValue !== undefined && String(directValue).trim() !== '') {
      return directValue;
    }

    const modelCode = data?.stb_version ?? data?.stbVersion ?? data?.model_code ?? data?.modelCode;
    if (modelCode === null || modelCode === undefined || String(modelCode).trim() === '') {
      return null;
    }

    const normalizedModelCode = this.normalizeComparableString(modelCode);
    const matchedModelCode = this.modelCodeList.find(item =>
      this.normalizeComparableString(this.getModelCodeLabel(item)) === normalizedModelCode
    );

    return matchedModelCode ? this.getModelCodeValue(matchedModelCode) : modelCode;
  }

  private getCountFromData(data: any): any {
    const count = data?.count ?? data?.modelCount ?? data?.model_count ?? data?.stbCount ?? data?.stb_count;

    return count === null || count === undefined || String(count).trim() === '' ? null : count;
  }

  private normalizeComparableString(value: any): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private workedHoursValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;

      if (!value) {
        return { required: true };
      }

      // Handles values like "00:00" or "00:00:00"
      if (typeof value === 'string') {
        const [hours = '0', minutes = '0'] = value.split(':');

        if (+hours === 0 && +minutes === 0) {
          return { zeroWorkedHours: true };
        }
      }

      return null;
    };
  }

  filterCategory(event: Event): void {
    this.categorySearchText = (event.target as HTMLInputElement).value;
    const value = this.categorySearchText.toLowerCase().trim();
    this.filteredCategories = value
      ? this.categories.filter(category =>
        category.name.toLowerCase().includes(value)
      )
      : [...this.categories];
  }

  filterTickets(event: Event): void {
    this.ticketSearchText = (event.target as HTMLInputElement).value;
    const value = this.ticketSearchText.toLowerCase().trim();
    this.filteredTickets = value
      ? this.tickets.filter(ticket =>
        ticket?.name?.toLowerCase().includes(value)
      )
      : [...this.tickets];
  }

  onTicketCategoryChange(id: number | string | null): void {
    this.ticketForm.patchValue({
      ticketCategoryDataId: null,
      ticket_name: ''
    });
    this.ticketSearchText = '';
    this.tickets = [];
    this.filteredTickets = [];

    this.getTicketsByCategory(id);
  }

  onTicketSelectionChange(id: number | string | null): void {
    const selectedTicket = this.tickets.find(ticket => String(ticket.id) === String(id));

    this.ticketForm.patchValue({
      ticketCategoryDataId: selectedTicket?.id ?? null,
      ticket_name: selectedTicket?.name ?? ''
    });
  }

  getSelectedTicketName(): string {
    const selectedTicketId = this.ticketForm.get('ticketCategoryDataId')?.value;
    const selectedTicket = this.tickets.find(ticket => String(ticket.id) === String(selectedTicketId));

    return selectedTicket?.name || this.ticketForm.get('ticket_name')?.value || 'Select Ticket';
  }

  getTicketsByCategory(id: number | string | null, preserveSelection = false): void {
    const requestSequence = ++this.ticketCategoryRequestSequence;

    if (!id) {
      this.tickets = [];
      this.filteredTickets = [];
      return;
    }

    const selectedTicketId = preserveSelection
      ? this.data?.ticketCategoryDataId
        ?? this.data?.ticket_category_data_id
        ?? this.ticketForm.get('ticketCategoryDataId')?.value
      : null;
    const selectedTicketName = preserveSelection
      ? this.data?.ticket_name
        ?? this.data?.ticketName
        ?? this.ticketForm.get('ticket_name')?.value
      : '';

    this.authService.getTicketsByCategory(id).subscribe({
      next: (res: TicketCategoryData[]) => {
        if (requestSequence !== this.ticketCategoryRequestSequence) return;

        this.tickets = this.normalizeTicketCategoryResponse(res);
        this.filteredTickets = [...this.tickets];

        this.ticketSearchText = '';

        if (!preserveSelection) return;

        const selectedTicket = this.tickets.find(ticket =>
          selectedTicketId !== null
          && selectedTicketId !== undefined
          && String(ticket.id) === String(selectedTicketId)
        ) ?? this.tickets.find(ticket =>
          this.normalizeComparableString(ticket.name) === this.normalizeComparableString(selectedTicketName)
        );

        if (selectedTicket) {
          this.ticketForm.patchValue({
            ticketCategoryDataId: selectedTicket.id,
            ticket_name: selectedTicket.name
          });
        } else {
          this.ticketForm.patchValue({
            ticketCategoryDataId: null,
            ticket_name: ''
          });
        }
      },
      error: (err: any) => {
        if (requestSequence !== this.ticketCategoryRequestSequence) return;

        this.tickets = [];
        this.filteredTickets = [];
        this.ticketForm.patchValue({
          ticketCategoryDataId: null,
          ticket_name: ''
        });
        console.error('getTicketsByCategory', err);
        this.toasterService.error('Failed to load tickets');
      }
    });
  }

  getCategoryName(): string {
    const categoryId = this.ticketForm.get('ticketCategoryId')?.value;

    return this.categories.find(
      category => Number(category.id) === Number(categoryId)
    )?.name || 'Select Category';
  }
  onCategorySelectOpened(opened: boolean): void {
    if (!opened) return;

    this.categorySearchText = '';
    this.filteredCategories = [...this.categories];
  }

}
