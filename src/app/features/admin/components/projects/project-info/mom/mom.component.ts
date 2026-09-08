import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { filter, finalize } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { ActivatedRoute } from '@angular/router';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import Swal from 'sweetalert2';
declare const Tabulator: any;
import { StorageService } from 'src/app/_core/services/storage.service';
import { URL } from 'src/app/api.base';
const WEB_BASE_URL = String(URL.WEB_URL()).replace(/\/+$/, '');
const WEB_ORIGIN = new globalThis.URL(WEB_BASE_URL).origin;

interface MomItem {
  id?: number;
  companyid?: number;
  projectid?: number;
  title?: string;
  date?: string;
  starttime?: any;
  endtime?: any;
  attendees?: string;
  agenda?: string;
  discussion?: string;
  decisions?: string;
  file_url?: string;
  filepath?: string;
  file_name?: string;
  file_type?: string;
  created_by?: number;
  employee_name?: string;
  attendees_list?: string;
  created_by_name?: string;
}

@Component({
  selector: 'app-mom',
  templateUrl: './mom.component.html',
  styleUrls: ['./mom.component.scss']
})
export class MomComponent implements OnInit, AfterViewInit {
  @ViewChild('tableDiv') tableDiv!: ElementRef;
  private table: any;
  private tableData: MomItem[] = [];
  employee_id: any = 0;
  projectid = 0;
  tableLoading = false;
  deletingMomId: number | null = null;
  downloadingMomId: number | null = null;

  constructor(
    private storageService: StorageService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private authService: AuthService,
    private drawerService: DrawerService,
    private toasterService: ToasterService
  ) {
    this.employee_id = storageService.getEmpId();
    this.projectid = Number(this.route.snapshot.paramMap.get('projectid')) || 0;
  }

  ngOnInit(): void {
    this.drawerService.drawerAction$
      .pipe(filter((action) => action.source === 'mom'))
      .subscribe(() => {
        this.getMOMListByProjectId();
      });
  }

  ngAfterViewInit(): void {
    this.getMOMListByProjectId();
  }

  getMOMListByProjectId() {
    this.tableLoading = true;
    this.authService.getmomdetails(this.employee_id)
      .pipe(finalize(() => {
        this.tableLoading = false;
      }))
      .subscribe({
      next: (res: any) => {
        this.tableData = this.normalizeMomList(res);
        if (this.table) {
          this.safeReplaceData(this.table, this.tableData);
        } else {
          this.initializeTable();
        }
      },
      error: (err: any) => {
        this.tableData = [];
        if (this.table) {
          this.safeReplaceData(this.table, this.tableData);
        }
        this.toasterService.error(err?.error?.message || 'Unable to load MOM details.');
      }
    });
  }

  addDoc() {
    this.drawerService.open('mom', {
      projectid: this.projectid
    });
  }

  editMom(data: MomItem) {
    const momId = Number(data?.id) || 0;
    if (!momId) {
      this.toasterService.error('Unable to edit MOM. Invalid id.');
      return;
    }

    this.drawerService.open('mom', {
      projectid: this.projectid,
      mom: { ...data, id: momId }
    });
  }

  initializeTable() {
    const freezeColumns = !this.isCompactViewport();
    this.table = new Tabulator(this.tableDiv.nativeElement, {

      data: this.tableData,
      layout: 'fitDataStretch',
      responsiveLayout: false,
      pagination: 'local',
      paginationSize: 15,
      paginationCounter: 'rows',
      movableColumns: true,
      selectable: true,
      editTriggerEvent: 'dblclick',
      paginationSizeSelector: [10, 15, 25, 30, 50, 100],
      placeholder: 'No Data Found',
      headerSortElement: function (col: any, dir: any) {
        if (dir === 'asc') return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === 'desc') return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },
      initialSort: [
        { column: 'date', dir: 'desc' },
      ],
      columns: [
        {
          title: 'Title',
          field: 'title',
          minWidth: 250,
          formatter: (cell: any) => this.titleFormatter(cell),
          cellClick: (e: any, cell: any) => this.handleTitleClick(e, cell)
        },
        {
          title: 'Date',
          field: 'date',
          width: 150,
          formatter: (cell: any) => this.dateFormatter(cell.getValue())
        },
        {
          title: 'Time',
          field: 'starttime',
          minWidth: 80,
          formatter: (cell: any) => this.timeRangeFormatter(cell.getRow().getData())
        },
        {
          title: 'Attendees',
          field: 'attendees_list',
          minWidth: 250,
          formatter: (cell: any) => this.textFormatter(cell.getValue())
        },
        {
          title: 'Agenda',
          field: 'agenda',
          minWidth: 220,
          formatter: (cell: any) => this.textFormatter(cell.getValue())
        },
        {
          title: 'Decisions',
          field: 'decisions',
          minWidth: 220,
          formatter: (cell: any) => this.textFormatter(cell.getValue())
        },
        // {
        //   title: 'Attachment',
        //   field: 'file_url',
        //   minWidth: 180,
        //   headerSort: false,
        //   formatter: (cell: any) => this.attachmentFormatter(cell.getRow().getData()),
        //   cellClick: (e: any, cell: any) => this.handleAttachmentClick(e, cell)
        // },
        {
          title: 'Actions',
          field: 'actions',
          width: 120,
          hozAlign: 'center',
          headerSort: false,
          frozen: freezeColumns,
          formatter: (cell: any) => this.actionFormatter(cell),
          cellClick: (e: any, cell: any) => this.handleActionClick(e, cell),
          cssClass: 'sticky-col-right',
        }
      ],
    });

