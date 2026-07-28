import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
	uploadForm: FormGroup;
	doc: any;
	searchTerm : any = '';
	Math = Math;
	showUploadModal = false;
	editModal = false;
	fileName :any = '';
	isSubmitting = false;
	id: number = 0;
	readonly maxDocumentTitleLength = 200;
	
	private selectedFile: File | null = null;
  
	constructor(private authService: AuthService,private toasterService: ToasterService,private fb: FormBuilder,
	) {
	  this.uploadForm = this.fb.group({
		title: ['', [Validators.required, Validators.maxLength(this.maxDocumentTitleLength)]],
		file: ['', Validators.required]
	  });
	}
  
	ngOnInit() {
	  this.getDocumentHistory();
	}
  
	getDocumentHistory() {
	  this.authService.getDocumentList().subscribe({
		next: (res: any[]) => {
		  this.documents = res.filter((doc) => doc.isdelete === false).map((doc) => ({
			...doc,
			filename : doc.file_url?.split('/').pop()?.replace(/^\d+_/,'') 
        }));
		  setTimeout(() => {
			this.initializeTable(); 
		  }, 100);
		},
		error: (err: any) => {
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
	  formatter: "rownum",
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
		title: 'FileName',
		field: 'filename',
		width: 550,
		hozAlign: 'left',
		headerHozAlign: 'left',
		formatter: (cell: any) => this.filenameFormatter(cell),  //after title
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
	  return `
		<div class="flex items-center justify-left gap-3 w-full h-full">
		  <button class="text-slate-400 hover:text-emerald-600 btn-download" title="Download">
			<i class="ri-download-2-line text-lg pointer-events-none"></i>
		  </button>
  
		  <button class="text-slate-400 hover:text-red-600 btn-delete" title="Delete">
			<i class="ri-delete-bin-line text-lg pointer-events-none"></i>
		  </button>
		</div>
	  `;
	}
  
	handleActionClick(e: any, cell: any) {
	  e.stopPropagation();
	  const target = e.target.closest('button');
	  if (!target) return;
  
	  const row = cell.getRow();
	  const data: any = row.getData();
  
	  if (target.classList.contains('btn-download')) {
		this.download(data);
	  } else if (target.classList.contains('btn-delete')) {
		this.delDoc(data);
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
		  { field: 'title', type: 'like', value: this.searchTerm },
		  'or',
		  { field: 'uploadedby', type: 'like', value: this.searchTerm }
		]
	  ]);
	}
  
	addDoc() {
	  this.showUploadModal = true;
	  this.resetForm();
	  document.body.classList.add('modal-open');
	}
  
	editDoc(id: number) {
	  this.id = id;
	  this.showUploadModal = true;
	  this.editModal = true;
	  this.doc = this.documents.find(t => t.id === id);
	  this.uploadForm.patchValue({
		title: this.doc.title,
		file: this.doc.file    
	  });
	  this.fileName = this.doc.file;
	  document.body.classList.add('modal-open');
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
	  const file = input.files?.[0];
	  if (file) {
		this.selectedFile = file;
		this.fileName = file.name;
		this.uploadForm.patchValue({ file: file });
	  }
	}
  
	clearFile(event?: Event) {
	  if (event) {
		event.stopPropagation();
	  }
	  this.selectedFile = null;
	  this.fileName = '';
	  this.uploadForm.patchValue({ file: '' });
	}
  
	resetForm() {
	  this.uploadForm.reset();
	  this.clearFile();
	}
  
	onReset() {
	  this.resetForm();
	}
  
	onSubmit() {
	  if (this.uploadForm.get('title')?.invalid) {
		this.toasterService.error('Please enter a valid document title');
		this.uploadForm.get('title')?.markAsTouched();
		return;
	  }

	  if (this.uploadForm.invalid && !this.editModal) {
		this.toasterService.error('Please fill all required fields');
		Object.keys(this.uploadForm.controls).forEach(key => {
		  this.uploadForm.get(key)?.markAsTouched();
		});
		return;
	  }
  
	  if (!this.selectedFile && !this.editModal) {
		this.toasterService.error('Please select a file');
		return;
	  }
  
	  this.submitDocument();
	}
  
	private submitDocument() {
	  this.isSubmitting = true;
  
	  if (this.editModal) {
		const formData = new FormData();
		formData.append('id', this.doc.id);
		formData.append('title', this.uploadForm.get('title')?.value);
		
		if (this.selectedFile) {
		  formData.append('file', this.selectedFile);
		}
  
		this.authService.editDoc(this.id, formData).subscribe({
		  next: () => {
			this.isSubmitting = false;
			this.toasterService.success('Document updated successfully');
			this.getDocumentHistory();
			this.closeModal();
		  },
		  error: (err: any) => {
			this.isSubmitting = false;
			this.toasterService.error(err?.error?.message || 'Failed to update document');
		  }
		});
	  } else {
		const formData = new FormData();
		formData.append('title', this.uploadForm.get('title')?.value);
		formData.append('file', this.selectedFile!);
  
		this.authService.upload(formData).subscribe({
		  next: (res: any) => {
			this.isSubmitting = false;
			this.toasterService.success('Document added successfully');
			this.closeModal();
			this.getDocumentHistory();
		  },
		  error: (err: any) => {
			this.isSubmitting = false;
			this.toasterService.error(err?.error?.message || 'Failed to upload document');
		  }
		});
	  }
	}
  
	download(file: any) {
	  this.authService.downloadDocument(file.id).subscribe({
		next: (blob: Blob) => {
		  const url = window.URL.createObjectURL(blob);
		  const a = document.createElement('a');
		  a.href = url;
		  a.download = file.title;
		  document.body.appendChild(a);
		  a.click();
		  document.body.removeChild(a);
		  window.URL.revokeObjectURL(url);
		},
		error: (err: any) => {
		  this.toasterService.error('Failed to download document');
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
  
		this.authService.delDoc(DocId).subscribe({
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
}
