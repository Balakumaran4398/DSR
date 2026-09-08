import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { catchError, finalize, forkJoin, of, Subscription } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { ExcelService, OverallPerformanceExcelSection } from 'src/app/_core/services/excel.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

type ReportSectionId = string;
type SummaryTone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'cyan';
type SortDirection = 'asc' | 'desc';
type ReportKind = 'release' | 'task' | 'issue' | 'ticket';
type DatePreset = 'weekly' | 'bi-weekly' | 'monthly' | 'custom';
type ExportKind = 'excel' | 'pdf';

interface SummaryCard {
  label: string;
  value: string | number;
  tone: SummaryTone;
}

interface ReportCell {
  value: string;
  title: string;
  isChip: boolean;
  chipClass: string;
}

interface ReportColumnView {
  label: string;
  index: number;
  active: boolean;
  sortIcon: string;
  sortTitle: string;
  ariaSort: 'ascending' | 'descending' | null;
}

interface ReportRow {
  id: string;
  cells: any[];
  cellViews: ReportCell[];
  searchText: string;
  meta: {
    statusKey?: string;
    categoryKey?: string;
    workedMinutes?: number;
  };
}

interface ReportSection {
  id: ReportSectionId;
  departmentId: string;
  departmentName: string;
  reportKind: ReportKind;
  reportTitle: string;
  sheetName: string;
  title: string;
  accent: [number, number, number];
  columns: string[];
  columnViews: ReportColumnView[];
  rows: ReportRow[];
  filteredRows: ReportRow[];
  loading: boolean;
  errorMessage: string;
  summary: SummaryCard[];
  emptyMessage: string;
  buildSummary: (rows: ReportRow[]) => SummaryCard[];
  searchTerm: string;
  pageSize: number;
  pageIndex: number;
  totalPages: number;
  pageNumbers: number[];
  showingFrom: number;
  showingTo: number;
  pagedRows: ReportRow[];
  sortColumnIndex: number | null;
  sortDirection: SortDirection;
  tableMinWidthRem: number;
  loadingLabel: string;
  emptyStateMessage: string;
  rowCountLabel: string;
  canExport: boolean;
  excelExporting: boolean;
  pdfExporting: boolean;
  showDepartmentHeading: boolean;
  departmentRecordCount: number;
}

interface DepartmentOption {
  filter_id: string;
  department_name: string;
  api_id: any;
  raw: any;
}

interface DepartmentReportData {
  department: DepartmentOption;
  dashboardData: any;
  releaseOverviewRows: any[];
  releaseOverviewLoaded: boolean;
  dashboardLoadFailed: boolean;
  releaseLoadFailed: boolean;
  loadFailed: boolean;
}

interface OverallPerformanceMetadataCache {
  departmentList: any[];
  employeeList: any[];
}

interface OverallPerformanceReportCacheEntry {
  generatedAt: string;
  departmentReportData: DepartmentReportData[];
}

interface OverallPerformanceViewState {
  selectedDepartmentIds: string[];
  startDate: string;
  endDate: string;
  selectedPreset: DatePreset;
}

interface LoadReportOptions {
  forceRefresh?: boolean;
  clearExistingData?: boolean;
}

