import { Component, ElementRef, OnInit, QueryList, ViewChildren } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
interface Employee {
  id: number;
  employee_name: string;
}
// --- Interfaces ---
interface Task {
  id: number;
  taskcode: string;
  projectid: number;
  phaseid: number | null;
  version: string | null;
  task: string;
  description: string;
  task_type: string;
  priority: string;
  severity: string | null;
  assigned_from: number;
  assigned_to: number;
  estimated_hours: string;
  worked_hours: string;
  start_date: string;
  end_date: string;
  status: string;
  completion_percentage: string | number;
  isactive: boolean;
  isdelete: boolean;
  created_date: string;
  updated_date: string;
  remark: string | null;
  project_title: string;
  assigned_from_name: string;
  assigned_to_name: string;
  phase_title: string | null;
}
@Component({
  selector: 'app-task-details',
  templateUrl: './task-details.component.html',
  styleUrls: ['./task-details.component.scss']
})
export class TaskDetailsComponent implements OnInit {
  @ViewChildren('taskItem') taskItems!: QueryList<ElementRef>;
  taskForm!: FormGroup;
  empid: any = 0;
  projectid: any = 0;
  taskid: any = 0;
  phaseid: any = 0;
  version: any = 0;
  fromdate: any = null
  todate: any = null;
  taskType: any;
  private hasRouteContext = false;

  constructor(private fb: FormBuilder, private router: Router, private authService: AuthService, private toasterService: ToasterService, private storageService: StorageService, private route: ActivatedRoute) {
    this.empid = this.storageService.getEmpId();
  }

  getTasksByProjectIdNdEmployeeId(phaseId: any = 0) {
    this.phaseid = Number(phaseId) || 0;
   
    this.authService.getTasksByProjectIdNdEmployeeId(this.projectid, this.empid, this.phaseid, this.taskType, this.fromdate, this.todate).subscribe((res: any) => {
      const list = Array.isArray(res) ? res : (res?.data ?? res?.tasks ?? []);
      this.taskList = Array.isArray(list) ? list : [];
      if (!this.taskList.length) {
        this.selectedTask = null as any;
        // this.toasterService.error('No tasks found');
        return;
      }
      const activeTaskId = this.taskid ?? this.route.snapshot.paramMap.get('taskid');
      const index = activeTaskId ? this.taskList.findIndex((t: any) => t?.id == activeTaskId) : -1;

      if (index !== -1) {
        this.selectTask(this.taskList[index], index, false);
      } else {
        this.selectTask(this.taskList[0], 0);
      }
    })
  }

  // --- State (No Signals) ---
  isSidebarOpen = false;
  activeTab = 'comments';
  isTabulatorLoaded = false;
  isEditing = false;

  // Store Tabulator instances
  subtasksTable: any;
  issuesTable: any;

  // Accordion state
  panels = {
    description: true,
    info: false
  };

  // Tab Definitions
  tabs = [
    { id: 'comments', label: 'Comments' },
    { id: 'tasks', label: 'Sub-tasks' },
    { id: 'issues', label: 'Issues' },
    { id: 'status-timeline', label: 'Timeline' },
    { id: 'activity', label: 'Activity' }
  ];

  // Lists for Dropdowns
  statusList = [];
  employeeList: Employee[] = [];
  phasesList: any = []
  filteredPhasesList: any[] = [];
  phaseSearchText = '';

  filterPhases(e: any): void {
    this.phaseSearchText = e.target.value
    const search = this.phaseSearchText.toLowerCase();
    this.filteredPhasesList = this.phasesList.filter((p: any) =>
      p.phase_title.toLowerCase().includes(search));
  }

  onPhaseSelectOpened(opened: boolean): void {
    if (!opened) {
      this.phaseSearchText = '';
      this.filteredPhasesList = [...this.phasesList];
    }
  }

  ngOnInit() {
    this.initForm();
    this.filteredPhasesList = [...this.phasesList];
    this.bindRouteContext();
  }

  initForm() {
    this.taskForm = this.fb.group({
      id: [''],
      taskcode: [''],
      project_title: [''],
      phase_title: [''],
      version: [''],
      task: ['', Validators.required],
      description: [''],
      task_type: [''],
      priority: [''],
      status: [''],
      assigned_to: [''],
      start_date: [''],
      end_date: [''],
      estimated_hours: [''],
      completion_percentage: [0],
      worked_hours: [''],
      severity: [''],
      isactive: [false],
      remark: ['']
    });
    this.taskForm.disable(); // Start in read-only mode
  }

  // Mock Data
  taskList: Task[] | any = [];
  selectedTask: Task | null | any = this.taskList[0];

  // Specific subtask data for ID 47, dummy data for others
  getSubtasksForTask(taskId: number): any[] {
    return []
  }

  startEditing() {
    this.isEditing = true;
    this.taskForm.enable();
    // Context fields remain read-only
    this.taskForm.get('project_title')?.disable();
    this.taskForm.get('phase_title')?.disable();
    this.taskForm.get('version')?.enable(); // Assuming version shouldn't be edited easily, or can enable if needed
  }

