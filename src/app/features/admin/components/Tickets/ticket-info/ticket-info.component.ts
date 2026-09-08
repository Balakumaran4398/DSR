import { Component } from '@angular/core';

@Component({
  selector: 'app-ticket-info',
  templateUrl: './ticket-info.component.html',
  styleUrls: ['./ticket-info.component.scss']
})
export class TicketInfoComponent {
  activeProjectTab = 'raisedtickets';

  tabs = [
    { id: 'raisedtickets', label: 'Active Tickets' },
    { id: 'overalltickets', label: 'Over All Tickets' },
    { id: 'clients', label: 'Clients' },
    { id: 'products', label: 'Products' }
  ];

  ngOnInit(): void {
    const savedTab = sessionStorage.getItem('activeTicketTab');
    if (savedTab) {
      this.activeProjectTab = savedTab;
    }
  }
  setActiveTab(tabId: string): void {
    this.activeProjectTab = tabId;
    sessionStorage.setItem('activeTicketTab', tabId);
  }
}
