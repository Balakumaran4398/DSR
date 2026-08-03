import { Component, ElementRef, ViewChild } from '@angular/core';
import { StorageService } from 'src/app/_core/services/storage.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { AuthService } from 'src/app/_core/services/auth.service';
import { Subject, takeUntil } from 'rxjs';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import Swal from 'sweetalert2';
import { ToastrService } from 'ngx-toastr';
declare const Tabulator: any;

@Component({
  selector: 'app-products',
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss']
})
export class ProductsComponent {

  role: any = '';
  @ViewChild('tableDiv') tableDiv!: ElementRef;
  private table: any;
  private destroy$ = new Subject<void>();
  products: any[] = [];
  selectedCount = 0;
  showBar = false;
  showMoveMenu = false;
  searchTerm: any = '';

  constructor(
    private storageService: StorageService,
    private drawerService: DrawerService,
    private authService: AuthService,
    private toasterService: ToastrService
  ) { }

  ngOnInit() {
    this.role = this.storageService.getRoleNames();
    this.getAllProducts();
    this.listenForDrawerActions();
    console.log(this.role);
  }


  listenForDrawerActions(): void {
    this.drawerService.drawerAction$
      .pipe(takeUntil(this.destroy$))
      .subscribe((action: any) => {
        if (action?.source === 'products') {
          if (action.action === 'created' || action.action === 'updated') {
            console.log('Product action detected:', action);
            setTimeout(() => {
              this.getAllProducts();
            }, 500);
          }
        }
      });
  }

  openProduct(type: any) {
    this.drawerService.open(type);
  }

  getAllProducts() {
    this.authService.getAllProducts().subscribe({
      next: (res: any) => {
        this.products = this.normalizeProductsResponse(res);
        console.log(this.products);

        if (this.table) {
          this.table.setData(this.products);
          return;
        }

        setTimeout(() => {
          this.initializeTable();
        }, 100);
      },
      error: (err: any) => {
        console.log('getAllProductsError', err);
      }
    });
  }

  initializeTable() {
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.products,
      layout: "fitColumns",
      height: "100%",
      pagination: "local",
      paginationSize: 15,
      paginationCounter: "rows",
      movableColumns: true,
      selectable: true,
      editTriggerEvent: "dblclick",
      paginationSizeSelector: [10, 15, 25, 50, 100],
      placeholder: "No Products Found",
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
          title: "Product Name",
          field: "productName",
          minWidth: 220,
          widthGrow: 2,
          frozen: true,
          responsive: 0,
          formatter: (cell: any) => {
            const value = this.escapeHtml(cell.getValue() || '-');
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
          title: "Version",
          field: "versionList",
          minWidth: 180,
          widthGrow: 1.5,
          formatter: (cell: any) => {
            const versions = this.normalizeVersionList(cell.getValue());
            if (!versions.length) {
              return `
              <div class="flex flex-wrap gap-1" >
                <span class="bg-blue-50 text-blue-600 px-2 py-1 rounded-full text-xs">
                  -
                </span>
              </div>`
            }
            return `
          <div class="flex flex-wrap gap-1">
            ${versions.map((version: string) => `
                <span class="bg-blue-50 text-blue-600 px-2 py-1 rounded-full text-xs">
                  ${this.escapeHtml(version)}
                </span>
              `).join('')
              }
          </div>
        `;
          }
        },
        {
          title: "Description",
          field: "productDescription",
          minWidth: 250,
          widthGrow: 3,
          formatter: (cell: any) => {
            const value = this.escapeHtml(cell.getValue() || "");
            return `
            <div class="flex items-center h-full">
              <span class="text-m text-black truncate max-w-full cursor-help" title="${value}">
                ${value || '-'}
              </span>
            </div>
          `;
          }
        },
        {
          title: "Created Date",
          field: "createdDate",
          minWidth: 150,
          widthGrow: 1,
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
          minWidth: 120,
          hozAlign: "right",
          frozen: true,
          headerSort: false,
          formatter: () =>
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
      this.drawerService.open('products', data)
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
      }).then((result: any) => {
        if (result.isConfirmed) {
          this.authService.deleteProduct(data.id).subscribe({
            next: (res: any) => {
              this.toasterService.success(res?.message);
              this.getAllProducts();
            },
            error: (err: any) => {
              this.toasterService.error(
                err?.error?.message || 'Failed to delete product'
              );
            }
          });
        }
      });
    }
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
        { field: 'productName', type: 'like', value: this.searchTerm },
        { field: 'versionList', type: 'like', value: this.searchTerm },
        { field: 'productDescription', type: 'like', value: this.searchTerm },
      ]
    ]);
  }

  private normalizeProductsResponse(res: any): any[] {
    const list = Array.isArray(res)
      ? res
      : (res?.details ?? res?.data ?? res?.products ?? res?.productList ?? []);

    return Array.isArray(list) ? list : [];
  }

  private normalizeVersionList(value: any): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((versionItem: any) => typeof versionItem === 'string' ? versionItem : versionItem?.version)
      .filter((version: any) => version !== null && version !== undefined && String(version).trim() !== '')
      .map((version: any) => String(version));
  }

  private escapeHtml(value: any): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
