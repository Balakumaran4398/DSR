import { Component, ElementRef, HostListener, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { FormControl } from '@angular/forms';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { Employee } from '../projects/project-info/release-manager/release-manager.component';
import { map, Observable, startWith } from 'rxjs';
import { PdfService } from 'src/app/_core/services/pdf.service';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
interface Task {
  id: number;
  subtaskid: number;
  employee_name: string;
  project_title: string;
  date: string;
  start_date: string;
  end_date: string;
  task: string;
  sub_task: string;
  comments: string;
  completion_percentage: number;
  worked_hours: string;
  isdelete: boolean;
  createddate: string;
  updateddate: string;
}

declare const Tabulator: any;
declare const luxon: any;
@Component({
  selector: 'app-task-overview',
  templateUrl: './task-overview.component.html',
  styleUrls: ['./task-overview.component.scss']
})
export class TaskOverviewComponent implements OnInit {
  @ViewChild('taskList') taskList!: ElementRef<HTMLDivElement>;
  @ViewChildren('taskItem') taskItems!: QueryList<ElementRef<HTMLDivElement>>;
  empId: any = 0
  myControl = new FormControl<string | Employee | number>('');
  filteredOptions!: Observable<Employee[]>;
  viewMode: 'card' | 'table' = 'card';

  constructor(private authService: AuthService, private storageService: StorageService, private pdfService: PdfService) {
    this.empId = storageService.getEmpId();
    this.getEmployeeList();
  }
  employees: any[] = []
  mobileView = false;
  // Filter States
  searchTerm: string = '';
  filterStartDate: Date | null = null;
  filterEndDate: Date | null = null;
  filteredTasks: any[] = [];

  // Updated Data with JSON structure
  tasks: Task[] = [];
  selectedTask: Task | null = null;
  @ViewChild('taskTableDiv', { static: false }) taskTableDiv!: ElementRef;
  taskTable: any;
  taskData: any[] = [];
  ngOnInit() {
    // const today = new Date();

    // this.filterStartDate = new Date(today);
    // this.filterStartDate.setDate(today.getDate() - 1);

    // this.filterEndDate = new Date(today);
    // this.filterEndDate.setDate(today.getDate() - 1);

    this.checkViewport();
    window.addEventListener('resize', () => this.checkViewport());

    this.filterTask();
 
  }
 
  
  // // Getter to filter tasks dynamically
  // get filteredTasks(): Task[] {
  //   return this.tasks.filter(task => {
  //     // 1. Text Search Filter (Name)
  //     const matchesName = this.searchTerm
  //       ? task.employee_name.toLowerCase().includes(this.searchTerm.toLowerCase())
  //       : true;

  //     // // 2. Date Range Filter (Using 'date' field)
  //     // let matchesDate = true;
  //     // if (this.filterStartDate && this.filterEndDate) {
  //     //   const taskDate = new Date(task.date);
  //     //   taskDate.setHours(0, 0, 0, 0);

  //     //   const startDate = new Date(this.filterStartDate);
  //     //   startDate.setHours(0, 0, 0, 0);

  //     //   const endDate = new Date(this.filterEndDate);
  //     //   endDate.setHours(0, 0, 0, 0);

  //     //   matchesDate = taskDate.getTime() >= startDate.getTime() && taskDate.getTime() <= endDate.getTime();
  //     // }

  //     return matchesName;
  //   });
  // }

  resetFilters() {
    this.searchTerm = '';
    this.clearSelection();
    this.filterEndDate = null;
    this.filterStartDate = null;
    this.ngOnInit();
  }

  checkViewport() {
    this.mobileView = window.innerWidth < 950;
    // Auto select first task if switching to desktop and nothing is selected
    if (!this.mobileView && !this.selectedTask && this.tasks.length > 0) {
      this.selectedTask = this.tasks[0];
    }
  }

  selectTask(task: Task) {
    this.selectedTask = task;
  }

  deselectTask() {
    this.selectedTask = null;
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    const target = event.target as HTMLElement;

    // Do NOT hijack arrow keys while typing
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

    event.preventDefault();

    const list = this.tasks;
    if (!list.length) return;

    const currentIndex = this.selectedTask
      ? list.findIndex(t => t.id === this.selectedTask!.id)
      : -1;

    let newIndex = currentIndex;

    if (event.key === 'ArrowDown') {
      newIndex = currentIndex < list.length - 1 ? currentIndex + 1 : 0;
    }

    if (event.key === 'ArrowUp') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : list.length - 1;
    }

    if (newIndex !== currentIndex) {
      this.selectTask(list[newIndex]);

      // Ensure visibility after DOM update
      setTimeout(() => this.scrollToSelectedTask());
    }
  }

  filterTask() {
    this.authService
      .getDsrOverviewByEmpIdNdFromToDateNdUserId(
        this.selectedEmployee.id,
        this.formatDateToYMD(this.filterStartDate),
        this.formatDateToYMD(this.filterEndDate),
        this.empId
      )
      .subscribe((res: any) => {
        this.tasks = res || [];
        this.taskData = [...this.tasks];
        if (this.taskTable) {
          this.taskTable.setData(this.taskData);
        }
        this.selectedTask = this.tasks.length > 0 ? this.tasks[0] : null;
      });
  }


  scrollToSelectedTask() {
    if (!this.selectedTask || !this.taskItems?.length) return;

    const index = this.tasks.findIndex(
      t => t.id === this.selectedTask?.id
    );

    const itemEl = this.taskItems.get(index);
    const listEl = this.taskList.nativeElement;

    if (!itemEl) return;

    const item = itemEl.nativeElement;

    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;

    const listScrollTop = listEl.scrollTop;
    const listHeight = listEl.clientHeight;
    const listBottom = listScrollTop + listHeight;

    // Scroll only if out of view
    if (itemTop < listScrollTop) {
      listEl.scrollTop = itemTop;
    } else if (itemBottom > listBottom) {
      listEl.scrollTop = itemBottom - listHeight;
    }
    item.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });

  }

  formatDateToYMD(date: Date | string | null): string {
    if (!date) return 'null';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }


  private _filter(value: string): Employee[] {
    const filterValue = value.toLowerCase();
    return this.employees.filter((emp: any) =>
      emp.employee_name.toLowerCase().includes(filterValue)
    );
  }

  displayFn(employee: Employee | number | string): string {
    if (employee === 0) return 'Select all';
    if (typeof employee === 'string') return employee;
    if (typeof employee === 'number') return '';

    return employee && employee.employee_name
      ? employee.employee_name
      : '';
  }
  clearSelection(): void {
    this.myControl.setValue('');
    this.selectedEmployee = {};
    this.selectedEmployee = { id: 0 };
    this.filterTask();
  }
  getEmployeeList() {
    this.authService.getEmployeeList().subscribe((res: any) => {
      this.employees = res;
      this.filteredOptions = this.myControl.valueChanges.pipe(
        startWith(''),
        map(value => {
          const name =
            typeof value === 'string'
              ? value
              : typeof value === 'number'
                ? ''
                : value?.employee_name || '';
          this.searchTerm = name;
          return name ? this._filter(name) : [...this.employees];
        })
      );
    })
  }
  selectedEmployee: any = { id: 0, employee_name: 'All Employee' };
  onEmployeeSelection(emp: any) {
    this.selectedEmployee = emp === 0 ? { id: 0, employee_name: 'All Employee' } : emp;
    this.filterTask();
  }

  get hasEmployeeSelection(): boolean {
    const value = this.myControl.value;
    return value !== null && value !== '';
  }
  generateDSRPdf() {
    const employee = this.selectedEmployee?.id === 0
      ? { ...this.selectedEmployee, employee_name: 'All Employee' }
      : this.selectedEmployee;

    this.pdfService.generatePDF(employee, this.filterStartDate, this.filterEndDate, this.taskData);
  }
  private getDateRangeLabel(): string {
    if (!this.filterStartDate || !this.filterEndDate) return '';

    const start = this.filterStartDate;
    const end = this.filterEndDate;

    const sameDay =
      start.getDate() === end.getDate() &&
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear();

    const sameMonthYear =
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear();

    // 1️⃣ Same exact date
    if (sameDay) {
      return start.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    }

    // 2️⃣ Same month & year
    if (sameMonthYear) {
      return `${start.getDate()}–${end.getDate()} ${start.toLocaleString('en-US', {
        month: 'long',
        year: 'numeric'
      })}`;
    }

    const startLabel = start.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const endLabel = end.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    // 3️⃣ Different month / year
    return `${startLabel} – ${endLabel}`;
  }

  get canDownloadPdf(): boolean {  
    const hasEmployeeSelection = this.myControl.value === 0 || !!this.myControl.value;

    return (
      hasEmployeeSelection &&
      this.filterStartDate !== null &&
      this.filterEndDate !== null &&
      this.filterStartDate <= this.filterEndDate
    );
  }


  openTableView() {
    this.viewMode = 'table';
    setTimeout(() => {
      if (!this.taskTableDiv) return;
  
      if (this.taskTable) {
        this.taskTable.destroy();
        this.taskTable = null;
      }
  
      this.initializeTaskTable();
    }, 0);

  }
  
  openCardView() {
    this.viewMode = 'card';
  }
  onSearch(event: any) {
    const value = event.target.value?.toLowerCase().trim();
  
    if (!this.taskTable) return;
  
    if (!value) {
      this.taskTable.clearFilter();
      return;
    }
  
    this.taskTable.setFilter((data: any) => {
      return (
        data.employee_name?.toLowerCase().includes(value) ||
        data.project_title?.toLowerCase().includes(value) ||
        data.task?.toLowerCase().includes(value) ||
        data.date?.toLowerCase().includes(value) ||
        data.worked_hours?.toString().includes(value) ||
        data.completion_percentage?.toString().includes(value)
      );
    });
  }
  
  
  initializeTaskTable() {
    this.taskTable = new Tabulator(this.taskTableDiv.nativeElement, {
      data: this.taskData,
      layout: "fitColumns",
      pagination: "local",
      paginationSize: 10,
      paginationCounter: "rows",
      movableColumns: true,
      placeholder: "<div class='py-10 text-slate-500'>No tasks available</div>",
      columns: [
  
        {
          title: "Employee",
          field: "employee_name",
          minWidth: 180,
          formatter: (cell: any) =>
            `<span class="font-semibold text-slate-800">
              ${cell.getValue() || '-'}
            </span>`
        },
  
        {
          title: "Project",
          field: "project_title",
          formatter: (cell: any) =>
            `<span class="text-slate-600">
              ${cell.getValue() || '-'}
            </span>`
        },
  
        {
          title: "Task",
          field: "task",
          formatter: (cell: any) =>
            `<span class="text-slate-600">
              ${cell.getValue() || '-'}
            </span>`
        },
  
        {
          title: "Date",
          field: "date",
          width: 130,
          formatter: (cell: any) =>
            `<span class="text-slate-500">
              ${cell.getValue() || '-'}
            </span>`
        },
  
        {
          title: "Hours",
          field: "worked_hours",
          width: 100,
          formatter: (cell: any) =>
            `<span class="text-slate-600">
              ${cell.getValue() || 0} hrs
            </span>`
        },
  
        {
          title: "Progress",
          field: "completion_percentage",
          formatter: (cell: any) => {
            const value = cell.getValue() || 0;
  
            return `
              <div class="flex items-center gap-3">
                <div class="w-28 bg-slate-200 rounded-full h-2">
                  <div class="h-2 rounded-full transition-all duration-300"
                       style="width:${value}%; background-color: var(--text-active);">
                  </div>
                </div>
                <span class="text-xs font-semibold text-slate-700">
                  ${value}%
                </span>
              </div>
            `;
          }
        }
      ],
    });
    attachTabulatorPaginationPersistence(this.taskTable, buildTabulatorPaginationKey('task-overview-table'));
  }
  
    
}
