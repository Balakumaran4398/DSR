import { Dialog } from '@angular/cdk/dialog';
import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { DocUploadComponent, DocUploadDialogResult } from '../_core/doc-upload/doc-upload.component';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from 'src/app/_core/services/auth.service';
import { ActivatedRoute } from '@angular/router';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { finalize } from 'rxjs';
declare const Tabulator: any;
declare const luxon: any;
import { URL } from 'src/app/api.base';
import { HttpClient } from '@angular/common/http';
const WEB_ORIGIN = new globalThis.URL(String(URL.WEB_URL())).origin;
@Component({
  selector: 'app-documents',
  templateUrl: './documents.component.html',
  styleUrls: ['./documents.component.scss']
})
export class DocumentsComponent implements AfterViewInit {

  @ViewChild('tableDiv') tableDiv!: ElementRef;
  private table: any;
  private tableData: any[] = [];
  projectid: any = 0
  tableLoading = false;
  downloadingDocumentId: number | null = null;
  constructor(private drawerService: DrawerService, private http: HttpClient, private route: ActivatedRoute, private authService: AuthService, private dialog: MatDialog, private toasterService: ToasterService) {
    this.projectid = this.route.snapshot.paramMap.get('projectid');
  }
  ngAfterViewInit(): void {
    this.getDocumentListByProjectId()
  }

  getDocumentListByProjectId() {
    this.tableLoading = true;
    this.authService.getDocumentListByProjectId(this.projectid)
      .pipe(finalize(() => {
        this.tableLoading = false;
      }))
      .subscribe({
        next: (res: any) => {
          this.tableData = res;
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
          this.toasterService.error(err?.error?.message || 'Unable to load documents.');
        }
      })
  }
  addDoc() {
    const dialogRef = this.dialog.open(DocUploadComponent, {
      disableClose: true, // optional
      data: {
        projectId: this.projectid
      }
    });

    dialogRef.afterClosed().subscribe((result?: DocUploadDialogResult) => {
      if (result?.uploaded) {
        this.getDocumentListByProjectId()
      }
    });
  }

  initializeTable() {

    const freezeColumns = !this.isCompactViewport();
    this.table = new Tabulator(this.tableDiv.nativeElement, {
      data: this.tableData,
      layout: "fitColumns",
      responsiveLayout: false,
      autoResize: true,
      columnDefaults: {
        headerHozAlign: 'center',
        headerWordWrap: true,
        widthShrink: 1,
        resizable: true,
        tooltip: true
      },
      pagination: "local",
      paginationSize: 10,
      paginationCounter: "rows",
      movableColumns: true,
      selectable: true,
      editTriggerEvent: "dblclick",
      paginationSizeSelector: [10, 25, 50, 100],
      placeholder: "No Data Found",
      headerSortElement: function (col: any, dir: any) {
        if (dir === "asc") return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
        if (dir === "desc") return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
        return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
      },

      columns: this.getDocumentColumns(freezeColumns),
    });
    attachTabulatorPaginationPersistence(this.table, buildTabulatorPaginationKey('project-documents-table'));

  }

  private getDocumentColumns(freezeColumns: boolean): any[] {
    const compact = this.isCompactViewport();
    return [
      {
        title: "File", widthGrow: 3, hozAlign: "center", headerHozAlign: "center",
        formatter: (cell: any) => this.titleFormatter(cell.getRow()?.getData?.() || {})
      },
      {
        title: "Title", field: "title", widthGrow: 3,
        minWidth: compact ? 40 : 120,
      },
      {
        title: "File",
        field: "filepath",
        widthGrow: 3,
        minWidth: compact ? 40 : 130,
        formatter: (cell: any) => {
          return this.getDisplayFileName(cell.getValue()) || '-';
        }
      },

      {
        title: "Uploaded by", field: "employee_name", widthGrow: 2,
        minWidth: compact ? 52 : 105
      },
      {
        title: "Create Date", field: "createddate", widthGrow: 2,
        minWidth: compact ? 48 : 115,
        formatter: (cell: any) => this.dateFormatter(cell.getValue())
      },

      {
        title: "Actions",
        field: "file_url",
        width: compact ? 56 : 96,
        minWidth: compact ? 56 : 96,
        widthGrow: 0,
        hozAlign: "center",
        headerSort: false,
        frozen: freezeColumns,
        formatter: (cell: any) => this.actionFormatter(cell),
        cellClick: (e: any, cell: any) => this.handleActionClick(e, cell),
        cssClass: "sticky-col-right",
      }
    ];
  }

