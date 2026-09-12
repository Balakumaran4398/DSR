import { Component } from '@angular/core';
import { StorageService } from 'src/app/_core/services/storage.service';

@Component({
  selector: 'app-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss']
})
export class OverviewComponent {
  activeTabId = 'releases';

  private readonly defaultTabs: any[] = [
    {
      id: 'timelogs',
      label: 'Time logs',
      icon: 'ri-add-line',
      description: 'Activity and tracking logs'
    },
    {
      id: 'releases',
      label: 'Releases',
      icon: 'ri-install-line',
      description: 'Project deployment history'
    },
    {
      id: 'Overall Performance',
      label: 'Overall Performance',
      icon: 'ri-bar-chart-line',
      description: 'Project performance metrics'
    }
  ];

  private readonly overallPerformanceTab = {
    id: 'Overall Performance',
    label: 'Overall Performance',
    icon: 'ri-bar-chart-line',
    description: 'Project performance metrics'
  };

  mainTabs: any[] = [];
  private tabStorageKey = 'overviewCurrentView';

  constructor(private storageService: StorageService) { }

  ngOnInit(): void {
    const { isAdmin, isManager } = this.storageService.roles;
    const canViewOverallPerformance = isAdmin || isManager;
    this.tabStorageKey = canViewOverallPerformance
      ? 'overviewCurrentView:management'
      : 'overviewCurrentView:standard';

    this.mainTabs = canViewOverallPerformance
      ? [...this.defaultTabs]
      : this.defaultTabs.filter(tab => tab.id !== this.overallPerformanceTab.id);

    const roleDefaultTab = canViewOverallPerformance
      ? this.overallPerformanceTab.id
      : 'releases';
    const savedTab = sessionStorage.getItem(this.tabStorageKey);
    const savedTabIsAvailable = this.mainTabs.some(tab => tab.id === savedTab);

    // Admins always land on the organization-wide report when Overview opens.
    // Managers and employees can continue from their last available tab.
    this.activeTabId = isAdmin
      ? this.overallPerformanceTab.id
      : savedTabIsAvailable ? savedTab! : roleDefaultTab;
    sessionStorage.setItem(this.tabStorageKey, this.activeTabId);
  }

  setActiveTab(id: string): void {
    if (!this.mainTabs.some(tab => tab.id === id)) {
      return;
    }

    this.activeTabId = id;    
    sessionStorage.setItem(this.tabStorageKey, id);
  }
}