    attachTabulatorPaginationPersistence(this.table, buildTabulatorPaginationKey('project-mom-table'));
  }



  actionFormatter(_cell: any) {
    const rowData: MomItem = _cell?.getRow?.().getData?.() || {};
    const hasFile = !!this.getAttachmentPath(rowData);
    const momId = Number(rowData?.id);
    const isDeleting = this.deletingMomId === momId;
    const isDownloading = this.downloadingMomId === momId;

    return `
      <div class="flex items-center justify-center gap-3 w-full h-full">
        <button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit" title="Edit MOM" ${isDeleting || isDownloading ? 'disabled' : ''}>
          <i class="ri-pencil-line text-lg pointer-events-none"></i>
        </button>
          <button
          class="transition-colors ${hasFile ? 'text-slate-400 hover:text-emerald-600 btn-download' : 'text-slate-300 cursor-not-allowed'} ${isDownloading ? 'tabulator-action-button--loading' : ''}"
          title="${isDownloading ? 'Downloading...' : (hasFile ? 'Download attachment' : 'No attachment available')}"
          ${hasFile && !isDownloading && !isDeleting ? '' : 'disabled'}
        >
              <i class="${isDownloading ? 'ri-loader-4-line tabulator-action-spinner' : 'ri-download-2-line text-lg'} pointer-events-none"></i>
        </button>
        <button class="text-slate-400 hover:text-red-600 transition-colors btn-delete ${isDeleting ? 'tabulator-action-button--loading' : ''}" title="${isDeleting ? 'Deleting...' : 'Delete MOM'}" ${isDeleting || isDownloading ? 'disabled' : ''}>
          <i class="${isDeleting ? 'ri-loader-4-line tabulator-action-spinner' : 'ri-delete-bin-line text-lg'} pointer-events-none"></i>
        </button>
      </div>
    `;
  }

  handleActionClick(e: any, cell: any) {
    e.stopPropagation();
    const target = e.target.closest('button');
    if (!target) return;
    if (target.disabled) return;

    const row = cell.getRow();
    const data: MomItem = row.getData();

    if (target.classList.contains('btn-edit')) {
      this.editMom(data);
    }
    else if (target.classList.contains('btn-download')) {
      this.downloadFile(data);
    }
    else if (target.classList.contains('btn-delete')) {
      this.deleteMom(data);
    }
  }

  handleTitleClick(e: any, cell: any) {
    const target = e.target.closest('button');
    if (!target?.classList.contains('view-btn')) {
      return;
    }

    e.stopPropagation();
    const rowData: MomItem = cell.getRow().getData();
    this.openMomDetailsDialog(rowData);
  }

  handleAttachmentClick(e: any, cell: any) {
    e.stopPropagation();
    const rowData: MomItem = cell.getRow().getData();
    if (!this.getAttachmentPath(rowData)) {
      return;
    }

    this.downloadFile(rowData);
  }

  deleteMom(data: MomItem) {
    const momId = Number(data?.id) || 0;
    if (!momId) {
      this.toasterService.error('Unable to delete MOM. Invalid id.');
      return;
    }

    Swal.fire({
      title: 'Delete MOM?',
      text: `Are you sure you want to delete "${data?.title || 'Untitled MOM'}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#ef4444',
      confirmButtonText: 'Yes, delete it'
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }

      this.deletingMomId = momId;
      this.refreshVisibleRows();
      this.authService.deletemom(momId, this.storageService.getUsername())
        .pipe(finalize(() => {
          this.deletingMomId = null;
          this.refreshVisibleRows();
        }))
        .subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message || 'MOM deleted successfully.');
          this.getMOMListByProjectId();
        },
        error: (err: any) => {
          this.toasterService.error(err?.error?.message || 'Unable to delete MOM.');
        }
      });
    });
  }




  downloadFile(data: MomItem): void {
    const rawFileUrl = this.getAttachmentPath(data);
    if (!rawFileUrl) {
      this.toasterService.error('No attachment available for this MOM.');
      return;
    }

    const fileName = this.getDownloadFileName(data, rawFileUrl);
    if (rawFileUrl.startsWith('data:')) {
      this.triggerBrowserDownload(rawFileUrl, fileName);
      return;
    }

    const downloadUrls = this.buildDownloadUrlCandidates(rawFileUrl);
    const momId = Number(data?.id);
    this.downloadingMomId = Number.isFinite(momId) ? momId : null;
    this.refreshVisibleRows();
    this.tryDownloadFromCandidates(downloadUrls, fileName, 0, this.downloadingMomId);
  }

  private triggerBrowserDownload(url: string, fileName: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private getDownloadFileName(data: MomItem, fileUrl: string): string {
    const providedFileName = `${data?.file_name ?? ''}`.trim();
    if (providedFileName) {
      return providedFileName;
    }

    const urlFileName = this.extractFileNameFromPath(fileUrl);
    if (urlFileName) {
      return urlFileName;
    }

    const ext = this.inferExtension(data?.file_type, fileUrl) || 'pdf';
    const safeName = (data.title || 'MOM').replace(/[^a-z0-9]/gi, '_');
    return `${safeName}.${ext}`;
  }

  private getAttachmentPath(data: MomItem): string {
    return `${data?.file_url ?? ''}`.trim();
  }

  private attachmentFormatter(data: MomItem): string {
    const attachmentPath = this.getAttachmentPath(data);
    if (!attachmentPath) {
      return `
        <div class="flex items-center h-full">
          <span class="text-sm text-slate-400">-</span>
        </div>
      `;
    }

    const label = this.escapeHtml(this.getAttachmentLabel(data, attachmentPath));
    const title = this.escapeHtml(attachmentPath);
    return `
      <div class="flex items-center h-full">
        <button
          type="button"
          class="text-sm text-blue-600 hover:text-blue-700 hover:underline truncate max-w-full"
          title="${title}"
        >
          ${label}
        </button>
      </div>
    `;
  }

  private getAttachmentLabel(data: MomItem, fileUrl: string): string {
    const providedFileName = `${data?.file_name ?? ''}`.trim();
    if (providedFileName) {
      return providedFileName;
    }

    return this.extractFileNameFromPath(fileUrl) || 'Download file';
  }

  private extractFileNameFromPath(fileUrl: string): string {
    const fileName = `${fileUrl ?? ''}`.split('/').pop()?.split('?')[0]?.trim() || '';
    if (!fileName) {
      return '';
    }

    return fileName.replace(/\.+$/, '').trim();
  }

  private inferExtension(fileType: string | undefined, fileUrl: string): string {
    const normalizedPath = `${fileUrl ?? ''}`.split('?')[0];
    const pathExtension = normalizedPath.split('.').pop()?.trim().replace(/\.+$/, '');
    if (pathExtension && pathExtension !== normalizedPath) {
      return pathExtension;
    }

    const mimeType = `${fileType ?? ''}`.trim().toLowerCase();
    const extensionMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'text/plain': 'txt',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-excel': 'xls'
    };

    return extensionMap[mimeType] || '';
  }

  private buildDownloadUrlCandidates(fileUrl: string): string[] {
    const normalizedUrl = `${fileUrl ?? ''}`.trim();
    if (!normalizedUrl) {
      return [];
    }

    const parsedUrl = this.parseAbsoluteUrl(normalizedUrl);
    const pathWithQuery = parsedUrl
      ? `${parsedUrl.pathname}${parsedUrl.search}`
      : normalizedUrl;

    const normalizedPaths = Array.from(new Set(
      [
        this.normalizePublicDownloadPath(pathWithQuery),
        this.ensureLeadingSlash(pathWithQuery),
        this.ensureLeadingSlash(pathWithQuery.replace('/var/www/html/R-SPACE', '')),
        this.ensureLeadingSlash(pathWithQuery.replace('/var/www/html', ''))
      ]
        .map((path) => path.trim())
        .filter(Boolean)
    ));

    const resolvedCandidates = normalizedPaths.flatMap((path) =>
      this.getDownloadOriginCandidates().map((origin) => `${origin}${path}`)
    );

    if (parsedUrl) {
      resolvedCandidates.push(normalizedUrl);
    }

    return Array.from(new Set(resolvedCandidates.map((path) => encodeURI(path))));
  }

  private normalizePublicDownloadPath(path: string): string {
    return this.ensureLeadingSlash(
      `${path ?? ''}`
        .replace('/var/www/html/R-SPACE', '')
        .replace('/var/www/html', '')
        .replace(/\/{2,}/g, '/')
        .trim()
    );
  }

  private parseAbsoluteUrl(value: string): globalThis.URL | null {
    if (!/^https?:\/\//i.test(value)) {
      return null;
    }

    try {
      return new globalThis.URL(value);
    } catch {
      return null;
    }
  }

  private ensureLeadingSlash(path: string): string {
    if (!path) {
      return '';
    }

    return path.startsWith('/') ? path : `/${path}`;
  }

  private getDownloadOriginCandidates(): string[] {
    const browserOrigin = typeof window !== 'undefined'
      ? `${window.location.origin ?? ''}`.replace(/\/+$/, '')
      : '';
    const configuredOrigin = `${WEB_ORIGIN}`.replace(/\/+$/, '');
    const browserOriginWithoutPort = this.removePortFromOrigin(browserOrigin);
    const configuredOriginWithoutPort = this.removePortFromOrigin(configuredOrigin);

    return Array.from(new Set(
      [
        browserOriginWithoutPort,
        configuredOriginWithoutPort,
        browserOrigin,
        configuredOrigin
      ]
        .map((origin) => `${origin ?? ''}`.replace(/\/+$/, ''))
        .filter(Boolean)
    ));
  }

  private removePortFromOrigin(origin: string): string {
    if (!origin) {
      return '';
    }

    try {
      const parsedOrigin = new globalThis.URL(origin);
      return parsedOrigin.port
        ? `${parsedOrigin.protocol}//${parsedOrigin.hostname}`
        : parsedOrigin.origin;
    } catch {
      return '';
    }
  }


  private tryDownloadFromCandidates(downloadUrls: string[], fileName: string, index = 0, momId?: number | null): void {


    if (index >= downloadUrls.length) {
      const directUrl = this.getPreferredDirectUrl(downloadUrls);
      if (directUrl) {
        this.openFileDirectly(directUrl);
        this.clearMomDownload(momId);
        return;
      }

      this.toasterService.error('Unable to download attachment.');
      this.clearMomDownload(momId);
      return;
    }

    const currentUrl = downloadUrls[index];
    this.http.get(currentUrl, {
      responseType: 'blob'
    }).subscribe({
      next: (blob: Blob) => {
        if (!blob || blob.size === 0) {
          this.tryDownloadFromCandidates(downloadUrls, fileName, index + 1, momId);
          return;
        }

        const blobUrl = window.URL.createObjectURL(
          new Blob([blob], { type: blob.type || 'application/octet-stream' })
        );
        this.triggerBrowserDownload(blobUrl, fileName);
        window.URL.revokeObjectURL(blobUrl);
        this.clearMomDownload(momId);
      },
      error: () => {
        this.tryDownloadFromCandidates(downloadUrls, fileName, index + 1, momId);
      }
    });
  }

  private clearMomDownload(momId?: number | null): void {
    if (momId === undefined || momId === null || this.downloadingMomId === momId) {
      this.downloadingMomId = null;
      this.refreshVisibleRows();
    }
  }

  private getPreferredDirectUrl(downloadUrls: string[]): string {
    const preferredUrl = downloadUrls.find((url) => !url.includes('/api/v1/'));
    return preferredUrl || downloadUrls[0] || '';
  }

  private openFileDirectly(url: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
  }

  private refreshVisibleRows(): void {
    try {
      this.table?.redraw?.(true);
    } catch {
      // ignore redraw timing during table rebuilds
    }
  }

  private normalizeMomList(res: any): MomItem[] {
    const rows = this.extractMomRows(res)
      .map((item: any) => this.normalizeMomRow(item))
      .filter((item: MomItem) => this.hasRenderableMomData(item));

    const scopedRows = rows.filter((item: MomItem) => this.matchesCurrentProject(item));
    return scopedRows.length ? scopedRows : rows;
  }

  private extractMomRows(res: any): any[] {
    const candidates = [
      res,
      res?.data,
      res?.result,
      res?.results,
      res?.items,
      res?.rows,
      res?.momdetails,
      res?.mom_details,
      res?.list,
      res?.payload
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  private normalizeMomRow(item: any): MomItem {
    const attendeesValue =
      item?.attendees_list ??
      item?.attendee_list ??
      item?.attendee_names ??
      item?.attendees ??
      '';

    const createdByName =
      item?.created_by_name ??
      item?.createdby_name ??
      item?.created_by_employee_name ??
      item?.employee_name ??
      '';

    return {
      id: Number(item?.id ?? item?.mom_id ?? item?.momid) || 0,
      companyid: Number(item?.companyid ?? item?.company_id) || 0,
      projectid: Number(item?.projectid ?? item?.project_id ?? item?.projectId) || 0,
      title: `${item?.title ?? item?.mom_title ?? item?.meeting_title ?? item?.subject ?? ''}`.trim(),
      date: `${item?.date ?? item?.meeting_date ?? item?.meetingdate ?? item?.mom_date ?? ''}`.trim(),
      starttime: item?.starttime ?? item?.start_time ?? item?.from_time ?? item?.meeting_start_time ?? '',
      endtime: item?.endtime ?? item?.end_time ?? item?.to_time ?? item?.meeting_end_time ?? '',
      attendees: this.normalizeTextValue(item?.attendees),
      attendees_list: this.normalizeTextValue(attendeesValue),
      agenda: this.normalizeTextValue(item?.agenda),
      discussion: this.normalizeTextValue(item?.discussion),
      decisions: this.normalizeTextValue(item?.decisions ?? item?.action_items),
      file_url: `${item?.file_url ?? item?.filepath ?? item?.file_path ?? item?.document_path ?? ''}`.trim(),
      filepath: `${item?.filepath ?? item?.file_path ?? item?.file_url ?? ''}`.trim(),
      file_name: `${item?.file_name ?? item?.filename ?? item?.document_name ?? item?.attachment_name ?? ''}`.trim(),
      file_type: `${item?.file_type ?? item?.mimetype ?? item?.mime_type ?? ''}`.trim(),
      created_by: Number(item?.created_by ?? item?.createdby ?? item?.employee_id) || 0,
      created_by_name: this.normalizeTextValue(createdByName),
      employee_name: this.normalizeTextValue(item?.employee_name)
    };
  }

  private normalizeTextValue(value: any): string {
    if (Array.isArray(value)) {
      return value
        .map((item: any) => `${item?.employee_name ?? item?.name ?? item ?? ''}`.trim())
        .filter(Boolean)
        .join(', ');
    }

    return `${value ?? ''}`.trim();
  }

  private hasRenderableMomData(item: MomItem): boolean {
    return !!(
      item?.id ||
      item?.title ||
      item?.date ||
      item?.agenda ||
      item?.discussion ||
      item?.decisions ||
      item?.attendees_list
    );
  }

  private matchesCurrentProject(item: MomItem): boolean {
    const itemProjectId = Number(item?.projectid) || 0;
    if (!this.projectid || !itemProjectId) {
      return true;
    }

    return itemProjectId === this.projectid;
  }

  private textFormatter(value: any): string {
    const displayValue = `${value ?? ''}`.trim();
    const safeValue = this.escapeHtml(displayValue || '-');
    return `
      <div class="flex items-center h-full">
        <span class="text-sm text-slate-600 truncate max-w-full cursor-help" title="${safeValue}">
          ${safeValue}
        </span>
      </div>
    `;
  }

  private titleFormatter(cell: any): string {
    const rowData: MomItem = cell.getRow().getData();
    const title = `${rowData?.title ?? ''}`.trim();
    const safeTitle = this.escapeHtml(title || '-');

    return `
      <div class="flex items-center justify-between w-full group relative pr-24">
        <div class="flex-1">
          <span class="font-medium text-gray-900 text-m leading-relaxed break-words truncate block cursor-help" title="${safeTitle}">
            ${safeTitle}
          </span>
        </div>
        <div class="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 transform translate-x-2 group-hover:translate-x-0">
          <button class="view-btn bg-white border border-gray-200 shadow-sm px-2.5 py-1 rounded-md hover:bg-gray-50 text-[var(--text-active)] hover:text-[var(--text-active)]-700 focus:outline-none flex items-center gap-1.5">
            <span class="text-[10px] font-semibold uppercase tracking-wide">View</span>
            <i class="ri-eye-line text-xs"></i>
          </button>
        </div>
      </div>
    `;
  }

  private formatNumberedText(value: string | null | undefined): string {
    if (!value) return '';
    return value
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(\d+)\s*\.\s*/g, '$1. ');
  }

  private openMomDetailsDialog(rowData: MomItem): void {
    const summaryCards = [
      { label: 'Meeting Date', value: this.getDisplayDate(rowData?.date) },
      { label: 'Meeting Time', value: this.getDisplayTimeRange(rowData) },
      { label: 'Attendees', value: this.getAttendeesDisplayValue(rowData) },
      { label: 'Created By', value: this.getCreatedByDisplayValue(rowData) }
    ];

    const summaryHtml = summaryCards.map(item => `
  <div style="
    background:var(--bg-card,#fff);
    border:1px solid var(--border-card,rgba(59,130,246,.12));
    border-radius:14px;
    padding:12px 14px;
    box-shadow:var(--shadow-card,0 8px 24px rgba(15,23,42,.05));
  ">
    <div style="
      font-size:14px;
      color:var(--text-main,#0f172a);
      margin-bottom:6px;
      line-height:1.5;
    ">
      <strong style="
        font-weight:700;
      ">${this.escapeHtml(item.label)}</strong>
    </div>

    <div style="
      font-size:14px;
      font-weight:400;
      color:var(--text-main,#0f172a);
      line-height:1.5;
      word-break:break-word;
      white-space:normal;
    ">${this.escapeHtml(item.value)}</div>
  </div>
`).join('');

    const detailsSections = [
      { label: 'Agenda', value: rowData?.agenda || 'No agenda available', variant: 'standard' },
      { label: 'Discussion Notes', value: rowData?.discussion || 'No discussion available', variant: 'email' },
      { label: 'Decisions & Action Items', value: rowData?.decisions || 'No decisions available', variant: 'standard' }
    ] as const;

    const detailsHtml = detailsSections.map((section, index) => `
    <div style="
      background:var(--bg-card,#fff);
      border:1px solid var(--border-card,rgba(59,130,246,.12));
      border-radius:18px;
      padding:20px 20px 18px;
      box-shadow:var(--shadow-card,0 10px 28px rgba(15,23,42,.06));
      ${section.variant === 'email' || index === 2 ? 'grid-column:1/-1;' : ''}
    ">
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-bottom:12px;
      ">
        <div style="
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:6px 10px;
  border-radius:999px;
  background:var(--chip-bg,rgba(255,255,255,.72));
  border:1px solid var(--border-card,rgba(59,130,246,.14));
  font-size:12px;
  color:var(--chip-text,#334155);
">
  <span style="
    display:block;
    width:8px;
    height:8px;
    border-radius:999px;
    background:#000;
  "></span>
  <strong style="font-weight:700;">
    ${this.escapeHtml(section.label)}
  </strong>
</div>
      </div>
      ${section.variant === 'email'
        ? this.buildDiscussionEmailHtml(rowData, section.value)
        : `
          <div style="
            font-size:14px;
            line-height:1.75;
            color:var(--text-soft,#1e293b);
            white-space:pre-wrap;
            word-break:break-word;
            max-height:260px;
            overflow-y:auto;
            padding-right:8px;
            scrollbar-width:thin;
          ">${this.escapeHtml(this.formatNumberedText(section.value))}</div>
        `
      }
    </div>
  `).join('');

    Swal.fire({
      showCloseButton: false,
      showConfirmButton: false,
      width: 1180,
      padding: 0,
      backdrop: 'rgba(0,0,0,.4)',
      html: `
      <div style="
        --header-text:var(--text-on-active,#fff);
        text-align:left;
        background:var(--bg-body,linear-gradient(180deg,#eef6ff 0%,#f8fafc 100%));
        border-radius:24px;
        overflow:hidden;
        box-shadow:0 24px 80px rgba(15,23,42,.18);
        border:1px solid var(--border-card,#dbe3f0);
      ">
        <div style="
          padding:28px 32px 22px;
          background:var(--text-active);
          border-bottom:1px solid color-mix(in srgb,var(--header-text) 12%,transparent);
          color:var(--header-text);
          position:relative;
          overflow:hidden;
        ">
          <div style="
            position:absolute;
            top:-56px;
            right:-24px;
            width:160px;
            height:160px;
            border-radius:999px;
            background:color-mix(in srgb,var(--header-text) 10%,transparent);
          "></div>
          <div style="
            position:absolute;
            bottom:-70px;
            left:-12px;
            width:180px;
            height:180px;
            border-radius:999px;
            background:color-mix(in srgb,var(--header-text) 8%,transparent);
          "></div>
          <button type="button" class="mom-dialog-close" style="
            position:absolute;
            top:20px;
            right:20px;
            width:40px;
            height:40px;
            border:1px solid color-mix(in srgb,var(--header-text) 16%,transparent);
            border-radius:999px;
            background:color-mix(in srgb,var(--header-text) 16%,transparent);
            color:var(--header-text);
            display:flex;
            align-items:center;
            justify-content:center;
            cursor:pointer;
            transition:background .2s ease,transform .2s ease;
            z-index:2;
            backdrop-filter:blur(8px);
          ">
            <i class="ri-close-line" style="font-size:18px;"></i>
          </button>
          <div style="padding-right:52px;position:relative;z-index:1;">
            <div style="min-width:0;">
              <div style="
                display:inline-flex;
                align-items:center;
                gap:8px;
                padding:6px 12px;
                border-radius:999px;
                background:color-mix(in srgb,var(--header-text) 14%,transparent);
                border:1px solid color-mix(in srgb,var(--header-text) 18%,transparent);
                font-size:10px;
                font-weight:800;
                letter-spacing:.1em;
                text-transform:uppercase;
                color:color-mix(in srgb,var(--header-text) 88%,transparent);
                margin-bottom:14px;
              ">
                <span style="
                  display:block;
                  width:8px;
                  height:8px;
                  border-radius:999px;
                  background:var(--header-text);
                "></span>
                Minutes of Meeting
              </div>
              <div style="
                font-size:28px;
                font-weight:800;
                line-height:1.2;
                word-break:break-word;
                color:var(--header-text);
              ">${this.escapeHtml(rowData?.title || 'Untitled MOM')}</div>
            </div>
          </div>
        </div>
        <div style="
          padding:24px 28px 28px;
          max-height:72vh;
          overflow:auto;
          background:var(
            --bg-body,
            radial-gradient(circle at top right,rgba(59,130,246,.08),transparent 26%),
            linear-gradient(180deg,rgba(255,255,255,.68) 0%,rgba(248,250,252,.96) 100%)
          );
        ">
          <div style="
            display:grid;
            grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
            gap:12px;
            margin-bottom:20px;
          ">${summaryHtml}</div>
          <div style="
            display:grid;
            grid-template-columns:minmax(240px,.82fr) minmax(320px,1.18fr);
            gap:18px;
          ">${detailsHtml}</div>
        </div>
      </div>
    `,
      didOpen: popup => {
        popup.style.setProperty('--swal2-background', 'transparent', 'important');

        const closeButton = popup.querySelector('.mom-dialog-close') as HTMLButtonElement | null;
        if (!closeButton) return;

        closeButton.addEventListener('mouseenter', () => {
          closeButton.style.background = 'color-mix(in srgb,var(--header-text) 24%,transparent)';
          closeButton.style.transform = 'scale(1.04)';
        });

        closeButton.addEventListener('mouseleave', () => {
          closeButton.style.background = 'color-mix(in srgb,var(--header-text) 16%,transparent)';
          closeButton.style.transform = 'scale(1)';
        });

        closeButton.addEventListener('click', () => Swal.close());
      }
    });
  }

  private dateFormatter(value: string): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return this.escapeHtml(value);
    }

    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private timeRangeFormatter(data: MomItem): string {
    const start = this.formatTime(data?.starttime);
    const end = this.formatTime(data?.endtime);

    if (start === '-' && end === '-') {
      return '-';
    }

    return `<span class="text-sm text-slate-600">${this.escapeHtml(start)} - ${this.escapeHtml(end)}</span>`;
  }

  private getDisplayDate(value?: string): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return `${value}`;
    }

    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private getDisplayTimeRange(data: MomItem): string {
    const start = this.formatTime(data?.starttime);
    const end = this.formatTime(data?.endtime);

    if (start === '-' && end === '-') {
      return '-';
    }

    return `${start} - ${end}`;
  }

  private getAttendeesDisplayValue(data: MomItem): string {
    const attendees = `${data?.attendees_list ?? data?.attendees ?? ''}`.trim();
    return attendees || '-';
  }

  private getCreatedByDisplayValue(data: MomItem): string {
    const createdBy = `${data?.created_by_name ?? data?.employee_name ?? ''}`.trim();
    return createdBy || '-';
  }

  private buildDiscussionEmailHtml(
    rowData: MomItem,
    discussionValue: string,
    isDarkMode = false
  ): string {
    const senderName = this.escapeHtml(
      this.getCreatedByDisplayValue(rowData)
    );

    const attendeeNames = this.escapeHtml(
      this.getAttendeesDisplayValue(rowData)
    );

    const meetingDate = this.escapeHtml(
      this.getDisplayDate(rowData?.date)
    );

    const subject = this.escapeHtml(
      `${rowData?.title || 'Meeting Discussion Notes'} - Discussion Notes`
    );

    const introLine = this.escapeHtml(
      `Please find below the discussion summary for the meeting "${rowData?.title || 'this meeting'}".`
    );

    const closingName =
      senderName === '-' ? 'Project Team' : senderName;

    const theme = {
      cardBg: 'var(--bg-card, #ffffff)',
      cardBorder: 'var(--border-card, #e2e8f0)',
      headerBg:
        'linear-gradient(180deg, var(--bg-elevated, #f8fafc) 0%, var(--bg-card, #ffffff) 100%)',
      headerBorder: 'var(--border-card, #e2e8f0)',
      bodyText: 'var(--text-main, #1e293b)',
      introText: 'var(--text-soft, #1e293b)',
    };

    return `
    <div
      class="mom-copy-content"
      style="
        border:1px solid ${theme.cardBorder};
        border-radius:16px;
        background:${theme.cardBg};
        overflow:hidden;
      "
    >

      <div style="
        background:${theme.headerBg};
        border-bottom:1px solid ${theme.headerBorder};
        padding:16px 18px;
      ">
        ${this.buildEmailMetaRow('From', senderName, false, isDarkMode)}
        ${this.buildEmailMetaRow('To', attendeeNames, false, isDarkMode)}
        ${this.buildEmailMetaRow('Date', meetingDate, false, isDarkMode)}
        ${this.buildEmailMetaRow('Subject', subject, true, isDarkMode)}
      </div>

      <div style="
        padding:22px;
        max-height:320px;
        overflow-y:auto;
        color:${theme.bodyText};
        font-size:14px;
        font-weight:400;
        line-height:1.8;
        word-break:break-word;
        scrollbar-width:thin;
      ">

        <p style="
          margin:0 0 14px;
          padding:0;
          font-size:14px;
          font-weight:400;
        ">Dear Team,</p>

        <p style="
          margin:0 0 14px;
          padding:0;
          font-size:14px;
          font-weight:400;
          color:${theme.introText};
        ">${introLine}</p>

        ${this.formatDiscussionContentAsEmailBody(
      discussionValue,
      isDarkMode
    )}

        <div style="
          height:8px;
          line-height:8px;
        "></div>

        <p style="
          margin:0 0 4px;
          padding:0;
          font-size:14px;
          font-weight:400;
        ">Regards,</p>

        <p style="
          margin:0;
          padding:0;
          font-size:14px;
          font-weight:400;
        ">${closingName}</p>

      </div>
    </div>
  `;
  }

  private buildEmailMetaRow(
    label: string,
    value: string,
    isLast = false,
    isDarkMode = false
  ): string {
    const labelColor = 'var(--text-main, #0f172a)';
    const valueColor = 'var(--text-main, #0f172a)';
    const dividerColor = 'var(--border-card, rgba(226,232,240,0.9))';

    return `
    <div style="
      display:flex;
      align-items:flex-start;
      gap:12px;
      padding:0 0 ${isLast ? '0' : '10px'};
      margin:0 0 ${isLast ? '0' : '10px'};
      border-bottom:${isLast ? '0' : `1px solid ${dividerColor}`};
      line-height:1.6;
    ">
      <strong style="
        flex:0 0 92px;
        font-size:14px;
        font-weight:700;
        color:${labelColor};
        line-height:1.6;
      ">${this.escapeHtml(label)}:</strong><span style="
        flex:1;
        font-size:14px;
        font-weight:400;
        color:${valueColor};
        line-height:1.6;
        word-break:break-word;
      ">${value}</span>
    </div>
  `;
  }

 private formatDiscussionContentAsEmailBody(
  value: string,
  isDarkMode = false
): string {
  const textColor = 'var(--text-soft, #1e293b)';

  const normalized = `${value ?? ''}`
    .replace(/\r\n/g, '\n')
    .trim();

  if (!normalized) {
    return `
      <p style="
        margin:0;
        padding:0;
        font-size:14px;
        font-weight:400;
        color:${textColor};
      ">No discussion available.</p>
    `;
  }

  const lines = normalized.split('\n');
  const htmlParts: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      htmlParts.push(`
        <div style="
          height:6px;
          line-height:6px;
        "></div>
      `);
      continue;
    }

    /*
     * Detect numbered/bullet lines:
     *
     * 1.Add something
     * 1. Add something
     * 1) Add something
     * - Add something
     * * Add something
     * • Add something
     */
    const bulletMatch = trimmedLine.match(
      /^(?:\d+[.)]\s*|[-*•]\s+)(.*)$/
    );

    if (bulletMatch) {
      const bulletText = bulletMatch[1].trim();

      htmlParts.push(`
        <p style="
          margin:0 0 7px;
          padding:0;
          font-size:14px;
          font-weight:400;
          color:${textColor};
          line-height:1.8;
          word-break:break-word;
        "><span style="
          font-weight:400;
        ">• </span>${this.formatDiscussionEmailLine(
          bulletText,
          isDarkMode
        )}</p>
      `);

      continue;
    }

    /*
     * Normal paragraph
     */
    htmlParts.push(`
      <p style="
        margin:0 0 14px;
        padding:0;
        font-size:14px;
        font-weight:400;
        color:${textColor};
        line-height:1.8;
        word-break:break-word;
      ">${this.formatDiscussionEmailLine(
        trimmedLine,
        isDarkMode
      )}</p>
    `);
  }

  return htmlParts.join('');
}

  private formatDiscussionEmailLine(
  value: string,
  isDarkMode = false
): string {
  const titleColor = 'var(--text-main, #0f172a)';
  const bodyColor = 'var(--text-soft, #1e293b)';

  const trimmedValue = `${value ?? ''}`.trim();

  if (!trimmedValue) {
    return '';
  }

  const colonIndex = trimmedValue.indexOf(':');

  // Normal text
  if (colonIndex <= 0) {
    return this.escapeHtml(trimmedValue);
  }

  const title = this.escapeHtml(
    trimmedValue.slice(0, colonIndex).trim()
  );

  const body = this.escapeHtml(
    trimmedValue.slice(colonIndex + 1).trim()
  );

  return `
    <strong style="
      font-weight:700;
      color:${titleColor};
    ">${title}:</strong>${body ? `<span style="
      display:inline;
      margin-left:5px;
      font-weight:400;
      color:${bodyColor};
    ">${body}</span>` : ''}
  `;
}

  // private getDownloadFileName(data: MomItem, fileUrl: string): string {
  //   const providedFileName = `${data?.file_name ?? ''}`.trim();
  //   if (providedFileName) {
  //     return providedFileName;
  //   }

  //   if (fileUrl.startsWith('data:')) {
  //     const mimeType = `${data?.file_type ?? fileUrl.slice(5, fileUrl.indexOf(';')) ?? ''}`.trim().toLowerCase();
  //     const extensionMap: Record<string, string> = {
  //       'application/pdf': 'pdf',
  //       'image/jpeg': 'jpg',
  //       'image/png': 'png',
  //       'image/gif': 'gif',
  //       'text/plain': 'txt',
  //       'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  //       'application/msword': 'doc',
  //       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  //       'application/vnd.ms-excel': 'xls'
  //     };
  //     const inferredExtension = extensionMap[mimeType] || '';
  //     const title = `${data?.title ?? 'mom-attachment'}`
  //       .trim()
  //       .replace(/[\\/:*?"<>|]+/g, '_');
  //     return inferredExtension ? `${title}.${inferredExtension}` : title;
  //   }

  //   const cleanUrl = fileUrl.split('?')[0];
  //   const extension = cleanUrl.split('.').pop();
  //   const title = `${data?.title ?? 'mom-attachment'}`
  //     .trim()
  //     .replace(/[\\/:*?"<>|]+/g, '_');

  //   return extension ? `${title}.${extension}` : title;
  // }

  private formatTime(time: any): string {
    if (!time && time !== 0) {
      return '-';
    }

    if (typeof time === 'string') {
      const timePart = time.includes('T') ? time.split('T')[1] : time;
      return timePart.slice(0, 8) || '-';
    }

    if (typeof time === 'object' && time !== null) {
      const hour = `${Number(time.hour) || 0}`.padStart(2, '0');
      const minute = `${Number(time.minute) || 0}`.padStart(2, '0');
      const second = `${Number(time.second) || 0}`.padStart(2, '0');
      return `${hour}:${minute}:${second}`;
    }

    return '-';
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }
}
