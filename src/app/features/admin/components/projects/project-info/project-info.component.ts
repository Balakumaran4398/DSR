import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, ViewChild } from '@angular/core';

@Component({
  selector: 'app-project-info',
  templateUrl: './project-info.component.html',
  styleUrls: ['./project-info.component.scss']
})
export class ProjectInfoComponent implements AfterViewInit {
  @ViewChild('tabsContainer') tabsContainer!: ElementRef;

  activeProjectTab = 'dashboard';
  showMoreMenu = false;

  projectDetails: any;

  tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'users', label: 'Users' },
    // { id: 'reports', label: 'Reports' },
    { id: 'phases', label: 'Phases' },
    // { id: 'time-logs', label: 'Time Logs' },
    { id: 'issues', label: 'Issues' },
    { id: 'release', label: 'Releases' },
    { id: 'documents', label: "Documents" },
    // { id: 'mom', label: " Minutes of Meeting" },

  ];

  visibleTabs: any[] = [...this.tabs];
  overflowTabs: any[] = [];

  constructor(private cdr: ChangeDetectorRef) {
    let projectDetails: any = localStorage.getItem("projectDetails");
    this.projectDetails = JSON.parse(projectDetails);
    let ActiveTab: any = sessionStorage.getItem('activeProjectTab')
    this.setActiveTab(ActiveTab || "tasks")
  }

  ngAfterViewInit(): void {
    // Initial calculation
    this.calculateTabs();
    // Trigger change detection because updating visibleTabs changes the view after init
    this.cdr.detectChanges();
  }

  @HostListener('window:resize')
  onResize() {
    this.calculateTabs();
  }

  setActiveTab(tabId: string): void {
    this.activeProjectTab = tabId;
    this.showMoreMenu = false;
    sessionStorage.setItem("activeProjectTab", this.activeProjectTab)
  }

  calculateTabs(): void {
    this.visibleTabs = [...this.tabs];
    this.overflowTabs = [];
  }
}
