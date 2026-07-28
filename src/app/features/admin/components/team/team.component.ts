import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, inject, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { filter, Subject, takeUntil } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import Swal from 'sweetalert2';

declare const Tabulator: any;
declare const luxon: any;

interface TeamSkillDetail {
  name: string;
  category: string;
  experience: string;
  level: number;
  icon: string;
}

@Component({
  selector: 'app-team',
  templateUrl: './team.component.html',
  styleUrls: ['./team.component.scss']
})
export class TeamComponent implements AfterViewInit, OnDestroy, OnInit {
  @ViewChild('tableDiv') tableDiv!: ElementRef;
  selectedCount = 0;
  showBar = false;
  showMoveMenu = false;
  private table: any;
  private tableData: any[] = [];
  private tableCheckInterval: any;
  private destroyed = false;
  private tableOps: Promise<void> = Promise.resolve();
  private destroy$ = new Subject<void>();
  empid: any = 0;
  canSelectEmployee = false;

  constructor(private authService: AuthService, private storageService: StorageService, private router: Router,private toasterService: ToasterService, private drawerService: DrawerService) { 
    this.empid = this.storageService.getEmpId();
    const roles = this.storageService.roles;
    this.canSelectEmployee = !!(roles?.isAdmin || roles?.isManager);
  }
  ngOnInit(): void {
    // this.getTeamInfo();
    this.drawerService.drawerAction$
      .pipe(filter(a => a.source === 'member'))
      .subscribe(() => { this.getTeamInfo() });
  }
  getTeamInfo() {
    this.authService.getUsersAll(this.empid).subscribe((res: any) => {
      this.tableData = res;
      if (this.table) {
        this.safeReplaceData(this.table, this.tableData);

      }})
  }

