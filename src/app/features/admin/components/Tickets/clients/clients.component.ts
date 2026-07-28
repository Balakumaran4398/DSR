import { Component, ElementRef, ViewChild } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import Swal from 'sweetalert2';
declare const Tabulator: any;

@Component({
  selector: 'app-clients',
  templateUrl: './clients.component.html',
  styleUrls: ['./clients.component.scss']
})
export class ClientsComponent {


  @ViewChild('tableDiv') tableDiv!: ElementRef;
  private table: any;
  private destroy$ = new Subject<void>();
  searchTerm: any = '';
  clients: any[] = []
  selectedCount = 0;
  showBar = false;
  showMoveMenu = false;
  role : any = '';

  constructor(
    private drawerService: DrawerService,
    private authService: AuthService,
    private storageService: StorageService,
    private toasterService: ToasterService
  ) { }

  ngOnInit() {
    this.getAllClients();
    this.listenForDrawerActions();
    this.role = this.storageService.getRoleNames();
  }

   listenForDrawerActions(): void {
    this.drawerService.drawerAction$
        .pipe(takeUntil(this.destroy$))
        .subscribe((action: any) => {
          if (action?.source === 'client') {
            if (action.action === 'created' || action.action === 'updated') {
              console.log('Client action detected:', action);
              setTimeout(() => {
                this.getAllClients();
              }, 500);
            }
          }
        });
    }


  getAllClients() {
    this.authService.getAllClients().subscribe({
      next: (res: any[]) => {
        this.clients = res;
        console.log(res);
        setTimeout(() => {
          this.initializeTable();
        }, 100);
      },
      error: (err: any) => {
        console.log('getAllclientsError', err);
      }
    });
  }

  initializeTable() {

    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.clients,
      layout: "fitData",
      pagination: "local",
      paginationSize: 15,
      paginationCounter: "rows",
      maxHeight : '800px',
      movableColumns: true,
      selectable: true,
      editTriggerEvent: "dblclick",
      paginationSizeSelector: [10, 15, 25, 30, 50, 100],
      placeholder: "No Data Found",
      headerSortElement: function (col: any, dir: any) {
        if (dir === "asc")
          return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === "desc")
          return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },
      initialSort: [
        { column: "id", dir: "desc" }
      ],
      columns: [
        {
          title: "Client Name",
          field: "company_name",
          minWidth: 220,
          width: 300,
          frozen: true,
          responsive: 0,
          formatter: (cell: any) => {
            const value = cell.getValue() || '-';
            return `
          <div class="flex items-center gap-3">
            <div class="h-8 w-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold border border-gray-200">
              ${value.charAt(0).toUpperCase()}
            </div>
            <span class="text-gray-800 font-medium">
              ${value}
            </span>
          </div>
          `;
          }
        },
        {
          title: "Phone",
          field: "mobile",
          width: 140,
          responsive: 3,
          formatter: (cell: any) =>
            `<span class="text-black text-sm font-mono">
              ${cell.getValue() || '-'}
            </span>`
        },
        {
          title: "Email",
          field: "email",
          width: 220, 
          responsive: 2,
          formatter: (cell: any) =>
            `<span class="text-black text-sm">
            ${cell.getValue() || '-'}
          </span>`
        },
        {
          title: "Address",
          field: "address",
          minWidth: 250,
          responsive: 3,

          formatter: (cell: any) =>
            `<span class="text-black text-sm">
            ${cell.getValue() || '-'}
          </span>`
        },
        {
          title: "City",
          field: "city",
          width: 140,
          responsive: 4,

          formatter: (cell: any) =>
            `<span class="text-black">
              ${cell.getValue() || '-'}
            </span>`
        },
        {
          title: "State",
          field: "state",
          width: 140,
          responsive: 4,

          formatter: (cell: any) =>
            `<span class="text-black">
            ${cell.getValue() || '-'}
          </span>`

        },
        {
          title: "Pincode",
          field: "pincode",
          width: 120,
          responsive: 5,
          formatter: (cell: any) =>
            `<span class="bg-slate-100 text-black px-2 py-1 rounded text-xs">
            ${cell.getValue() || '-'}
          </span>`
        },
        {
          title: "Created Date",
          field: "created_date",
          width: 150,
          sorter: (a: any, b: any) => {
            return new Date(a).getTime() - new Date(b).getTime();
          },
          formatter: (cell: any) => {
            const value = cell.getValue();
            if (!value) return "-";

            return new Date(value).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric"
            });
          }
        },
        {
          title: "Actions",
          field: "actions",
          width: 120,
          hozAlign: "right",
          frozen: true,
          headerSort: false,
          formatter: () =>
            // <button class="text-slate-400 hover:text-amber-600 transition-colors btn-relieve" title="Relieve Employee">
            // <i class="ri-user-unfollow-line text-lg pointer-events-none"></i>
            // </button>
            `<div class="flex items-center justify-center gap-3 w-full h-full">
            <button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit" title="Edit">
              <i class="ri-pencil-line text-lg pointer-events-none"></i>
            </button>
            <button class="text-slate-400 hover:text-red-600 transition-colors btn-delete" title="Delete">
              <i class="ri-delete-bin-line text-lg pointer-events-none"></i>
            </button>
          </div>
        `,
          cellClick: (e: any, cell: any) =>
            this.handleActionClick(e, cell),
          cssClass: "sticky-col-right"
        }
      ]
    });
    attachTabulatorPaginationPersistence(
      this.table,
      buildTabulatorPaginationKey('customer-table')
    );

    this.table.on("rowSelectionChanged",
      (data: any[], rows: any[]) => {
        this.selectedCount = rows.length;
        this.showBar = this.selectedCount > 0;
        if (!this.showBar)
          this.showMoveMenu = false;
      }
    );
  }

  openClient(type: any) {
    this.drawerService.open(type)
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
        { field: 'companyName', type: 'like', value: this.searchTerm },
        { field: 'mobile', type: 'like', value: this.searchTerm },
        { field: 'email', type: 'like', value: this.searchTerm },
        { field: 'address', type: 'like', value: this.searchTerm },
        { field: 'city', type: 'like', value: this.searchTerm },
        { field: 'state', type: 'like', value: this.searchTerm },
        { field: 'created_date', type: 'like', value: this.searchTerm }

      ]
    ]);
  }

  handleActionClick(e: any, cell: any) {
    if (this.storageService.roles.isEmployee) {
      return
    }
    e.stopPropagation();
    const target = e.target.closest('button');
    if (!target) return;

    const row = cell.getRow();
    const data = row.getData();
    console.log(data);
    if (target.classList.contains('btn-edit')) {
      this.drawerService.open('client', data)
      console.log('inside edit');
    } else if (target.classList.contains('btn-delete')) {
      Swal.fire({
        title: "Are you sure?",
        text: "You won't be able to revert this!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes, delete it!"
      }).then((result:any) => {
        if (result.isConfirmed) {
          this.authService.deleteClient(data.id).subscribe({
            next: (res: any) => {
              this.toasterService.success(res?.message);
              this.getAllClients();
            },
            error: (err: any) => {
              this.toasterService.error(
                err?.error?.message || 'Failed to delete client'
              );
            }
          });
        }
      });
    }
  }
}

