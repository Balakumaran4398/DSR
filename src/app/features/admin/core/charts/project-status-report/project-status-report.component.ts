import { AfterViewInit, Component, ElementRef, Inject, Input, Optional, SimpleChanges, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { formatStatusPill } from 'src/app/_core/utils/status-pill.util';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
declare const Tabulator: any;
declare const luxon: any;
@Component({
  selector: 'app-project-status-report',
  templateUrl: './project-status-report.component.html',
  styleUrls: ['./project-status-report.component.scss']
})
export class ProjectStatusReportComponent implements AfterViewInit {
  @ViewChild('tableProject') tableProject!: ElementRef;
  @Input() dues: any[] = [];
  private table: any;
  @Input() icon: any = 'ri-stack-line';
  constructor(private router: Router, @Optional() @Inject(MAT_DIALOG_DATA) public data: any, public matDialog: MatDialog) {
    console.log("aaaaaaa");
    if (data?.data) {
      this.dues = data?.data
      console.log("dues", this.dues   );
      
    }
  }
  ngOnChanges(changes: SimpleChanges) {
    if (changes['dues']) {
      console.log('Dues changed:', changes['dues'].currentValue);
      this.ngAfterViewInit()
    }
  }
  ngAfterViewInit() {
    const checkInterval = setInterval(() => {
      if (typeof Tabulator !== 'undefined' && typeof luxon !== 'undefined' && this.tableProject) {
        clearInterval(checkInterval);
        this.initializeTable();
      }
    }, 100);
  }
  initializeTable() {
    this.dues
    this.table = new Tabulator(this.tableProject.nativeElement, {
      data: this.dues,
      layout: "fitColumns",
      pagination: "local",
      paginationSize: 15,
      paginationCounter: "rows",
      movableColumns: true,
      selectable: true,
      editTriggerEvent: "dblclick",
      paginationSizeSelector: [10, 15, 25, 30, 50, 100],
      placeholder: "No Data Found",
      responsiveLayout: false,
      height: "60vh",
      headerSortElement: function (col: any, dir: any) {
        if (dir === "asc") return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === "desc") return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },

      initialSort: [
        { column: "title", dir: "asc" },
      ],

      columns: [
        {
          title: "Project",
          field: "title",
          minWidth: 250,
          responsive: 0,
          frozen: true,
          formatter: (cell: any) => {
            const data = cell.getData();
            return `
                <div class="flex items-center justify-between w-full group relative pr-8">
                    <div class="flex  gap-2">
                        <div class="text-[var(--text-active)] text-lg font-semibold">
                            <i class="ri-folder-3-line"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="font-medium text-gray-900 text-m leading-relaxed break-words">${data.project_name}</span>
                        </div>
                    </div>
                    <button class="absolute access-btn right-0 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white border border-gray-200 shadow-sm px-2.5 py-1 rounded-md hover:bg-gray-50 text-[var(--text-active)] hover:text-[var(--text-active)]-700 focus:outline-none z-10 flex items-center gap-1.5 transform translate-x-2 group-hover:translate-x-0" >
                        <span class="text-[10px] font-semibold uppercase tracking-wide">Open</span>
                        <i class="ri-arrow-right-up-line text-xs"></i>
                    </button>
                </div>
                `;
          },
          cellClick: (e: any, cell: any) => {
            if (e.target.closest('.access-btn')) {
              e.stopPropagation();
              const rowData = cell.getRow().getData();
              localStorage.setItem('projectDetails', JSON.stringify(rowData));
              sessionStorage.setItem('activeProjectTab','release');
              this.router.navigate([`/main/projects/project-content/${rowData.projectid}`]);
              this.matDialog.closeAll();

            }
          }
        },
        {
          title: "Subject",
          field: "title",
          minWidth: 150,
          responsive: 3,

        },
        {
          title: "Assignee",
          field: "assignee_to_name",
          minWidth: 150,
          responsive: 3,
          formatter: (cell: any) => {
            const name = cell.getValue();

            return `
                <div class="flex items-center gap-2">
                    <span class="text-m font-medium text-gray-800 truncate">${name}</span>
                </div>
                `;
          }
        }, {
          title: "Version",
          width: 100,
          field: "version",
        },
        {
          title: "Status",
          field: "status",
          minWidth: 150,
          // cssClass: "app-status-cell",
          formatter: (cell: any) => {
            return formatStatusPill(cell.getValue());
          }
        },
        {
          title: "Released on",
          field: "released_date",
          width: 150,
          minWidth: 120,
          responsive: 1
        },
        {
          title: "Type",
          field: "release_type",
          width: 150,
          responsive: 2,
          cssClass: "psr-type-cell",

          formatter: (cell: any) => {
            const value = `${cell.getValue() ?? ''}`.trim();
            const safeValue = this.escapeHtml(value || '-');
            const icon = value.toLowerCase().includes('internal')
              ? 'ri-building-4-line'
              : value.toLowerCase().includes('external')
                ? 'ri-external-link-line'
                : 'ri-price-tag-3-line';

            return `
              <span class="psr-type-pill ${this.getReleaseTypeClass(value)}" title="${safeValue}">
                <span>${safeValue}</span>
              </span>
            `;
          }
        },
      ]
    });
    attachTabulatorPaginationPersistence(this.table, buildTabulatorPaginationKey('project-status-report-table'));

  }

  private getReleaseTypeClass(value: string): string {
    const type = `${value ?? ''}`.trim().toLowerCase();

    if (type.includes('internal')) {
      return 'psr-type--internal';
    }

    if (type.includes('external')) {
      return 'psr-type--external';
    }

    return 'psr-type--muted';
  }

  private escapeHtml(value: any): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
