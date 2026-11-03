import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-ticket-info',
  templateUrl: './ticket-info.component.html',
  styleUrls: ['./ticket-info.component.scss']
})
export class TicketInfoComponent {
  activeProjectTab = 'raisedtickets';
  notificationTicketId: string | null = null;

  constructor(private route: ActivatedRoute) {}

  tabs = [
    { id: 'raisedtickets', label: 'Active Tickets' },
    { id: 'overalltickets', label: 'Over All Tickets' },
    { id: 'clients', label: 'Clients' },
    { id: 'products', label: 'Products' }
  ];

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.notificationTicketId = params.get('ticketId');
    });
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
