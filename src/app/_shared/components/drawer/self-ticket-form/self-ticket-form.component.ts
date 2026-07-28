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
  projectSearchText = '';
  empid: any = 0;

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
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {

      this.isEditMode = true;

      this.ticketForm.patchValue({
        clientId: this.data.clientUserId || this.data.clientsId,
        project_id: this.data.project_id,
        projectName: this.data.project_title || '',
        ticket_name: this.data.ticket_name,
        ticketDescription: this.data.description,
        client_comments: this.data.reason_f_issue,
        solution: this.data.solution,
        status: this.data.status,
        priority: this.data.priority,
        worked_hours: this.formatWorkedHours(this.data.worked_hours),
        // stbModel: this.data.stb_model,
        // stbVersion: this.data.stb_version
      });
      this.patchSelectedClientName();
      this.patchSelectedProjectName();
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
        this.projectList = res
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

  filterProjects(event: Event): void {
    this.projectSearchText = (event.target as HTMLInputElement).value;
    const value = this.projectSearchText.toLowerCase().trim();
    this.filteredProjects = value
      ? this.projectList.filter(project =>
        project.project_title?.toLowerCase().includes(value)
      )
      : this.projectList;
  }

  onProjectSelectOpened(opened: boolean): void {
    if (!opened) return;

    this.projectSearchText = '';
    this.filteredProjects = this.projectList;
  }

  onProjectSelectionChange(projectId: any): void {
    if (projectId === null || projectId === undefined) {
      this.ticketForm.patchValue({
        project_id: null,
        projectName: ''
      });
      return;
    }

    const project = this.projectList.find(item => `${item.id}` === `${projectId}`);
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
      project_id: this.ticketForm.get('project_id'),
      projectName: this.ticketForm.get('projectName'),
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
    if (!this.ticketForm.valid) {
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
      project_id: formValue.project_id,
      empId: empId,
      ticketName: formValue.ticket_name,
      priority: formValue.priority,
      ticketCategoryId: 3,
      description: formValue.ticketDescription,
      status: formValue.status,
      workedHours: formValue.worked_hours || '00:00',
      // createdDate: new Date().toISOString(),
      reasonFIssue: formValue.client_comments || '',
      isreassign: false,
      deptId: deptId,
      solution: formValue.solution,
      assignedFrom: empId,
      stbModel: formValue.stbModel || '',
      stbVersion: formValue.stbVersion || '',
      deptHead: 4,
      deptHeadStatus: 0,
      // reason_f_issue : formValue.solution,
      updatedBy: this.storageService.getEmpId(),
      path: ''
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

    // already correct
    if (value.includes(':')) {
      return value.substring(0, 5);
    }

    // API gives "9"
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
}
