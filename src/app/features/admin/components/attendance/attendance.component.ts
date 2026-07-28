import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map, Observable, startWith } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { PdfService } from 'src/app/_core/services/pdf.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { AttendanceDocComponent } from '../team/attendance-doc/attendance-doc.component';
import { MatDialog } from '@angular/material/dialog';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
declare const Tabulator: any;
declare const luxon: any;
@Component({
  selector: 'app-attendance',
  templateUrl: './attendance.component.html',
  styleUrls: ['./attendance.component.scss']
})
export class AttendanceComponent implements OnDestroy {
  activeTabId: string = 'timelogs';
  startDate: any = null;
  endDate: any = null;
  selected_emp_id: any = 0;
  empid: any = 0;
  private table: any;
  projectid: any = 0
  tableData: any[] = [];
  @ViewChild('tableDiv') tableDiv!: ElementRef;

  private tableCheckInterval: any;
  private destroyed = false;
  private tableOps: Promise<void> = Promise.resolve();

  constructor(private authService: AuthService, private route: ActivatedRoute, private router: Router,private dialog: MatDialog, private toasterService: ToasterService, private storageService: StorageService, private drawerService: DrawerService,private pdfService: PdfService) {
    this.empid = this.storageService.getEmpId();
    console.log(this.empid);
    this.selected_emp_id = this.empid;
    this.loadData({ target: { value: this.projectid } })

  }
  setActiveTab(id: string): void {
    this.activeTabId = id;
  }
  myControl = new FormControl<string>('');
  employeeControl = new FormControl('');
  employees: any[] = [];
  filteredOptions!: Observable<any[]>;
  employeeList: any[] = [];
  currentView: string = 'table';

  views = [
    { id: 'table', label: 'Table', icon: 'ri-table-line' },
    { id: 'kanban', label: 'Kanban', icon: 'ri-trello-line' },
  ];

  ngOnInit(): void {
    // this.setupEmployeeFilter();
  }

  ngAfterViewInit() {
    this.tableCheckInterval = setInterval(() => {
      if (this.destroyed) return;
      if (!this.tableDiv?.nativeElement?.isConnected) return;
      if (typeof Tabulator !== 'undefined' && typeof luxon !== 'undefined' && this.tableDiv) {
        clearInterval(this.tableCheckInterval);
        this.tableCheckInterval = null;
        this.initializeAttendanceTable(this.tableDiv.nativeElement);
      }
    }, 50);
  }

  ngOnDestroy(): void {
    this.destroyed = true;

    if (this.tableCheckInterval) {
      clearInterval(this.tableCheckInterval);
      this.tableCheckInterval = null;
    }

    const tableToDestroy = this.table;
    this.table = null;

    this.tableOps = this.tableOps.finally(() => {
      try {
        tableToDestroy?.destroy?.();
      } catch {
        // ignore
      }
    });
  }

  loadData(e: any) {
    this.getEmployees();
    // this.getAttendanceByEmp();
  }

  getEmployees() {
    this.authService.getEmployeeList().subscribe({
      next: (res: any) => {
        this.employeeList = res
        this.filteredOptions = this.myControl.valueChanges.pipe(
          startWith(''),
          map((value: any) => {
            const name = typeof value === 'string' ? value : value?.employee_name || '';
            return name ? this._filter(name) : [...this.employeeList];
          })
        );
      }
    });
  }
  private _filter(value: string): any[] {
    const filterValue = value.toLowerCase();
    return this.employeeList.filter((emp: any) =>
      emp.employee_name.toLowerCase().includes(filterValue)
    );
  }
  filterEmployees(name: string) {
    return this.employees.filter(emp =>
      emp.employee_name.toLowerCase().includes(name.toLowerCase())
    );
  }

  displayEmployee(emp: any): string {
    return emp ? emp.employee_name : '';
  }