  cancelEdit() {
    this.isEditing = false;
    this.taskForm.disable();
    this.selectTask(this.selectedTask!); // Revert to original data
  }

  saveEdit() {
    if (this.taskForm.valid && this.selectedTask) {
      // Update selected task object
      const updatedValues = this.taskForm.getRawValue(); // use getRawValue to get disabled fields too
      this.selectedTask = { ...this.selectedTask, ...updatedValues };

      // Update assignee name lookup
      const assignee = this.employeeList.find(e => e.id == this.selectedTask!.assigned_to);
      if (assignee) {
        this.selectedTask.assigned_to_name = assignee.employee_name;
      }

      this.updateTask(this.selectedTask);

      // Update in the list
      const index = this.taskList.findIndex((t: any) => t.id === this.selectedTask?.id);
      if (index !== -1) {
        this.taskList[index] = this.selectedTask;
      }
      this.isEditing = false;
      this.taskForm.disable();
    }
  }
  // --- Methods ---

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  isDesktop() {
    // Simple check - in a real app, use BreakpointObserver
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
  }
  selectTask(task?: Task | null, index?: number, syncUrl: boolean = true) {
    if (!task) {
      this.selectedTask = null as any;
      return;
    }

    const projectId = (task as any)?.projectid ?? this.projectid;
    const taskId = (task as any)?.id;

    if (!projectId || !taskId) {
      this.toasterService.error('Invalid task navigation');
      return;
    }

    this.projectid = projectId;
    this.taskid = taskId;

    this.selectedTask = task;
    this.storageService.saveTaskItem(task);
    this.isEditing = false;

    // Update Form
    if (this.taskForm) {
      this.taskForm.patchValue(task);
      this.taskForm.disable();
    }

    if (window.innerWidth < 1024) {
      this.isSidebarOpen = false;
    }

    // Refresh subtasks table if it exists
    if (this.subtasksTable) {
      try {
        const newData = this.getSubtasksForTask(taskId);
        this.subtasksTable.setData(newData);
      } catch {
        // ignore
      }
    }

    if (typeof index === 'number') {
      setTimeout(() => {
        this.scrollToIndex(index);
      }, 300);
    }

    if (syncUrl) {
      this.syncRouteWithSelection(projectId, taskId);
    }
  }

  setActiveTab(tabId: string) {
    this.activeTab = tabId;
    if (['tasks', 'issues'].includes(tabId)) {
      if (this.isTabulatorLoaded) {
        setTimeout(() => this.initTabulator(tabId), 100);
      }
      // If not loaded yet, the onload handler will trigger it
    }
  }