  private getDisplayFileName(value: unknown): string {
    return `${value ?? ''}`.split(/[\\/]/).pop() ?? '';
  }

  private titleFormatter(rowData: any): string {
    const fileUrl = `${rowData?.file_url ?? ''}`.trim();
    const fileName = this.getDisplayFileName(fileUrl.split('?')[0]);
    const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
    let preview: string;

    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(extension) && fileUrl) {
      const imageUrl = this.buildDownloadUrlCandidates(fileUrl)[0] ?? '';
      preview = `<img src="${this.escapeHtml(imageUrl)}" alt="Image preview" loading="lazy" style="width:32px;height:32px;object-fit:cover;border-radius:6px;flex:none;">`;
    } else if (extension === 'pdf') {
      preview = '<i class="ri-file-pdf-2-fill" aria-label="PDF file" style="font-size:22px;color:#dc2626;flex:none;"></i>';
    } else if (['xls', 'xlsx', 'csv'].includes(extension)) {
      preview = '<i class="ri-file-excel-2-fill" aria-label="Excel file" style="font-size:22px;color:#16a34a;flex:none;"></i>';
    } else if (['doc', 'docx'].includes(extension)) {
      preview = '<i class="ri-file-word-2-fill" aria-label="Word file" style="font-size:22px;color:#2563eb;flex:none;"></i>';
    } else {
      preview = '<i class="ri-file-line" aria-label="File" style="font-size:22px;color:#64748b;flex:none;"></i>';
    }

