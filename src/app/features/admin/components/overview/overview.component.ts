import { Component } from '@angular/core';

@Component({
  selector: 'app-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss']
})
export class OverviewComponent {
  // State using standard properties instead of Signals
  activeTabId: string = 'timelogs';

  mainTabs: any[] = [
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
    }

  ];

  setActiveTab(id: string): void {
    this.activeTabId = id;
  }
}