  initTabulator(type: string) {
    const Tabulator = (window as any).Tabulator;
    if (!Tabulator) {
      console.warn('Tabulator library not loaded');
      return;
    }


  }
  togglePanel(panel: 'description' | 'info') {
    this.panels[panel] = !this.panels[panel];
  }
  // Keyboard Navigation - Navigation ONLY (Auto-selects next/prev task)
  onListKeydown(event: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();

      let newIndex = 0;
      const currentIndex = this.taskList.findIndex((t: any) => t.id === this.selectedTask?.id);

      if (event.key === 'ArrowDown') {
        newIndex = Math.min(currentIndex + 1, this.taskList.length - 1);
      } else if (event.key === 'ArrowUp') {
        newIndex = Math.max(currentIndex - 1, 0);
      }

      if (newIndex !== currentIndex) {
        this.selectTask(this.taskList[newIndex]);
        this.scrollToIndex(newIndex);
        this.storageService.saveTaskItem(this.taskList[newIndex]);
      }
    }
  }

  scrollToIndex(index: number) {
    const items = this.taskItems.toArray();
    if (items[index]) {
      items[index].nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  getInitials(name: string | undefined): string {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  // Helpers for Styling
  getStatusColor(status: string | undefined | null): string {
    const val = status || '';

    if (["Active", "On-Track", "Approved", "Completed", "Invoiced", "Open"].includes(val)) {
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    } else if (["In-Progress", "In-Review", "In-Testing", "Planning"].includes(val)) {
      return "bg-blue-100 text-blue-700 border-blue-200";
    } else if (["On-Hold", "To-be-Tested"].includes(val)) {
      return "bg-amber-100 text-amber-700 border-amber-200";
    } else if (["Delayed", "Cancelled", "Rejected", "Closed"].includes(val)) {
      return "bg-red-100 text-red-700 border-red-200";
    }

    return "bg-gray-100 text-gray-700 border-gray-200";
  }

  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'High': return 'bg-red-500';
      case 'Medium': return 'bg-orange-400';
      case 'Low': return 'bg-green-500';
      default: return 'bg-slate-300';
    }
  }


  loadData(e: any) {
    this.getProjects();
    this.getPhasesByProjectId(e);
    this.getStatusList();
    this.getEmployees();
  }

  projectList: any[] = [];
  phaseList: any[] = [];
  getProjects(callback?: Function) {
    this.authService.getAllProjectsByEmployeeId(this.empid).subscribe({
      next: (res: any) => {
        this.projectList = res

        if (callback) callback();
      }
    });
  }
  getPhasesByProjectId(e: any) {
    this.authService.getPhaseByProjectId(e?.target?.value).subscribe({
      next: (res: any) => {
        this.filteredPhasesList = res;
        this.phasesList = res
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

  getEmployees() {
    this.authService.getEmployeelistByProjectId(this.projectid).subscribe({
      next: (res: any) => {
        this.employeeList = res?.assigned_employee_list
      }
    });
  }

  updateTask(selectTask: any) {
    selectTask.username = this.storageService.getUsername();
    this.authService.updateTask(selectTask).subscribe({
      next: ((res: any) => {
        this.toasterService.success(res?.message);
        this.getTasksByProjectIdNdEmployeeId(this.phaseid)
      }),
      error: (err: any) => {
        this.toasterService.error(err?.error?.message);
      }
    })
  }


  onRangeChange(event: { startDate: Date; endDate: Date }) {
    const nextFromDate = this.formatDateToYMD(event.startDate);
    const nextToDate = this.formatDateToYMD(event.endDate);

    if (this.fromdate === nextFromDate && this.todate === nextToDate) {
      return;
    }

    this.fromdate = nextFromDate;
    this.todate = nextToDate;
    this.syncRouteWithSelection(this.projectid, this.taskid ?? this.selectedTask?.id, true);
  }

  private bindRouteContext(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(([params, queryParams]) => {
      const nextProjectId = params.get('projectid');
      const nextTaskId = params.get('taskid');
      const nextTaskType = queryParams.get('tasktype') || sessionStorage.getItem('tasktype') || this.taskType || 'requirement';
      const nextFromDate = queryParams.get('fromdate') || sessionStorage.getItem('fromdate');
      const nextToDate = queryParams.get('todate') || sessionStorage.getItem('todate');

      const shouldReloadTasks =
        !this.hasRouteContext ||
        `${this.projectid ?? ''}` !== `${nextProjectId ?? ''}` ||
        `${this.taskType ?? ''}` !== `${nextTaskType ?? ''}` ||
        `${this.fromdate ?? ''}` !== `${nextFromDate ?? ''}` ||
        `${this.todate ?? ''}` !== `${nextToDate ?? ''}`;

      const projectChanged = `${this.projectid ?? ''}` !== `${nextProjectId ?? ''}`;

      this.projectid = nextProjectId;
      this.taskid = nextTaskId;
      this.taskType = nextTaskType;
      this.fromdate = nextFromDate;
      this.todate = nextToDate;

      if (projectChanged) {
        this.phaseid = 0;
      }

      if (!this.hasRouteContext || projectChanged) {
        this.loadData({ target: { value: this.projectid } });
      }

      this.hasRouteContext = true;

      if (shouldReloadTasks) {
        this.getTasksByProjectIdNdEmployeeId(this.phaseid);
        return;
      }

      if (!this.taskList.length) {
        return;
      }

      const index = this.taskList.findIndex((task: any) => `${task?.id}` === `${this.taskid}`);
      if (index !== -1 && this.selectedTask?.id !== this.taskList[index]?.id) {
        this.selectTask(this.taskList[index], index, false);
      }
    });
  }

  private syncRouteWithSelection(projectId: any, taskId: any, replaceUrl = false): void {
    if (!projectId || !taskId) {
      return;
    }

    const currentProjectId = this.route.snapshot.paramMap.get('projectid');
    const currentTaskId = this.route.snapshot.paramMap.get('taskid');
    const currentTaskType = this.route.snapshot.queryParamMap.get('tasktype') || '';
    const currentFromDate = this.route.snapshot.queryParamMap.get('fromdate') || '';
    const currentToDate = this.route.snapshot.queryParamMap.get('todate') || '';

    const nextTaskType = `${this.taskType ?? ''}`;
    const nextFromDate = `${this.fromdate ?? ''}`;
    const nextToDate = `${this.todate ?? ''}`;

    if (
      `${currentProjectId ?? ''}` === `${projectId}` &&
      `${currentTaskId ?? ''}` === `${taskId}` &&
      currentTaskType === nextTaskType &&
      currentFromDate === nextFromDate &&
      currentToDate === nextToDate
    ) {
      return;
    }

    this.router.navigate(['/main/projects/project-content', projectId, taskId], {
      queryParams: this.buildNavigationQueryParams(),
      replaceUrl
    });
  }

  private buildNavigationQueryParams(): Record<string, string | null> {
    return {
      tasktype: this.taskType || null,
      fromdate: this.fromdate || null,
      todate: this.todate || null
    };
  }

  formatDateToYMD(date: Date | string | null): string {
    if (!date) return 'null';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }

}
