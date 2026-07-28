import { AfterViewInit, Component, ElementRef, Inject, Input, Optional, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
declare const Tabulator: any;
declare const luxon: any;
@Component({
  selector: 'app-overdue',
  templateUrl: './overdue.component.html',
  styleUrls: ['./overdue.component.scss']
})
export class OverdueComponent implements AfterViewInit {
  @ViewChild('tableOverDue') tableOverDue!: ElementRef;
  @Input() dues: any[] = [];
  private table: any;
  @Input() icon: any = 'ri-stack-line';
  constructor(private router: Router, @Optional() @Inject(MAT_DIALOG_DATA) public data: any,public matDialog: MatDialog) {
    if (data?.data) {
      this.dues = data?.data
    }
  }
  ngAfterViewInit() {
    const checkInterval = setInterval(() => {
      if (typeof Tabulator !== 'undefined' && typeof luxon !== 'undefined' && this.tableOverDue) {
        clearInterval(checkInterval);
        this.initializeTable();
      }
    }, 100);
  }
  initializeTable() {
    this.table = new Tabulator(this.tableOverDue.nativeElement, {
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
        { column: "task", dir: "asc" },
      ],

      columns: [
        {
          title: "Task",
          field: "task",
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
                            <span class="task-name-link font-medium text-gray-900 text-m leading-relaxed break-words cursor-pointer hover:text-[var(--text-active)]">${data.task}</span>
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
            if (e.target.closest('.access-btn') || e.target.closest('.task-name-link')) {
              e.stopPropagation();
              const rowData = cell.getRow().getData();
              this.matDialog.closeAll();
              const projectId = rowData?.projectid ?? rowData?.project_id ?? rowData?.projectId;
              const taskId = rowData?.id ?? rowData?.taskid ?? rowData?.task_id;
              if (!projectId || !taskId) {
                console.warn('Invalid task navigation from overdue row:', rowData);
                return;
              }
              this.router.navigate(['/main/projects/project-content', projectId, taskId], {
                queryParams: this.buildTaskDetailsQueryParams(rowData)
              });
            }
          }
        },
        {
          title: "Type",
          field: "task_type",
          width: 125,
          responsive: 2,

          formatter: (cell: any) => {
            const val = cell.getValue();
            let colorClass = "bg-gray-100 text-gray-700";
            let icon = "ri-question-line";

            if (val === 'bug') {
              colorClass = "bg-red-100 text-red-700";
              icon = "ri-bug-line";
            } else {
              colorClass = "bg-blue-100 text-blue-700";
              icon = "ri-lightbulb-line";
            }

            return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${colorClass}"><i class="${icon} mr-1"></i>${val}</span>`;
          }
        },
        {
          title: "Project",
          field: "project_name",
          minWidth: 150,
          responsive: 3,

        },
        {
          title: "Assignee",
          field: "employee_name",
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
        },
        {
          title: "Deadline",
          field: "end_date",
          width: 150,
          minWidth: 120,
          responsive: 1,

          formatter: (cell: any) => {
            const val = cell.getValue();

            if (!val) return "";

            const endDate = new Date(val);
            const today = new Date();
            // Reset time to start of day for accurate comparison
            today.setHours(0, 0, 0, 0);
            endDate.setHours(0, 0, 0, 0);

            const diffTime = endDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let text = "";
            let colorClass = "";

            if (diffDays < 0) {
              text = `Ended ${Math.abs(diffDays)} days ago`;
              colorClass = "text-red-400";
            } else if (diffDays === 0) {
              text = "Ends today";
              colorClass = "text-amber-600 font-bold";
            } else if (diffDays === 1) {
              text = "1 day left";
              colorClass = "text-amber-600 font-bold";
            } else {
              text = `${diffDays} days left`;
              colorClass = diffDays < 5 ? "text-amber-600" : "text-emerald-600";
            }

            return `
                    <div class="flex flex-col justify-center h-full">
                        <span class="text-s font-medium ${colorClass} leading-tight">${text}</span>
                        <span class="text-m font-medium  text-gray-700 leading-tight font-mono">${val}</span>
                    </div>
                `;
          }
        },
        {
          title: "Status",
          field: "status",
          // editor: "list",
          minWidth: 150,
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
          title: "Description",
          field: "description",
          widthGrow: 2,
          minWidth: 200, // Added minWidth
          responsive: 4, // Hide first

          formatter: (cell: any) => {
            return `<span class="text-m text-gray-700 truncate block w-full" title="${cell.getValue()}">${cell.getValue()}</span>`;
          }
        }
      ]
    });
    attachTabulatorPaginationPersistence(this.table, buildTabulatorPaginationKey('overdue-table'));

  }

  private buildTaskDetailsQueryParams(rowData: any): Record<string, string | null> {
    const taskType = this.resolveTaskType(rowData);
    return {
      tasktype: taskType,
      fromdate: rowData?.start_date || null,
      todate: rowData?.end_date || null
    };
  }

  private resolveTaskType(rowData: any): string {
    const rawType = `${rowData?.task_type ?? rowData?.type ?? rowData?.tasktype ?? ''}`.trim().toLowerCase();

    if (rawType.includes('bug') || rawType.includes('issue')) {
      return 'bug';
    }

    if (rawType.includes('requirement') || rawType.includes('req') || rawType.includes('task')) {
      return 'requirement';
    }

    return 'requirement';
  }
}
