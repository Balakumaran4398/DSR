

import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { attachTabulatorPaginationPersistence, buildTabulatorPaginationKey } from 'src/app/_core/utils/tabulator-pagination.util';
import Swal from 'sweetalert2';
declare const Tabulator: any;
@Component({
	selector: 'app-admin-documents',
	templateUrl: './admin-documents.component.html',
	styleUrls: ['./admin-documents.component.scss']
})
export class AdminDocumentsComponent {
	@ViewChild('tableDiv') tableDiv!: ElementRef;
	private table: any;
	documents: any[] = [];
	filteredDocument!: any;
	uploadForm: FormGroup;
	doc: any;
	searchTerm: any = '';
	Math = Math;
	showUploadModal = false;
		editModal = false;
		isSubmitting = false;
		tableLoading = false;
		deletingDocumentId: number | null = null;
		downloadingDocumentId: number | null = null;
		isDownloadAllLoading = false;
		id: number = 0;
	selectedFiles: File[] = [];
	fileNames: string[] = [];
	downloadOpen: boolean = false;
	deletedFileUrls: string[] = [];
	readonly maxDocumentTitleLength = 200;
	readonly acceptedDocumentFileTypes = '.xls,.xlsx,.pdf,.png,.jpg,.jpeg';
	private readonly allowedDocumentExtensions = new Set(['xls', 'xlsx', 'pdf', 'png', 'jpg', 'jpeg']);