    return `<div style="display:flex;align-items:center;justify-content:center;text-align:center;gap:8px;width:100%;flex:1 1 100%;min-width:0;white-space:normal;overflow-wrap:anywhere;">${preview}</div>`;
  }


  actionFormatter(cell: any) {
    const rowData = cell?.getRow?.().getData?.() || {};
    const hasFile = !!`${rowData.file_url ?? ''}`.trim();
    const documentId = Number(rowData?.id);
    const isDownloading = this.downloadingDocumentId === documentId;

    return `
      <div class="flex items-center justify-center gap-3 w-full h-full">
        <button
          class="transition-colors ${hasFile ? 'text-slate-400 hover:text-blue-600 btn-download' : 'text-slate-300 cursor-not-allowed'} ${isDownloading ? 'tabulator-action-button--loading' : ''}"
          title="${isDownloading ? 'Downloading...' : (hasFile ? 'Download' : 'No file available')}"
          ${hasFile && !isDownloading ? '' : 'disabled'}>
          <i class="${isDownloading ? 'ri-loader-4-line tabulator-action-spinner' : 'ri-download-2-line text-lg'} pointer-events-none"></i>
        </button>
        
      </div>
    `;

  }

  handleActionClick(e: any, cell: any) {
    e.stopPropagation();
    const target = e.target.closest('button');
    if (!target) return;
    const row = cell.getRow();
    const data = row.getData();
    console.log(data);

    if ((target as HTMLButtonElement).disabled) {
      return;
    }

    if (target.classList.contains('btn-download')) {
      this.downloadFile(data.file_url, data.title, data.id)
    } else if (target.classList.contains('btn-delete')) {

    }
  }


  downloadFile(fileUrl: string, title: string, documentId?: number | string) {
    const normalizedFileUrl = `${fileUrl ?? ''}`.trim();
    if (!normalizedFileUrl) {
      this.toasterService.error('No file is available for this document.');
      return;
    }

    const extension = normalizedFileUrl.split('?')[0].split('.').pop();
    const fileName = extension ? `${title}.${extension}` : title;
    const downloadUrls = this.buildDownloadUrlCandidates(normalizedFileUrl);
    this.downloadingDocumentId = Number(documentId);
    this.refreshVisibleRows();
    this.tryDownloadFromCandidates(downloadUrls, fileName, 0, undefined, Number(documentId));
  }

  private triggerBrowserDownload(url: string, fileName: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  private buildDownloadUrlCandidates(fileUrl: string): string[] {
    const normalizedUrl = `${fileUrl ?? ''}`.trim();
    if (!normalizedUrl) {
      return [];
    }

    if (/^https?:\/\//i.test(normalizedUrl)) {
      return [encodeURI(normalizedUrl)];
    }

    const rawCandidates = [
      normalizedUrl,
      normalizedUrl.replace('/var/www/html', ''),
      normalizedUrl.replace('/var/www/html/dsr', ''),
    ];

    const resolvedCandidates = rawCandidates
      .filter(Boolean)
      .map((path) => path.trim())
      .flatMap((path) => {
        if (/^https?:\/\//i.test(path)) {
          return [path];
        }

        if (path.startsWith('/')) {
          return [`${WEB_ORIGIN}${path}`];
        }

        return [`${WEB_ORIGIN}/${path}`];
      });

    return Array.from(new Set(resolvedCandidates.map((path) => encodeURI(path))));
  }

  private tryDownloadFromCandidates(downloadUrls: string[], fileName: string, index = 0, lastError?: any, documentId?: number): void {
    if (index >= downloadUrls.length) {
      console.error('Unable to download attachment.', lastError);
      this.toasterService.error(this.getDownloadErrorMessage(lastError));
      this.clearDocumentDownload(documentId);
      return;
    }

    const currentUrl = downloadUrls[index];
    this.http.get(currentUrl, {
      responseType: 'blob'
    }).subscribe({
      next: (blob: Blob) => {
        const blobUrl = window.URL.createObjectURL(
          new Blob([blob], { type: blob.type || 'application/octet-stream' })
        );
        this.triggerBrowserDownload(blobUrl, fileName);
        window.URL.revokeObjectURL(blobUrl);
        this.clearDocumentDownload(documentId);
      },
      error: (err) => {
        console.error('Download failed:', err);
        this.tryDownloadFromCandidates(downloadUrls, fileName, index + 1, err, documentId);
      }
    });
  }

  private clearDocumentDownload(documentId?: number): void {
    if (documentId === undefined || this.downloadingDocumentId === documentId) {
      this.downloadingDocumentId = null;
      this.refreshVisibleRows();
    }
  }

  private getDownloadErrorMessage(err: any): string {
    if (err?.status === 0) {
      return 'Unable to download document. File server is unreachable or blocked.';
    }

    if (err?.status === 401 || err?.status === 403) {
      return 'Unable to download document. Access denied.';
    }

    if (err?.status === 404) {
      return 'Unable to download document. File not found.';
    }

    if (err?.status >= 500) {
      return 'Unable to download document. Server error while reading file.';
    }

    return err?.error?.message || err?.message || 'Unable to download document.';
  }


  private safeReplaceData(table: any, data: any): void {
    const normalized = Array.isArray(data) ? data : [];
    try {
      if (typeof table?.replaceData === 'function') {
        table.replaceData(normalized);
        return;
      }
      if (typeof table?.setData === 'function') {
        table.setData(normalized);
      }
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

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }

  private dateFormatter(value: string): string {
    if (!value) {
      return '<span>-</span>';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return `<span>${this.escapeHtml(value)}</span>`;
    }

    const formattedDate = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `<span>${formattedDate}</span>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
