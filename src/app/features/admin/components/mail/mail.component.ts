import { Component, ElementRef, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from 'src/app/_core/services/auth.service';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import { MailListComponent } from '../mail-list/mail-list.component';


declare const Tabulator: any;
@Component({
  selector: 'app-mail',
  templateUrl: './mail.component.html',
  styleUrls: ['./mail.component.scss']
})
export class MailComponent {

  @ViewChild('tableDiv') tableDiv!: ElementRef;
  private table: any;
  mails : any[] = [];
  searchTerm = '';
  userData = JSON.parse(sessionStorage.getItem('user_data') || '{}');
  initialStartDate: string | null = null;
  initialEndDate: string | null = null;
  fromdate: any = null
  todate: any = null;
  private suppressInitialRangeFetch = false;

  constructor(private authService : AuthService, private matDialog: MatDialog){}

  ngOnInit(){
    this.setCurrentWeekDateRange();
    this.getAllMails();
  
  }

  initializeTable() {
    if (this.table) {
      this.table.destroy();
    }
  
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.mails,
      layout: 'fitColumns',
      pagination: 'local',
      paginationSize: 10,
      paginationCounter: 'rows',
      paginationSizeSelector: [5, 10, 25, 50, 100],
      movableColumns: true,
      selectable: true,
      height: "900px",
      placeholder: 'No Data Found',
      headerSortElement: function (col: any, dir: any) {
        if (dir === 'asc') return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === 'desc') return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },
      columns: [
        {
          title: 'ID',
          field: 'serialNo',
          width: 70,
          hozAlign: 'center',
          formatter: "rownum",
          headerHozAlign: 'center',
          headerSort: false,
          
        },
        {
          title: 'Project Name',
          field: 'project_title',
          width: 304, 				//changed
          frozen: true,
          resizable: true,
          hozAlign: 'left',
          sorter: 'string',
          headerHozAlign: 'left',
          formatter: (cell: any) => this.titleFormatter(cell), //change here
          cellClick: (e: any, cell: any) => {
            if (e.target.closest('.view-btn')) {
              e.stopPropagation();
              this.openDialogue(cell.getRow().getData());
            }
          }
        },
        {
          title: 'Assigned From',
          field: 'employee_name',
          minWidth: 200,
          hozAlign: 'center',
          headerHozAlign: 'center',
          sorter: 'string',
          formatter: (cell: any) => this.empNameFormatter(cell),
        },
{
          title: 'Assigned To',
          field: 'assignee_name',
          minWidth: 200,
          hozAlign: 'left',
          headerHozAlign: 'left',
          formatter: (cell: any) => this.empNameFormatter(cell)
        },
 
        {
          title: 'Status',
          field: 'status',
          minWidth: 200,
          hozAlign: 'center',
          headerHozAlign: 'center',
          formatter: (cell: any) => {
              const val = cell.getValue();
              // Simple color logic
              let colorClass = "bg-gray-100 text-gray-700";
              if (["Active", "On-Track", "Approved", "Completed", "Invoiced", "Open"].includes(val)) {
                colorClass = "bg-emerald-100 text-emerald-700";
              } else if (["In-Progress", "In-Review", "In-Testing", "Planning"].includes(val)) {
                colorClass = "bg-blue-100 text-blue-700";
              } else if (["On-Hold", "To-be-Tested"].includes(val)) {
                colorClass = "bg-amber-100 text-amber-700";
              } else if (["Delayed", "Cancelled", "Rejected", "Closed"].includes(val)) {
                colorClass = "bg-red-100 text-red-700";
              }

              return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}">${val}</span>`;
          }
        },
        
        {
          title: 'Created Date',
          field: 'created_date',
          minWidth: 150,
          hozAlign: 'center',
          headerHozAlign: 'center',
          formatter: (cell: any) => this.dateFormatter(cell.getValue()),
        },
        {
          title: 'Download',
          field: 'file_url',
          width: 120,
          hozAlign: 'center',
          headerHozAlign: 'center',
          headerSort: false,
          frozen: true,
          formatter: (cell: any) => this.actionFormatter(cell),
          cellClick: (e: any, cell: any) => this.handleActionClick(e, cell),
          cssClass: 'sticky-col-right',
        }
      ],
    });
  
    attachTabulatorPaginationPersistence(this.table, buildTabulatorPaginationKey('documents-table'));
  }

  private empNameFormatter(cell: any): string {
    const title = `${cell.getValue() ?? ''}`.trim() || '-';
    return `<span class="text-center font-medium text-gray-900">${this.escapeHtml(title)}</span>`;
    
  }

  private titleFormatter(cell: any): string {
    const title = `${cell.getValue() ?? ''}`.trim() || '-';
    const safeTitle = this.escapeHtml(title);
  
    return `
      <div class="flex items-center justify-between w-full group gap-2">
  
        <div class="min-w-0 flex-1">
          <span
            class="block truncate font-medium text-gray-900"
            title="${safeTitle}">
            ${safeTitle}
          </span>
        </div>
  
        <button
          type="button"
          class="view-btn flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 bg-white text-[var(--text-active)] shadow-sm whitespace-nowrap opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 hover:bg-gray-50">
          <span class="text-[10px] font-semibold uppercase tracking-wide">
            View
          </span>
          <i class="ri-eye-line text-xs"></i>
        </button>
  
      </div> `;
}

 

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  actionFormatter(_cell: any) {
    const rowData = _cell?.getRow?.().getData?.() || {};
    const fileUrl = this.getMailFileUrl(rowData);
    const hasFile = !!fileUrl;

    return `
      <div class="flex items-center justify-center gap-3 w-full h-full">
        <button
          class="transition-colors ${hasFile ? 'text-slate-400 hover:text-emerald-600 btn-download' : 'text-slate-300 cursor-not-allowed'}"
          title="${hasFile ? 'Download' : 'No file available'}"
          ${hasFile ? '' : 'disabled'}>
          <i class="ri-download-2-line text-lg pointer-events-none"></i>
        </button>
      </div>
    `;
  }

  handleActionClick(e: any, cell: any) {
    e.stopPropagation();
    const target = e.target.closest('button');
    if (!target) return;

    const row = cell.getRow();
    const data: any = row.getData();

    if (target.classList.contains('btn-download')) {
       this.downloadFile(this.getMailFileUrl(data), data.file_name ?? data.filename ?? data.title);
    } else if (target.classList.contains('btn-delete')) {
      // this.delDoc(data);
    }
  }

  private dateFormatter(value: string): string {
    if (!value) {
      return '<span class="text-center">-</span>';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return `<span class="text-center">${this.escapeHtml(value)}</span>`;
    }

    const formattedDate = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `<span class="text-center">${formattedDate}</span>`;
  }

  getAllMails(){
    this.authService.getAllMails(this.userData.empid,this.userData.id,this.fromdate,this.todate).subscribe({
      next : (res : any[]) => {
        this.mails = res;
        console.log(res);
        setTimeout(() => {
                this.initializeTable();
              });
      },
      error : (err : any) => {
        console.log('getAllMailsError',err);
      }
    });
  }

  private setCurrentWeekDateRange(): void {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + diff);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 5);
    weekEnd.setHours(23, 59, 59, 999);

    this.fromdate = this.formatDateToYMD(weekStart);
    this.todate = this.formatDateToYMD(weekEnd);
    this.initialStartDate = this.fromdate;
    this.initialEndDate = this.todate;
    this.suppressInitialRangeFetch = true;
  }

  

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value.trim().toLowerCase();
    
    if (!this.table) return;

    if (!this.searchTerm) {
      this.table.clearFilter();
      return;
    }

    this.table.setFilter([
      [
        { field: 'project_title', type: 'like', value: this.searchTerm },
        { field: 'employee_name', type: 'like', value: this.searchTerm },
        { field: 'status', type: 'like', value: this.searchTerm },
        // { field: 'created_date', type: 'like', value: this.searchTerm },
        { field: 'team_members', type: 'like', value: this.searchTerm }
      ]
    ]);
  }


  private getMailFileUrl(data: any): string {
    return `${data?.file_url ?? data?.link_url ?? ''}`.trim();
  }

  private getFileNameFromUrl(url: string, fallbackName?: string): string {
    const fallback = `${fallbackName ?? ''}`.trim();
    if (fallback) {
      return fallback;
    }

    const cleanUrl = url.split('?')[0].split('#')[0];
    const fileName = cleanUrl.split('/').pop() || 'mail-attachment';
    return decodeURIComponent(fileName.replace(/^\d+_/, ''));
  }

  downloadFile(url: string, fileName?: string){
    const fileUrl = `${url ?? ''}`.trim();
    if (!fileUrl) {
      return;
    }

    const a = document.createElement('a');

    a.href = encodeURI(fileUrl);
    a.download = this.getFileNameFromUrl(fileUrl, fileName);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
  }
  
