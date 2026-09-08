import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';

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
  projectId: string | null = null;
  isLoading = false;
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

  constructor(private cdr: ChangeDetectorRef,
     private route: ActivatedRoute,
    private router: Router,
     private authService: AuthService

  ) {
    let projectDetails: any = localStorage.getItem("projectDetails");
    this.projectDetails = JSON.parse(projectDetails);
    let ActiveTab: any = sessionStorage.getItem('activeProjectTab')
    this.setActiveTab(ActiveTab || "tasks")
  }
  ngOnInit(): void {
    // 1. Listen to route parameter changes (e.g., switching from Project A to Project B)
    this.route.paramMap.subscribe(params => {
      this.projectId = params.get('projectid') || params.get('projectId') || params.get('id');

      if (this.projectId) {
        this.fetchProjectDetails(this.projectId);
      }
    });

    // 2. Listen to router navigation events to catch tab changes when clicking links inside the same component
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.syncTabFromStorage();
    });

    // Initial tab sync on load
    this.syncTabFromStorage();
  }

  syncTabFromStorage(): void {
    const activeTab = sessionStorage.getItem('activeProjectTab');
    if (activeTab && activeTab !== this.activeProjectTab) {
      this.activeProjectTab = activeTab;
      this.cdr.detectChanges();
    }
  }

  fetchProjectDetails(id: string): void {
    this.isLoading = true;

    this.authService.getProjectById(id).subscribe({
      next: (res: any) => {
        this.projectDetails = res;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Failed to fetch project details:', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
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