	constructor(private authService: AuthService, private toasterService: ToasterService, private fb: FormBuilder,
	) {
		this.uploadForm = this.fb.group({
			title: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(this.maxDocumentTitleLength)]],
			file: ['', Validators.required]
		});
	}

	ngOnInit() {
		this.getDocumentHistory();
	}

		getDocumentHistory() {
			this.tableLoading = true;
			this.authService.getDocumentList()
				.pipe(finalize(() => {
					this.tableLoading = false;
				}))
				.subscribe({
				next: (res: any[]) => {
					console.log(res);
				// this.documents = res.filter((doc) => doc.isdelete === false).map((doc) => ({
				// 	...doc,
				// 	filename: doc.file_url[0]?.split('/').pop()?.replace(/^\d+_/, '')
				// }));
				this.documents = res
					.filter((doc) => !doc.isdelete)
					.map((doc) => ({
						...doc,
						filename: doc.file_url
							?.map((url: string) => url.split('/').pop()?.replace(/^\d+_/, ''))
							.join(', ') || ''
					}));
				setTimeout(() => {
					this.initializeTable();
				}, 100);
				console.log('afterfilename', this.documents);

				},
				error: (err: any) => {
					this.documents = [];
					if (this.table) {
						this.table.setData?.(this.documents);
					}
					this.toasterService.error('Failed to load documents');
				}
			});
	}

	initializeTable() {
		if (this.table) {
			this.table.destroy();
		}

		this.table = new Tabulator(this.tableDiv.nativeElement, {
			data: this.documents,
			layout: 'fitColumns',
			pagination: 'local',
			paginationSize: 10,
			paginationCounter: 'rows',
			paginationSizeSelector: [5, 10, 25, 50, 100],
			movableColumns: true,
			selectable: true,
			placeholder: 'No Data Found',
			headerSortElement: function (col: any, dir: any) {
				if (dir === 'asc') return '<i class="ri-arrow-up-line text-xs ml-1"></i>';
				if (dir === 'desc') return '<i class="ri-arrow-down-line text-xs ml-1"></i>';
				return '<i class="ri-arrow-up-down-line text-xs ml-1"></i>';
			},
			columns: [
				{
					title: 'ID',
					field: 'serialNo',
					width: 100,
					hozAlign: 'left',
					// formatter: "rownum",
					formatter: function (cell: any) {
						const table = cell.getTable();
						const page = table.getPage();
						const pageSize = table.getPageSize();
						const rowPosition = cell.getRow().getPosition(true);
						return ((page - 1) * pageSize) + rowPosition;
					},
					headerHozAlign: 'left',
					headerSort: false,
				},
				{
					title: 'Title',
					field: 'title',
					width: 300,
					hozAlign: 'left',
					headerHozAlign: 'left',
					formatter: (cell: any) => this.filenameFormatter(cell),
				},
				{
					title: 'File Name',
					field: 'filename',
					width: 500,
					formatter: (cell: any) => {
						const value = cell.getValue();
						const safeValue = value ? String(value) : '';

						return `
					<div class="flex items-center h-full w-full overflow-hidden">
						<span class="text-sm text-black truncate cursor-help" title="${safeValue}">
							${safeValue || '-'}
						</span>
					</div>
				`;
					}
				},
				{
					title: 'Created Date',
					field: 'createddate',
					minWidth: 350,
					hozAlign: 'left',
					headerHozAlign: 'left',
					formatter: (cell: any) => this.dateFormatter(cell.getValue()),
				},
				{
					title: 'Actions',
					field: 'actions',
					width: 150,
					hozAlign: 'center',
					headerHozAlign: 'center',
					headerSort: false,
					frozen: true,
					formatter: (cell: any) => this.actionFormatter(cell),
					cellClick: (e: any, cell: any) => this.handleActionClick(e, cell),
					cssClass: 'sticky-col-right',
				}
			],
		});

		attachTabulatorPaginationPersistence(this.table, buildTabulatorPaginationKey('documents-table'));
	}

	private filenameFormatter(cell: any): string {
		const title = `${cell.getValue() ?? ''}`.trim() || '-';
		return `<span class="font-medium text-gray-900">${this.escapeHtml(title)}</span>`;
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

		actionFormatter(_cell: any) {
			const rowData = _cell?.getRow?.().getData?.() || {};
			const documentId = Number(rowData?.id);
			const isDeleting = this.deletingDocumentId === documentId;
			const isDownloading = this.downloadingDocumentId === documentId;

			return `
			<div class="flex items-center justify-left gap-3 w-full h-full">
			<button class="text-slate-400 hover:text-blue-600 transition-colors btn-edit" title="Edit" ${isDeleting || isDownloading ? 'disabled' : ''}>
	          <i class="ri-pencil-line text-lg pointer-events-none"></i>
	        </button>
	
			  <button class="text-slate-400 hover:text-emerald-600 btn-download ${isDownloading ? 'tabulator-action-button--loading' : ''}" title="${isDownloading ? 'Downloading...' : 'Download'}" ${isDeleting || isDownloading ? 'disabled' : ''}>
				<i class="${isDownloading ? 'ri-loader-4-line tabulator-action-spinner' : 'ri-download-2-line text-lg'} pointer-events-none"></i>
			  </button>
	  
			  <button class="text-slate-400 hover:text-red-600 btn-delete ${isDeleting ? 'tabulator-action-button--loading' : ''}" title="${isDeleting ? 'Deleting...' : 'Delete'}" ${isDeleting || isDownloading ? 'disabled' : ''}>
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
		const data: any = row.getData();

		//   console.log(data.id);


		if (target.classList.contains('btn-download')) {
			this.downloadUI(data);
		} else if (target.classList.contains('btn-delete')) {
			this.delDoc(data);
		} else if (target.classList.contains('btn-edit')) {
			this.editDoc(data.id);
		}
	}

	onSearch(event: Event): void {
		this.searchTerm = (event.target as HTMLInputElement).value.trim().toLowerCase();

		if (!this.table) return;

		if (!this.searchTerm) {
			this.table.clearFilter();
			return;
		}
		if (this.searchTerm) {
			this.table.addFilter([
				[
					{ field: 'title', type: 'like', value: this.searchTerm },
					{ field: 'filename', type: 'like', value: this.searchTerm },
				]
			]);
		}
	}

	addDoc() {
		this.showUploadModal = true;
		this.resetForm();
		document.body.classList.add('modal-open');
	}



	editDoc(id: number) {
		this.id = id;
		this.editModal = true;

		this.doc = JSON.parse(JSON.stringify(this.documents.find(t => t.id === id) || {}));

		if (!this.doc) return;

		this.uploadForm.patchValue({
			title: this.doc.title,
			file: ''
		});

		// Reset newly selected staging cache array when opening modal
		this.selectedFiles = [];
		this.fileNames = [];
		this.deletedFileUrls = [];

		document.body.classList.add('modal-open');
	}

	
	removeExistingFile(index: number) {
		if (this.doc && this.doc.file_url) {
			const removedUrl = this.doc.file_url[index];
			if (removedUrl) {
				this.deletedFileUrls.push(removedUrl);
			}
			this.doc.file_url.splice(index, 1);
		}
	}
	closeModal() {
		this.id = 0;
		this.showUploadModal = false;
		this.editModal = false;
		this.resetForm();
		document.body.classList.remove('modal-open');
	}


	onFileSelected(event: Event) {
		const input = event.target as HTMLInputElement;

		if (!input.files || input.files.length === 0) {
			return;
		}
		const files = Array.from(input.files);
		const allowedFiles = files.filter(file => this.isAllowedDocumentFile(file));
		const rejectedFiles = files.filter(file => !this.isAllowedDocumentFile(file));

		if (rejectedFiles.length) {
			this.toasterService.error('Only XLS, XLSX, PDF, PNG, JPG, or JPEG files are allowed');
		}

		if (!allowedFiles.length) {
			if (!this.selectedFiles.length) {
				this.uploadForm.patchValue({ file: '' });
				this.uploadForm.get('file')?.setErrors({ invalidFileType: true });
				this.uploadForm.get('file')?.markAsTouched();
			}

			input.value = '';
			return;
		}

		// append newly selected files
		this.selectedFiles = [
			...this.selectedFiles,
			...allowedFiles
		];
		this.fileNames = this.selectedFiles.map(file => file.name);

		this.uploadForm.patchValue({
			file: this.selectedFiles
		});
		this.uploadForm.get('file')?.setErrors(null);

		console.log('Selected files:', this.selectedFiles);

		// Important: allow selecting the same file again
		input.value = '';
	}

	clearFile(event?: Event) {
		if (event) {
			event.stopPropagation();
		}
		this.selectedFiles = [];
		this.fileNames = [];
		this.uploadForm.patchValue({ file: '' });
		this.uploadForm.get('file')?.updateValueAndValidity();
	}

	resetForm() {
		this.uploadForm.reset();
		this.clearFile();
	}

	onReset() {
		this.resetForm();
	}

		onSubmit() {
			if (this.isSubmitting) return;

			if (this.uploadForm.get('title')?.invalid) {
			this.toasterService.error('Please enter a valid document title');
			this.uploadForm.get('title')?.markAsTouched();
			return;
		}

		if (this.uploadForm.get('file')?.hasError('invalidFileType')) {
			this.toasterService.error('Only XLS, XLSX, PDF, PNG, JPG, or JPEG files are allowed');
			this.uploadForm.get('file')?.markAsTouched();
			return;
		}

		if (this.uploadForm.invalid && !this.editModal) {
			this.toasterService.error('Please fill all required fields');
			Object.keys(this.uploadForm.controls).forEach(key => {
				this.uploadForm.get(key)?.markAsTouched();
			});
			return;
		}

		if (!this.editModal && !this.selectedFiles.length) {
			this.toasterService.error('Please select a file');
			return;
		}

		if (this.hasInvalidSelectedFiles()) {
			this.toasterService.error('Only XLS, XLSX, PDF, PNG, JPG, or JPEG files are allowed');
			this.uploadForm.get('file')?.setErrors({ invalidFileType: true });
			this.uploadForm.get('file')?.markAsTouched();
			return;
		}

		this.submitDocument();
	}

	private hasInvalidSelectedFiles(): boolean {
		return this.selectedFiles.some(file => !this.isAllowedDocumentFile(file));
	}

	private isAllowedDocumentFile(file: File): boolean {
		const extension = this.getFileExtension(file.name);
		return this.allowedDocumentExtensions.has(extension);
	}

	private getFileExtension(fileName: string): string {
		return String(fileName || '').split('.').pop()?.toLowerCase() || '';
	}

	
	private submitDocument() {
		this.isSubmitting = true;

		const formData = new FormData();
		formData.append('title', this.uploadForm.get('title')?.value);

		if (this.editModal) {
			formData.append('id', this.doc.id.toString());

			// 1. Send remaining existing file URLs so the backend knows what to keep
			if (this.doc.file_url && this.doc.file_url.length > 0) {
				this.doc.file_url.forEach((url: string) => {
					formData.append('existing_files', url);
				});
			}

			// 2. Send deleted file URLs for backend storage cleanup
			if (this.deletedFileUrls.length > 0) {
				this.deletedFileUrls.forEach((url: string) => {
					formData.append('deleted_files', url);
				});
			}

			// 3. Append newly uploaded files
			this.selectedFiles.forEach(file => {
				formData.append('file', file);
			});

				this.authService.editDoc(this.id, formData)
					.pipe(finalize(() => {
						this.isSubmitting = false;
					}))
					.subscribe({
					next: () => {
						this.toasterService.success('Document updated successfully');
						this.getDocumentHistory();
						this.closeModal();
					},
					error: (err: any) => {
						this.toasterService.error(
							err?.error?.message || 'Failed to update document'
						);
				}
			});
		} else {
			this.selectedFiles.forEach(file => {
				formData.append('file', file);
			});

				this.authService.upload(formData)
					.pipe(finalize(() => {
						this.isSubmitting = false;
					}))
					.subscribe({
					next: () => {
						this.toasterService.success('Document added successfully');
						this.closeModal();
						this.getDocumentHistory();
					},
					error: (err: any) => {
						this.toasterService.error(
							err?.error?.message || 'Failed to upload document'
						);
				}
			});
		}
	}
	downloadUI(file: any) {
		this.filteredDocument = this.documents.find(t => t.id === file.id);
		console.log(this.filteredDocument);
		if (file.file_url && file.file_url.length > 1) {
			this.downloadOpen = true;
			return;
		}
		this.downloadAll();
	}

	downloadSingleFile(url: string) {
		const fileUrl = url;
		const a = document.createElement('a');
		a.href = fileUrl;
		a.target = '_blank';
		a.download = this.getFilename(fileUrl) || 'document';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

		downloadAll() {
			if (this.isDownloadAllLoading) return;

			const documentId = Number(this.filteredDocument?.id);
			this.isDownloadAllLoading = true;
			this.downloadingDocumentId = Number.isFinite(documentId) ? documentId : null;
			this.refreshTableActions();
			this.authService.downloadDocument(this.filteredDocument.id)
				.pipe(finalize(() => {
					this.isDownloadAllLoading = false;
					this.downloadingDocumentId = null;
					this.refreshTableActions();
				}))
				.subscribe({
				next: (blob: Blob) => {
					const url = window.URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = this.filteredDocument.title;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				window.URL.revokeObjectURL(url);
			},
				error: () => {
					this.toasterService.error('Failed to download all documents');
				}
			});
	}

	delDoc(data: any) {
		const DocId = Number(data?.id) || 0;
		if (!DocId) {
			this.toasterService.error('Unable to delete Document. Invalid id.');
			return;
		}

		Swal.fire({
			title: 'Delete Document?',
			text: `Are you sure you want to delete "${data?.title}"?`,
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#2563eb',
			cancelButtonColor: '#ef4444',
			confirmButtonText: 'Yes, delete it'
		}).then((result) => {
			if (!result.isConfirmed) {
				return;
			}

				this.deletingDocumentId = DocId;
				this.refreshTableActions();
				this.authService.delDoc(DocId)
					.pipe(finalize(() => {
						this.deletingDocumentId = null;
						this.refreshTableActions();
					}))
					.subscribe({
					next: () => {
						this.documents = this.documents.filter(d => d.id !== DocId);
						this.getDocumentHistory();
					this.toasterService.success('Document deleted successfully');
				},
				error: (err: any) => {
					this.toasterService.error(err?.error?.message || 'Failed to delete document');
				}
			});
			});
		}

		private refreshTableActions(): void {
			try {
				this.table?.redraw?.(true);
			} catch {
				// ignore redraw timing during table rebuilds
			}
		}

	getFilename(url: string) {
		return url?.split('/').pop()?.replace(/^\d+_/, '')
	}
}