@Component({
  selector: 'app-overall-performance-report',
  templateUrl: './overall-performance-report.component.html',
  styleUrls: ['./overall-performance-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverallPerformanceReportComponent implements OnInit, OnDestroy {
  private static metadataCache: OverallPerformanceMetadataCache | null = null;
  private static viewState: OverallPerformanceViewState | null = null;
  private static readonly reportCache = new Map<string, OverallPerformanceReportCacheEntry>();
  private static readonly metadataCacheStorageKey = 'dsr-overall-performance-report:metadata:v1';
  private static readonly viewStateStorageKey = 'dsr-overall-performance-report:view-state:v1';
  private static readonly reportCacheStoragePrefix = 'dsr-overall-performance-report:data:v1:';

  metadataLoading = false;
  pdfExporting = false;
  excelExporting = false;
  searchTerm = '';
  generatedBy = 'System User';
  displayedActivityCount = 0;
  departmentCount = 0;
  hasSectionLoading = false;
  isOverallReportLoading = false;
  hasSectionErrors = false;
  canExportOverall = false;
  selectedDepartmentLabel = 'All Department';
  selectedDepartmentTriggerLabel = 'All Department';
  selectedDepartmentFullLabel = 'All Department';
  selectedDepartmentCountLabel = 'No Departments Selected';
  canSelectAllDepartments = true;
  isDepartmentSelectionLocked = false;
  departmentFilterPlaceholder = 'All Department';
  noDepartmentOptionMessage = 'No departments found';
  emptyPageTitle = 'No department reports available';
  emptyPageMessage = 'Select one or more departments or change the date range to view report data.';
  dateRangeLabel = '';
  dateRangeDisplayLabel = '';
  selectedPresetLabel = 'Weekly';
  readonly allDepartmentsValue = '__all_departments__';
  selectedDepartmentIds: string[] = [this.allDepartmentsValue];
  departmentSearchTerm = '';
  startDate = '';
  endDate = '';
  filterStartDate: Date | null = null;
  filterEndDate: Date | null = null;
  selectedPreset: DatePreset = 'weekly';
  isCustomOpen = false;
  generatedAt = new Date();
  sections: ReportSection[] = [];
  departments: DepartmentOption[] = [];
  filteredDepartments: DepartmentOption[] = [];
  readonly pageSizeOptions = [10, 25, 50, 100];
  readonly skeletonRows = Array.from({ length: 6 }, (_value, index) => index);
  readonly datePresets: Array<{ id: DatePreset; label: string }> = [
    { id: 'weekly', label: 'Weekly' },
    { id: 'bi-weekly', label: 'Bi-Weekly' },
    { id: 'monthly', label: 'This Month' },
    { id: 'custom', label: 'Custom' }
  ];

  private loadSubscription?: Subscription;
  private metadataSubscription?: Subscription;
  private metadataLoaded = false;
  private departmentReportData: DepartmentReportData[] = [];
  private departmentList: any[] = [];
  private employeeList: any[] = [];
  private tableLoadingState: Record<string, Partial<Record<ReportKind, boolean>>> = {};
  private tableErrorState: Record<string, Partial<Record<ReportKind, string>>> = {};
  private sectionExportingState: Record<string, Partial<Record<ExportKind, boolean>>> = {};
  private activeLoadRunId = 0;
  private activeReportRequestKey: string | null = null;
  private activeReportRequestCount = 0;
  private readonly activeTableRequestKeys = new Set<string>();
  private rebuildSectionsTimeoutId: number | null = null;
  private departmentRecordCountById: Record<string, number> = {};
  private managerDepartmentRestricted = false;
  private readonly maxSessionCacheCharacters = 4_000_000;

  private readonly releaseKeys = [
    'total_release_list',
    'release_list',
    'releases',
    'in_progress_release_list',
    'inprogress_release_list',
    'internal_passed_release_list',
    'internal_pass_release_list',
    'external_passed_release_list',
    'external_pass_release_list',
    'passed_release_list',
    'completed_release_list'
  ];
  private readonly taskKeys = [
    'open_task_list',
    'active_task_list',
    'closed_task_list',
    'completed_task_list',
    'task_list',
    'tasks'
  ];
  private readonly issueKeys = [
    'bug_list',
    'open_bug_list',
    'closed_bug_list',
    'open_issue_list',
    'closed_issue_list',
    'issue_list',
    'issues'
  ];
  private readonly ticketKeys = [
    'ticket_list',
    'ticketList',
    'ticketlist',
    'all_ticket_list',
    'overall_ticket_list',
    'tickets',
    'ticket_details',
    'ticketDetails'
  ];

  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private toasterService: ToasterService,
    private excelService: ExcelService,
    private cdr: ChangeDetectorRef
  ) {
    this.generatedBy = this.getGeneratedByLabel();
    this.refreshComputedState();
  }

  @ViewChild('customDateFilter') private customDateFilterRef?: ElementRef<HTMLElement>;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isCustomOpen) {
      return;
    }

    const path = event.composedPath();
    const customDateFilter = this.customDateFilterRef?.nativeElement;
    const clickedInsideCustomFilter = !!customDateFilter && path.includes(customDateFilter);
    const clickedInsideDatepicker = path.some(element => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      return !!element.closest('mat-datepicker-content, .mat-datepicker-content, mat-calendar, .mat-calendar');
    });

    if (!clickedInsideCustomFilter && !clickedInsideDatepicker) {
      this.isCustomOpen = false;
      this.requestViewUpdate();
    }
  }

  ngOnInit(): void {
    this.generatedBy = this.getGeneratedByLabel();
    this.updateDepartmentAccessFlags();

    if (!this.restoreViewState()) {
      this.setDefaultDateRange();
    }

    this.refreshComputedState();
    this.loadDepartmentMetadata();
  }

  ngOnDestroy(): void {
    this.activeLoadRunId++;
    this.loadSubscription?.unsubscribe();
    this.metadataSubscription?.unsubscribe();
    this.activeReportRequestKey = null;
    this.activeReportRequestCount = 0;
    this.activeTableRequestKeys.clear();
    this.clearScheduledRebuild();
  }

  canExportSection(section: ReportSection): boolean {
    return !!section?.canExport;
  }

  isSectionExcelExporting(section: ReportSection): boolean {
    return !!section?.excelExporting;
  }

  isSectionPdfExporting(section: ReportSection): boolean {
    return !!section?.pdfExporting;
  }

  private getGeneratedByLabel(): string {
    return this.storageService.getEmpName() || this.storageService.getUsername() || 'System User';
  }

  private refreshComputedState(): void {
    const selectedDepartments = this.getSelectedDepartmentOptions();
    const selectedCount = selectedDepartments.length;
    const isAllDepartmentsSelected = this.isAllDepartmentsSelected(selectedDepartments);

    this.departmentCount = this.departments.length;
    this.displayedActivityCount = this.sections.reduce((total, section) => total + section.filteredRows.length, 0);
    this.hasSectionLoading = this.sections.some(section => section.loading);
    this.isOverallReportLoading = this.metadataLoading || this.hasSectionLoading;
    this.hasSectionErrors = this.sections.some(section => !!section.errorMessage);
    this.canExportOverall = !!this.sections.length
      && !this.hasSectionLoading
      && !this.hasSectionErrors
      && this.sections.some(section => section.filteredRows.length > 0);

    if (isAllDepartmentsSelected) {
      this.selectedDepartmentTriggerLabel = `All Department (${selectedCount} Selected)`;
      this.selectedDepartmentFullLabel = `All Department (${selectedCount} Selected)`;
    } else if (!selectedCount) {
      this.selectedDepartmentTriggerLabel = 'No Departments Selected';
      this.selectedDepartmentFullLabel = 'No Departments Selected';
    } else {
      const visibleNames = selectedDepartments.slice(0, 3).map(department => department.department_name);
      const remainingCount = selectedCount - visibleNames.length;
      this.selectedDepartmentTriggerLabel = remainingCount > 0
        ? `${visibleNames.join(', ')} +${remainingCount}`
        : visibleNames.join(', ');
      this.selectedDepartmentFullLabel = selectedDepartments.map(department => department.department_name).join(', ');
    }

    this.selectedDepartmentLabel = this.selectedDepartmentTriggerLabel;
    this.selectedDepartmentCountLabel = selectedCount
      ? `${selectedCount} ${selectedCount === 1 ? 'Department' : 'Departments'} Selected`
      : 'No Departments Selected';
    this.emptyPageTitle = this.metadataLoading
      ? 'Loading overall performance report'
      : this.managerDepartmentRestricted && !this.departments.length
        ? 'No assigned department found'
        : 'No department reports available';
    this.emptyPageMessage = this.metadataLoading
      ? 'Preparing report data for this tab.'
      : this.managerDepartmentRestricted && !this.departments.length
        ? 'Your manager account does not have a department assigned for this report.'
        : 'Select one or more departments or change the date range to view report data.';
    this.dateRangeLabel = `${this.formatDisplayDate(this.startDate)} to ${this.formatDisplayDate(this.endDate)}`;
    this.dateRangeDisplayLabel = `${this.formatDisplayDate(this.startDate)} - ${this.formatDisplayDate(this.endDate)}`;
    this.selectedPresetLabel = this.datePresets.find(preset => preset.id === this.selectedPreset)?.label || 'Weekly';
  }

  private requestViewUpdate(): void {
    this.refreshComputedState();
    this.cdr.markForCheck();
  }

  onRangeChange(event: { startDate: Date; endDate: Date }): void {
    const nextStartDate = this.formatDateToYMD(event.startDate);
    const nextEndDate = this.formatDateToYMD(event.endDate);

    if (nextStartDate === this.startDate && nextEndDate === this.endDate && (this.hasSectionLoading || this.sections.length)) {
      return;
    }

    this.setSelectedDateRangeValues(event.startDate, event.endDate);
    this.saveViewState();
    this.requestViewUpdate();
    this.loadReportData({ forceRefresh: true, clearExistingData: true });
  }

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value || '';
    this.applySearch();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.applySearch();
  }

  onDepartmentFilterChange(value: any): void {
    if (this.managerDepartmentRestricted) {
      this.selectedDepartmentIds = this.departments.length ? [this.departments[0].filter_id] : [];
      this.departmentSearchTerm = '';
      this.applyDepartmentSearch();
      this.saveViewState();
      this.requestViewUpdate();
      return;
    }

    const selectedValues = Array.isArray(value) ? value.map(item => `${item ?? ''}`) : [];
    const actualDepartmentIds = this.getValidDepartmentIds(selectedValues);
    const hadAllSelected = this.isAllDepartmentsSelected();
    const hasAllSelected = selectedValues.includes(this.allDepartmentsValue);
    let nextDepartmentIds: string[];

    if (hasAllSelected && !hadAllSelected) {
      nextDepartmentIds = this.getAllDepartmentSelectionValues();
    } else if (hadAllSelected && !hasAllSelected && actualDepartmentIds.length === this.departments.length) {
      nextDepartmentIds = [];
    } else if (hasAllSelected && actualDepartmentIds.length < this.departments.length) {
      nextDepartmentIds = actualDepartmentIds;
    } else {
      nextDepartmentIds = actualDepartmentIds;

      if (actualDepartmentIds.length && actualDepartmentIds.length === this.departments.length) {
        nextDepartmentIds = this.getAllDepartmentSelectionValues();
      }
    }

    if (this.areSameStringSets(nextDepartmentIds, this.selectedDepartmentIds)) {
      return;
    }

    this.selectedDepartmentIds = nextDepartmentIds;
    this.departmentSearchTerm = '';
    this.applyDepartmentSearch();
    this.saveViewState();
    this.requestViewUpdate();
    this.loadReportData({ forceRefresh: true, clearExistingData: true });
  }

  filterDepartments(event: Event): void {
    this.departmentSearchTerm = (event.target as HTMLInputElement).value || '';
    this.applyDepartmentSearch();
    this.requestViewUpdate();
  }

  onDepartmentSelectOpened(opened: boolean): void {
    if (!opened) {
      this.departmentSearchTerm = '';
    }

    this.applyDepartmentSearch();
    this.requestViewUpdate();
  }

  onSectionSearch(section: ReportSection, event: Event): void {
    const searchTerm = (event.target as HTMLInputElement).value || '';
    this.replaceSection(section.id, currentSection => ({
      ...currentSection,
      searchTerm,
      pageIndex: 0
    }));
  }

  clearSectionSearch(section: ReportSection): void {
    this.replaceSection(section.id, currentSection => ({
      ...currentSection,
      searchTerm: '',
      pageIndex: 0
    }));
  }

  onPageSizeChange(section: ReportSection, event: Event): void {
    const nextPageSize = Number((event.target as HTMLSelectElement).value);
    if (!this.pageSizeOptions.includes(nextPageSize)) {
      return;
    }

    this.replaceSection(section.id, currentSection => ({
      ...currentSection,
      pageSize: nextPageSize,
      pageIndex: 0
    }));
  }

  goToPage(section: ReportSection, pageIndex: number): void {
    this.replaceSection(section.id, currentSection => ({
      ...currentSection,
      pageIndex: Math.max(0, Math.min(currentSection.totalPages - 1, pageIndex))
    }));
  }

  sortByColumn(section: ReportSection, columnIndex: number): void {
    this.replaceSection(section.id, currentSection => ({
      ...currentSection,
      sortColumnIndex: currentSection.sortColumnIndex === columnIndex ? currentSection.sortColumnIndex : columnIndex,
      sortDirection: currentSection.sortColumnIndex === columnIndex
        ? (currentSection.sortDirection === 'asc' ? 'desc' : 'asc')
        : 'asc',
      pageIndex: 0
    }));
  }

  refresh(): void {
    this.loadReportData({ forceRefresh: true });
  }

  selectPreset(preset: DatePreset): void {
    this.selectedPreset = preset;

    if (preset === 'custom') {
      this.isCustomOpen = !this.isCustomOpen;
      this.requestViewUpdate();
      return;
    } 
    this.isCustomOpen = false;
    const range = this.getPresetDateRange(preset);
    this.updateSelectedDateRange(range.startDate, range.endDate);
  }

  applyCustomFilter(): void {
    if (!this.filterStartDate || !this.filterEndDate) {
      return;
    }

    this.selectedPreset = 'custom';
    this.isCustomOpen = false;
    this.updateSelectedDateRange(this.filterStartDate, this.filterEndDate);
  }

  exportExcel(): void {
    const exportSections = this.getExportableSections();

    if (this.excelExporting) {
      return;
    }

    if (!this.canExportOverall || !exportSections.length) {
      this.toasterService.error('No report data available for Excel export');
      return;
    }

    this.excelExporting = true;
    this.requestViewUpdate();
    window.setTimeout(() => {
      try {
        this.excelService.generateOverallPerformanceExcel(
          {
            generatedBy: this.generatedBy,
            fromDate: this.startDate,
            toDate: this.endDate,
            selectedCompany: this.selectedDepartmentFullLabel,
            totalDepartments: this.getSelectedDepartmentOptions().length,
            separateSheets: true,
            filename: this.buildOverallExportFilename('xlsx')
          },
          this.buildExcelSections(exportSections)
        );
        this.toasterService.success('Excel downloaded successfully');
      } catch (error) {
        console.error('Overall performance Excel error:', error);
        this.toasterService.error('Unable to generate Excel report');
      } finally {
        this.excelExporting = false;
        this.requestViewUpdate();
      }
    });
  }

  exportPdf(): void {
    const exportSections = this.getExportableSections();

    if (this.pdfExporting) {
      return;
    }

    if (!this.canExportOverall || !exportSections.length) {
      this.toasterService.error('No report data available for PDF export');
      return;
    }

    this.pdfExporting = true;
    this.requestViewUpdate();
    window.setTimeout(() => {
      try {
        this.exportPdfSections(
          exportSections,
          this.buildOverallExportFilename('pdf'),
          'Overall Department Performance Report'
        );
      } finally {
        this.pdfExporting = false;
        this.requestViewUpdate();
      }
    });
  }

  exportSectionExcel(section: ReportSection): void {
    if (this.isSectionExcelExporting(section)) {
      return;
    }

    if (!section || !this.canExportSection(section)) {
      this.toasterService.error('No report data available for Excel export');
      return;
    }

    this.setSectionExporting(section, 'excel', true);
    window.setTimeout(() => {
      try {
        this.excelService.generateOverallPerformanceSectionExcel(
          {
            generatedBy: this.generatedBy,
            fromDate: this.startDate,
            toDate: this.endDate,
            filename: this.buildSectionExportFilename(section, 'xlsx')
          },
          this.buildExcelSections([section])[0]
        );
        this.toasterService.success('Excel downloaded successfully');
      } catch (error) {
        console.error('Table-wise performance Excel error:', error);
        this.toasterService.error('Unable to generate Excel report');
      } finally {
        this.setSectionExporting(section, 'excel', false);
      }
    });
  }

  exportSectionPdf(section: ReportSection): void {
    if (this.isSectionPdfExporting(section)) {
      return;
    }

    if (!section || !this.canExportSection(section)) {
      this.toasterService.error('No report data available for PDF export');
      return;
    }

    this.setSectionExporting(section, 'pdf', true);
    window.setTimeout(() => {
      try {
        this.exportPdfSections(
          [section],
          this.buildSectionExportFilename(section, 'pdf'),
          `${section.departmentName} ${section.reportTitle}`
        );
      } finally {
        this.setSectionExporting(section, 'pdf', false);
      }
    });
  }

  retrySection(section: ReportSection): void {
    const department = this.departments.find(item => item.filter_id === section.departmentId)
      || this.departmentReportData.find(item => item.department.filter_id === section.departmentId)?.department;

    if (!department) {
      return;
    }

    if (this.managerDepartmentRestricted && !this.isDepartmentOptionAccessible(department)) {
      this.toasterService.error('You can view only your assigned department report');
      return;
    }

    const employeeId = Number(this.storageService.getEmpId() || 0);
    const reportCacheKey = this.buildReportCacheKey(employeeId, this.getReportDepartmentOptions());
    this.activeReportRequestKey = reportCacheKey;

    if (section.reportKind === 'release') {
      this.loadReleaseReportData(employeeId, department, this.activeLoadRunId, reportCacheKey);
      return;
    }

    this.loadDashboardReportData(employeeId, department, this.activeLoadRunId, reportCacheKey);
  }

  private isSectionExporting(section: ReportSection, exportKind: ExportKind): boolean {
    return !!this.sectionExportingState[section.id]?.[exportKind];
  }

  private setSectionExporting(section: ReportSection, exportKind: ExportKind, exporting: boolean): void {
    const currentSectionState = this.sectionExportingState[section.id] || {};

    if (exporting) {
      this.sectionExportingState = {
        ...this.sectionExportingState,
        [section.id]: {
          ...currentSectionState,
          [exportKind]: true
        }
      };
      this.refreshSectionExportState(section.id);
      return;
    }

    const nextSectionState = { ...currentSectionState };
    delete nextSectionState[exportKind];

    if (Object.keys(nextSectionState).length) {
      this.sectionExportingState = {
        ...this.sectionExportingState,
        [section.id]: nextSectionState
      };
      this.refreshSectionExportState(section.id);
      return;
    }

    const nextExportingState = { ...this.sectionExportingState };
    delete nextExportingState[section.id];
    this.sectionExportingState = nextExportingState;
    this.refreshSectionExportState(section.id);
  }

  private refreshSectionExportState(sectionId: string): void {
    this.sections = this.sections.map(section => section.id === sectionId ? this.decorateSection(section) : section);
    this.requestViewUpdate();
  }

  private exportPdfSections(exportSections: ReportSection[], filename: string, reportTitle: string): void {
    const jsPdfCtor = (window as any).jspdf?.jsPDF;
    if (!jsPdfCtor) {
      this.toasterService.error('PDF export library is not available');
      return;
    }

    try {
      const doc = new jsPdfCtor('l', 'mm', 'a3');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      this.drawPdfPageHeader(doc, pageWidth, exportSections, reportTitle);
      let cursorY = 42;

      exportSections.forEach((section, sectionIndex) => {
        if (sectionIndex > 0) {
          doc.addPage();
          cursorY = 18;
        }

        if (this.shouldShowDepartmentHeadingInList(exportSections, sectionIndex, section)) {
          this.drawPdfDepartmentHeading(doc, section, cursorY, pageWidth);
          cursorY += 13;
        }

        this.drawPdfSectionHeader(doc, section, cursorY, pageWidth);
        cursorY += 19;

        this.drawPdfSummaryCards(doc, section, cursorY, pageWidth);
        cursorY += 16;

        (doc as any).autoTable({
          startY: cursorY,
          head: [section.columns],
          body: section.filteredRows.length
            ? section.filteredRows.map(row => row.cells)
            : [[section.emptyMessage, ...Array(Math.max(section.columns.length - 1, 0)).fill('')]],
          theme: 'grid',
          styles: {
            fontSize: 7,
            cellPadding: 1.7,
            overflow: 'linebreak',
            valign: 'middle',
            lineColor: [226, 232, 240],
            lineWidth: 0.15,
            textColor: [30, 41, 59]
          },
          headStyles: {
            fillColor: section.accent,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
            cellPadding: 1.8,
            overflow: 'linebreak'
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          margin: { top: 10, left: 14, right: 14, bottom: 16 },
          didParseCell: (data: any) => {
            this.applyPdfSemanticCellStyle(data, section);
          },
          willDrawCell: (data: any) => {
            this.applyPdfSemanticCellStyle(data, section);
          },
          didDrawPage: () => {
            const pageNumber = doc.internal.getNumberOfPages();
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.2);
            doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Generated ${this.generatedAt.toLocaleString()}`, 14, pageHeight - 8);
            doc.text(`Page ${pageNumber}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
            doc.setTextColor(0);
          }
        });
      });

      doc.save(filename);
      this.toasterService.success('PDF downloaded successfully');
    } catch (error) {
      console.error('Overall performance PDF error:', error);
      this.toasterService.error('Unable to generate PDF report');
    }
  }

  trackBySection(_index: number, section: ReportSection): string {
    return section.id;
  }

  trackByDepartment(_index: number, department: DepartmentOption): string {
    return department.filter_id;
  }

  trackByDatePreset(_index: number, preset: { id: DatePreset; label: string }): DatePreset {
    return preset.id;
  }

  trackByColumnView(_index: number, column: ReportColumnView): string {
    return `${column.index}-${column.label}`;
  }

  trackByRow(_index: number, row: ReportRow): string {
    return row.id;
  }

  trackByCell(index: number, cell: ReportCell): string {
    return `${index}-${cell.value}`;
  }

  trackBySummary(_index: number, item: SummaryCard): string {
    return item.label;
  }

  trackByPage(_index: number, page: number): number {
    return page;
  }

  isChipColumn(column: string): boolean {
    const key = this.normalizeStatusKey(column);
    return ['status', 'result', 'priority', 'category', 'releasetype', 'testingtype', 'releaseperformance', 'overduestatus'].includes(key);
  }

  getChipClass(value: any): string {
    const key = this.normalizeStatusKey(value);
    if (['pass', 'passed', 'completed', 'approved', 'closed', 'production', 'excellent'].includes(key)) return 'status-chip--success';
    if (['failed', 'rejected', 'cancelled', 'canceled', 'poor', 'overdue'].includes(key)) return 'status-chip--danger';
    if (['inprogress', 'testing', 'intesting', 'tobetested', 'service'].includes(key)) return 'status-chip--info';
    if (['good'].includes(key)) return 'status-chip--info';
    if (
      ['open', 'pending', 'onhold', 'delayed', 'upcoming', 'upcomingrelease', 'ordinary', 'reopen', 'reopened', 'duetoday', 'duetomorrow'].includes(key)
      || key.startsWith('duein')
    ) return 'status-chip--warning';
    return 'status-chip--neutral';
  }

  private setDefaultDateRange(): void {
    const range = this.getCurrentWeekRange();
    this.selectedPreset = 'weekly';
    this.setSelectedDateRangeValues(range.startDate, range.endDate);
  }

  private getPresetDateRange(preset: Exclude<DatePreset, 'custom'>): { startDate: Date; endDate: Date } {
    if (preset === 'weekly') {
      return this.getCurrentWeekRange();
    }

    if (preset === 'bi-weekly') {
      return this.getCurrentWeekRange(14);
    }

    return this.getCurrentMonthRange();
  }

  private getCurrentWeekRange(days = 7, referenceDate = new Date()): { startDate: Date; endDate: Date } {
    const day = referenceDate.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const startDate = new Date(referenceDate);
    startDate.setDate(referenceDate.getDate() + diffToMonday);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + days - 1);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  private getCurrentMonthRange(referenceDate = new Date()): { startDate: Date; endDate: Date } {
    const startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  private updateSelectedDateRange(startDate: Date, endDate: Date): void {
    const currentStartDate = this.startDate;
    const currentEndDate = this.endDate;
    this.setSelectedDateRangeValues(startDate, endDate);

    if (this.startDate === currentStartDate && this.endDate === currentEndDate && (this.hasSectionLoading || this.sections.length)) {
      this.requestViewUpdate();
      return;
    }

    this.saveViewState();
    this.requestViewUpdate();
    this.loadReportData({ forceRefresh: true, clearExistingData: true });
  }

  private setSelectedDateRangeValues(startDate: Date, endDate: Date): void {
    const normalizedRange = this.normalizeDateRange(startDate, endDate);
    this.filterStartDate = normalizedRange.startDate;
    this.filterEndDate = normalizedRange.endDate;
    this.startDate = this.formatDateToYMD(normalizedRange.startDate);
    this.endDate = this.formatDateToYMD(normalizedRange.endDate);
  }

  private normalizeDateRange(startDate: Date, endDate: Date): { startDate: Date; endDate: Date } {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const normalizedStart = start <= end ? start : end;
    const normalizedEnd = start <= end ? end : start;

    normalizedStart.setHours(0, 0, 0, 0);
    normalizedEnd.setHours(23, 59, 59, 999);

    return { startDate: normalizedStart, endDate: normalizedEnd };
  }

  private loadDepartmentMetadata(): void {
    this.metadataSubscription?.unsubscribe();

    if (this.restoreMetadataCache()) {
      this.loadReportData();
      return;
    }

    this.metadataLoading = true;
    this.requestViewUpdate();

    this.metadataSubscription = forkJoin({
      departments: this.authService.getAllDepartments().pipe(catchError(error => {
        console.error('Overall performance department metadata load error:', error);
        this.toasterService.error('Unable to load departments');
        return of([]);
      })),
      employees: this.authService.getUsersAll(Number(this.storageService.getEmpId() || 0)).pipe(catchError(error => {
        console.error('Overall performance employee metadata load error:', error);
        return of([]);
      }))
    }).subscribe({
      next: ({ departments, employees }) => {
        this.departmentList = this.extractResponseList(departments, [
          'departments',
          'departmentList',
          'data',
          'details'
        ]);
        this.employeeList = this.extractResponseList(employees, [
          'employees',
          'users',
          'data',
          'details'
        ]);
        this.metadataLoaded = true;
        this.refreshDepartmentOptions(false);
        this.saveMetadataCache();
        this.saveViewState();
        this.metadataLoading = false;
        this.loadReportData();
        this.requestViewUpdate();
      },
      error: error => {
        console.error('Overall performance metadata load error:', error);
        this.metadataLoaded = true;
        this.departmentList = [];
        this.employeeList = [];
        this.refreshDepartmentOptions(false);
        this.metadataLoading = false;
        this.requestViewUpdate();
      }
    });
  }

  private restoreMetadataCache(): boolean {
    const cache = OverallPerformanceReportComponent.metadataCache
      || this.readSessionCache<OverallPerformanceMetadataCache>(OverallPerformanceReportComponent.metadataCacheStorageKey);

    if (!cache) {
      return false;
    }

    this.departmentList = Array.isArray(cache.departmentList) ? cache.departmentList : [];
    this.employeeList = Array.isArray(cache.employeeList) ? cache.employeeList : [];
    this.metadataLoaded = true;
    this.metadataLoading = false;
    this.refreshDepartmentOptions(false);
    OverallPerformanceReportComponent.metadataCache = {
      departmentList: this.departmentList,
      employeeList: this.employeeList
    };
    this.saveViewState();
    this.requestViewUpdate();

    return true;
  }

  private saveMetadataCache(): void {
    const cache: OverallPerformanceMetadataCache = {
      departmentList: this.departmentList,
      employeeList: this.employeeList
    };

    OverallPerformanceReportComponent.metadataCache = cache;
    this.writeSessionCache(OverallPerformanceReportComponent.metadataCacheStorageKey, cache);
  }

  private restoreReportCache(reportCacheKey: string, selectedDepartments: DepartmentOption[]): boolean {
    const cache = this.getReportCacheEntry(reportCacheKey);

    if (!cache) {
      return false;
    }

    const departmentsById = new Map(selectedDepartments.map(department => [department.filter_id, department]));
    const cachedReports = Array.isArray(cache.departmentReportData) ? cache.departmentReportData : [];

    if (cachedReports.length !== selectedDepartments.length) {
      return false;
    }

    if (cachedReports.some(report => !departmentsById.has(report.department?.filter_id))) {
      return false;
    }

    const loadRunId = ++this.activeLoadRunId;
    this.loadSubscription?.unsubscribe();
    if (loadRunId !== this.activeLoadRunId) {
      return false;
    }

    this.loadSubscription = undefined;
    this.activeReportRequestKey = null;
    this.activeReportRequestCount = 0;
    this.activeTableRequestKeys.clear();
    this.tableLoadingState = {};
    this.tableErrorState = {};
    this.departmentReportData = cachedReports.map(report => ({
      ...report,
      department: departmentsById.get(report.department.filter_id) || report.department
    }));
    this.generatedAt = this.parseCacheDate(cache.generatedAt);
    this.clearScheduledRebuild();
    this.rebuildSections();

    return true;
  }

  private saveReportCache(reportCacheKey: string): void {
    if (!this.departmentReportData.length || this.hasTableErrors()) {
      return;
    }

    const cache: OverallPerformanceReportCacheEntry = {
      generatedAt: this.generatedAt.toISOString(),
      departmentReportData: this.departmentReportData
    };

    OverallPerformanceReportComponent.reportCache.set(reportCacheKey, cache);
    this.writeSessionCache(
      this.getReportStorageKey(reportCacheKey),
      cache,
      this.maxSessionCacheCharacters
    );
  }

  private clearReportCache(reportCacheKey: string): void {
    OverallPerformanceReportComponent.reportCache.delete(reportCacheKey);

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(this.getReportStorageKey(reportCacheKey));
      }
    } catch {
      // Cache cleanup is best-effort.
    }
  }

  private getReportCacheEntry(reportCacheKey: string): OverallPerformanceReportCacheEntry | null {
    const memoryCache = OverallPerformanceReportComponent.reportCache.get(reportCacheKey);

    if (memoryCache) {
      return memoryCache;
    }

    const sessionCache = this.readSessionCache<OverallPerformanceReportCacheEntry>(
      this.getReportStorageKey(reportCacheKey)
    );

    if (sessionCache) {
      OverallPerformanceReportComponent.reportCache.set(reportCacheKey, sessionCache);
    }

    return sessionCache;
  }

  private readSessionCache<T>(storageKey: string): T | null {
    try {
      if (typeof sessionStorage === 'undefined') {
        return null;
      }

      const raw = sessionStorage.getItem(storageKey);
      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private writeSessionCache(storageKey: string, value: unknown, maxCharacters = 250_000): void {
    try {
      if (typeof sessionStorage === 'undefined') {
        return;
      }

      const serialized = JSON.stringify(value);
      if (serialized.length > maxCharacters) {
        return;
      }

      sessionStorage.setItem(storageKey, serialized);
    } catch {
      // Cache writes are best-effort; the report still works when browser storage is full.
    }
  }

  private getReportStorageKey(reportCacheKey: string): string {
    return `${OverallPerformanceReportComponent.reportCacheStoragePrefix}${encodeURIComponent(reportCacheKey)}`;
  }

  private restoreViewState(): boolean {
    const state = OverallPerformanceReportComponent.viewState
      || this.readSessionCache<OverallPerformanceViewState>(OverallPerformanceReportComponent.viewStateStorageKey);

    if (!state || !state.startDate || !state.endDate) {
      return false;
    }

    const startDate = this.parseYMDDate(state.startDate);
    const endDate = this.parseYMDDate(state.endDate, true);

    if (!startDate || !endDate) {
      return false;
    }

    this.selectedDepartmentIds = Array.isArray(state.selectedDepartmentIds) && state.selectedDepartmentIds.length
      ? [...state.selectedDepartmentIds]
      : [this.allDepartmentsValue];
    this.selectedPreset = state.selectedPreset || 'weekly';
    this.setSelectedDateRangeValues(startDate, endDate);
    OverallPerformanceReportComponent.viewState = this.getCurrentViewState();

    return true;
  }

  private saveViewState(): void {
    if (!this.startDate || !this.endDate) {
      return;
    }

    const state = this.getCurrentViewState();
    OverallPerformanceReportComponent.viewState = state;
    this.writeSessionCache(OverallPerformanceReportComponent.viewStateStorageKey, state);
  }

  private getCurrentViewState(): OverallPerformanceViewState {
    return {
      selectedDepartmentIds: [...this.selectedDepartmentIds],
      startDate: this.startDate,
      endDate: this.endDate,
      selectedPreset: this.selectedPreset
    };
  }

  private parseYMDDate(value: string, endOfDay = false): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return date;
  }

  private parseCacheDate(value: string): Date {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private buildReportCacheKey(employeeId: number, selectedDepartments: DepartmentOption[]): string {
    return JSON.stringify({
      employeeId,
      accessScope: this.getDepartmentAccessCacheScope(),
      startDate: this.startDate,
      endDate: this.endDate,
      departments: selectedDepartments.map(department => ({
        filterId: department.filter_id,
        apiId: `${this.getDepartmentRequestApiValue(department) ?? ''}`,
        scope: this.isSqaDepartment(department) ? 'assigned-to-department' : 'department'
      }))
    });
  }

  private buildTableRequestKey(employeeId: number, department: DepartmentOption, requestKind: ReportKind | 'dashboard'): string {
    return JSON.stringify({
      employeeId,
      startDate: this.startDate,
      endDate: this.endDate,
      departmentId: department.filter_id,
      requestKind
    });
  }

  private getDepartmentAccessCacheScope(): string {
    if (!this.managerDepartmentRestricted) {
      return 'all-departments';
    }

    const department = this.departments[0];
    return `manager:${department?.filter_id || 'unassigned'}`;
  }

  private finishReportRequest(loadRunId: number, reportCacheKey: string, requestKey: string): void {
    this.activeTableRequestKeys.delete(requestKey);

    if (loadRunId !== this.activeLoadRunId || this.activeReportRequestKey !== reportCacheKey) {
      return;
    }

    this.activeReportRequestCount = Math.max(0, this.activeReportRequestCount - 1);

    if (this.activeReportRequestCount > 0) {
      return;
    }

    this.activeReportRequestKey = null;
    this.saveReportCache(reportCacheKey);
  }

  private hasTableErrors(): boolean {
    return Object.values(this.tableErrorState).some(departmentErrors =>
      Object.values(departmentErrors).some(errorMessage => !!errorMessage)
    );
  }

  private scheduleRebuildSections(): void {
    if (this.rebuildSectionsTimeoutId !== null) {
      return;
    }

    this.rebuildSectionsTimeoutId = window.setTimeout(() => {
      this.rebuildSectionsTimeoutId = null;
      this.rebuildSections();
    });
  }

  private clearScheduledRebuild(): void {
    if (this.rebuildSectionsTimeoutId === null) {
      return;
    }

    window.clearTimeout(this.rebuildSectionsTimeoutId);
    this.rebuildSectionsTimeoutId = null;
  }

  private flushScheduledRebuild(): void {
    if (this.rebuildSectionsTimeoutId === null) {
      return;
    }

    window.clearTimeout(this.rebuildSectionsTimeoutId);
    this.rebuildSectionsTimeoutId = null;
    this.rebuildSections();
  }

  private extractResponseList(response: any, keys: string[]): any[] {
    if (Array.isArray(response)) {
      return response;
    }

    for (const key of keys) {
      if (Array.isArray(response?.[key])) {
        return response[key];
      }
    }

    return [];
  }

  private refreshDepartmentOptions(reloadOnSelectionChange = true): void {
    this.updateDepartmentAccessFlags();
    this.departments = this.applyDepartmentAccessRestriction(this.normalizeDepartmentOptions(this.departmentList));

    if (this.managerDepartmentRestricted) {
      this.departmentSearchTerm = '';
    }

    this.applyDepartmentSearch();

    if (this.managerDepartmentRestricted) {
      const restrictedSelection = this.departments.length ? [this.departments[0].filter_id] : [];
      const selectionChanged = !this.areSameStringSets(restrictedSelection, this.selectedDepartmentIds);
      this.selectedDepartmentIds = restrictedSelection;

      if (selectionChanged && this.metadataLoaded && reloadOnSelectionChange) {
        this.saveViewState();
        this.loadReportData({ forceRefresh: true, clearExistingData: true });
      }

      return;
    }

    if (this.selectedDepartmentIds.includes(this.allDepartmentsValue)) {
      this.selectedDepartmentIds = this.getAllDepartmentSelectionValues();
      return;
    }

    const validSelectedIds = this.getValidDepartmentIds(this.selectedDepartmentIds);

    if (!validSelectedIds.length || validSelectedIds.length !== this.selectedDepartmentIds.length) {
      this.selectedDepartmentIds = validSelectedIds;

      if (this.metadataLoaded && reloadOnSelectionChange) {
        this.loadReportData({ forceRefresh: true, clearExistingData: true });
      }
    }
  }

  private applyDepartmentSearch(): void {
    const searchValue = this.normalizeSearchText(this.departmentSearchTerm);
    this.filteredDepartments = searchValue
      ? this.departments.filter(department => this.normalizeSearchText(department.department_name).includes(searchValue))
      : [...this.departments];
  }

  private normalizeDepartmentOptions(list: any[]): DepartmentOption[] {
    const seen = new Set<string>();
    const options: DepartmentOption[] = [];

    (Array.isArray(list) ? list : []).forEach(department => {
      const id = this.firstPresent(
        department?.id,
        department?.department_id,
        department?.departmentId,
        department?.departmentid,
        department?.dept_id,
        department?.deptId,
        department?.deptid
      );
      const name = this.firstPresent(
        department?.department_name,
        department?.departmentName,
        department?.dept_name,
        department?.deptName,
        department?.name,
        department?.title,
        department?.label
      );
      const filterId = this.firstPresent(id, name);

      if (!filterId || !name) {
        return;
      }

      const key = `${filterId}`.trim().toLowerCase();
      if (!key || seen.has(key)) {
        return;
      }

      seen.add(key);
      options.push({
        ...department,
        raw: department,
        api_id: id ?? filterId,
        filter_id: `${filterId}`,
        department_name: `${name}`.trim()
      });
    });

    return this.sortDepartmentsForReport(options);
  }

  private updateDepartmentAccessFlags(): void {
    const roles = this.storageService.roles;
    this.managerDepartmentRestricted = !!roles?.isManager && !roles?.isAdmin;
    this.canSelectAllDepartments = !this.managerDepartmentRestricted;
    this.isDepartmentSelectionLocked = this.managerDepartmentRestricted;
    this.departmentFilterPlaceholder = this.managerDepartmentRestricted ? 'Manager Department' : 'All Department';
    this.noDepartmentOptionMessage = this.managerDepartmentRestricted
      ? 'No assigned department found'
      : 'No departments found';
  }

  private applyDepartmentAccessRestriction(departments: DepartmentOption[]): DepartmentOption[] {
    if (!this.managerDepartmentRestricted) {
      return departments;
    }

    const managerDepartmentKeys = this.getLoggedInDepartmentKeys();
    const scopedDepartments = departments.filter(department =>
      this.doFilterKeysOverlap(this.getDepartmentOptionKeys(department), managerDepartmentKeys)
    );

    if (scopedDepartments.length) {
      return scopedDepartments.slice(0, 1);
    }

    const fallbackDepartment = this.buildLoggedInDepartmentFallbackOption();
    return fallbackDepartment ? [fallbackDepartment] : [];
  }

  private getLoggedInDepartmentKeys(): string[] {
    return this.normalizeFilterKeys(this.getLoggedInDepartmentValues());
  }

  private getLoggedInDepartmentValues(): any[] {
    const user = this.storageService.getUser() || {};
    const loggedInEmployee = this.findLoggedInEmployee();
    const values: any[] = [this.storageService.getDept()];

    [user, loggedInEmployee].forEach(source => {
      if (!source || typeof source !== 'object') {
        return;
      }

      values.push(
        source?.department,
        source?.dept,
        source?.team,
        source?.department_id,
        source?.departmentId,
        source?.departmentid,
        source?.dept_id,
        source?.deptId,
        source?.deptid,
        source?.department_name,
        source?.departmentName,
        source?.dept_name,
        source?.deptName,
        source?.team_name,
        source?.teamName
      );
      values.push(...this.collectDepartmentValues(source?.department));
      values.push(...this.collectDepartmentValues(source?.dept));
      values.push(...this.collectDepartmentValues(source?.team));
    });

    return values;
  }

  private findLoggedInEmployee(): any | null {
    const user = this.storageService.getUser() || {};
    const empId = this.firstPresent(
      this.storageService.getEmpId(),
      user?.empid,
      user?.emp_id,
      user?.empId,
      user?.employee_id,
      user?.employeeId,
      user?.id,
      user?.user_id,
      user?.userId
    );
    const username = this.firstPresent(
      this.storageService.getUsername(),
      user?.username,
      user?.user_name,
      user?.email,
      user?.employee_name,
      user?.employeeName,
      user?.name
    );

    return this.employeeList.find(employee => {
      const employeeId = this.firstPresent(
        employee?.empid,
        employee?.emp_id,
        employee?.empId,
        employee?.employee_id,
        employee?.employeeId,
        employee?.id,
        employee?.user_id,
        employee?.userId
      );
      const employeeName = this.firstPresent(
        employee?.username,
        employee?.user_name,
        employee?.email,
        employee?.employee_name,
        employee?.employeeName,
        employee?.name
      );
      const idMatches = this.isSameId(empId, employeeId);
      const nameMatches = this.isPresent(username) && this.isPresent(employeeName)
        && this.normalizeSearchText(username) === this.normalizeSearchText(employeeName);

      return idMatches || nameMatches;
    }) || null;
  }

  private buildLoggedInDepartmentFallbackOption(): DepartmentOption | null {
    const user = this.storageService.getUser() || {};
    const department = this.firstPresent(user?.department, user?.dept, user?.team, this.storageService.getDept());
    const id = this.firstPresent(
      this.extractDepartmentId(department),
      user?.department_id,
      user?.departmentId,
      user?.departmentid,
      user?.dept_id,
      user?.deptId,
      user?.deptid
    );
    const name = this.firstPresent(
      this.extractDepartmentName(department),
      user?.department_name,
      user?.departmentName,
      user?.dept_name,
      user?.deptName,
      user?.team_name,
      user?.teamName,
      typeof department === 'string' && department !== '[object Object]' ? department : null,
      id
    );
    const filterId = this.firstPresent(id, name);

    if (!filterId || !name) {
      return null;
    }

    return {
      raw: department || user,
      api_id: id ?? filterId,
      filter_id: `${filterId}`,
      department_name: `${name}`.trim()
    };
  }

  private extractDepartmentId(value: any): any {
    if (!value || typeof value !== 'object') {
      return null;
    }

    return this.firstPresent(
      value?.id,
      value?.department_id,
      value?.departmentId,
      value?.departmentid,
      value?.dept_id,
      value?.deptId,
      value?.deptid
    );
  }

  private extractDepartmentName(value: any): any {
    if (!value || typeof value !== 'object') {
      return null;
    }

    return this.firstPresent(
      value?.department_name,
      value?.departmentName,
      value?.dept_name,
      value?.deptName,
      value?.team_name,
      value?.teamName,
      value?.name,
      value?.title,
      value?.label
    );
  }

  private doFilterKeysOverlap(first: string[], second: string[]): boolean {
    if (!first.length || !second.length) {
      return false;
    }

    const secondKeys = new Set(second);
    return first.some(key => secondKeys.has(key));
  }

  private isDepartmentOptionAccessible(department: DepartmentOption): boolean {
    if (!this.managerDepartmentRestricted) {
      return true;
    }

    const allowedDepartment = this.departments[0];
    return !!allowedDepartment && allowedDepartment.filter_id === department.filter_id;
  }

  private loadReportData(options: LoadReportOptions = {}): void {
    if (!this.metadataLoaded) {
      return;
    }

    const employeeId = Number(this.storageService.getEmpId() || 0);
    const selectedDepartments = this.getReportDepartmentOptions();
    const reportCacheKey = this.buildReportCacheKey(employeeId, selectedDepartments);
    const forceRefresh = !!options.forceRefresh;

    if (!selectedDepartments.length) {
      this.departmentReportData = [];
      this.sections = [];
      this.tableLoadingState = {};
      this.tableErrorState = {};
      this.departmentRecordCountById = {};
      this.activeReportRequestKey = null;
      this.activeReportRequestCount = 0;
      this.activeTableRequestKeys.clear();
      this.saveViewState();
      this.requestViewUpdate();
      return;
    }

    if (!forceRefresh && this.activeReportRequestKey === reportCacheKey && this.hasSectionLoading) {
      return;
    }

    if (!forceRefresh && this.restoreReportCache(reportCacheKey, selectedDepartments)) {
      return;
    }

    const loadRunId = ++this.activeLoadRunId;
    this.loadSubscription?.unsubscribe();
    this.loadSubscription = new Subscription();
    this.activeReportRequestKey = reportCacheKey;
    this.activeReportRequestCount = 0;
    this.activeTableRequestKeys.clear();
    this.generatedAt = new Date();
    this.saveViewState();
    this.clearReportCache(reportCacheKey);

    this.prepareDepartmentReportsForLoad(selectedDepartments, !options.clearExistingData);
    this.rebuildSections();

    selectedDepartments.forEach(department => {
      const applicableKinds = this.getApplicableReportKinds(department);

      if (applicableKinds.includes('release')) {
        this.loadReleaseReportData(employeeId, department, loadRunId, reportCacheKey);
      }

      if (applicableKinds.some(kind => kind !== 'release')) {
        this.loadDashboardReportData(employeeId, department, loadRunId, reportCacheKey);
      }
    });
  }

  private loadReleaseReportData(
    employeeId: number,
    department: DepartmentOption,
    loadRunId: number,
    reportCacheKey: string
  ): void {
    const departmentId = this.getDepartmentRequestApiValue(department);
    const managerName = this.shouldUseManagerBasedDepartmentScope() && !this.isSqaDepartment(department)
      ? this.getDepartmentManagerNameParam(department)
      : '';
    const sectionKey = this.getDepartmentSectionStateKey(department);
    const requestKey = this.buildTableRequestKey(employeeId, department, 'release');

    if (this.activeTableRequestKeys.has(requestKey)) {
      return;
    }

    this.activeTableRequestKeys.add(requestKey);
    this.activeReportRequestCount++;
    this.setTableError(sectionKey, 'release', '');
    this.setTableLoading(sectionKey, 'release', true);

    const subscription = this.authService
      .getReleaseOverviewListByEmp(this.getReleaseOverviewPayload(employeeId, departmentId, managerName))
      .pipe(finalize(() => {
        if (loadRunId === this.activeLoadRunId) {
          this.flushScheduledRebuild();
          this.setTableLoading(sectionKey, 'release', false);
        }
        this.finishReportRequest(loadRunId, reportCacheKey, requestKey);
      }))
      .subscribe({
        next: releases => {
          if (loadRunId !== this.activeLoadRunId) {
            return;
          }

          this.patchDepartmentReportData(department, {
            releaseOverviewRows: this.normalizeReleaseOverviewResponse(releases),
            releaseOverviewLoaded: true,
            releaseLoadFailed: false,
            loadFailed: false
          });
          this.scheduleRebuildSections();
        },
        error: error => {
          if (loadRunId !== this.activeLoadRunId) {
            return;
          }

          console.error(`Overall performance release load error for ${department.department_name}:`, error);
          this.patchDepartmentReportData(department, {
            releaseOverviewLoaded: false,
            releaseLoadFailed: true,
            loadFailed: true
          });
          this.setTableError(sectionKey, 'release', 'Unable to load Release Report.');
          this.scheduleRebuildSections();
        }
      });

    this.loadSubscription?.add(subscription);
  }

  private loadDashboardReportData(
    employeeId: number,
    department: DepartmentOption,
    loadRunId: number,
    reportCacheKey: string
  ): void {
    const departmentId = this.getDepartmentRequestApiValue(department);
    const managerName = this.shouldUseManagerBasedDepartmentScope() && !this.isSqaDepartment(department)
      ? this.getDepartmentManagerNameParam(department)
      : '';
    const sectionKey = this.getDepartmentSectionStateKey(department);
    const affectedKinds = this.getApplicableReportKinds(department).filter(kind => kind !== 'release');
    const requestKey = this.buildTableRequestKey(employeeId, department, 'dashboard');

    if (this.activeTableRequestKeys.has(requestKey)) {
      return;
    }

    this.activeTableRequestKeys.add(requestKey);
    this.activeReportRequestCount++;

    affectedKinds.forEach(kind => {
      this.setTableError(sectionKey, kind, '');
      this.setTableLoading(sectionKey, kind, true);
    });

    const subscription = this.authService
      .getDashboardDetailsByEmployeeId(employeeId, 0, this.startDate, this.endDate, departmentId, managerName)
      .pipe(finalize(() => {
        if (loadRunId === this.activeLoadRunId) {
          this.flushScheduledRebuild();
          affectedKinds.forEach(kind => this.setTableLoading(sectionKey, kind, false));
        }
        this.finishReportRequest(loadRunId, reportCacheKey, requestKey);
      }))
      .subscribe({
        next: dashboard => {
          if (loadRunId !== this.activeLoadRunId) {
            return;
          }

          this.patchDepartmentReportData(department, {
            dashboardData: dashboard || {},
            dashboardLoadFailed: false,
            loadFailed: false
          });
          this.scheduleRebuildSections();
        },
        error: error => {
          if (loadRunId !== this.activeLoadRunId) {
            return;
          }

          console.error(`Overall performance dashboard load error for ${department.department_name}:`, error);
          this.patchDepartmentReportData(department, {
            dashboardLoadFailed: true,
            loadFailed: true
          });
          affectedKinds.forEach(kind => this.setTableError(sectionKey, kind, `Unable to load ${this.getReportKindTitle(kind)}.`));
          this.scheduleRebuildSections();
        }
      });

    this.loadSubscription?.add(subscription);
  }

  private prepareDepartmentReportsForLoad(selectedDepartments: DepartmentOption[], keepExistingReports = true): void {
    const selectedIds = new Set(selectedDepartments.map(department => department.filter_id));
    const existingReports = keepExistingReports
      ? new Map(this.departmentReportData.map(report => [report.department.filter_id, report]))
      : new Map<string, DepartmentReportData>();

    this.departmentReportData = selectedDepartments.map(department => ({
      ...this.createEmptyDepartmentReportData(department),
      ...existingReports.get(department.filter_id),
      department
    }));

    const nextLoadingState = Object.fromEntries(
      Object.entries(this.tableLoadingState).filter(([departmentId]) => selectedIds.has(departmentId))
    ) as Record<string, Partial<Record<ReportKind, boolean>>>;
    const nextErrorState = Object.fromEntries(
      Object.entries(this.tableErrorState).filter(([departmentId]) => selectedIds.has(departmentId))
    ) as Record<string, Partial<Record<ReportKind, string>>>;

    selectedDepartments.forEach(department => {
      const sectionKey = this.getDepartmentSectionStateKey(department);
      nextLoadingState[sectionKey] = { ...(nextLoadingState[sectionKey] || {}) };
      nextErrorState[sectionKey] = { ...(nextErrorState[sectionKey] || {}) };

      this.getApplicableReportKinds(department).forEach(kind => {
        nextErrorState[sectionKey][kind] = '';
        nextLoadingState[sectionKey][kind] = true;
      });
    });

    this.tableLoadingState = nextLoadingState;
    this.tableErrorState = nextErrorState;
  }

  private createEmptyDepartmentReportData(department: DepartmentOption): DepartmentReportData {
    return {
      department,
      dashboardData: {},
      releaseOverviewRows: [],
      releaseOverviewLoaded: false,
      dashboardLoadFailed: false,
      releaseLoadFailed: false,
      loadFailed: false
    };
  }

  private patchDepartmentReportData(
    department: DepartmentOption,
    changes: Partial<Omit<DepartmentReportData, 'department'>>
  ): void {
    const index = this.departmentReportData.findIndex(report => report.department.filter_id === department.filter_id);
    const current = index >= 0
      ? this.departmentReportData[index]
      : this.createEmptyDepartmentReportData(department);
    const nextReport = {
      ...current,
      ...changes,
      department
    };
    nextReport.loadFailed = !!nextReport.dashboardLoadFailed || !!nextReport.releaseLoadFailed;

    if (index >= 0) {
      this.departmentReportData = [
        ...this.departmentReportData.slice(0, index),
        nextReport,
        ...this.departmentReportData.slice(index + 1)
      ];
      return;
    }

    this.departmentReportData = [...this.departmentReportData, nextReport];
  }

  private setTableLoading(departmentId: string, reportKind: ReportKind, loading: boolean): void {
    if (!!this.tableLoadingState[departmentId]?.[reportKind] === loading) {
      return;
    }

    this.tableLoadingState = {
      ...this.tableLoadingState,
      [departmentId]: {
        ...(this.tableLoadingState[departmentId] || {}),
        [reportKind]: loading
      }
    };
    this.updateSectionTransientState(departmentId, reportKind);
  }

  private setTableError(departmentId: string, reportKind: ReportKind, errorMessage: string): void {
    if ((this.tableErrorState[departmentId]?.[reportKind] || '') === errorMessage) {
      return;
    }

    this.tableErrorState = {
      ...this.tableErrorState,
      [departmentId]: {
        ...(this.tableErrorState[departmentId] || {}),
        [reportKind]: errorMessage
      }
    };
    this.updateSectionTransientState(departmentId, reportKind);
  }

  private updateSectionTransientState(departmentId: string, reportKind: ReportKind): void {
    this.sections = this.sections.map(section => {
      if (section.departmentId !== departmentId || section.reportKind !== reportKind) {
        return section;
      }

      return this.decorateSection({
        ...section,
        loading: this.isTableLoading(departmentId, reportKind),
        errorMessage: this.getTableError(departmentId, reportKind)
      });
    });
    this.requestViewUpdate();
  }

  private isTableLoading(departmentId: string, reportKind: ReportKind): boolean {
    return !!this.tableLoadingState[departmentId]?.[reportKind];
  }

  private getTableError(departmentId: string, reportKind: ReportKind): string {
    return this.tableErrorState[departmentId]?.[reportKind] || '';
  }

  private getDepartmentSectionStateKey(department: DepartmentOption): string {
    return department.filter_id;
  }

  private mergePreviousSectionViewState(section: ReportSection, previousSection: ReportSection | undefined): ReportSection {
    if (!previousSection) {
      return section;
    }

    return {
      ...section,
      searchTerm: previousSection.searchTerm,
      pageSize: previousSection.pageSize,
      pageIndex: previousSection.pageIndex,
      sortColumnIndex: previousSection.sortColumnIndex,
      sortDirection: previousSection.sortDirection
    };
  }

  private getReportKindTitle(reportKind: ReportKind): string {
    const titleMap: Record<ReportKind, string> = {
      release: 'Release Report',
      task: 'Task Report',
      issue: 'Issue Report',
      ticket: 'Tickets Report'
    };

    return titleMap[reportKind];
  }

  private getReleaseOverviewPayload(employeeId: number, departmentId: any, managerName: any = ''): any {
    return {
      employee_id: employeeId,
      projectid: 0,
      fromdate: this.startDate,
      todate: this.endDate,
      department_id: departmentId || '',
      manager_name: managerName || ''
    };
  }

  private normalizeReleaseOverviewResponse(response: any): any[] {
    const rows = this.extractResponseList(response, [
      'release_list',
      'releaseList',
      'releaseoverviewList',
      'releaseOverviewList',
      'release_overview_list',
      'total_release_list',
      'releases',
      'data',
      'details'
    ]);

    if (rows.length) {
      return rows.filter(row => row && typeof row === 'object');
    }

    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      return [];
    }

    const envelopeKeys = [
      'release_list',
      'releaseList',
      'releaseoverviewList',
      'releaseOverviewList',
      'release_overview_list',
      'total_release_list',
      'releases',
      'data',
      'details'
    ];

    return envelopeKeys.some(key => Object.prototype.hasOwnProperty.call(response, key))
      ? []
      : [response];
  }

  private getDepartmentApiValue(department: DepartmentOption): any {
    return this.firstPresent(department.api_id, department.filter_id, department.department_name);
  }

  private getDepartmentRequestApiValue(department: DepartmentOption): any {
    return this.isSqaDepartment(department)
      ? ''
      : this.getDepartmentApiValue(department);
  }

  private rebuildSections(): void {
    const previousSections = new Map(this.sections.map(section => [section.id, section]));
    this.sections = this.departmentReportData
      .flatMap(report => this.buildDepartmentSections(report))
      .map(section => this.mergePreviousSectionViewState(section, previousSections.get(section.id)));
    this.applySearch();
  }

  private buildDepartmentSections(report: DepartmentReportData): ReportSection[] {
    const department = report.department;
    const applicableReportKinds = this.getApplicableReportKinds(department);
    const dashboardReleases = this.uniqueRows(
      this.extractRowsByKeys(report.dashboardData, this.releaseKeys, row => this.isReleaseRow(row))
    );
    const releaseSource = report.releaseOverviewLoaded ? report.releaseOverviewRows : dashboardReleases;
    const useManagerScope = this.shouldUseManagerBasedDepartmentScope();
    const releases = this.filterRowsForDepartmentScope(
      this.uniqueRows(releaseSource),
      department,
      report.releaseOverviewLoaded,
      useManagerScope
    );
    const tasks = this.filterRowsForDepartmentScope(
      this.uniqueRows(this.extractRowsByKeys(report.dashboardData, this.taskKeys, row => this.isTaskRow(row))),
      department,
      false,
      useManagerScope
    );
    const issues = this.filterRowsForDepartmentScope(
      this.uniqueRows(this.extractRowsByKeys(report.dashboardData, this.issueKeys, row => this.isIssueRow(row))),
      department,
      false,
      useManagerScope
    );
    const tickets = this.filterRowsForDepartmentScope(
      this.uniqueRows(this.extractRowsByKeys(report.dashboardData, this.ticketKeys, row => this.isTicketRow(row))),
      department,
      false,
      useManagerScope
    );
    const sectionIdPrefix = this.getDepartmentSectionIdPrefix(department);

    const sectionBuilders: Record<ReportKind, () => ReportSection> = {
      release: () => this.buildReleaseSection(
        releases,
        `${sectionIdPrefix}-release-report`,
        department,
        'Release Report'
      ),
      task: () => this.buildTaskSection(
        tasks,
        `${sectionIdPrefix}-task-report`,
        department,
        'Task Report'
      ),
      issue: () => this.buildIssueSection(
        issues,
        `${sectionIdPrefix}-issue-report`,
        department,
        'Issue Report'
      ),
      ticket: () => this.buildTicketSection(
        tickets,
        `${sectionIdPrefix}-ticket-report`,
        department,
        'Tickets Report'
      )
    };
    return applicableReportKinds
      .map(kind => sectionBuilders[kind]());
  }

  private buildReleaseSection(
    rows: any[],
    id: ReportSectionId,
    department: DepartmentOption,
    reportTitle: string
  ): ReportSection {
    const reportRows = rows.map((row, index) => {
      const status = this.getStatusLabel(row);
      return this.createReportRow([
        index + 1,
        this.getProjectName(row),
        this.getValue(row, ['title', 'release_title', 'releaseTitle', 'name', 'subject']),
        this.getValue(row, ['version', 'release_version', 'version_name']),
        this.getValue(row, ['assignee_from_name', 'released_by_name', 'releasedByName', 'assigned_from_name', 'assignedFromName']),
        this.getReleasePerformance(row),
        this.formatReleaseTableDate(this.getFirstValue(row, ['planned_date', 'plannedDate', 'target_date', 'targetDate'])),
        this.formatReleaseTableDate(this.getFirstValue(row, ['released_date', 'release_date', 'releasedDate', 'releaseDate'])),
        this.getReleaseTesterName(row),
        this.getReleaseQcTestingStartDate(row) || '-',
        this.formatReleaseTableDate(this.getFirstValue(row, ['qc_testing_end_date', 'qcTestingEndDate'])),
        this.formatReleaseTableDate(this.getFirstValue(row, ['qc_release_date', 'qcReleaseDate', 'closed_date', 'closedDate'])),
        this.getCompanyName(row),
        status,
        this.getValue(row, ['release_type', 'releaseType', 'type']),
        this.getReleaseOverdueDate(row),
        this.getReleaseOverdueStatus(row),
        this.getValue(row, ['remarks', 'comments', 'description'])
      ], { statusKey: this.normalizeStatusKey(status) });
    });

    return this.createSection(
      id,
      department,
      'release',
      reportTitle,
      [37, 99, 235],
      [
        'S/NO',
        'PROJECT',
        'TITLE',
        'VERSION',
        'WORKED BY / RELEASED BY',
        'RELEASE PERFORMANCE',
        'PLANNED DATE',
        'RELEASE DATE',
        'TESTED BY',
        'QC TESTING START DATE',
        'QC TESTING END DATE',
        'QC RELEASED DATE',
        'CLIENT',
        'STATUS',
        'RELEASE TYPE',
        'OVERDUE',
        'OVERDUE STATUS',
        'REMARKS'
      ],
      reportRows,
      rowsForSummary => [
        this.summary('Total Releases', rowsForSummary.length, 'neutral'),
        this.summary('Pass', this.countByStatus(rowsForSummary, ['pass', 'passed', 'completed', 'approved']), 'green'),
        this.summary('Failed', this.countByStatus(rowsForSummary, ['failed', 'rejected']), 'red'),
        this.summary('To-be-Tested', this.countByStatus(rowsForSummary, ['tobetested', 'testing']), 'amber'),
        this.summary('Upcoming', this.countByStatus(rowsForSummary, ['upcoming', 'upcomingrelease']), 'blue')
      ],
      'No release records found for the selected date range.'
    );
  }

  private buildTaskSection(
    rows: any[],
    id: ReportSectionId,
    department: DepartmentOption,
    reportTitle: string
  ): ReportSection {
    const reportRows = rows.map((row, index) => {
      const status = this.getStatusLabel(row);
      const workedHours = this.getValue(row, ['worked_hours', 'workedHours', 'total_worked_hours', 'hours']);
      return this.createReportRow([
        index + 1,
        this.formatDisplayDate(this.getFirstValue(row, ['created_date', 'createddate', 'task_date', 'date'])),
        this.getProjectName(row),
        this.getValue(row, ['code', 'task_code', 'taskCode', 'task_id', 'taskid', 'id']),
        this.getValue(row, ['task_name', 'taskName', 'task', 'task_title', 'taskTitle', 'sub_task_name', 'subTaskName', 'title', 'name', 'subject']),
        this.getValue(row, ['assigned_to_name', 'assignedToName', 'employee_name', 'employeeName', 'owner_name', 'ownerName']),
        this.getPriorityLabel(row),
        this.formatDisplayDate(this.getFirstValue(row, ['start_date', 'startDate', 'assigned_date'])),
        this.formatDisplayDate(this.getFirstValue(row, ['due_date', 'dueDate', 'end_date', 'endDate'])),
        workedHours,
        status,
        this.getValue(row, ['remarks', 'comments', 'description', 'task_description'])
      ], {
        statusKey: this.normalizeStatusKey(status),
        workedMinutes: this.parseWorkedMinutes(workedHours)
      });
    });

    return this.createSection(
      id,
      department,
      'task',
      reportTitle,
      [124, 58, 237],
      ['S.No', 'Date', 'Project', 'Task Code', 'Task / Sub Task', 'Assigned To', 'Priority', 'Start Date', 'Due Date', 'Worked Hours', 'Status', 'Remarks'],
      reportRows,
      rowsForSummary => [
        this.summary('Total Tasks', rowsForSummary.length, 'neutral'),
        this.summary('Completed', this.countByStatus(rowsForSummary, ['completed', 'closed', 'pass', 'passed', 'approved']), 'green'),
        this.summary('In-Progress', this.countByStatus(rowsForSummary, ['inprogress', 'progress']), 'blue'),
        this.summary('Pending', this.countByStatus(rowsForSummary, ['open', 'pending', 'todo']), 'amber'),
        this.summary('On-Hold', this.countByStatus(rowsForSummary, ['onhold', 'hold', 'delayed']), 'red'),
        this.summary('Worked Hours', this.formatWorkedMinutes(this.sumWorkedMinutes(rowsForSummary)), 'cyan')
      ],
      'No task records found for the selected date range.'
    );
  }

  private buildIssueSection(
    rows: any[],
    id: ReportSectionId,
    department: DepartmentOption,
    reportTitle: string
  ): ReportSection {
    const reportRows = rows.map((row, index) => {
      const status = this.getStatusLabel(row);
      return this.createReportRow([
        index + 1,
        this.formatDisplayDate(this.getFirstValue(row, ['created_date', 'createddate', 'issue_date', 'bug_date', 'date'])),
        this.getProjectName(row),
        this.getValue(row, ['bug_code', 'bugCode', 'issue_code', 'issueCode', 'bug_id', 'issue_id', 'id']),
        this.getValue(row, ['bug_name', 'bugName', 'issue_name', 'issueName', 'title', 'name', 'subject', 'reason_f_issue', 'reasonFIssue']),
        this.getValue(row, ['assigned_to_name', 'assignedToName', 'assignee_to_name', 'employee_name', 'employeeName', 'owner_name', 'ownerName']),
        this.getValue(row, ['testing_type', 'testingType', 'type']),
        this.getPriorityLabel(row),
        status,
        this.getValue(row, ['remarks', 'comments', 'description', 'issue_description', 'bug_description', 'reason_f_issue', 'reasonFIssue'])
      ], { statusKey: this.normalizeStatusKey(status) });
    });

    return this.createSection(
      id,
      department,
      'issue',
      reportTitle,
      [220, 38, 38],
      ['S.No', 'Date', 'Project', 'Bug / Issue Code', 'Bug / Issue', 'Assigned To', 'Testing Type', 'Priority', 'Status', 'Remarks'],
      reportRows,
      rowsForSummary => [
        this.summary('Total Bugs / Issues', rowsForSummary.length, 'neutral'),
        this.summary('Open', this.countByStatus(rowsForSummary, ['open', 'pending', 'reopen', 'reopened']), 'amber'),
        this.summary('In-Progress', this.countByStatus(rowsForSummary, ['inprogress', 'progress', 'testing']), 'blue'),
        this.summary('To-be-Tested', this.countByStatus(rowsForSummary, ['tobetested']), 'cyan'),
        this.summary('Closed', this.countByStatus(rowsForSummary, ['closed', 'completed', 'pass', 'passed', 'approved']), 'green'),
        this.summary('Failed / Rejected', this.countByStatus(rowsForSummary, ['failed', 'rejected']), 'red')
      ],
      'No bug or issue records found for the selected date range.'
    );
  }

  private buildTicketSection(
    rows: any[],
    id: ReportSectionId,
    department: DepartmentOption,
    reportTitle: string
  ): ReportSection {
    const reportRows = rows.map((row, index) => {
      const status = this.getStatusLabel(row);
      const workedHours = this.getValue(row, ['worked_hours', 'workedHours', 'total_worked_hours', 'hours']);
      const category = this.getTicketCategory(row);

      return this.createReportRow([
        index + 1,
        this.formatDisplayDate(this.getFirstValue(row, ['created_date', 'createddate', 'assigned_date', 'ticket_date', 'date'])),
        this.getValue(row, ['code', 'ticket_code', 'ticketCode', 'ticket_id', 'ticketid', 'id']),
        this.getValue(row, ['ticket_name', 'ticketName', 'ticket_title', 'ticketTitle', 'ticket', 'title', 'name', 'subject']),
        this.getCompanyName(row),
        this.getProductName(row) || this.getProjectName(row),
        this.getDepartmentLabel(row),
        this.getValue(row, ['assigned_from_name', 'assignedFromName', 'created_by_name', 'createdByName', 'raised_by_name']),
        this.getValue(row, ['assigned_to_name', 'assignedToName', 'employee_name', 'employeeName', 'owner_name', 'ownerName']),
        category,
        workedHours,
        this.formatDisplayDate(this.getFirstValue(row, ['entry_date', 'entryDate', 'updated_date', 'updateddate', 'created_date'])),
        status,
        this.getValue(row, ['remarks', 'comments', 'description', 'client_comments', 'reason_f_issue', 'reasonFIssue'])
      ], {
        statusKey: this.normalizeStatusKey(status),
        categoryKey: this.normalizeStatusKey(category),
        workedMinutes: this.parseWorkedMinutes(workedHours)
      });
    });

    return this.createSection(
      id,
      department,
      'ticket',
      reportTitle,
      [8, 145, 178],
      ['S.No', 'Date', 'Ticket Code', 'Ticket', 'Client', 'Product', 'Department', 'Assigned From', 'Assigned To', 'Category', 'Worked Hours', 'Entry Date', 'Status', 'Remarks'],
      reportRows,
      rowsForSummary => [
        this.summary('Total Tickets', rowsForSummary.length, 'neutral'),
        this.summary('Open', this.countByStatus(rowsForSummary, ['open', 'reopen', 'reopened']), 'amber'),
        this.summary('In-Progress', this.countByStatus(rowsForSummary, ['inprogress', 'progress']), 'blue'),
        this.summary('On-Hold', this.countByStatus(rowsForSummary, ['onhold', 'hold', 'delayed']), 'red'),
        this.summary('Closed', this.countByStatus(rowsForSummary, ['closed', 'completed']), 'green'),
        this.summary('Worked Hours', this.formatWorkedMinutes(this.sumWorkedMinutes(rowsForSummary)), 'cyan')
      ],
      'No ticket records found for the selected date range.'
    );
  }

  private createSection(
    id: ReportSectionId,
    department: DepartmentOption,
    reportKind: ReportKind,
    reportTitle: string,
    accent: [number, number, number],
    columns: string[],
    rows: ReportRow[],
    buildSummary: (rows: ReportRow[]) => SummaryCard[],
    emptyMessage: string
  ): ReportSection {
    const departmentName = department.department_name;
    const sectionRows = this.attachCellViewModels(rows, columns);

    return this.decorateSection({
      id,
      departmentId: department.filter_id,
      departmentName,
      reportKind,
      reportTitle,
      sheetName: this.getSectionSheetName(departmentName, reportKind),
      title: `${departmentName} - ${reportTitle}`,
      accent,
      columns,
      columnViews: [],
      rows: sectionRows,
      filteredRows: sectionRows,
      loading: this.isTableLoading(department.filter_id, reportKind),
      errorMessage: this.getTableError(department.filter_id, reportKind),
      summary: buildSummary(sectionRows),
      emptyMessage,
      buildSummary,
      searchTerm: '',
      pageSize: 10,
      pageIndex: 0,
      totalPages: 1,
      pageNumbers: [],
      showingFrom: 0,
      showingTo: 0,
      pagedRows: [],
      sortColumnIndex: null,
      sortDirection: 'asc',
      tableMinWidthRem: Math.max(58, columns.length * 8.5),
      loadingLabel: '',
      emptyStateMessage: emptyMessage,
      rowCountLabel: '',
      canExport: false,
      excelExporting: false,
      pdfExporting: false,
      showDepartmentHeading: false,
      departmentRecordCount: 0
    });
  }

  private createReportRow(cells: any[], meta: ReportRow['meta'] = {}): ReportRow {
    const formattedCells = cells.map(cell => this.formatCell(cell));

    return {
      id: this.buildRowId(formattedCells, meta),
      cells: formattedCells,
      cellViews: [],
      meta,
      searchText: this.normalizeSearchText(formattedCells.join(' '))
    };
  }

  private attachCellViewModels(rows: ReportRow[], columns: string[]): ReportRow[] {
    const chipColumns = columns.map(column => this.isChipColumn(column));

    return rows.map(row => ({
      ...row,
      cellViews: row.cells.map((cell, columnIndex) => {
        const value = this.formatCell(cell);
        const isChip = !!chipColumns[columnIndex];

        return {
          value,
          title: value,
          isChip,
          chipClass: isChip ? this.getChipClass(value) : ''
        };
      })
    }));
  }

  private buildRowId(cells: string[], meta: ReportRow['meta']): string {
    return this.hashText(`${cells.join('|')}|${meta.statusKey || ''}|${meta.categoryKey || ''}`);
  }

  private hashText(value: string): string {
    let hash = 0;

    for (let index = 0; index < value.length; index++) {
      hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
    }

    return `${value.length}-${Math.abs(hash)}`;
  }

  private decorateSection(section: ReportSection): ReportSection {
    const totalPages = Math.max(1, Math.ceil(section.filteredRows.length / section.pageSize));
    const pageIndex = Math.max(0, Math.min(section.pageIndex, totalPages - 1));
    const startIndex = pageIndex * section.pageSize;
    const pagedRows = section.filteredRows.slice(startIndex, startIndex + section.pageSize);

    return {
      ...section,
      pageIndex,
      totalPages,
      pagedRows,
      showingFrom: section.filteredRows.length ? startIndex + 1 : 0,
      showingTo: section.filteredRows.length
        ? Math.min(startIndex + section.pageSize, section.filteredRows.length)
        : 0,
      pageNumbers: this.buildPageNumbers(totalPages, pageIndex),
      columnViews: this.buildColumnViews(section.columns, section.sortColumnIndex, section.sortDirection),
      tableMinWidthRem: Math.max(58, section.columns.length * 8.5),
      loadingLabel: this.buildSectionLoadingLabel(section),
      emptyStateMessage: section.searchTerm || this.searchTerm
        ? 'No records match the current search.'
        : section.emptyMessage,
      rowCountLabel: `${section.filteredRows.length} Records`,
      canExport: !section.loading && !section.errorMessage && section.filteredRows.length > 0,
      excelExporting: this.isSectionExporting(section, 'excel'),
      pdfExporting: this.isSectionExporting(section, 'pdf')
    };
  }

  private buildColumnViews(
    columns: string[],
    sortColumnIndex: number | null,
    sortDirection: SortDirection
  ): ReportColumnView[] {
    return columns.map((column, index) => {
      const active = sortColumnIndex === index;

      return {
        label: column,
        index,
        active,
        sortIcon: active
          ? (sortDirection === 'asc' ? 'ri-arrow-up-line' : 'ri-arrow-down-line')
          : 'ri-arrow-up-down-line',
        sortTitle: active
          ? `${sortDirection === 'asc' ? 'Sort descending' : 'Sort ascending'} by ${column}`
          : `Sort ${column}`,
        ariaSort: active
          ? (sortDirection === 'asc' ? 'ascending' : 'descending')
          : null
      };
    });
  }

  private buildSectionLoadingLabel(section: ReportSection): string {
    const action = section.filteredRows.length ? 'Refreshing' : 'Loading';
    const reportLabelMap: Record<ReportKind, string> = {
      release: 'releases',
      task: 'tasks',
      issue: 'issues',
      ticket: 'tickets'
    };

    return `${action} ${reportLabelMap[section.reportKind]}...`;
  }

  private applyFiltersToSection(section: ReportSection, globalSearchValue = this.normalizeSearchText(this.searchTerm)): ReportSection {
    const sectionSearchValue = this.normalizeSearchText(section.searchTerm);
    const matchingRows = section.rows.filter(row => {
      const matchesGlobalSearch = !globalSearchValue || row.searchText.includes(globalSearchValue);
      const matchesSectionSearch = !sectionSearchValue || row.searchText.includes(sectionSearchValue);
      return matchesGlobalSearch && matchesSectionSearch;
    });
    const filteredRows = this.sortRows(matchingRows, section);

    return this.decorateSection({
      ...section,
      filteredRows,
      summary: section.buildSummary(filteredRows)
    });
  }

  private replaceSection(sectionId: string, updater: (section: ReportSection) => ReportSection): void {
    const globalSearchValue = this.normalizeSearchText(this.searchTerm);
    this.sections = this.sections.map(section => {
      if (section.id !== sectionId) {
        return section;
      }

      return this.applyFiltersToSection(updater(section), globalSearchValue);
    });
    this.updateDepartmentRecordCounts();
    this.requestViewUpdate();
  }

  private applySearch(): void {
    const globalSearchValue = this.normalizeSearchText(this.searchTerm);
    this.sections = this.sections.map(section => this.applyFiltersToSection(section, globalSearchValue));
    this.updateDepartmentRecordCounts();
    this.requestViewUpdate();
  }

  private updateDepartmentRecordCounts(): void {
    const recordCounts = this.sections.reduce((counts, section) => {
      counts[section.departmentId] = (counts[section.departmentId] || 0) + section.filteredRows.length;
      return counts;
    }, {} as Record<string, number>);

    this.departmentRecordCountById = recordCounts;
    this.sections = this.sections.map((section, index, sections) => ({
      ...section,
      showDepartmentHeading: index === 0 || sections[index - 1]?.departmentId !== section.departmentId,
      departmentRecordCount: recordCounts[section.departmentId] || 0
    }));
  }

  private buildPageNumbers(totalPages: number, pageIndex: number): number[] {
    const maxVisiblePages = 5;
    const currentPage = pageIndex + 1;
    const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - maxVisiblePages + 1));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    return Array.from({ length: endPage - startPage + 1 }, (_value, index) => startPage + index);
  }

  private sortRows(rows: ReportRow[], section: ReportSection): ReportRow[] {
    if (section.sortColumnIndex === null) {
      return rows;
    }

    const columnIndex = section.sortColumnIndex;
    const direction = section.sortDirection === 'asc' ? 1 : -1;
    const column = section.columns[columnIndex] || '';

    return [...rows].sort((first, second) => {
      return this.compareCellValues(first.cells[columnIndex], second.cells[columnIndex], column) * direction;
    });
  }

  private compareCellValues(first: any, second: any, column: string): number {
    const firstValue = `${first ?? ''}`.trim();
    const secondValue = `${second ?? ''}`.trim();
    const firstEmpty = !firstValue || firstValue === '-';
    const secondEmpty = !secondValue || secondValue === '-';

    if (firstEmpty || secondEmpty) {
      if (firstEmpty && secondEmpty) return 0;
      return firstEmpty ? 1 : -1;
    }

    const columnKey = this.normalizeStatusKey(column);
    if (columnKey.includes('date')) {
      const firstDate = Date.parse(firstValue);
      const secondDate = Date.parse(secondValue);
      if (Number.isFinite(firstDate) && Number.isFinite(secondDate)) {
        return firstDate - secondDate;
      }
    }

    const firstNumber = Number(firstValue);
    const secondNumber = Number(secondValue);
    if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) {
      return firstNumber - secondNumber;
    }

    return firstValue.localeCompare(secondValue, undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }

  private getExportableSections(): ReportSection[] {
    return [...this.sections];
  }

  private shouldShowDepartmentHeadingInList(sections: ReportSection[], index: number, section: ReportSection): boolean {
    return index === 0 || sections[index - 1]?.departmentId !== section.departmentId;
  }

  private buildExcelSections(sections: ReportSection[]): OverallPerformanceExcelSection[] {
    return sections.map(section => ({
      title: section.title,
      departmentName: section.departmentName,
      reportTitle: section.reportTitle,
      reportKind: section.reportKind,
      sheetName: section.sheetName,
      summary: section.summary.map(item => [item.label, item.value]),
      headers: section.columns,
      rows: section.filteredRows.map(row => row.cells)
    }));
  }

  private buildOverallExportFilename(extension: 'xlsx' | 'pdf'): string {
    return `OVERALL_PERFORMANCE_REPORT_${this.startDate}_to_${this.endDate}.${extension}`;
  }

  private buildSectionExportFilename(section: ReportSection, extension: 'xlsx' | 'pdf'): string {
    const reportNameMap: Record<ReportKind, string> = {
      release: 'RELEASE_REPORT',
      task: 'TASK_REPORT',
      issue: 'ISSUE_REPORT',
      ticket: 'TICKETS_REPORT'
    };

    return `${this.getDepartmentFilenameToken(section.departmentName)}_${reportNameMap[section.reportKind]}_${this.startDate}_to_${this.endDate}.${extension}`;
  }

  private getDepartmentFilenameToken(departmentName: string): string {
    const withoutDepartmentSuffix = `${departmentName || ''}`.replace(/\bdepartments?\b/gi, '');
    const token = withoutDepartmentSuffix
      .trim()
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();

    return token || 'DEPARTMENT';
  }

  private extractRowsByKeys(source: any, keys: string[], predicate: (row: any) => boolean): any[] {
    const normalizedKeys = new Set(keys.map(key => this.normalizeObjectKey(key)));
    const rows: any[] = [];
    const seen = new WeakSet<object>();

    const visit = (value: any, key?: string): void => {
      if (value === null || value === undefined) return;

      if (Array.isArray(value)) {
        if (key && normalizedKeys.has(this.normalizeObjectKey(key))) {
          rows.push(...value.filter(item => item && typeof item === 'object' && predicate(item)));
        }
        value.forEach(item => visit(item));
        return;
      }

      if (typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);

      Object.entries(value).forEach(([entryKey, entryValue]) => visit(entryValue, entryKey));
    };

    visit(source);
    return rows;
  }

  private filterRowsForDepartment(
    rows: any[],
    department: DepartmentOption,
    keepUnknownDepartmentRows = false
  ): any[] {
    if (!department) {
      return rows;
    }

    const matchingRows: any[] = [];
    const unknownDepartmentRows: any[] = [];

    rows.forEach(row => {
      const rowKeys = this.getRowDepartmentKeys(row);

      if (!rowKeys.length) {
        unknownDepartmentRows.push(row);
        return;
      }

      if (this.rowMatchesDepartmentOption(row, department, rowKeys)) {
        matchingRows.push(row);
      }
    });

    if (matchingRows.length) {
      return keepUnknownDepartmentRows
        ? [...matchingRows, ...unknownDepartmentRows]
        : matchingRows;
    }

    return unknownDepartmentRows.length === rows.length || keepUnknownDepartmentRows
      ? unknownDepartmentRows
      : [];
  }

  private filterRowsForDepartmentScope(
    rows: any[],
    department: DepartmentOption,
    keepUnknownDepartmentRows = false,
    useManagerScope = false
  ): any[] {
    if (this.isSqaDepartment(department)) {
      return this.filterRowsForAssignedToDepartment(rows, department);
    }

    return useManagerScope
      ? this.filterRowsForDepartmentManager(rows, department, keepUnknownDepartmentRows)
      : this.filterRowsForDepartment(rows, department, keepUnknownDepartmentRows);
  }

  private filterRowsForAssignedToDepartment(rows: any[], department: DepartmentOption): any[] {
    const departmentKeys = this.getDepartmentOptionKeys(department);

    if (!departmentKeys.length) {
      return rows;
    }

    return rows.filter(row =>
      this.doFilterKeysOverlap(this.getAssignedToDepartmentKeys(row), departmentKeys)
    );
  }

  private getAssignedToDepartmentKeys(row: any): string[] {
    if (!row || typeof row !== 'object') {
      return [];
    }

    const values: any[] = [];
    const assignedDepartmentKeys = [
      'assigned_to_department',
      'assignedToDepartment',
      'assigned_to_dept',
      'assignedToDept',
      'assigned_to_department_id',
      'assignedToDepartmentId',
      'assigned_to_dept_id',
      'assignedToDeptId',
      'assignee_to_department',
      'assigneeToDepartment',
      'assignee_to_dept',
      'assigneeToDept',
      'assignee_to_department_id',
      'assigneeToDepartmentId',
      'assignee_to_dept_id',
      'assigneeToDeptId',
      'tested_by_department',
      'testedByDepartment',
      'tested_by_dept',
      'testedByDept',
      'tested_by_department_id',
      'testedByDepartmentId',
      'tested_by_dept_id',
      'testedByDeptId',
      'employee_department',
      'employeeDepartment',
      'employee_dept',
      'employeeDept',
      'employee_department_id',
      'employeeDepartmentId',
      'employee_dept_id',
      'employeeDeptId'
    ];

    assignedDepartmentKeys.forEach(key => values.push(...this.collectDepartmentValues(row[key])));

    this.getAssignedToReferences(row).forEach(reference => {
      if (reference && typeof reference === 'object') {
        values.push(...this.collectEmployeeDepartmentValues(reference));
      }

      const employee = this.findEmployee(reference);
      if (employee) {
        values.push(...this.collectEmployeeDepartmentValues(employee));
      }
    });

    return this.normalizeFilterKeys(values);
  }

  private getAssignedToReferences(row: any): any[] {
    if (!row || typeof row !== 'object') {
      return [];
    }

    const references = [
      row?.assigned_to,
      row?.assignedTo,
      row?.assigned_to_id,
      row?.assignedToId,
      row?.assigned_to_name,
      row?.assignedToName,
      row?.assignee_to,
      row?.assigneeTo,
      row?.assignee_to_id,
      row?.assigneeToId,
      row?.assignee_to_name,
      row?.assigneeToName,
      row?.tested_by,
      row?.testedBy,
      row?.tested_by_id,
      row?.testedById,
      row?.tested_by_name,
      row?.testedByName,
      row?.employee,
      row?.employeeDetails,
      row?.employee_id,
      row?.employeeId,
      row?.employee_name,
      row?.employeeName,
      row?.emp_id,
      row?.empId,
      row?.assignee,
      row?.tester
    ];

    return references
      .flatMap(value => Array.isArray(value) ? value : [value])
      .filter(value => value !== null && value !== undefined && `${value}`.trim() !== '');
  }

  private filterRowsForDepartmentManager(
    rows: any[],
    department: DepartmentOption,
    keepUnknownDepartmentRows = false
  ): any[] {
    const managerKeys = this.getDepartmentManagerKeys(department);
    const hasManagerData = rows.some(row => this.getRowManagerKeys(row).length > 0);

    if (managerKeys.length && hasManagerData) {
      const matchingRows: any[] = [];
      const unknownManagerRows: any[] = [];

      rows.forEach(row => {
        const rowKeys = this.getRowManagerKeys(row);

        if (!rowKeys.length) {
          unknownManagerRows.push(row);
          return;
        }

        if (this.doFilterKeysOverlap(rowKeys, managerKeys)) {
          matchingRows.push(row);
        }
      });

      if (matchingRows.length) {
        return keepUnknownDepartmentRows
          ? [...matchingRows, ...unknownManagerRows]
          : matchingRows;
      }

      const hasDepartmentData = rows.some(row => this.getRowDepartmentKeys(row).length > 0);
      if (!hasDepartmentData) {
        return keepUnknownDepartmentRows ? unknownManagerRows : [];
      }
    }

    return this.filterRowsForDepartment(rows, department, keepUnknownDepartmentRows);
  }

  private rowMatchesDepartmentOption(row: any, department: DepartmentOption, rowKeys = this.getRowDepartmentKeys(row)): boolean {
    const selectedKeys = this.getDepartmentOptionKeys(department);

    return selectedKeys.some(key => rowKeys.includes(key));
  }

  private isSqaDepartment(department: DepartmentOption | null | undefined): boolean {
    if (!department) {
      return false;
    }

    const sqaKeys = this.normalizeFilterKeys(['sqa', 'qa', 'quality assurance', 'software quality assurance', 'qa team']);
    return this.doFilterKeysOverlap(this.getDepartmentOptionKeys(department), sqaKeys);
  }

  private shouldUseManagerBasedDepartmentScope(): boolean {
    return !this.isAllDepartmentsSelected();
  }

  private getDepartmentManagerNameParam(department: DepartmentOption): string {
    if (!department) {
      return '';
    }

    return this.getDepartmentManagerValues(department)
      .map(value => `${value ?? ''}`.trim())
      .find(Boolean) || '';
  }

  private getDepartmentManagerKeys(department: DepartmentOption): string[] {
    return this.normalizeFilterKeys(this.getDepartmentManagerValues(department));
  }

  private getDepartmentManagerValues(department: DepartmentOption): any[] {
    if (!department) {
      return [];
    }

    const raw = department.raw || department;
    const values: any[] = [
      raw?.manager_name,
      raw?.managerName,
      raw?.department_manager_name,
      raw?.departmentManagerName,
      raw?.team_lead_name,
      raw?.teamLeadName,
      raw?.lead_name,
      raw?.leadName,
      raw?.hod_name,
      raw?.hodName,
      ...this.collectManagerValues(raw?.manager),
      ...this.collectManagerValues(raw?.managerDetails),
      ...this.collectManagerValues(raw?.department_manager),
      ...this.collectManagerValues(raw?.departmentManager),
      ...this.collectManagerValues(raw?.team_lead),
      ...this.collectManagerValues(raw?.teamLead),
      ...this.collectManagerValues(raw?.lead),
      ...this.collectManagerValues(raw?.owner)
    ];

    values.push(
      raw?.manager_id,
      raw?.managerId,
      raw?.managerid,
      raw?.department_manager_id,
      raw?.departmentManagerId,
      raw?.team_lead_id,
      raw?.teamLeadId,
      raw?.lead_id,
      raw?.leadId,
      ...this.getDepartmentManagerFallbackValues(department)
    );

    return Array.from(new Set(values.filter(value => this.isPresent(value))));
  }

  private getDepartmentManagerFallbackValues(department: DepartmentOption): any[] {
    const label = department?.department_name || '';
    const key = this.normalizeDepartmentConfigKey(label);

    if (key === 'ridapps' || key === 'ridapp') {
      return [label, 'Ridapps', 'Ridapp', 'Ridapps Team', 'Rid Apps'];
    }

    if (key === 'softwareteam' || key === 'software') {
      return [label, 'Software Team', 'Software', 'Software Development'];
    }

    if (key === 'sqa' || key === 'qa' || key === 'qualityassurance') {
      return [label, 'SQA', 'QA', 'Quality Assurance', 'Software Quality Assurance', 'QA Team'];
    }

    return [label];
  }

  private getRowManagerKeys(row: any): string[] {
    if (!row || typeof row !== 'object') {
      return [];
    }

    return this.normalizeFilterKeys([
      row?.manager_name,
      row?.managerName,
      row?.manager_id,
      row?.managerId,
      row?.managerid,
      row?.department_manager_name,
      row?.departmentManagerName,
      row?.department_manager_id,
      row?.departmentManagerId,
      row?.team_lead_name,
      row?.teamLeadName,
      row?.team_lead_id,
      row?.teamLeadId,
      row?.lead_name,
      row?.leadName,
      row?.lead_id,
      row?.leadId,
      row?.assigned_manager_name,
      row?.assignedManagerName,
      row?.project_manager_name,
      row?.projectManagerName,
      row?.owner_name,
      row?.ownerName,
      ...this.collectManagerValues(row?.manager),
      ...this.collectManagerValues(row?.managerDetails),
      ...this.collectManagerValues(row?.department_manager),
      ...this.collectManagerValues(row?.departmentManager),
      ...this.collectManagerValues(row?.team_lead),
      ...this.collectManagerValues(row?.teamLead),
      ...this.collectManagerValues(row?.lead),
      ...this.collectManagerValues(row?.owner)
    ]);
  }

  private collectManagerValues(value: any, depth = 0): any[] {
    if (!this.isPresent(value) || depth > 2) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap(item => this.collectManagerValues(item, depth + 1));
    }

    if (typeof value !== 'object') {
      return [value];
    }

    const values: any[] = [
      value?.manager_name,
      value?.managerName,
      value?.employee_name,
      value?.employeeName,
      value?.full_name,
      value?.fullName,
      value?.user_name,
      value?.username,
      value?.name,
      value?.title,
      value?.label,
      value?.email,
      value?.manager_id,
      value?.managerId,
      value?.managerid,
      value?.id,
      value?.empid,
      value?.emp_id,
      value?.empId,
      value?.employee_id,
      value?.employeeId,
      value?.user_id,
      value?.userId
    ];

    ['manager', 'managerDetails', 'department_manager', 'departmentManager', 'team_lead', 'teamLead', 'lead', 'owner']
      .forEach(key => values.push(...this.collectManagerValues(value[key], depth + 1)));

    return values;
  }

  private isAllDepartmentsSelected(selectedDepartments = this.getSelectedDepartmentOptions()): boolean {
    if (!this.departments.length) {
      return this.selectedDepartmentIds.includes(this.allDepartmentsValue);
    }

    return this.selectedDepartmentIds.includes(this.allDepartmentsValue)
      && selectedDepartments.length === this.departments.length;
  }

  private getReportDepartmentOptions(): DepartmentOption[] {
    const selectedDepartments = this.getSelectedDepartmentOptions();

    if (this.managerDepartmentRestricted) {
      return this.departments.length ? [this.departments[0]] : [];
    }

    return this.isAllDepartmentsSelected(selectedDepartments)
      ? this.sortDepartmentsForReport([...this.departments])
      : this.sortDepartmentsForReport(selectedDepartments);
  }

  private getSelectedDepartmentOptions(): DepartmentOption[] {
    const selectedIds = new Set(this.getValidDepartmentIds(this.selectedDepartmentIds));
    return this.departments.filter(department => selectedIds.has(department.filter_id));
  }

  private getValidDepartmentIds(values: string[]): string[] {
    const validDepartmentIds = new Set(this.departments.map(department => department.filter_id));
    const selectedIds = new Set<string>();

    values.forEach(value => {
      if (validDepartmentIds.has(value)) {
        selectedIds.add(value);
      }
    });

    return Array.from(selectedIds);
  }

  private getAllDepartmentSelectionValues(): string[] {
    return this.departments.length
      ? [this.allDepartmentsValue, ...this.departments.map(department => department.filter_id)]
      : [this.allDepartmentsValue];
  }

  private getDepartmentSectionIdPrefix(department: DepartmentOption): string {
    const base = `${department.filter_id || department.department_name}`.trim().toLowerCase();
    const safe = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return safe || 'department';
  }

  private areSameStringSets(first: string[], second: string[]): boolean {
    if (first.length !== second.length) {
      return false;
    }

    const secondSet = new Set(second);
    return first.every(value => secondSet.has(value));
  }

  private getApplicableReportKinds(department: DepartmentOption): ReportKind[] {
    const departmentKey = this.normalizeDepartmentConfigKey(department.department_name);

    if (departmentKey.includes('ridapps') || departmentKey.includes('software')) {
      return ['release', 'task', 'issue', 'ticket'];
    }

    if (departmentKey.includes('sqa')) {
      return ['release', 'task', 'ticket'];
    }

    if (departmentKey.includes('fiber')) {
      return ['task', 'ticket'];
    }

    return ['ticket'];
  }

  private sortDepartmentsForReport(departments: DepartmentOption[]): DepartmentOption[] {
    return [...departments].sort((first, second) => {
      const firstOrder = this.getDepartmentReportOrder(first);
      const secondOrder = this.getDepartmentReportOrder(second);

      if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
      }

      return first.department_name.localeCompare(second.department_name, undefined, {
        numeric: true,
        sensitivity: 'base'
      });
    });
  }

  private getDepartmentReportOrder(department: DepartmentOption): number {
    const departmentKey = this.normalizeDepartmentConfigKey(department.department_name);
    if (departmentKey.includes('ridapps')) return 1;
    if (departmentKey.includes('software')) return 2;
    if (departmentKey.includes('sqa')) return 3;
    if (departmentKey.includes('fiber')) return 4;
    return 5;
  }

  private normalizeDepartmentConfigKey(value: any): string {
    return `${value ?? ''}`.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private getSectionSheetName(departmentName: string, reportKind: ReportKind): string {
    const reportNameMap: Record<ReportKind, string> = {
      release: 'Release',
      task: 'Tasks',
      issue: 'Issues',
      ticket: 'Tickets'
    };

    return `${departmentName} - ${reportNameMap[reportKind]}`;
  }

  private getDepartmentOptionKeys(department: DepartmentOption): string[] {
    const raw = department.raw || department;
    return this.normalizeFilterKeys([
      department.filter_id,
      department.api_id,
      department.department_name,
      raw?.id,
      raw?.department_id,
      raw?.departmentId,
      raw?.departmentid,
      raw?.dept_id,
      raw?.deptId,
      raw?.deptid,
      raw?.department_name,
      raw?.departmentName,
      raw?.dept_name,
      raw?.deptName,
      raw?.name,
      raw?.title,
      raw?.label
    ]);
  }

  private getRowDepartmentKeys(row: any): string[] {
    if (!row || typeof row !== 'object') {
      return [];
    }

    const values: any[] = [this.getDepartmentLabel(row)];
    const departmentKeys = [
      'department',
      'dept',
      'team',
      'department_id',
      'departmentId',
      'departmentid',
      'dept_id',
      'deptId',
      'deptid',
      'department_name',
      'departmentName',
      'dept_name',
      'deptName',
      'team_name',
      'teamName',
      'employee_department',
      'employeeDepartment',
      'assigned_to_department',
      'assignedToDepartment',
      'assigned_from_department',
      'assignedFromDepartment',
      'assignee_to_department',
      'assigneeToDepartment',
      'assignee_from_department',
      'assigneeFromDepartment',
      'created_by_department',
      'createdByDepartment',
      'released_by_department',
      'releasedByDepartment',
      'tested_by_department',
      'testedByDepartment',
      'task_department',
      'taskDepartment',
      'release_department',
      'releaseDepartment',
      'project_department',
      'projectDepartment',
      'overall_ticket_department'
    ];

    departmentKeys.forEach(key => values.push(...this.collectDepartmentValues(row[key])));

    const relatedPeopleKeys = [
      'assigned_to',
      'assignedTo',
      'assigned_to_id',
      'assignedToId',
      'assigned_to_name',
      'assignedToName',
      'assigned_from',
      'assignedFrom',
      'assigned_from_id',
      'assignedFromId',
      'assigned_from_name',
      'assignedFromName',
      'assignee_to',
      'assigneeTo',
      'assignee_to_id',
      'assigneeToId',
      'assignee_to_name',
      'assigneeToName',
      'assignee_from',
      'assigneeFrom',
      'assignee_from_id',
      'assigneeFromId',
      'assignee_from_name',
      'assigneeFromName',
      'released_by',
      'releasedBy',
      'released_by_id',
      'releasedById',
      'released_by_name',
      'releasedByName',
      'tested_by',
      'testedBy',
      'tested_by_id',
      'testedById',
      'tested_by_name',
      'testedByName',
      'created_by',
      'createdBy',
      'created_by_id',
      'createdById',
      'created_by_name',
      'createdByName',
      'employee',
      'employeeDetails',
      'employee_name',
      'employeeName',
      'assignee',
      'owner',
      'owner_name',
      'ownerName'
    ];

    relatedPeopleKeys.forEach(key => {
      const employee = this.findEmployee(row[key]);
      if (employee) {
        values.push(...this.collectEmployeeDepartmentValues(employee));
      }
    });

    return this.normalizeFilterKeys(values);
  }

  private collectEmployeeDepartmentValues(employee: any): any[] {
    if (!employee || typeof employee !== 'object') {
      return [];
    }

    const values: any[] = [];
    const keys = [
      'department',
      'dept',
      'team',
      'department_id',
      'departmentId',
      'departmentid',
      'dept_id',
      'deptId',
      'deptid',
      'department_name',
      'departmentName',
      'dept_name',
      'deptName',
      'team_name',
      'teamName',
      'employee_department',
      'employeeDepartment'
    ];

    keys.forEach(key => values.push(...this.collectDepartmentValues(employee[key])));
    return values;
  }

  private collectDepartmentValues(value: any, depth = 0): any[] {
    if (!this.isPresent(value) || depth > 2) {
      return [];
    }

    if (typeof value !== 'object') {
      return [value];
    }

    const values: any[] = [];
    const keys = [
      'id',
      'department',
      'dept',
      'team',
      'department_id',
      'departmentId',
      'departmentid',
      'dept_id',
      'deptId',
      'deptid',
      'department_name',
      'departmentName',
      'dept_name',
      'deptName',
      'team_name',
      'teamName',
      'name',
      'title',
      'label'
    ];

    keys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        values.push(...this.collectDepartmentValues(value[key], depth + 1));
      }
    });

    return values;
  }

  private getDepartmentLabel(row: any): string {
    if (!row || typeof row !== 'object') {
      return '-';
    }

    const departmentNameKeys = [
      'department_name',
      'departmentName',
      'dept_name',
      'deptName',
      'team_name',
      'teamName',
      'employee_department',
      'employeeDepartment',
      'assigned_to_department',
      'assignedToDepartment',
      'assigned_from_department',
      'assignedFromDepartment',
      'created_by_department',
      'createdByDepartment',
      'released_by_department',
      'releasedByDepartment',
      'task_department',
      'taskDepartment',
      'release_department',
      'releaseDepartment',
      'project_department',
      'projectDepartment',
      'overall_ticket_department'
    ];
    const departmentIdKeys = ['department_id', 'departmentId', 'departmentid', 'dept_id', 'deptId', 'deptid'];

    const directDepartmentKeys = [
      ...departmentNameKeys,
      'department',
      'dept',
      'team',
      ...departmentIdKeys
    ];

    for (const key of directDepartmentKeys) {
      if (!Object.prototype.hasOwnProperty.call(row, key) || !this.isPresent(row[key])) {
        continue;
      }

      const department = this.resolveDepartmentReference(row[key], departmentNameKeys, departmentIdKeys);
      if (department) {
        return department;
      }
    }

    const relatedPeopleKeys = [
      'assigned_to',
      'assignedTo',
      'assigned_to_id',
      'assignedToId',
      'assigned_to_name',
      'assignedToName',
      'assigned_from',
      'assignedFrom',
      'assigned_from_id',
      'assignedFromId',
      'assigned_from_name',
      'assignedFromName',
      'assignee_to',
      'assigneeTo',
      'assignee_to_id',
      'assigneeToId',
      'assignee_to_name',
      'assigneeToName',
      'assignee_from',
      'assigneeFrom',
      'assignee_from_id',
      'assigneeFromId',
      'assignee_from_name',
      'assigneeFromName',
      'released_by',
      'releasedBy',
      'released_by_id',
      'releasedById',
      'released_by_name',
      'releasedByName',
      'tested_by',
      'testedBy',
      'tested_by_id',
      'testedById',
      'tested_by_name',
      'testedByName',
      'created_by',
      'createdBy',
      'created_by_id',
      'createdById',
      'created_by_name',
      'createdByName',
      'employee_name',
      'employeeName',
      'employee',
      'employeeDetails',
      'assignee',
      'owner',
      'owner_name',
      'ownerName'
    ];

    for (const key of relatedPeopleKeys) {
      const relatedValue = row[key];
      if (!this.isPresent(relatedValue)) {
        continue;
      }

      if (typeof relatedValue === 'object') {
        const nestedDepartment = this.resolveDepartmentReference(relatedValue, departmentNameKeys, departmentIdKeys);
        if (nestedDepartment) {
          return nestedDepartment;
        }
      }

      const employee = this.findEmployee(relatedValue);
      const employeeDepartment = employee
        ? this.resolveDepartmentReference(employee, departmentNameKeys, departmentIdKeys)
        : '';
      if (employeeDepartment) {
        return employeeDepartment;
      }
    }

    return '-';
  }

  private resolveDepartmentReference(value: any, departmentNameKeys: string[], departmentIdKeys: string[]): string {
    if (!this.isPresent(value)) {
      return '';
    }

    if (typeof value === 'object') {
      const nestedName = this.getRawValue(value, departmentNameKeys);
      if (this.isPresent(nestedName)) {
        return this.resolveDepartmentReference(nestedName, departmentNameKeys, departmentIdKeys);
      }

      const nestedDepartment = this.getRawValue(value, ['department', 'dept', 'team']);
      if (this.isPresent(nestedDepartment)) {
        return this.resolveDepartmentReference(nestedDepartment, departmentNameKeys, departmentIdKeys);
      }

      const nestedId = this.getRawValue(value, departmentIdKeys);
      return this.resolveDepartmentId(nestedId);
    }

    const departmentId = `${value}`.trim();
    const mappedName = this.resolveDepartmentId(departmentId);
    return mappedName || departmentId;
  }

  private resolveDepartmentId(value: any): string {
    if (!this.isPresent(value)) {
      return '';
    }

    const department = this.departmentList.find(item => {
      const itemId = this.getRawValue(item, ['id', 'department_id', 'departmentId', 'departmentid', 'dept_id', 'deptId', 'deptid']);
      return this.isPresent(itemId) && `${itemId}`.trim() === `${value}`.trim();
    });

    if (!department) {
      return '';
    }

    const name = this.getRawValue(department, [
      'department_name',
      'departmentName',
      'dept_name',
      'deptName',
      'name',
      'title',
      'label'
    ]);
    return this.isPresent(name) ? this.formatCell(name) : '';
  }

  private findEmployee(value: any): any | null {
    const employeeIdKeys = ['id', 'empid', 'emp_id', 'empId', 'employeeid', 'employee_id', 'employeeId', 'userid', 'user_id', 'userId'];
    const employeeNameKeys = ['employee_name', 'employeeName', 'full_name', 'fullName', 'user_name', 'username', 'name'];
    const sourceId = typeof value === 'object' ? this.getRawValue(value, employeeIdKeys) : value;
    const sourceName = typeof value === 'object' ? this.getRawValue(value, employeeNameKeys) : value;

    return this.employeeList.find(employee => {
      const employeeId = this.getRawValue(employee, employeeIdKeys);
      const employeeName = this.getRawValue(employee, employeeNameKeys);
      const idMatches = this.isPresent(sourceId) && this.isPresent(employeeId)
        && `${sourceId}`.trim() === `${employeeId}`.trim();
      const nameMatches = this.isPresent(sourceName) && this.isPresent(employeeName)
        && this.normalizeSearchText(sourceName) === this.normalizeSearchText(employeeName);
      return idMatches || nameMatches;
    }) || null;
  }

  private getRawValue(row: any, keys: string[]): any {
    if (!row || typeof row !== 'object') {
      return null;
    }

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key) && this.isPresent(row[key])) {
        return row[key];
      }
    }

    return null;
  }

  private drawPdfSummaryCards(doc: any, section: ReportSection, y: number, pageWidth: number): void {
    const visibleSummary = section.summary.slice(0, 6);
    if (!visibleSummary.length) return;

    const gap = 3;
    const cardWidth = (pageWidth - 28 - gap * (visibleSummary.length - 1)) / visibleSummary.length;
    visibleSummary.forEach((item, index) => {
      const x = 14 + index * (cardWidth + gap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, cardWidth, 11, 2, 2, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(String(item.label).toUpperCase(), x + 2, y + 4);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(String(item.value), x + 2, y + 8.4);
    });
    doc.setTextColor(0);
  }

  private drawPdfPageHeader(
    doc: any,
    pageWidth: number,
    sections: ReportSection[] = this.sections,
    reportTitle = 'Overall Department Performance Report'
  ): void {
    const departmentNames = Array.from(new Set(sections.map(section => section.departmentName).filter(Boolean)));
    const reportNames = Array.from(new Set(sections.map(section => section.reportTitle).filter(Boolean)));
    const totalRecords = sections.reduce((total, section) => total + section.filteredRows.length, 0);
    const departmentLabel = departmentNames.length === 1
      ? departmentNames[0]
      : this.selectedDepartmentLabel;
    const detailLabel = reportNames.length === 1
      ? `Department: ${departmentLabel} | Report: ${reportNames[0]} | Records: ${totalRecords}`
      : `Departments: ${departmentLabel} | Total Departments: ${departmentNames.length} | Overall Total Records: ${totalRecords}`;

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 32, 'F');
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 30, pageWidth, 2, 'F');

    doc.setFillColor(37, 99, 235);
    doc.roundedRect(14, 5.5, 24, 6.5, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text('RIDSYS', 26, 9.8, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16.5);
    doc.setTextColor(255, 255, 255);
    doc.text(reportTitle, 44, 10.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Selected Period: ${this.dateRangeLabel}`, 14, 20);
    doc.text(`Generated By: ${this.generatedBy}`, 14, 26);
    doc.text(`Generated At: ${this.generatedAt.toLocaleString()}`, pageWidth - 14, 20, { align: 'right' });
    doc.text(detailLabel, pageWidth - 14, 26, { align: 'right' });
    doc.setTextColor(0);
  }

  private drawPdfDepartmentHeading(doc: any, section: ReportSection, y: number, pageWidth: number): void {
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(14, y - 5, pageWidth - 28, 9, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`${section.departmentName.toUpperCase()} DEPARTMENT`, 18, y + 1);
    doc.setTextColor(0);
  }

  private drawPdfSectionHeader(doc: any, section: ReportSection, y: number, pageWidth: number): void {
    const [accentR, accentG, accentB] = section.accent;
    const department = this.getDepartmentName(section);
    const reportName = this.getReportTitle(section);
    const top = y - 6;
    const height = 18;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, top, pageWidth - 28, height, 2.5, 2.5, 'FD');
    doc.setFillColor(accentR, accentG, accentB);
    doc.roundedRect(14, top, 4, height, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(accentR, accentG, accentB);
    doc.text(department.toUpperCase(), 22, y - 0.5);

    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(reportName, 22, y + 7);

    doc.setFillColor(accentR, accentG, accentB);
    doc.roundedRect(pageWidth - 45, y - 2.5, 31, 6.5, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(`${section.filteredRows.length} Records`, pageWidth - 29.5, y + 1.8, { align: 'center' });
    doc.setTextColor(0);
  }

  getDepartmentName(section: ReportSection): string {
    if (section.departmentName) {
      return section.departmentName;
    }

    const separatorIndex = section.title.indexOf(' - ');
    return separatorIndex >= 0 ? section.title.slice(0, separatorIndex) : this.selectedDepartmentLabel;
  }

  getReportTitle(section: ReportSection): string {
    if (section.reportTitle) {
      return section.reportTitle;
    }

    const separatorIndex = section.title.indexOf(' - ');
    return separatorIndex >= 0 ? section.title.slice(separatorIndex + 3) : section.title;
  }

  private applyPdfSemanticCellStyle(data: any, section: ReportSection): void {
    if (data.section !== 'body') return;

    const semanticStyle = this.getPdfSemanticCellStyle(
      section.columns[data.column.index],
      data.cell.raw
    );
    if (!semanticStyle) return;

    data.cell.styles.fillColor = semanticStyle.fillColor;
    data.cell.styles.textColor = semanticStyle.textColor;
    data.cell.styles.lineColor = semanticStyle.borderColor;
    data.cell.styles.fontStyle = 'bold';
    data.cell.styles.halign = 'center';
  }

  private getPdfSemanticCellStyle(
    column: string,
    value: any
  ): {
    fillColor: [number, number, number];
    textColor: [number, number, number];
    borderColor: [number, number, number];
  } | null {
    const columnKey = this.normalizeStatusKey(column);
    const valueKey = this.normalizeStatusKey(value);
    if (!valueKey || valueKey === 'na') return null;

    if (columnKey === 'releasetype') {
      if (valueKey === 'internal') return { fillColor: [219, 234, 254], textColor: [30, 64, 175], borderColor: [147, 197, 253] };
      if (valueKey === 'external') return { fillColor: [243, 232, 255], textColor: [107, 33, 168], borderColor: [216, 180, 254] };
      return { fillColor: [241, 245, 249], textColor: [71, 85, 105], borderColor: [203, 213, 225] };
    }

    if (columnKey !== 'status') return null;
    if (['pass', 'passed', 'completed', 'approved', 'closed', 'production'].includes(valueKey)) {
      return { fillColor: [220, 252, 231], textColor: [21, 128, 61], borderColor: [134, 239, 172] };
    }
    if (['failed', 'rejected', 'cancelled', 'canceled'].includes(valueKey)) {
      return { fillColor: [254, 226, 226], textColor: [185, 28, 28], borderColor: [252, 165, 165] };
    }
    if (['inprogress', 'testing', 'intesting', 'tobetested', 'service'].includes(valueKey)) {
      return { fillColor: [219, 234, 254], textColor: [30, 64, 175], borderColor: [147, 197, 253] };
    }
    if (['open', 'pending', 'onhold', 'delayed', 'upcoming', 'upcomingrelease', 'reopen', 'reopened'].includes(valueKey)) {
      return { fillColor: [254, 243, 199], textColor: [146, 64, 14], borderColor: [253, 230, 138] };
    }

    return { fillColor: [241, 245, 249], textColor: [71, 85, 105], borderColor: [203, 213, 225] };
  }

  private isReleaseRow(row: any): boolean {
    if (!row || typeof row !== 'object') return false;
    if (this.isObviousTicketRow(row) || this.isObviousIssueRow(row) || this.isObviousTaskRow(row)) return false;
    return this.hasAnyKey(row, [
      'release_code',
      'releaseCode',
      'release_id',
      'releaseid',
      'release_type',
      'releaseType',
      'released_date',
      'release_date',
      'qc_testing_start_date',
      'qc_testing_end_date',
      'qc_release_date'
    ]) || this.hasAnyKey(row, ['title', 'name', 'status', 'version', 'id']);
  }

  private isTaskRow(row: any): boolean {
    if (!row || typeof row !== 'object') return false;
    if (this.isObviousTicketRow(row) || this.isObviousIssueRow(row) || this.isObviousReleaseRow(row)) return false;
    return this.hasAnyKey(row, [
      'task_name',
      'taskName',
      'sub_task_name',
      'subTaskName',
      'task_code',
      'taskCode',
      'task_id',
      'taskid',
      'task_type'
    ]) || this.hasAnyKey(row, ['title', 'name', 'status', 'id']);
  }

  private isIssueRow(row: any): boolean {
    if (!row || typeof row !== 'object') return false;
    if (this.isObviousTicketRow(row) || this.isObviousTaskRow(row) || this.isObviousReleaseRow(row)) return false;
    return this.hasAnyKey(row, [
      'bug_name',
      'bugName',
      'bug_code',
      'bugCode',
      'bug_id',
      'issue_name',
      'issueName',
      'issue_code',
      'issueCode',
      'issue_id',
      'reason_f_issue',
      'reasonFIssue',
      'testing_type',
      'testingType'
    ]) || this.hasAnyKey(row, ['title', 'name', 'status', 'id']);
  }

  private isTicketRow(row: any): boolean {
    if (!row || typeof row !== 'object') return false;
    if (this.isObviousReleaseRow(row) || this.isObviousTaskRow(row) || this.isObviousIssueRow(row)) return false;
    return this.hasAnyKey(row, [
      'ticket_name',
      'ticketName',
      'ticket_code',
      'ticketCode',
      'ticket_id',
      'ticketid',
      'ticket_status',
      'ticketStatus',
      'ticket_category_id',
      'ticketCategoryId',
      'client_comments',
      'overall_ticket_status'
    ]) || this.hasAnyKey(row, ['title', 'name', 'status', 'id']);
  }

  private isObviousReleaseRow(row: any): boolean {
    return this.hasAnyKey(row, [
      'release_code',
      'releaseCode',
      'release_id',
      'release_type',
      'releaseType',
      'released_date',
      'release_date',
      'qc_testing_end_date'
    ]);
  }

  private isObviousTaskRow(row: any): boolean {
    return this.hasAnyKey(row, [
      'task_name',
      'taskName',
      'sub_task_name',
      'subTaskName',
      'task_code',
      'taskCode',
      'task_id',
      'task_type'
    ]);
  }

  private isObviousIssueRow(row: any): boolean {
    return this.hasAnyKey(row, [
      'bug_name',
      'bugName',
      'bug_code',
      'bugCode',
      'bug_id',
      'issue_name',
      'issueName',
      'issue_code',
      'issueCode',
      'reason_f_issue',
      'testing_type'
    ]);
  }

  private isObviousTicketRow(row: any): boolean {
    return this.hasAnyKey(row, [
      'ticket_name',
      'ticketName',
      'ticket_code',
      'ticketCode',
      'ticket_id',
      'ticket_status',
      'ticket_category_id',
      'client_comments',
      'overall_ticket_status'
    ]);
  }

  private hasAnyKey(row: any, keys: string[]): boolean {
    return keys.some(key => Object.prototype.hasOwnProperty.call(row, key) && this.isPresent(row[key]));
  }

  private uniqueRows(rows: any[]): any[] {
    const seen = new Set<string>();
    const unique: any[] = [];

    rows.forEach(row => {
      const key = [
        this.getFirstValue(row, ['id', 'code', 'ticket_id', 'task_id', 'release_id', 'issue_id', 'bug_id']),
        this.getFirstValue(row, ['ticket_code', 'task_code', 'release_code', 'issue_code', 'bug_code']),
        this.getFirstValue(row, ['ticket_name', 'task_name', 'title', 'name']),
        this.getFirstValue(row, ['created_date', 'released_date', 'date'])
      ].filter(value => value !== null && value !== undefined && `${value}`.trim() !== '').join('|') || JSON.stringify(row);

      if (seen.has(key)) return;
      seen.add(key);
      unique.push(row);
    });

    return unique;
  }

  private getValue(row: any, keys: string[]): any {
    return this.formatCell(this.getFirstValue(row, keys));
  }

  private getFirstValue(row: any, keys: string[]): any {
    if (!row || typeof row !== 'object') return null;

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key) && this.isPresent(row[key])) {
        return this.toDisplayScalar(row[key]);
      }
    }

    return null;
  }

  private toDisplayScalar(value: any, depth = 0): any {
    if (!this.isPresent(value)) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (Array.isArray(value)) return value.length === 1 ? this.toDisplayScalar(value[0], depth + 1) : null;
    if (typeof value === 'object') {
      if (depth > 1) return null;
      return this.getFirstValue(value, ['name', 'title', 'label', 'text', 'value', 'employee_name', 'company_name', 'productName', 'project_title']);
    }

    return value;
  }

  private isPresent(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return `${value}`.trim() !== '';
  }

  private firstPresent(...values: any[]): any {
    return values.find(value => this.isPresent(value)) ?? null;
  }

  private isSameId(first: any, second: any): boolean {
    return this.isPresent(first) && this.isPresent(second) && `${first}`.trim() === `${second}`.trim();
  }

  private normalizeFilterKeys(values: any[]): string[] {
    const keys = new Set<string>();

    values.forEach(value => {
      if (!this.isPresent(value) || value === '-') {
        return;
      }

      const text = `${value}`.trim().toLowerCase();
      if (!text) {
        return;
      }

      keys.add(text);
      keys.add(text.replace(/[^a-z0-9]/g, ''));

      const withoutDepartmentSuffix = text.replace(/\bdepartments?\b/g, '').replace(/\s+/g, ' ').trim();
      if (withoutDepartmentSuffix && withoutDepartmentSuffix !== text) {
        keys.add(withoutDepartmentSuffix);
        keys.add(withoutDepartmentSuffix.replace(/[^a-z0-9]/g, ''));
      }
    });

    return Array.from(keys).filter(Boolean);
  }

  private formatCell(value: any): string {
    if (value === null || value === undefined || `${value}`.trim() === '') return '-';
    return `${value}`.trim();
  }

  private getProjectName(row: any): string {
    return this.getValue(row, ['project_name', 'projectName', 'project_title', 'projectTitle', 'overall_ticket_project', 'product_name', 'productName']);
  }

  private getProductName(row: any): string {
    return this.getValue(row, ['product_name', 'productName', 'product', 'product_title', 'project_name', 'projectName', 'overall_ticket_project']);
  }

  private getCompanyName(row: any): string {
    return this.getValue(row, ['company_name', 'companyName', 'client_name', 'clientName', 'customer_name', 'customerName', 'client', 'customer']);
  }

  private getStatusLabel(row: any): string {
    const rawStatus = this.getFirstValue(row, ['status_name', 'statusName', 'overall_ticket_status', 'status', 'status_id', 'statusId', 'ticket_status', 'ticketStatus', 'current_status']);
    if (!this.isPresent(rawStatus)) {
      return '-';
    }

    const numericStatus = Number(rawStatus);
    const statusMap: Record<number, string> = {
      0: 'Open',
      1: 'In-Progress',
      2: 'To-be-Tested',
      3: 'Delayed',
      4: 'Closed',
      5: 'Cancelled',
      6: 'Approved',
      7: 'Completed',
      8: 'Rejected',
      9: 'Failed',
      10: 'Passed',
      11: 'Re-Open'
    };

    if (Number.isFinite(numericStatus)) {
      return statusMap[numericStatus] || `${rawStatus}`;
    }

    return this.formatCell(rawStatus);
  }

  private formatReleaseTableDate(value: any): string {
    if (!this.isPresent(value) || value === '-') {
      return '-';
    }

    return this.formatReleaseDateOnly(`${value}`) || '-';
  }

  private getReleasePerformance(release: any): string {
    if (this.isUpcomingRelease(release) || this.isReleasePerformancePending(release)) {
      return 'Pending';
    }

    const performanceState = this.getReleasePerformanceState(release);
    if (performanceState === 'excellent') return 'Excellent';
    if (performanceState === 'good') return 'Good';
    if (performanceState === 'poor') return 'Poor';
    return this.getValue(release, ['release_performance', 'releasePerformance', 'performance']);
  }

  private getReleaseOverdueDate(release: any): string {
    if (!this.isUpcomingRelease(release)) {
      const toBeTestedDate = this.getToBeTestedTransitionDate(release);
      return toBeTestedDate ? this.formatReleaseDateOnly(toBeTestedDate) : '-';
    }

    return this.getReleaseOverdueState(release) === 'overdue'
      ? this.formatReleaseDateOnly(`${release?.released_date ?? release?.release_date ?? ''}`.trim()) || '-'
      : '-';
  }

  private getReleaseOverdueStatus(release: any): string {
    if (!this.isUpcomingRelease(release)) {
      return '-';
    }

    const overdueStatusState = this.getReleaseOverdueStatusState(release);
    const daysUntilRelease = this.getDaysUntilRelease(release?.released_date ?? release?.release_date);

    if (overdueStatusState === 'overdue') {
      return 'Overdue';
    }

    if (overdueStatusState === 'high-warning') {
      return daysUntilRelease === 0 ? 'Due Today' : 'Due Tomorrow';
    }

    if (overdueStatusState === 'warning') {
      return `Due in ${daysUntilRelease} Days`;
    }

    return '-';
  }

  private getReleaseOverdueState(release: any): 'none' | 'warning' | 'high-warning' | 'overdue' | 'excellent' | 'good' | 'poor' {
    return this.isUpcomingRelease(release)
      ? (this.isReleaseOverdue(release) ? 'overdue' : 'none')
      : this.getReleasePerformanceState(release);
  }

  private getReleaseOverdueStatusState(release: any): 'none' | 'warning' | 'high-warning' | 'overdue' {
    if (!this.isUpcomingRelease(release)) {
      return 'none';
    }

    const daysUntilRelease = this.getDaysUntilRelease(release?.released_date ?? release?.release_date);
    if (daysUntilRelease === null) {
      return 'none';
    }

    if (daysUntilRelease < 0) {
      return 'overdue';
    }

    if (daysUntilRelease <= 1) {
      return 'high-warning';
    }

    return 'warning';
  }

  private getReleaseQcTestingStartDate(release: any): string {
    const qcTestingStartDate = this.getFirstDateValue(release, ['qc_testing_start_date', 'qcTestingStartDate']);
    return qcTestingStartDate ? this.formatReleaseDateOnly(qcTestingStartDate) : '';
  }

  private getReleaseTesterName(release: any): string {
    if (this.isUpcomingRelease(release)) {
      return '-';
    }

    return this.getValue(release, ['assignee_to_name', 'tested_by_name', 'testedByName', 'assigned_to_name', 'assignedToName']);
  }

  private isReleaseOverdue(release: any): boolean {
    const daysUntilRelease = this.getDaysUntilRelease(release?.released_date ?? release?.release_date);
    return daysUntilRelease !== null && daysUntilRelease < 0;
  }

  private isUpcomingRelease(release: any): boolean {
    return this.normalizeReleaseStatus(release?.status) === 'upcoming-release';
  }

  private isReleasePerformancePending(release: any): boolean {
    return this.normalizeReleaseStatus(release?.status) === 'pending';
  }

  private getReleasePerformanceState(release: any): 'none' | 'excellent' | 'good' | 'poor' {
    const releaseDate = this.parseReleaseDate(`${release?.released_date ?? release?.release_date ?? ''}`.trim());
    const toBeTestedDate = this.parseReleaseDate(this.getToBeTestedTransitionDate(release) || '');

    if (!releaseDate || !toBeTestedDate) {
      return 'none';
    }

    releaseDate.setHours(0, 0, 0, 0);
    toBeTestedDate.setHours(0, 0, 0, 0);

    const daysBeforeRelease = Math.floor((releaseDate.getTime() - toBeTestedDate.getTime()) / 86400000);
    if (daysBeforeRelease >= 2) return 'excellent';
    if (daysBeforeRelease >= 0) return 'good';
    return 'poor';
  }

  private getToBeTestedTransitionDate(release: any): string | null {
    const explicitTransitionDate = this.getFirstDateValue(release, [
      'to_be_tested_date',
      'toBeTestedDate',
      'to_be_tested_at',
      'toBeTestedAt',
      'release_tested_date',
      'release_status_changed_date',
      'status_changed_date'
    ]);

    if (explicitTransitionDate) {
      return explicitTransitionDate;
    }

    const timelineDate = this.getFirstToBeTestedTimelineDate(
      release?.status_logs || release?.statusLogs || release?.activity_logs || release?.activityLogs || release?.logs
    );

    if (timelineDate) {
      return timelineDate;
    }

    return this.normalizeReleaseStatus(release?.status) === 'to-be-tested'
      ? this.getFirstDateValue(release, ['updateddate', 'updated_date'])
      : null;
  }

  private getFirstToBeTestedTimelineDate(logs: any): string | null {
    const timeline = Array.isArray(logs) ? logs : [];
    const toBeTestedLogs = timeline
      .map((log: any) => ({
        date: this.getFirstDateValue(log, ['logdate', 'created_date', 'createddate', 'updated_date', 'updateddate']),
        status: this.normalizeReleaseStatus(log?.status)
      }))
      .filter((log: any) => log.status === 'to-be-tested' && !!log.date)
      .map((log: any) => ({
        date: log.date,
        time: this.getReleaseDateTime(log.date)
      }))
      .filter((log: any) => log.time !== null)
      .sort((first: any, second: any) => first.time - second.time);

    return toBeTestedLogs[0]?.date || null;
  }

  private getFirstDateValue(source: any, keys: string[]): string | null {
    for (const key of keys) {
      const value = `${source?.[key] ?? ''}`.trim();
      if (value && this.getReleaseDateTime(value) !== null) {
        return value;
      }
    }

    return null;
  }

  private getReleaseDateTime(value: string): number | null {
    const parsed = this.parseReleaseDate(value);
    return parsed ? parsed.getTime() : null;
  }

  private normalizeReleaseStatus(status: any): string {
    return `${status ?? ''}`.trim().toLowerCase().replace(/[-_\s]+/g, '-');
  }

  private formatReleaseDateOnly(value: string): string {
    const parsed = this.parseReleaseDate(`${value ?? ''}`.trim());

    if (!parsed) {
      return `${value ?? ''}`.trim();
    }

    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(
      parsed.getDate()
    ).padStart(2, '0')}`;
  }

  private getDaysUntilRelease(releasedDate: string | null | undefined): number | null {
    const rawValue = `${releasedDate ?? ''}`.trim();
    if (!rawValue) {
      return null;
    }

    const releaseDate = this.parseReleaseDate(rawValue);
    if (!releaseDate) {
      return null;
    }

    releaseDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Math.ceil((releaseDate.getTime() - today.getTime()) / 86400000);
  }

  private parseReleaseDate(value: string): Date | null {
    const normalized = value.trim();
    const ymdParts = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);

    if (ymdParts) {
      const year = Number(ymdParts[1]);
      const month = Number(ymdParts[2]);
      const day = Number(ymdParts[3]);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const dmyParts = normalized.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s].*)?$/);

    if (dmyParts) {
      const day = Number(dmyParts[1]);
      const month = Number(dmyParts[2]);
      const year = Number(dmyParts[3]);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private getPriorityLabel(row: any): string {
    const rawPriority = this.getFirstValue(row, ['priority_name', 'priority', 'priority_id']);
    if (!this.isPresent(rawPriority)) {
      return '-';
    }

    const priorityMap: Record<number, string> = {
      1: 'High',
      2: 'Medium',
      3: 'Low'
    };
    const numericPriority = Number(rawPriority);
    return Number.isFinite(numericPriority) ? (priorityMap[numericPriority] || `${rawPriority}`) : this.formatCell(rawPriority);
  }

  private getTicketCategory(row: any): string {
    const rawCategory = this.getFirstValue(row, ['ticket_category_name', 'ticketCategoryName', 'ticket_category', 'ticketCategory', 'category_name', 'category', 'ticket_category_id', 'ticketCategoryId']);
    if (!this.isPresent(rawCategory)) {
      return '-';
    }

    const categoryMap: Record<number, string> = {
      1: 'Production',
      2: 'Service',
      3: 'Ordinary'
    };
    const numericCategory = Number(rawCategory);
    return Number.isFinite(numericCategory) ? (categoryMap[numericCategory] || `${rawCategory}`) : this.formatCell(rawCategory);
  }

  private countByStatus(rows: ReportRow[], statuses: string[]): number {
    const targets = new Set(statuses);
    return rows.filter(row => {
      const status = row.meta.statusKey || '';
      return targets.has(status) || statuses.some(target => status.includes(target));
    }).length;
  }

  private sumWorkedMinutes(rows: ReportRow[]): number {
    return rows.reduce((total, row) => total + (row.meta.workedMinutes || 0), 0);
  }

  private parseWorkedMinutes(value: any): number {
    if (!value || value === '-') return 0;
    if (typeof value === 'number') return Math.round(value * 60);

    const text = `${value}`.trim();
    if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 60);

    const [hours = '0', minutes = '0'] = text.split(':');
    return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  }

  private formatWorkedMinutes(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private summary(label: string, value: string | number, tone: SummaryTone): SummaryCard {
    return { label, value, tone };
  }

  private normalizeSearchText(value: any): string {
    return `${value ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private normalizeObjectKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private normalizeStatusKey(value: any): string {
    return `${value ?? ''}`.trim().toLowerCase().replace(/[^a-z]/g, '');
  }

  private formatDateToYMD(date: Date | string | null): string {
    if (!date) return '';
    const parsed = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  private formatDisplayDate(value: any): string {
    if (!value || value === '-') return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return `${value}`;
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).replace(/ /g, '-');
  }
}
