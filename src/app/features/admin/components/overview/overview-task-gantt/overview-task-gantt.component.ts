import { AfterViewInit, Component, ElementRef, HostListener, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/_core/services/auth.service';

declare var Gantt: any;

interface Task {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  custom_class: string;
  assignee: string;
  dependencies: string;
  description?: string;
  status?: string;
  priority?: string;
  phase?: string;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

@Component({
  selector: 'app-overview-task-gantt',
  templateUrl: './overview-task-gantt.component.html',
  styleUrls: ['./overview-task-gantt.component.scss']
})
export class OverviewTaskGanttComponent implements AfterViewInit, OnChanges {
  @ViewChild('ganttSvg') ganttSvg!: ElementRef;

  ganttChart: any;
  currentViewMode: string = 'Week';
  currentFilter: string = 'all';

  employees: Employee[] = [];
  allTasks: Task[] = [];

  @Input() rawData: any[] = [];

  constructor(private route: ActivatedRoute, private authService: AuthService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rawData'] && this.rawData) {
      this.currentFilter = "all";
      this.processDataAndRefresh();
    }
  }

  ngAfterViewInit() {
    if (this.rawData && this.rawData.length > 0) {
      this.processDataAndRefresh();
    }
  }

  processDataAndRefresh() {
    this.generateTasksFromRawData(this.rawData);
    // Logic check: if chart exists, refresh with current filter; if not, init.
    this.filterByEmployee(this.currentFilter);
  }

  generateTasksFromRawData(rawData: any[]) {
    // 1. Sort by Phase Title
    const sortedData = [...rawData].sort((a, b) => {
      const phaseA = a.phase_title || 'Uncategorized';
      const phaseB = b.phase_title || 'Uncategorized';
      return phaseA.localeCompare(phaseB);
    });

    // 2. Extract Unique Employees
    const uniqueAssignees = [...new Set(sortedData.map(t => t.assigned_to_name))].filter(n => !!n);

    this.employees = [
      { id: 'all', name: 'All Personnel', role: 'Global View', avatar: 'ALL' },
      ...uniqueAssignees.map(name => ({
        id: name,
        name: name,
        role: 'Team Member',
        avatar: name.split(' ').map((n: any) => n[0]).join('').toUpperCase().substring(0, 2)
      }))
    ];

    // 3. Map Tasks
    const priorityMap: { [key: string]: string } = {
      'high': 'gantt-style-orange',
      'medium': 'gantt-style-blue',
      'low': 'gantt-style-teal'
    };

    this.allTasks = sortedData.map(item => {
      let cssClass = priorityMap[(item.priority || '').toLowerCase()] || 'gantt-style-blue';

      let start = new Date(item.start_date);
      let end = new Date(item.end_date);

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
        dependencies: item.dependencies || '',
        description: item.description,
        status: item.status,
        priority: item.priority,
        phase: item.phase_title || 'Uncategorized'
      };
    });
  }

  initGantt(tasks: Task[]) {
    if (typeof Gantt === 'undefined' || !this.ganttSvg) return;

    this.ganttChart = new Gantt("#gantt", tasks, {
      view_mode: this.currentViewMode,
      date_format: "MMM D",
      bar_height: 35,
      padding: 20,
      container_height: 50,
      lines: 'both',
      read_only: true,
      infinite_padding: true,
      on_click: (task: any) => console.log('Clicked', task),
    });
  }

  filterByEmployee(empId: string) {
    this.currentFilter = empId;

    const tasksToShow = empId === 'all'
      ? this.allTasks
      : this.allTasks.filter(t => t.assignee === empId);

    this.refreshChart(tasksToShow);
  }

  refreshChart(tasks: Task[]) {
    if (tasks.length === 0) {
      if (this.ganttSvg) this.ganttSvg.nativeElement.style.display = 'none';
      return;
    }

    if (this.ganttSvg) this.ganttSvg.nativeElement.style.display = 'block';

    if (!this.ganttChart) {
      this.initGantt(tasks);
    } else {
      this.ganttChart.refresh(tasks);
    }
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

  getMemberTaskCount(id: string) {
    if (id === 'all') return this.allTasks.length;
    return this.allTasks.filter(t => t.assignee === id).length;
  }
  private navigateRoster(direction: number): void {
    const employees = this.employees;
    if (!employees.length) return;

    const currentIndex = employees.findIndex(
      e => e.id === this.currentFilter
    );

    const nextIndex =
      currentIndex === -1
        ? (direction > 0 ? 0 : employees.length - 1)
        : (currentIndex + direction + employees.length) % employees.length;

    const nextEmp = employees[nextIndex];

    this.filterByEmployee(nextEmp.id);

    requestAnimationFrame(() => {
      const el = document.getElementById(`emp-${nextEmp.id}`);
      if (el) {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      this.navigateRoster(1);
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      this.navigateRoster(-1);
      event.preventDefault();
    }
  }
}