private teamMemberFormatter(value: string): string {
  if (!value) {
    return '<span>-</span>';
  }

  return `
    <div class="text-left whitespace-normal break-words">
      ${this.escapeHtml(value)}
    </div>
  `;
}

openDialogue(data: any) {
    const dialogRef = this.matDialog.open(MailListComponent,
      {
        data: {
          ...data,
          mails: this.mails
        },
        width: '100vw'
      }
    );
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // handle dialog result (refresh, API call, etc.)
        console.log('Dialog closed with:', result);
      }
    });
  }
  onRangeChange(event: { startDate: Date; endDate: Date }) {
    const nextFromDate = this.formatDateToYMD(event.startDate);
    const nextToDate = this.formatDateToYMD(event.endDate);
    const isSameRange = this.fromdate === nextFromDate && this.todate === nextToDate;

    this.fromdate = nextFromDate;
    this.todate = nextToDate;
    this.initialStartDate = this.fromdate;
    this.initialEndDate = this.todate;

    if (this.suppressInitialRangeFetch && isSameRange) {
      this.suppressInitialRangeFetch = false;
      return;
    }

    this.suppressInitialRangeFetch = false;
    this.getAllMails()
  }
    formatDateToYMD(date: Date | string | null): string {
    if (!date) return 'null';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }
}
