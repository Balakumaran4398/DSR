import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/_core/services/auth.service';

// Declare global variable for the library loaded via CDN
declare var Gantt: any;

interface Task {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  custom_class: string;
  assignee: string; // Employee ID
  dependencies: string;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  avatar: string;
}
@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ReportsComponent implements AfterViewInit {
  @ViewChild('ganttSvg') ganttSvg!: ElementRef;
  ganttChart: any;
  currentViewMode: string = 'Week';
  currentFilter: string = 'all';
  projectid: any = 0;
  employees: Employee[] = [];
  filteredEmployees: Employee[] = [];
  allTasks: Task[] = [];
  rawData: any
  // Computed getter for filtered tasks
  get filteredTasks(): Task[] {
    if (this.currentFilter === 'all') return this.allTasks;
    let all = this.allTasks.filter(t => t.assignee === this.currentFilter);
    return all;
  }

  constructor(private route: ActivatedRoute, private authService: AuthService) {
    this.projectid = this.route.snapshot.paramMap.get('projectid');
    this.getTasksByEmpIdNdProjectIdNdaDate();

  }

  ngAfterViewInit() {
    this.loadFrappeLibrary();
    if (this.rawData) {
      this.generateTasksFromRawData(this.rawData)
    }
  }

  getTasksByEmpIdNdProjectIdNdaDate() {
    this.authService.getTasksByEmpIdNdProjectIdNdaDate(this.projectid, 0).subscribe((res: any) => {
      this.rawData = res;
      this.generateTasksFromRawData(this.rawData);
      this.filterByEmployee('all');
    })
  }

  generateTasksFromRawData(rawData: any[]) {
    // 1. Sort by Phase Title to create a "Tree" / Grouping effect
    rawData.sort((a, b) => {
      const phaseA = a.phase_title || 'Uncategorized';
      const phaseB = b.phase_title || 'Uncategorized';
      return phaseA.localeCompare(phaseB);
    });

    // 2. Extract Unique Employees
    const uniqueAssignees = [...new Set(rawData.map(t => t.assigned_to_name))];

    this.employees = [
      { id: 'all', name: 'All Personnel', role: 'Global View', avatar: 'ALL' },
      ...uniqueAssignees.map(name => ({
        id: name,
        name: name,
        role: 'Team Member',
        avatar: name.split(' ').map((n: any) => n[0]).join('').toUpperCase().substring(0, 2)
      }))
    ];

    // 3. Map Tasks with Style Configuration based on Priority
    const priorityMap: { [key: string]: string } = {
      'high': 'gantt-style-orange',
      'medium': 'gantt-style-blue',
      'low': 'gantt-style-teal'
    };

    this.allTasks = rawData.map(item => {
      let cssClass = 'gantt-style-blue'; // default
      const priority = (item.priority || '').toLowerCase();

      if (priorityMap[priority]) {
        cssClass = priorityMap[priority];
      }

      let start = new Date(item.start_date);
      let end = new Date(item.end_date);

      // ✅ FIX: same-day task → minimum 1-day duration
      if (start.getTime() === end.getTime()) {
        end.setDate(end.getDate() + 1);
      }
      return {
        id: item.id.toString(),
        name: item.task,
        start: item.start_date,
        end: end.toISOString().split('T')[0],
        progress: parseInt(item.completion_percentage || '0', 10),
        custom_class: cssClass,
        assignee: item.assigned_to_name,
        dependencies: item.dependencies,
        description: item.description,
        status: item.status,
        priority: item.priority,
        phase: item.phase_title || 'Uncategorized'
      };
    });
  }

  loadFrappeLibrary() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/frappe-gantt/dist/frappe-gantt.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/frappe-gantt/dist/frappe-gantt.umd.js';
    script.onload = () => {
      this.initGantt();
    };
    document.body.appendChild(script);
  }

  initGantt() {
    if (typeof Gantt === 'undefined') return;

    // Frappe Gantt might throw error if empty array, check length
    const data = this.filteredTasks.length ? this.filteredTasks : this.allTasks;

    // Destroy existing instance to prevent memory leaks if re-initializing
    if (this.ganttChart) {
      // frappe gantt doesn't have a destroy method in standard lib, 
      // usually we just overwrite or clear innerHTML if needed.
      // For this demo, simple overwrite works.
    }

    this.ganttChart = new Gantt("#gantt", data, {
      view_mode: this.currentViewMode,
      // view_mode_select: true,
      date_format: "MMM D",
      popup_trigger: "click mouseover",
      bar_height: 35,
      padding: 20,
      container_height: 50,
      // scroll_to: new Date,
      lines: 'both',
      infinite_padding: true,
      on_click: (task: any) => console.log('Clicked', task),
      on_date_change: (task: any, start: Date, end: Date) => console.log('Date change', task, start, end),
      on_progress_change: (task: any, progress: number) => console.log('Progress', task, progress),
    });


  }

  changeViewMode(mode: string) {
    this.currentViewMode = mode;
    if (this.ganttChart) {
      this.ganttChart.change_view_mode(mode);
      setTimeout(() => {
        const todayBtn = document.querySelector(
          '.side-header > .today-button'
        ) as HTMLButtonElement;

        if (todayBtn) {
          todayBtn.click();
        }
      }, 50);
    }
  }

  filterByEmployee(empId: string) {
    this.currentFilter = empId;
    this.refreshChart();
  }

  addNewTask() {

  }

  refreshChart() {
    if (!this.ganttChart) return;

    const tasksToShow = this.filteredTasks;
    const svgElement = this.ganttSvg.nativeElement;

    if (tasksToShow.length === 0) {
      svgElement.style.display = 'none';
    } else {
      svgElement.style.display = 'block';
      this.ganttChart.refresh(tasksToShow);
    }
  }

  getMemberTaskCount(id: string) {
    if (id === 'all') return this.allTasks.length;
    return this.allTasks.filter(t => t.assignee === id).length;
  }
  searchQuery: any;
  updateFilters() {
    // Sidebar search logic
    const query = this.searchQuery.toLowerCase();
    this.filteredEmployees = this.employees.filter(e =>
      e.name.toLowerCase().includes(query) || e.role.toLowerCase().includes(query)
    );

    // Directive filtering logic
    const filter = this.currentFilter;
    let tasks = filter === 'all' ? this.allTasks : this.allTasks.filter(t => t.assignee === filter);





  }
}