import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

@Component({
  selector: 'app-add-teammate-form',
  templateUrl: './add-teammate-form.component.html',
  styleUrls: ['./add-teammate-form.component.scss']
})
export class AddTeammateFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  taskForm: FormGroup;
  searchControl = new FormControl('');
  projectDetails: any;
  projectid: any = 0;
  // Mock Data
  employeeList: any[] = [];

  constructor(private authService: AuthService, private storageService: StorageService,private drawerService: DrawerService, private toasterService: ToasterService) {
    const stored = localStorage.getItem('projectDetails');
    this.projectDetails = stored ? JSON.parse(stored) : null;
    this.projectid = this.projectDetails?.id
    this.getTeamInfo();
    this.getAllEmployees();
    this.taskForm = this.fb.group({
      employee_list: [[], Validators.required],
      username: storageService.getUsername()
    });
  }

  getAllEmployees() {
    this.authService.getEmployeeList().subscribe((res: any) => {
      this.employeeList = res;
    });
  }
  getTeamInfo() {
    this.authService.getEmployeelistByProjectId(this.projectid).subscribe((res: any) => {
      // this.employeeList = res?.employee_list
      // this.taskForm.get('employee_list')?.setValue(res?.assigned_employee_list.map((e: { id: any; }) => e.id))
      const assignedIds = res?.assigned_employee_list?.map((e: { id: any }) => e.id) || [];
      this.taskForm.get('employee_list')?.setValue(assignedIds);
    })
  }
  
  ngOnInit() {
    // Initial setup if needed
  }

  // Getter for easy access to form fields in template
  get rf() {
    return {
      employee_list: this.taskForm.get('employee_list'),
    };
  }

  // Filter Logic
  get filteredEmployees() {
    const search = this.searchControl.value?.toLowerCase() || '';
    // Retrieve currently selected IDs safely (ensure it's an array)
    const selectedIds = this.taskForm.get('employee_list')?.value || [];
    
    if (!search) {
      return this.employeeList;
    }

    return this.employeeList
      .filter(emp => {
        // Return true if name matches search OR if employee is already selected
        // This keeps selected items in the list so the dropdown trigger text doesn't break
        const matchesSearch = emp.employee_name.toLowerCase().includes(search);
        const isSelected = Array.isArray(selectedIds) && selectedIds.includes(emp.id);
        return matchesSearch || isSelected;
      })
      .sort((a, b) => {
        // Sort logic: Matches go to top, selected-but-not-matching go to bottom
        const aMatches = a.employee_name.toLowerCase().includes(search);
        const bMatches = b.employee_name.toLowerCase().includes(search);
        if (aMatches && !bMatches) return -1; // a comes first
        if (!aMatches && bMatches) return 1;  // b comes first
        return 0;
      });
  }

  onCancel() {
    this.taskForm.reset();
    this.searchControl.setValue('');
  }
 
  onSubmit() {
    if (this.taskForm.valid) {
      console.log('Form Submitted:', this.taskForm.value);
      this.projectDetails = { ...this.projectDetails, ...this.taskForm.value }
      this.authService.updateProject(this.projectDetails).subscribe({
        next: ((res: any) => {
          this.toasterService.success(res?.message);
          this.drawerService.notifyAction({
            source: 'member', 
            action: 'updated',
            payload: res
          });
  
          this.drawerService.close();
  
        }),
        error: (err: any) => {
          this.toasterService.error(err?.error?.message);
        }
      })
    } else {
      this.taskForm.markAllAsTouched();
    }
  }
}