import { Component, ElementRef, ViewChild } from '@angular/core';
import { StorageService } from 'src/app/_core/services/storage.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { AuthService } from 'src/app/_core/services/auth.service';
import { finalize, Subject, Subscription, takeUntil } from 'rxjs';
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
  private productRequest?: Subscription;
  private productRequestVersion = 0;
  private tableInitTimer?: ReturnType<typeof setTimeout>;
  products: any[] = [];
  selectedCount = 0;
  showBar = false;
  showMoveMenu = false;
  searchTerm: any = '';
  productsLoading = false;
  deletingProductId: number | null = null;

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
    const requestVersion = ++this.productRequestVersion;
    this.productRequest?.unsubscribe();

    this.productsLoading = true;
    this.productRequest = this.authService.getAllProducts()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (requestVersion === this.productRequestVersion) {
            this.productsLoading = false;
            this.productRequest = undefined;
          }
        })
      )
      .subscribe({
        next: (res: any) => {
          if (requestVersion !== this.productRequestVersion) return;

          this.products = this.normalizeProductsResponse(res);
          this.renderTable();
        },
        error: (err: any) => {
          if (requestVersion !== this.productRequestVersion) return;

          this.products = [];
          this.renderTable();
          console.log('getAllProductsError', err);
        },
        complete: () => {
          if (requestVersion === this.productRequestVersion) {
            this.productRequest = undefined;
          }
        }
      });
  }

  ngOnDestroy(): void {
    this.productRequest?.unsubscribe();
    if (this.tableInitTimer) {
      clearTimeout(this.tableInitTimer);
    }
    if (this.table) {
      this.table.destroy();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private renderTable(): void {
    if (!this.tableDiv?.nativeElement) {
      return;
    }

    if (this.table) {
      this.table.setData(this.products);
      this.table.redraw(true);
      return;
    }

    if (this.tableInitTimer) {
      clearTimeout(this.tableInitTimer);
    }

    this.tableInitTimer = setTimeout(() => {
      this.initializeTable();
    }, 100);
  }

  initializeTable() {
    if (this.table) {
      this.table.destroy();
    }
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
          formatter: (cell: any) => this.actionFormatter(cell),
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
    if (target.disabled) return;

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
          this.deletingProductId = Number(data.id);
          this.refreshTableActions();
          this.authService.deleteProduct(data.id)
            .pipe(finalize(() => {
              this.deletingProductId = null;
              this.refreshTableActions();
            }))
            .subscribe({
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

  actionFormatter(cell: any): string {
    const data = cell.getData?.() ?? {};
    const productId = Number(data?.id);
    const isDeleting = this.deletingProductId === productId;

    return `<div class="flex items-center justify-center gap-3 w-full h-full">
      <button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit" title="Edit" ${isDeleting ? 'disabled' : ''}>
        <i class="ri-pencil-line text-lg pointer-events-none"></i>
      </button>
      <button class="text-slate-400 hover:text-red-600 transition-colors btn-delete ${isDeleting ? 'tabulator-action-button--loading' : ''}" title="${isDeleting ? 'Deleting...' : 'Delete'}" ${isDeleting ? 'disabled' : ''}>
        <i class="${isDeleting ? 'ri-loader-4-line tabulator-action-spinner' : 'ri-delete-bin-line text-lg'} pointer-events-none"></i>
      </button>
    </div>`;
  }

  private refreshTableActions(): void {
    try {
      this.table?.redraw?.(true);
    } catch {
      // ignore redraw timing during table rebuilds
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
