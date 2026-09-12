import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';

declare const Tabulator: any;
declare const luxon: any;

@Component({
  selector: 'app-teammates',
  templateUrl: './teammates.component.html',
  styleUrls: ['./teammates.component.scss']
})
export class TeammatesComponent implements AfterViewInit, OnDestroy {
  @ViewChild('tableDiv') tableDiv!: ElementRef;
  selectedCount = 0;
  showBar = false;
  showMoveMenu = false;
  private table: any;
  private tableData: any[] = [];
  projectid: any = 0;
  private destroy$ = new Subject<void>();

  constructor(private authService: AuthService, private activatedRoute: ActivatedRoute,private storageService: StorageService, private drawerService: DrawerService) {
   
    this.activatedRoute.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const pid = Number(params.get('projectid'));
      if (!pid) return;
      this.projectid = pid;
      this.getTeamInfo();
    
    });
    
    
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getTeamInfo() {
    if (!this.projectid) return;

    this.authService.getprojectmembersById(this.projectid).subscribe((res: any) => {
      const normalized = Array.isArray(res) ? res : [];
      this.tableData = normalized.map((user: any) => ({
        ...user,
        name: `${user?.firstname ?? ''} ${user?.lastname ?? ''}`.trim()
      }));

      if (this.table) {
        this.safeReplaceData(this.table, this.tableData);
      }
    });
  }

  ngAfterViewInit() {
    const checkInterval = setInterval(() => {
      if (typeof Tabulator !== 'undefined' && typeof luxon !== 'undefined' && this.tableDiv) {
        clearInterval(checkInterval);
        this.initializeTable();
      }
    }, 50);

    this.drawerService.drawerAction$
      .pipe(
        filter(a => a.source === 'member'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.getTeamInfo();
      });
  }

  initializeTable() {
    const freezeColumns = !this.isCompactViewport();
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.tableData,
      layout: 'fitDataStretch',
      responsiveLayout: false,
      pagination: 'local',
      paginationSize: 10,
      paginationCounter: 'rows',
      movableColumns: true,
      selectable: true,
      editTriggerEvent: 'dblclick',
      paginationSizeSelector: [10, 25, 50, 100],
      placeholder: 'No Data Found',
      headerSortElement: function (col: any, dir: any) {
        if (dir === 'asc') return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === 'desc') return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },
      initialSort: [{ column: 'joining_date', dir: 'asc' }],
      columns: [
        { title: 'Member', field: 'name', minWidth: 250, formatter: this.nameFormatter, responsive: 0, frozen: freezeColumns },
        { title: 'Mobile', field: 'mobile', width: 140, responsive: 3, formatter: (cell: any) => `<span class="text-gray-600 text-sm font-mono">${cell.getValue() || '-'}</span>` },
        { title: 'Email', field: 'email', responsive: 3, formatter: (cell: any) => `<span class="text-gray-600 text-sm ">${cell.getValue() || '-'}</span>` },
        { title: 'Department', field: 'department_name', width: 160, responsive: 2, formatter: (cell: any) => `<span class="text-gray-700 text-sm">${cell.getValue() || '-'}</span>` },
        { title: 'Role', field: 'position', formatter: (cell: any) => `<span class="text-gray-600">${cell.getValue() || '-'}</span>`, responsive: 5 },
        {
          title: 'Status',
          field: 'isactive',
          editable: false,
          formatter: this.statusFormatter
        },
        { title: 'Shift', field: 'shift_type', width: 120, responsive: 4, formatter: (cell: any) => `<span class="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">${cell.getValue() || '-'}</span>` },
        { title: 'Attendance id', field: 'attendanceid', width: 140, responsive: 3, formatter: (cell: any) => `<span class="text-gray-600 text-sm font-mono ">${cell.getValue() || '-'}</span>` },
        { title: 'Date joined', field: 'joining_date', width: 150, formatter: (cell: any) => `<span class="text-gray-500">${cell.getValue()}</span>`, responsive: 3 }
      ]
    });

    attachTabulatorPaginationPersistence(this.table, buildTabulatorPaginationKey('project-teammates-table'));

    this.table.on('rowSelectionChanged', (data: any[], rows: any[]) => {
      this.selectedCount = rows.length;
      this.showBar = this.selectedCount > 0;
      if (!this.showBar) this.showMoveMenu = false;
    });
  }

  statusFormatter(cell: any) {
    const value = cell.getValue();
    let classes = '';
    let dotColor = '';
    let label = '';

    if (value === true) {
      classes = 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/20';
      dotColor = 'bg-emerald-500';
      label = 'Active';
    } else {
      classes = 'bg-red-50 text-red-700 border-red-200 ring-red-600/20';
      dotColor = 'bg-red-500';
      label = 'Inactive';
    }

    return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${classes}">
            <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
            ${label}
        </span>
    `;
  }

  nameFormatter(cell: any) {
    const data = cell.getData();
    const toTitleCase = (str: string): string =>
      str
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    const name = toTitleCase(`${data.firstname} ${data.lastname}`.trim());
    const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2);

    return `
      <div class="flex items-center gap-2">
          <div class="h-8 w-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold border border-gray-200">
              ${initials}
          </div>
          <div class="flex flex-col">
            <span class="font-medium text-gray-900 text-m leading-tight">${name}</span>
          </div>
      </div>
    `;
  }

  onSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value.toLowerCase();

    if (value) {
      this.table.setFilter([
        [
          { field: 'firstname', type: 'like', value: value },
          { field: 'lastname', type: 'like', value: value },
          { field: 'email', type: 'like', value: value },
          { field: 'department_name', type: 'like', value: value },
          { field: 'role', type: 'like', value: value },
          { field: 'position', type: 'like', value: value },
          { field: 'mobile', type: 'like', value: value },
          { field: 'gender', type: 'like', value: value },
          { field: 'blood_group', type: 'like', value: value },
          { field: 'marital_status', type: 'like', value: value },
          { field: 'shift_type', type: 'like', value: value },
          { field: 'attendanceid', type: 'like', value: value }
        ]
      ]);
    } else {
      this.table.clearFilter();
    }
  }

  cancelSelection() {
    this.table.deselectRow();
  }

  onDelete() {
    const rows = this.table.getSelectedRows();
    if (!rows?.length) return;
    if (confirm(`Delete ${rows.length} members?`)) {
      rows.forEach((r: any) => r.delete());
    }
  }
  toggleMoveMenu(event: MouseEvent) {
    event.stopPropagation();
    this.showMoveMenu = !this.showMoveMenu;
  }

  moveTo(department: string) {
    const rows = this.table.getSelectedRows();
    rows.forEach((r: any) => r.update({ department: department }));

    this.showMoveMenu = false;
  }

  addMenber() {
    this.drawerService.open('teammate');
  }

  private safeReplaceData(table: any, data: any): void {
    const normalized = Array.isArray(data) ? data : [];
    try {
      table?.replaceData?.(normalized);
    } catch {
      try {
        table?.setData?.(normalized);
      } catch {
        // ignore
      }
    }

    try {
      table?.redraw?.(true);
    } catch {
      // ignore
    }
  }

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }
}
