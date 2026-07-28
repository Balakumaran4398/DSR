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
  projectList: any[] = [];
  filteredProjects: any[] = [];
  clientSearchText = '';
  projectSearchText = '';
  empid: any = 0;

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
    this.empid= storageService.getEmpId();
    this.initializeForm();
  }

  private initializeForm(): void {
    this.assignForm = this.fb.group({
      department: [null, Validators.required],
      employeeId: [null, Validators.required],
      clientId: [null, Validators.required],
      project_id: [''],
      projectName: [''],
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
    this.getProjects();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.isEditMode = true;
      this.patchFormData();
    }
  }

  private patchFormData(): void {
    if (!this.data) return;

    this.assignForm.patchValue({
      clientId: this.data.clientUserId || this.data.clients_id,
      project_id: this.data.project_id,
      projectName: this.data.project_title || '',
      clientName: this.data.company_name,
      ticket_name: this.data.ticket_name,
      ticketDescription: this.data.description,
      department: this.data.dept_id,
      employeeId: this.data.emp_id,
      employeeName: this.data.assigned_to_name || '',
      priority: this.data.priority,
      comments: this.data.client_comments || '',
    });
    this.patchSelectedProjectName();

    if (this.data.dept_id) {
      this.getEmployeeListByDepartment(this.data.dept_id);
    }
  }

  getDepartments(): void {
    this.authService.getAllDepartments().subscribe({
      next: (res: any[]) => {
        this.departments = res;
        console.log('Departments:', res);
      },
      error: (err: any) => {
        console.error('Get departments error:', err);
        this.toasterService.error('Failed to load departments');
      }
    });
  }

  getAllClients(): void {
    this.authService.getAllClients().subscribe({
      next: (res: any[]) => {
        this.clients = res;
        this.filteredClients = res;
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
  getEmployees(): void {
    this.authService.getEmployeeList().subscribe({
      next: (res: any[]) => {
        this.employees = res;
        this.filteredEmployees = res;
        console.log('Employees:', res);
      },
      error: (err: any) => {
        console.error('Get employees error:', err);
        this.toasterService.error('Failed to load employees');
      }
    });
  }

  onDepartmentChange(): void {
    const deptId = this.assignForm.get('department')?.value;
    console.log("Selected department id:", deptId);
    if (deptId) {
      this.getEmployeeListByDepartment(deptId);
    } else {
      this.filteredEmployees = [];
    }
    this.assignForm.patchValue({
      employeeId: null,
      employeeName: ''
    });
    console.log("Employees after filter:", this.filteredEmployees);
  }

  filterEmployees(event: Event): void {
    const value = (event.target as HTMLInputElement).value.toLowerCase().trim();
    this.filteredEmployees = value
      ? this.employees.filter(emp =>
        emp.employee_name?.toLowerCase().includes(value)
      )
      : this.employees;
  }

  selectEmployee(event: MatAutocompleteSelectedEvent): void {
    const employee = event.option.value;
    console.log('Selected employee:', employee.id);
    this.assignForm.patchValue({
      employeeId: employee.id || employee.emp_id,
      employeeName: employee.employee_name
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
      this.assignForm.patchValue({
        project_id: null,
        projectName: ''
      });
      return;
    }

    const project = this.projectList.find(item => `${item.id}` === `${projectId}`);
    if (!project) return;

    this.assignForm.patchValue({
      project_id: project.id,
      projectName: project.project_title
    });
  }

  private patchSelectedProjectName(): void {
    const selectedProjectId = this.assignForm.get('project_id')?.value;
    if (!selectedProjectId) return;

    const selectedProject = this.projectList.find(project => `${project.id}` === `${selectedProjectId}`);
    if (selectedProject) {
      this.assignForm.patchValue({
        projectName: selectedProject.project_title
      });
    }
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
      error: (err: any) => {
        console.error('Filter error:', err);
      }
    });
  }

  get rf() {
    return {
      department: this.assignForm.get('department'),
      employeeId: this.assignForm.get('employeeId'),
      employeeName: this.assignForm.get('employeeName'),
      clientId: this.assignForm.get('clientId'),
      project_id: this.assignForm.get('project_id'),
      projectName: this.assignForm.get('projectName'),
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
      project_id: null,
      projectName: '',
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
      project_id: formValue.project_id,
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
      assignedFrom: this.storageService.getEmpId(),
      updatedBy: this.storageService.getEmpId()
    };

    console.log('Payload:', payload);

    if (this.isEditMode && this.data?.id) {
      const updatePayload = {
        ...payload,
        id: this.data.id
      };
      console.log('Update Payload:', updatePayload);

      this.authService.updateTicket(updatePayload).subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message || 'Ticket assignment updated successfully');
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
            err?.error?.message || 'Failed to update ticket assignment'
          );
        }
      });
    } else {
      console.log('Create Payload:', payload);

      this.authService.createTicketRise(payload).subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message || 'Ticket assigned successfully');
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
            err?.error?.message || 'Failed to assign ticket'
          );
        }
      });
    }
  }

  getSelectedEmployeeDisplay(): string {
    const empId = this.assignForm.get('employeeId')?.value;
    const emp = this.employees.find(e => e.id === empId || e.emp_id === empId);
    return emp?.employee_name || '';
  }
}