  onEmployeeSelect(event: any, emp: any) {
    if (event.isUserInput) {
      console.log('Selected Employee ID:', emp.id);
      this.selected_emp_id = emp.id;
      this.getAttendanceByEmp();
    }
  }
  getAttendanceByEmp() {
    const currentId = this.selected_emp_id || this.empid;

    const payload = {
      id: currentId,
      fromdate: this.startDate,
      todate: this.endDate
    };
  
    this.authService.getAttendanceByEmp(payload).subscribe((res: any) => {
      this.tableData = res.map((item: any, idx: number) => ({
        sl_no: idx + 1,
        employee_name: item.employeeName,
        attendance_id: item.attendanceId,
        attendance_date: item.attendanceDate,
        day: item.day,
        punch_time: item.alltime || '-',
        worked_hrs: item.workedhoursdash || '-',
        status: item.status || 'Absent',
        remarks: item.statusemp || ''
      }));
  
      if (this.table) {
        this.safeReplaceData(this.table, this.tableData);

      }});
  }


  clearEmployee() {
    this.myControl.reset();
    // this.selected_emp_id = 0;
    this.selected_emp_id = this.empid;
    this.getAttendanceByEmp();
  }

  onRangeChange(event: { startDate: Date; endDate: Date }) {
    console.log(event.startDate, event.endDate);
    this.startDate = this.formatDateToYMD(event.startDate);
    this.endDate = this.formatDateToYMD(event.endDate);
    this.getAttendanceByEmp();
  }
  formatDateToYMD(date: Date | string | null): string {
    if (!date) return 'null';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }
  generateAttendancePdf() {
    this.pdfService.generateAttendancePDF(this.selected_emp_id,this.startDate,this.endDate,this.tableData
    );
  }
    addDoc() {
      const dialogRef = this.dialog.open(AttendanceDocComponent, {
        disableClose: true, // optional
      });
  
      dialogRef.afterClosed().subscribe(result => {
        this.getAttendanceByEmp()
      });
    }
  initializeAttendanceTable(tableDiv: any) {
    this.table = new Tabulator(tableDiv, {
      data: this.tableData,
      layout: "fitColumns",
      height: "600px",
      pagination: "local",
      paginationSize: 10,
      paginationSizeSelector: [10, 25, 50, 100],
      paginationCounter: "rows",
      movableColumns: true,
      placeholder: "No Attendance Records Found",
      initialSort: [
        { column: "attendance_date", dir: "desc" },
      ],

      columns: [

        {
          title: "S.No",
          field: "sl_no",
          width: 80,
          hozAlign: "center"
        },

        {
          title: "Employee Name",
          field: "employee_name",
          minWidth: 180,
          frozen: true
        },

        {
          title: "Attendance ID",
          field: "attendance_id",
          width: 130,
          hozAlign: "center"
        },

        {
          title: "Date",
          field: "attendance_date",
          width: 130,
          hozAlign: "center"
        },

        {
          title: "Day",
          field: "day",
          width: 120,
          hozAlign: "center"
        },

        {
          title: "Punch Logs",
          field: "punch_time",
          minWidth: 350,
          formatter: (cell: any) => {
            const val = cell.getValue();

            if (!val || val === "-") {
              return `<span class="text-slate-300 italic">
                        No activity logs recorded
                      </span>`;
            }

            return `
              <div class="font-mono font-semibold text-[11px] 
                          text-indigo-600 bg-indigo-50 
                          px-2.5 py-1.5 rounded-lg 
                          border border-indigo-100">
                ${val}
              </div>`;
          }
        },
        {
          title: "Worked Hours",
          field: "worked_hrs",
          width: 120,
          hozAlign: "center"
        },
        {
          title: "Status",
          field: "status",
          width: 180,
          hozAlign: "center",
          formatter: (cell: any) => {
            const val = cell.getValue();
            const row = cell.getRow().getData();
            const apiColor = row.latetemp;

            const statusColors: any = {
              "Present": "bg-emerald-100 text-emerald-800 border-emerald-200",
              "Absent": "bg-rose-100 text-rose-800 border-rose-200",
              "Half Day": "bg-amber-100 text-amber-800 border-amber-200",
              "Leave": "bg-red-100 text-red-800 border-red-200"
            };

            if (apiColor) {
              return `
                <span 
                  class="px-3 py-1 rounded-full text-[10px] 
                         font-semibold uppercase border tracking-wider"
                  style="
                    background:${apiColor}20;
                    color:${apiColor};
                    border-color:${apiColor}40;">
                  ${val}
                </span>`;
            }

            const cls = statusColors[val] ||
              "bg-slate-100 text-slate-700 border-slate-200";

            return `
              <span class="px-3 py-1 rounded-full text-[10px] 
                           font-semibold uppercase border 
                           tracking-wider shadow-sm ${cls}">
                ${val}
              </span>`;
          }
        },


        {
          title: "Remarks",
          field: "remarks",
          minWidth: 260,
          formatter: (cell: any) => {
            const val = cell.getValue();
            if (!val) return "";

            const statusMap: any = {
              "Proper Thumb": {
                bg: "bg-emerald-50 border-emerald-200",
                dot: "bg-emerald-500",
                text: "text-emerald-700"
              },
              "Improper Thumb": {
                bg: "bg-amber-50 border-amber-200",
                dot: "bg-amber-500",
                text: "text-amber-700"
              },
              "Late": {
                bg: "bg-orange-50 border-orange-200",
                dot: "bg-orange-500",
                text: "text-orange-700"
              },
              "Work.hrs shortage": {
                bg: "bg-rose-50 border-rose-200",
                dot: "bg-rose-500",
                text: "text-rose-700"
              },
              "Improper Thumb & Late": {
                bg: "bg-violet-50 border-violet-200",
                dot: "bg-violet-500",
                text: "text-violet-700"
              },
              "Improper Thumb & Work.hrs shortage": {
                bg: "bg-sky-50 border-sky-200",
                dot: "bg-sky-500",
                text: "text-sky-700"
              },
              "Late & Work.hrs shortage": {
                bg: "bg-red-50 border-red-200",
                dot: "bg-red-500",
                text: "text-red-700"
              },
              "Improper Thumb & Late & Work.hrs shortage": {
                bg: "bg-gray-100 border-gray-300",
                dot: "bg-gray-700",
                text: "text-gray-800"
              }
            };
            const style = statusMap[val] || {
              bg: "bg-slate-50 border-slate-200",
              dot: "bg-slate-500",
              text: "text-slate-700"
            };

            return `
              <div class="flex items-center gap-2 ${style.bg} px-3 py-1.5 rounded-md border w-fit">
                <span class="w-2 h-2 rounded-full ${style.dot}"></span>
                <span class="text-xs font-medium ${style.text}">${val}</span>
              </div>`;
          }
        }

      ]
    });

    attachTabulatorPaginationPersistence(this.table, buildTabulatorPaginationKey('attendance-table'));

    // Optional edit listener
    this.table.on("cellEdited", (cell: any) => {
      const updatedRow = cell.getRow().getData();
      console.log("Updated Row:", updatedRow);
    });
  }




  private enqueueTableOp(action: () => any): void {
    this.tableOps = this.tableOps.finally(() => {
      if (this.destroyed) return;
      if (!this.tableDiv?.nativeElement?.isConnected) return;
      try {
        const result = action();
        return Promise.resolve(result).catch(() => { });
      } catch {
        return;
      }
    });
  }

  private safeReplaceData(table: any, data: any): void {
    if (this.destroyed) return;
    if (!this.tableDiv?.nativeElement?.isConnected) return;

    const normalized = Array.isArray(data) ? data : [];
    const tableRef = table;

    this.enqueueTableOp(() => {
      try {
        if (typeof tableRef?.replaceData === 'function') {
          return tableRef.replaceData(normalized);
        }
      } catch {
        // ignore
      }

      try {
        if (typeof tableRef?.setData === 'function') {
          return tableRef.setData(normalized);
        }
      } catch {
        // ignore
      }
    });
  }


}