  ngAfterViewInit() {
    this.tableCheckInterval = setInterval(() => {
      if (this.destroyed) return;
      if (!this.tableDiv?.nativeElement?.isConnected) return;
      if (typeof Tabulator !== 'undefined' && typeof luxon !== 'undefined' && this.tableDiv) {
        clearInterval(this.tableCheckInterval);
        this.tableCheckInterval = null;
        this.initializeTable();
        this.getTeamInfo();
      }
    }, 50);

     this.drawerService.drawerAction$
          .pipe(
            filter(a => a.source === 'teammate'),
            takeUntil(this.destroy$)
          )
          .subscribe(() => {
            this.getTeamInfo();
          });
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


  initializeTable() {
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.tableData,
      layout: "fitData",
      pagination: "local",
      paginationSize: 15,
      paginationCounter: "rows",
      movableColumns: true,
      selectable: true,
      editTriggerEvent: "dblclick",
      paginationSizeSelector: [10, 15, 25, 30, 50, 100],
      placeholder: "No Data Found",
      maxHeight: "800px",
      headerSortElement: function (col: any, dir: any) {
        if (dir === "asc") return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === "desc") return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },

      initialSort: [
        { column: "joining_date", dir: "asc" },
      ],

      columns: [
        // Selection Checkbox
        // { formatter: "rowSelection", titleFormatter: "rowSelection", width: 50, hozAlign: "center", headerSort: false, responsive: 0 },
        // Primary Info (Avatar + Name + Email)
        {
          title: "Member",
          field: "name",
          minWidth: 280,
          formatter: this.nameFormatter,
          responsive: 0,
          frozen: true,
          cellClick: (e: any, cell: any) => {
            if (e.target.closest('.member-skills-view-btn')) {
              e.stopPropagation();
              this.openMemberSkillsDialog(cell.getRow().getData());
            }
          }
        },
  
        // Mobile (New)
        { title: "Mobile", field: "mobile", width: 140, responsive: 3, formatter: (cell: any) => `<span class="text-gray-600 text-sm font-mono">${cell.getValue() || '-'}</span>` },
        // Mobile (New)
        { title: "Email", field: "email", responsive: 3, formatter: (cell: any) => `<span class="text-gray-600 text-sm ">${cell.getValue() || '-'}</span>` },

        // Department (New)
        { title: "Department", field: "department_name", width: 160, responsive: 2, formatter: (cell: any) => `<span class="text-gray-700 text-sm">${cell.getValue() || '-'}</span>` },

        // Role Text
        { title: "Role", field: "position", formatter: (cell: any) => `<span class="text-gray-600">${cell.getValue() || '-'}</span>`, responsive: 5 },

        {
          title: "Status",
          field: "isactive",
          editor: 'list',
          editorParams: {
            values: [{ label: "Active", value: true }, { label: "Inactive", value: false }], // Boolean dropdown
            autocomplete: true,
            clearable: false,
          },
          formatter: this.statusFormatter,

        },
        // Shift (New)
        { title: "Shift", field: "shift_type", width: 120, responsive: 4, formatter: (cell: any) => `<span class="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">${cell.getValue() || '-'}</span>` },
        // Mobile (New)
        { title: "Attendance id", field: "attendanceid", width: 130, responsive: 3, formatter: (cell: any) => `<span class="text-gray-600 text-sm font-mono ">${cell.getValue() || '-'}</span>` },
        // Joined Date
        { title: "Date joined", field: "joining_date", width: 150, formatter: (cell: any) => `<span class="text-gray-500">${cell.getValue()}</span>`, responsive: 3 },
        {
          title: "Actions",
          field: "actions", // Ensures CSS targeting matches a "field"
          minWidth: 100,
          hozAlign: "center",
          headerSort: false,
          frozen: true,
          formatter: this.actionFormatter,
          cellClick: (e: any, cell: any) => this.handleActionClick(e, cell),
          cssClass: "sticky-col-right",
        }
      ],
    });
    attachTabulatorPaginationPersistence(this.table, buildTabulatorPaginationKey('team-table'));
    this.table.on("rowSelectionChanged", (data: any[], rows: any[]) => {
      this.selectedCount = rows.length;
      this.showBar = this.selectedCount > 0;
      if (!this.showBar) this.showMoveMenu = false;
    });
  }

  // --- Formatters ---
  statusFormatter(cell: any) {
    const value = cell.getValue(); // This will be true/false
    let classes = "";
    let dotColor = "";
    let label = "";

    if (value === true) {
      classes = "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/20";
      dotColor = "bg-emerald-500";
      label = "Active";
    } else {
      classes = "bg-red-50 text-red-700 border-red-200 ring-red-600/20"; // Changed inactive to red for visibility
      dotColor = "bg-red-500";
      label = "Inactive";
    }

    return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${classes}">
            <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
            ${label}
        </span>
    `;
  }

  actionFormatter(cell: any) {
    return `
      <div class="flex items-center justify-center gap-3 w-full h-full">
      <button class="text-slate-400 hover:text-amber-600 transition-colors btn-relieve" title="Relieve Employee">
      <i class="ri-user-unfollow-line text-lg pointer-events-none"></i>
      </button>
        <button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit" title="Edit">
          <i class="ri-pencil-line text-lg pointer-events-none"></i>
        </button>
        <button class="text-slate-400 hover:text-red-600 transition-colors btn-delete" title="Delete">
          <i class="ri-delete-bin-line text-lg pointer-events-none"></i>
        </button>
      </div>
    `;
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
    if (target.classList.contains('btn-relieve')) {
      this.drawerService.open('relieve', data);

    } else if (target.classList.contains('btn-edit')) {
      this.drawerService.open('member', data)
    } else if (target.classList.contains('btn-delete')) {
      Swal.fire({
        title: "Are you sure?",
        text: "You won't be able to revert this!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes, delete it!"
      }).then((result) => {
        if (result.isConfirmed) {
          this.authService.deleteUser(data.id, this.storageService.getUsername()).subscribe((res: any) => {
            this.toasterService.success(res.message);
            this.getTeamInfo();
          }, err => {
            this.toasterService.error(err?.error?.message);
          })
        }
      });

    }
  }
  nameFormatter(cell: any) {
    const data = cell.getData();
    const escapeHtml = (value: any): string =>
      String(value ?? '-')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const toTitleCase = (str: string): string =>
      str
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    const rawName = `${data.firstname || data.employee_name || data.name || ''} ${data.lastname || ''}`.trim();
    const name = rawName ? toTitleCase(rawName) : 'Team Member';

    const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2);
    // Stacked layout: Name on top, email below
    // <span class="text-gray-500 text-xs leading-tight">${data.email} | ${data.mobile}</span>
    return `
      <div class="team-member-cell flex items-center justify-between gap-3 w-full group">
        <div class="flex items-center gap-2 min-w-0">
          <div class="h-8 w-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold border border-gray-200">
              ${escapeHtml(initials)}
          </div>
          <div class="flex flex-col min-w-0">
            <span class="font-medium text-gray-900 text-m leading-tight truncate">${escapeHtml(name)}</span>
          </div>
        </div>
        <button type="button" class="member-skills-view-btn" title="View skill details">
          <span>View</span>
          <i class="ri-eye-line"></i>
        </button>
      </div>
    `;
  }

  onSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value.toLowerCase();

    if (value) {
      // Filter across ALL relevant fields from your data structure
      this.table.setFilter([
        [
          { field: "firstname", type: "like", value: value },
          { field: "lastname", type: "like", value: value },
          { field: "email", type: "like", value: value },
          { field: "department_name", type: "like", value: value },
          { field: "role", type: "like", value: value },
          { field: "position", type: "like", value: value },
          { field: "mobile", type: "like", value: value },
          { field: "gender", type: "like", value: value },
          { field: "blood_group", type: "like", value: value },
          { field: "marital_status", type: "like", value: value },
          { field: "shift_type", type: "like", value: value },
          { field: 'attendanceid', type: "like", value: value }
        ]
      ]);
    } else {
      this.table.clearFilter();
    }
  }

  // --- Actions ---

  cancelSelection() {
    this.table.deselectRow();
  }

  onDelete() {
    const rows = this.table.getSelectedRows();
    if (confirm(`Delete ${rows.length} users?`)) {
      rows.forEach((r: any) => r.delete());
    }
  }

  toggleMoveMenu(event: MouseEvent) {
    event.stopPropagation(); // Prevent window click from closing immediately
    this.showMoveMenu = !this.showMoveMenu;
  }

  moveTo(department: string) {
    const rows = this.table.getSelectedRows();
    rows.forEach((r: any) => r.update({ department: department }));

    this.showMoveMenu = false;
  }
  addMenber() {
    this.drawerService.open('member');
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
  private escapeHtml(value: any): string {
    return String(value ?? '-')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private openMemberSkillsDialog(rowData: any): void {
    const skills = this.buildTeamSkillDetails(rowData);
    const memberName = this.getMemberDisplayName(rowData);
    const subtitle = [
      rowData?.position,
      rowData?.department_name,
      rowData?.email
    ].filter(Boolean).join(' | ');
    const skillCardsHtml = skills.length
      ? skills.map((skill, index) => `
        <article style="
          position:relative;
          overflow:hidden;
          border:2px solid #e2e8f0;
          border-radius:22px;
          padding:18px;
          background:linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          box-shadow:0 16px 34px rgba(15,23,42,0.08);
        ">
          <div style="
            position:absolute;
            inset:auto -30px -44px auto;
            width:110px;
            height:110px;
            border-radius:999px;
          "></div>
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:14px; position:relative;">
            <div style="display:flex; gap:12px; min-width:0;">
              <div style="
                width:44px;
                height:44px;
                border-radius:16px;
                display:flex;
                align-items:center;
                justify-content:center;
                color:#ffffff;
                background:${index % 2 === 0 ? 'linear-gradient(135deg,#2563eb,#0f766e)' : 'linear-gradient(135deg,#f97316,#be123c)'};
                box-shadow:0 12px 26px rgba(37,99,235,0.22);
                flex:0 0 auto;
              ">
                <i class="${this.escapeHtml(skill.icon)}" style="font-size:22px;"></i>
              </div>
              <div style="min-width:0;">
               <h3 style="margin:0; font-size:15px; line-height:1.25; color:#0f172a; font-weight:600; word-break:break-word;"> 
                  ${this.escapeHtml(skill.name)}
                </h3>
                 <p style="margin:6px 0 0; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.08em;">
                  ${this.escapeHtml(skill.category)}
                </p>
              </div>
            </div>
            <span style="
              display:inline-flex;
              align-items:center;
              white-space:nowrap;
              border-radius:999px;
              padding:7px 10px;
              background:#ecfeff;
              color:#0e7490;
              font-size:12px;
              font-weight:800;
            ">
              ${this.escapeHtml(skill.experience)}
            </span>
          </div>
          
        </article>
      `).join('')
      : `
        <div style="
          border:1px dashed #cbd5e1;
          border-radius:24px;
          padding:34px 24px;
          background:#f8fafc;
          text-align:center;
          color:#64748b;
        ">
          <div style="
            width:58px;
            height:58px;
            margin:0 auto 14px;
            border-radius:20px;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#e0f2fe;
            color:#0369a1;
          ">
            <i class="ri-lightbulb-flash-line" style="font-size:28px;"></i>
          </div>
          <h3 style="margin:0; color:#0f172a; font-size:18px; font-weight:800;">No skills added yet</h3>
          <p style="margin:8px 0 0; font-size:14px;">Skill details are shown here when they are available for this member.</p>
        </div>
      `;

    Swal.fire({
      showCloseButton: false,
      showConfirmButton: false,
      width: 880,
      padding: 0,
      backdrop : 'rgba(0,0,0,0.4)',
      html: `
        <div style="
          text-align:left;
          background:#ffffff;
          border-radius:28px;
          overflow:hidden;
          box-shadow:0 30px 90px rgba(15,23,42,0.24);
          border:1px solid #dbe3f0;
        ">
          <div style="
            padding:30px 34px;
            background:var(--text-active);
              color:#ffffff;
            position:relative;
          ">
            <button type="button" class="member-skills-dialog-close" style="
              position:absolute;
              top:18px;
              right:18px;
              width:40px;
              height:40px;
              border:none;
              border-radius:999px;
              background:rgba(255,255,255,0.16);
              color:#ffffff;
              display:flex;
              align-items:center;
              justify-content:center;
              cursor:pointer;
            ">
              <i class="ri-close-line" style="font-size:20px;"></i>
            </button>
            <div style="display:flex; align-items:center; gap:16px; padding-right:54px;">
              <div style="
                width:60px;
                height:60px;
                border-radius:22px;
                background:rgba(255,255,255,0.18);
                border:1px solid rgba(255,255,255,0.28);
                display:flex;
                align-items:center;
                justify-content:center;
                color:#ffffff;
                font-size:22px;
                font-weight:900;
                flex:0 0 auto;
              ">
                ${this.escapeHtml(this.getInitials(memberName))}
              </div>
              <div style="min-width:0;">
                <h2 style="margin:6px 0 0; font-size:30px; line-height:1.15; font-weight:900; word-break:break-word;">${this.escapeHtml(memberName)}</h2>
                <p style="margin:9px 0 0; font-size:14px; opacity:0.88; word-break:break-word;">${this.escapeHtml(subtitle || 'Team member profile')}</p>
              </div>
            </div>
          </div>

          <div style="padding:26px 34px 34px; max-height:68vh; overflow:auto; background:#f8fafc;">
            <div style="
              display:grid;
              grid-template-columns:repeat(2,1fr);
              gap:16px;
            ">
              ${skillCardsHtml}
            </div>
          </div>
        </div>
      `,
      didOpen: (popup) => {
        const swalPopup = popup.parentElement as HTMLElement | null;
        // if (swalPopup) {
        //   swalPopup.style.background = 'transparent';
        //   swalPopup.style.boxShadow = 'none';
        // }
        popup.style.setProperty('--swal2-background', 'transparent', 'important'); //same as before
        const closeButton = popup.querySelector('.member-skills-dialog-close') as HTMLButtonElement | null;
        if (closeButton) {
          closeButton.addEventListener('click', () => Swal.close());
        }
      }
    });
  }

  private buildTeamSkillDetails(rowData: any): TeamSkillDetail[] {
    const rawSkills = rowData?.skill_set || rowData?.skillset || rowData?.skills || rowData?.skill_details || rowData?.technologies || rowData?.tech_stack;
    const skillItems = this.normalizeSkillItems(rawSkills);
    const defaultLevels = [92, 86, 78, 88, 74, 82];
    const defaultIcons = [
      'ri-code-s-slash-line',
      'ri-layout-4-line',
      'ri-database-2-line',
      'ri-links-line',
      'ri-palette-line',
      'ri-settings-3-line'
    ];

    return skillItems.map((skill: any, index: number) => {
      if (typeof skill === 'object' && skill !== null) {
        const name = skill.name || skill.skill || skill.title || `Skill ${index + 1}`;

        return {
          name,
          category: skill.category || skill.type || this.inferSkillCategory(name),
          experience: skill.experience || skill.years || skill.duration || 'Experience not added',
          level: Number(skill.level || skill.percentage || skill.score || defaultLevels[index % defaultLevels.length]),
          icon: skill.icon || defaultIcons[index % defaultIcons.length]
        };
      }

      const name = String(skill).trim();

      return {
        name,
        category: this.inferSkillCategory(name),
        experience: 'Experience not added',
        level: defaultLevels[index % defaultLevels.length],
        icon: defaultIcons[index % defaultIcons.length]
      };
    }).filter((skill) => !!skill.name);
  }

  private normalizeSkillItems(rawSkills: any): any[] {
    if (Array.isArray(rawSkills)) {
      return rawSkills;
    }

    if (rawSkills && typeof rawSkills === 'object') {
      return [rawSkills];
    }

    if (typeof rawSkills === 'string' && rawSkills.trim()) {
      const trimmed = rawSkills.trim();

      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // Fall back to delimiter parsing below.
        }
      }

      return trimmed
        .split(/[,/|]/)
        .map((skill: string) => skill.trim())
        .filter(Boolean);
    }

    return [];
  }

  private inferSkillCategory(skillName: string): string {
    const value = `${skillName || ''}`.toLowerCase();

    if (value.includes('angular') || value.includes('react') || value.includes('vue') || value.includes('html') || value.includes('css')) {
      return 'Frontend';
    }

    if (value.includes('java') || value.includes('python') || value.includes('node') || value.includes('spring') || value.includes('api')) {
      return 'Backend';
    }

    if (value.includes('sql') || value.includes('mysql') || value.includes('database') || value.includes('mongo')) {
      return 'Database';
    }

    if (value.includes('figma') || value.includes('ui') || value.includes('ux') || value.includes('design')) {
      return 'Design';
    }

    return 'Technical Skill';
  }

  private getMemberDisplayName(rowData: any): string {
    const fullName = `${rowData?.firstname || rowData?.employee_name || rowData?.name || ''} ${rowData?.lastname || ''}`.trim();
    return fullName || rowData?.email || 'Team Member';
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'TM';
  }

    private openIssueDetailsDialog(rowData: any): void {
      const summaryCards = [
        { label: 'Owner', value: rowData?.assigned_from_name || '-' },
        { label: 'Assignee', value: rowData?.assigned_to_name || '-' },
        { label: 'Start Date', value: rowData?.start_date || '-' },
        { label: 'End Date', value: rowData?.end_date || '-' },
        { label: 'Estimated Hours', value: rowData?.estimated_hours || '-' },
        { label: 'Worked Hours', value: rowData?.worked_hours || '-' }
      ];
  
      const summaryHtml = summaryCards.map((item: any) => `
        <div style="
          background:#ffffff;
          border:1px solid #e2e8f0;
          border-radius:16px;
          padding:14px 16px;
          box-shadow:0 10px 30px rgba(15,23,42,0.06);
        ">
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; margin-bottom:6px;">
            ${this.escapeHtml(item.label)}
          </div>
          <div style="font-size:14px; font-weight:600; color:#0f172a; word-break:break-word;">
            ${this.escapeHtml(item.value)}
          </div>
        </div>
      `).join('');
  
      const metadataRows = [
        { label: 'Type', value: rowData?.task_type || '-' },
        { label: 'Version', value: rowData?.version || '-' },
        { label: 'Phase', value: rowData?.phase_title || '-' },
        {
          label: 'Completion',
          value: rowData?.completion_percentage !== undefined && rowData?.completion_percentage !== null
            ? `${rowData.completion_percentage}%`
            : '-'
        }
      ];
  
      const metadataHtml = metadataRows.map((item: any) => `
        <div style="display:flex; justify-content:space-between; gap:16px; padding:12px 0; border-bottom:1px solid #e2e8f0;">
          <div style="font-size:13px; font-weight:600; color:#475569;">${this.escapeHtml(item.label)}</div>
          <div style="font-size:13px; font-weight:600; color:#0f172a; text-align:right; word-break:break-word;">${this.escapeHtml(item.value)}</div>
        </div>
      `).join('');
  
      Swal.fire({
        showCloseButton: false,
        showConfirmButton: false,
        width: 860,
        padding: 0,
        html: `
          <div style="
            text-align:left;
            background:#ffffff;
            border-radius:24px;
            overflow:hidden;
            box-shadow:0 24px 80px rgba(15,23,42,0.22);
            border:1px solid #dbe3f0;
          ">
            <div style="
              padding:30px 34px;
              background:var(--text-active);
              border-radius:24px 24px 0 1px;
              color:#ffffff;
              position:relative;
            ">
              <button type="button" class="issue-dialog-close" style="
                position:absolute;
                top:18px;
                right:18px;
                width:40px;
                height:40px;
                border:none;
                border-radius:999px;
                background:rgba(255,255,255,0.16);
                color:#ffffff;
                display:flex;
                align-items:center;
                justify-content:center;
                cursor:pointer;
                transition:background 0.2s ease;
              ">
                <i class="ri-close-line" style="font-size:20px;"></i>
              </button>
              <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-right:56px;">
                <div style="min-width:0;">
                   <div style="font-size:28px; font-weight:800; line-height:1.25; word-break:break-word;">
                    ${this.escapeHtml(rowData?.task || 'Issue Details')}
                  </div>
                  <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:16px;">
                    ${this.buildBadge(rowData?.status || '-', '#dcfce7', '#166534')}
                    ${this.buildBadge(rowData?.priority || '-', '#fee2e2', '#b91c1c')}
                    ${this.buildBadge(rowData?.task_type || '-', '#dbeafe', '#1d4ed8')}
                  </div>
                </div>
              </div>
            </div>
  
            <div style="padding:24px 32px 32px; max-height:68vh; overflow:auto;">
              <div style="
                display:grid;
                grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
                gap:14px;
                margin-bottom:24px;
              ">
                ${summaryHtml}
              </div>
  
              <div style="display:grid; grid-template-columns:1.1fr 0.9fr; gap:20px;">
                <div style="
                  background:#ffffff;
                  border:1px solid #e2e8f0;
                  border-radius:20px;
                  padding:20px 22px;
                  box-shadow:0 10px 30px rgba(15,23,42,0.06);
                ">
                  <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; margin-bottom:12px;">
                    Description
                  </div>
                  <div style="font-size:14px; line-height:1.7; color:#1e293b; white-space:pre-wrap; word-break:break-word;">
                    ${this.escapeHtml(rowData?.description || 'No description available')}
                  </div>
                </div>
  
                <div style="
                  background:#ffffff;
                  border:1px solid #e2e8f0;
                  border-radius:20px;
                  padding:20px 22px;
                  box-shadow:0 10px 30px rgba(15,23,42,0.06);
                ">
                  <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; margin-bottom:4px;">
                    More Details
                  </div>
                  ${metadataHtml}
                </div>
              </div>
            </div>
          </div>
        `,
        didOpen: (popup) => {
          const swalPopup = popup.parentElement as HTMLElement | null;
          if (swalPopup) {
            swalPopup.style.background = 'transparent';
            swalPopup.style.boxShadow = 'none';
          }
  
          const closeButton = popup.querySelector('.issue-dialog-close') as HTMLButtonElement | null;
          if (closeButton) {
            closeButton.addEventListener('click', () => Swal.close());
          }
        }
      });
    }
 private buildBadge(label: string, background: string, color: string): string {
    return `
      <span style="
        display:inline-flex;
        align-items:center;
        padding:6px 12px;
        border-radius:999px;
        background:${background};
        color:${color};
        font-size:12px;
        font-weight:700;
        letter-spacing:0.02em;
      ">
        ${this.escapeHtml(label)}
      </span>
    `;
  }

}
