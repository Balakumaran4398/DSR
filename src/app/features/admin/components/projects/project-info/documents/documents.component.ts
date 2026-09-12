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
      layout: "fitDataStretch",
      responsiveLayout: false,
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

      initialSort: [
        { column: "title", dir: "asc" },
      ],

      columns: [

      { title: "Title", field: "title" },
        {
          title: "File",
          field: "filepath",
          formatter: (cell: any) => {
            const path = cell.getValue();  
            return path.split('/').pop();  
          }
        },

        { title: "Uploaded by", field: "employee_name" },
        {
          title: "Actions",
          field: "file_url",
          width: 100,
          hozAlign: "center",
          headerSort: false,
          frozen: freezeColumns,
          formatter: (cell: any) => this.actionFormatter(cell),
          cellClick: (e: any, cell: any) => this.handleActionClick(e, cell),
          cssClass: "sticky-col-right",
        }
      ],
    });
    attachTabulatorPaginationPersistence(this.table, buildTabulatorPaginationKey('project-documents-table'));

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

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }
}
