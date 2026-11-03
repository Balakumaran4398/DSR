import { Component, OnInit } from '@angular/core';
import { AuthService, WeekendSettingsPayload } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

type HolidayType = 'National' | 'Religious' | 'Company';
type SaturdayRule = 'none' | 'all' | 'second-fourth' | 'first-third-fifth';

interface HolidayEntry {
  id: string;
  date: string;
  name: string;
  description: string;
  type: string;
}

interface HolidayGroup {
  key: string;
  entries: HolidayEntry[];
}

interface WeekendSettings {
  id: number;
  sunday_off: boolean;
  monday_off: boolean;
  tuesday_off: boolean;
  wednesday_off: boolean;
  thursday_off: boolean;
  friday_off: boolean;
  saturday_off: boolean;
  saturday_type: string;
}

@Component({
  selector: 'app-holiday-calendar',
  templateUrl: './holiday-calendar.component.html',
  styleUrls: ['./holiday-calendar.component.scss']
})
export class HolidayCalendarComponent implements OnInit {
  readonly weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  readonly types: HolidayType[] = ['National', 'Religious', 'Company'];
  readonly yearOptions: number[];
  year = new Date().getFullYear();
  holidays: HolidayEntry[] = [];
  weeklyOffDays: string[] = ['Sunday'];
  saturdayRule: SaturdayRule = 'second-fourth';
  searchTerm = '';
  typeFilter: HolidayType | 'All' = 'All';
  isEditorOpen = false;
  editorMode: 'create' | 'edit' | 'delete' = 'create';
  editingHolidayId: number | null = null;
  deleteConfirmed = false;
  isLoadingHolidays = false;
  isLoadingWeekendSettings = false;
  isSavingWeekendSettings = false;
  isSavingHoliday = false;
  isDeletingHoliday = false;
  holidayError = '';
  weekendSettingsError = '';
  weekendSettingsResponse: any = null;
  editorError = '';
  draftDate: Date | null = null;
  draft: { date: string; name: string; description: string; type: string } = this.emptyDraft();
  private companyId: number | null = null;
  weekendSettingsId: number | null = null;

  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private toaster: ToasterService
  ) {
    const thisYear = new Date().getFullYear();
    this.yearOptions = Array.from({ length: 9 }, (_value, index) => thisYear - 3 + index);
  }

  ngOnInit(): void {
    const companyId = Number(this.storageService.getCompanyId());
    if (!Number.isFinite(companyId) || companyId <= 0) {
      this.holidayError = 'Company information is unavailable. Please sign in again.';
      this.weekendSettingsError = this.holidayError;
      return;
    }
    this.companyId = companyId;
    this.loadHolidays();
    if (this.canManage) this.loadWeekendSettings();
  }

  get canManage(): boolean {  
    return this.storageService.roles.isAdmin;
  }

  get minHolidayDate(): Date {
    return new Date(this.year, 0, 1);
  }

  get maxHolidayDate(): Date {
    return new Date(this.year, 11, 31);
  }

  get yearHolidays(): HolidayEntry[] {
    return this.holidays.filter(holiday => holiday.date.startsWith(`${this.year}-`));
  }

  get nationalCount(): number {
    return this.yearHolidays.filter(holiday => holiday.type.toLowerCase() === 'national').length;
  }

  get religiousCount(): number {
    return this.yearHolidays.filter(holiday => holiday.type.toLowerCase() === 'religious').length;
  }

  get companyCount(): number {
    return this.yearHolidays.filter(holiday => holiday.type.toLowerCase() === 'company').length;
  }

  get filteredHolidayCount(): number {
    return this.filteredGroups.reduce((total, group) => total + group.entries.length, 0);
  }

  get filteredGroups(): HolidayGroup[] {
    const search = this.searchTerm.trim().toLowerCase();
    const filtered = this.yearHolidays
      .filter(holiday => this.typeFilter === 'All' || holiday.type.toLowerCase() === this.typeFilter.toLowerCase())
      .filter(holiday => !search || `${holiday.name} ${holiday.description} ${holiday.type}`.toLowerCase().includes(search))
      .sort((a, b) => a.date.localeCompare(b.date));
    const groups = new Map<string, HolidayEntry[]>();
    filtered.forEach(holiday => {
      const monthKey = holiday.date.slice(0, 7);
      groups.set(monthKey, [...(groups.get(monthKey) || []), holiday]);
    });
    return Array.from(groups, ([key, entries]) => ({ key, entries }));
  }

  get selectedWeeklyOffSummary(): string {
    const days = [...this.weeklyOffDays];
    if (this.saturdayRule !== 'none') days.push(this.saturdayRuleLabel);
    return days.length ? days.join(', ') : 'No weekly days off selected';
  }

  get saturdayRuleLabel(): string {
    const labels: Record<SaturdayRule, string> = {
      none: 'No Saturday off',
      all: 'All Saturdays',
      'second-fourth': '2nd & 4th Saturday',
      'first-third-fifth': '1st, 3rd & 5th Saturday'
    };
    return labels[this.saturdayRule];
  }

  changeYear(value: number): void {
    this.year = Number(value);
    this.closeEditor();
  }

  loadHolidays(): void {
    if (this.companyId === null) return;
    this.isLoadingHolidays = true;
    this.holidayError = '';
    this.authService.getHolidays(this.companyId).subscribe({
      next: (response: any) => {
        this.holidays = this.normalizeHolidayResponse(response);
        this.isLoadingHolidays = false;
      },
      error: (error: any) => {
        this.isLoadingHolidays = false;
        this.holidayError = this.errorMessage(error, 'Unable to load holidays.');
      }
    });
  }

  loadWeekendSettings(afterLoad?: () => void): void {
    if (this.companyId === null) return;
    this.isLoadingWeekendSettings = true;
    this.weekendSettingsError = '';
    this.authService.getWeekendSettings(this.companyId).subscribe({
      next: (response: any) => {
        this.weekendSettingsResponse = response;
        const settings = this.normalizeWeekendResponse(response);
        if (!settings || !Number.isFinite(Number(settings.id)) || Number(settings.id) <= 0) {
          this.weekendSettingsError = 'Weekend settings were not returned by the server.';
          this.weekendSettingsId = null;
        } else {
          this.weekendSettingsId = Number(settings.id);
          this.weeklyOffDays = this.weekdays.filter(day => settings[`${day.toLowerCase()}_off` as keyof WeekendSettings] === true);
          this.saturdayRule = this.normalizeSaturdayRule(settings.saturday_type, settings.saturday_off);
        }
        this.isLoadingWeekendSettings = false;
        if (this.weekendSettingsId !== null) afterLoad?.();
      },
      error: (error: any) => {
        this.isLoadingWeekendSettings = false;
        this.weekendSettingsResponse = null;
        this.weekendSettingsId = null;
        this.weekendSettingsError = this.errorMessage(error, 'Unable to load weekly off settings.');
      }
    });
  }

  toggleWeeklyOff(day: string): void {
    if (!this.canManage || this.isLoadingWeekendSettings || this.isSavingWeekendSettings) return;
    const applyChange = () => {
      const previousDays = [...this.weeklyOffDays];
      const previousSaturdayRule = this.saturdayRule;
      this.weeklyOffDays = this.weeklyOffDays.includes(day)
        ? this.weeklyOffDays.filter(selected => selected !== day)
        : [...this.weeklyOffDays, day];
      this.saveWeekendSettings(previousDays, previousSaturdayRule);
    };
    if (this.weekendSettingsId === null) {
      this.loadWeekendSettings(applyChange);
      return;
    }
    applyChange();
  }

  setSaturdayRule(rule: SaturdayRule): void {
    if (!this.canManage || this.isLoadingWeekendSettings || this.isSavingWeekendSettings) return;
    const applyChange = () => {
      const previousDays = [...this.weeklyOffDays];
      const previousSaturdayRule = this.saturdayRule;
      this.saturdayRule = rule;
      this.saveWeekendSettings(previousDays, previousSaturdayRule);
    };
    if (this.weekendSettingsId === null) {
      this.loadWeekendSettings(applyChange);
      return;
    }
    applyChange();
  }

  openAddHoliday(): void {
    if (!this.canManage) return;
    this.editorMode = 'create';
    this.editingHolidayId = null;
    this.deleteConfirmed = false;
    this.draft = this.emptyDraft();
    this.draftDate = null;
    this.editorError = '';
    this.isEditorOpen = true;
  }

  openEditHoliday(holiday: HolidayEntry): void {
    if (!this.canManage) return;
    const id = Number(holiday.id);
    if (!Number.isFinite(id) || id <= 0) {
      this.toaster.error('This holiday cannot be edited because its ID is unavailable.');
      return;
    }
    this.editorMode = 'edit';
    this.editingHolidayId = id;
    this.deleteConfirmed = false;
    this.setDraftFromHoliday(holiday);
    this.editorError = '';
    this.isEditorOpen = true;
  }

  openDeleteHoliday(holiday: HolidayEntry): void {
    if (!this.canManage) return;
    const id = Number(holiday.id);
    if (!Number.isFinite(id) || id <= 0) {
      this.toaster.error('This holiday cannot be deleted because its ID is unavailable.');
      return;
    }
    this.editorMode = 'delete';
    this.editingHolidayId = id;
    this.deleteConfirmed = false;
    this.setDraftFromHoliday(holiday);
    this.editorError = '';
    this.isEditorOpen = true;
  }

  closeEditor(): void {
    if (this.isSavingHoliday || this.isDeletingHoliday) return;
    this.isEditorOpen = false;
    this.editorMode = 'create';
    this.editingHolidayId = null;
    this.deleteConfirmed = false;
    this.editorError = '';
    this.draft = this.emptyDraft();
    this.draftDate = null;
  }

  onDraftDateChange(date: Date | null): void {
    this.draftDate = date;
    this.draft.date = date && !isNaN(date.getTime()) ? this.formatLocalDate(date) : '';
    this.editorError = '';
  }

  resetEditor(): void {
    this.editorError = '';
    if (this.editorMode === 'edit') {
      const holiday = this.holidays.find(item => Number(item.id) === this.editingHolidayId);
      if (holiday) {
        this.setDraftFromHoliday(holiday);
        return;
      }
    }
    this.draft = this.emptyDraft();
    this.draftDate = null;
  }

  saveHoliday(): void {
    if (!this.canManage || this.isSavingHoliday) return;
    const companyId = this.companyId;
    const createdBy = `${this.storageService.getUsername() || ''}`.trim();
    const name = this.draft.name.trim();
    const date = this.draftDate && !isNaN(this.draftDate.getTime()) ? this.formatLocalDate(this.draftDate) : '';
    if (!name || !date) {
      this.editorError = 'Enter a holiday name and date.';
      return;
    }
    if (!companyId || !createdBy) {
      this.editorError = 'Company or login information is unavailable. Please sign in again.';
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) !== this.year) {
      this.editorError = `Choose a valid date in ${this.year}.`;
      return;
    }

    this.editorError = '';
    this.isSavingHoliday = true;
    const payload = {
      title: name,
      holiday_date: date,
      companyid: companyId,
      type: this.draft.type,
      remarks: this.draft.description.trim(),
      createdby: createdBy
    };
    const request = this.editorMode === 'edit' && this.editingHolidayId !== null
      ? this.authService.editHoliday({ ...payload, id: this.editingHolidayId })
      : this.authService.createHoliday(payload);
    request.subscribe({
      next: (response: any) => {
        this.isSavingHoliday = false;
        this.toaster.success(response?.message || (this.editorMode === 'edit' ? 'Holiday updated successfully.' : 'Holiday created successfully.'));
        this.closeEditor();
        this.loadHolidays();
      },
      error: (error: any) => {
        this.isSavingHoliday = false;
        this.editorError = this.errorMessage(error, this.editorMode === 'edit' ? 'Unable to update holiday. Please try again.' : 'Unable to create holiday. Please try again.');
      }
    });
  }

  deleteHoliday(): void {
    if (!this.canManage || this.editorMode !== 'delete' || !this.deleteConfirmed || this.isDeletingHoliday) return;
    const id = this.editingHolidayId;
    const createdBy = `${this.storageService.getUsername() || ''}`.trim();
    if (id === null || !createdBy) {
      this.editorError = 'Holiday ID or login information is unavailable. Please sign in again.';
      return;
    }
    this.editorError = '';
    this.isDeletingHoliday = true;
    this.authService.deleteHoliday(id, createdBy).subscribe({
      next: (response: any) => {
        this.isDeletingHoliday = false;
        this.toaster.success(response?.message || 'Holiday deleted successfully.');
        this.closeEditor();
        this.loadHolidays();
      },
      error: (error: any) => {
        this.isDeletingHoliday = false;
        this.editorError = this.errorMessage(error, 'Unable to delete holiday. Please try again.');
      }
    });
  }

  monthLabel(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  holidayDay(dateValue: string): string {
    return this.parseLocalDate(dateValue).toLocaleDateString('en-US', { weekday: 'long' });
  }

  holidayDateLabel(dateValue: string): string {
    return this.parseLocalDate(dateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  trackByHoliday(_index: number, holiday: HolidayEntry): string {
    return holiday.id;
  }

  private saveWeekendSettings(previousDays: string[], previousSaturdayRule: SaturdayRule): void {
    const companyId = this.companyId;
    const settingsId = this.weekendSettingsId;
    const createdBy = `${this.storageService.getUsername() || ''}`.trim();
    if (companyId === null || settingsId === null || !createdBy) {
      this.weeklyOffDays = previousDays;
      this.saturdayRule = previousSaturdayRule;
      this.weekendSettingsError = 'Company, settings, or login information is unavailable.';
      return;
    }

    const payload: WeekendSettingsPayload = {
      companyid: companyId,
      id: settingsId,
      sunday_off: this.weeklyOffDays.includes('Sunday'),
      monday_off: this.weeklyOffDays.includes('Monday'),
      tuesday_off: this.weeklyOffDays.includes('Tuesday'),
      wednesday_off: this.weeklyOffDays.includes('Wednesday'),
      thursday_off: this.weeklyOffDays.includes('Thursday'),
      friday_off: this.weeklyOffDays.includes('Friday'),
      saturday_off: this.saturdayRule !== 'none',
      saturday_type: this.saturdayRule,
      createdby: createdBy
    };
    this.isSavingWeekendSettings = true;
    this.weekendSettingsError = '';
    this.authService.updateWeekendSettings(payload).subscribe({
      next: (response: any) => {
        this.isSavingWeekendSettings = false;
        this.weekendSettingsError = '';
        const updatedSettings = this.normalizeWeekendResponse(response);
        if (updatedSettings && Number.isFinite(updatedSettings.id) && updatedSettings.id > 0) {
          this.weekendSettingsId = updatedSettings.id;
        }
        this.toaster.success(response?.message || 'Weekly off settings updated.');
      },
      error: (error: any) => {
        this.isSavingWeekendSettings = false;
        this.weeklyOffDays = previousDays;
        this.saturdayRule = previousSaturdayRule;
        this.weekendSettingsError = this.errorMessage(error, 'Unable to update weekly off settings.');
        this.toaster.error(this.weekendSettingsError);
      }
    });
  }

  private normalizeHolidayResponse(response: any): HolidayEntry[] {
    const value = response?.data ?? response?.holidays ?? response;
    const items = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
    return items
      .map((item: any, index: number) => {
        const date = `${item?.holiday_date ?? item?.date ?? ''}`.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
        return {
          id: `${item?.id ?? `${date}-${index}`}`,
          date,
          name: `${item?.title ?? item?.name ?? ''}`,
          description: `${item?.remarks ?? item?.description ?? ''}`,
          type: this.normalizeHolidayType(item?.type)
        } as HolidayEntry;
      })
      .filter((holiday: HolidayEntry | null): holiday is HolidayEntry => holiday !== null);
  }

  private normalizeHolidayType(value: any): string {
    const type = `${value ?? ''}`.trim().toLowerCase();
    return this.types.find(option => option.toLowerCase() === type) || `${value || 'Company'}`;
  }

  private normalizeWeekendResponse(response: any): WeekendSettings | null {
    const value = response?.data?.settings ?? response?.data?.result ?? response?.data ?? response?.settings ?? response?.result ?? response;
    const item = Array.isArray(value) ? value[0] : value;
    if (!item || typeof item !== 'object') return null;
    return {
      id: Number(item.id),
      sunday_off: this.toBoolean(item.sunday_off),
      monday_off: this.toBoolean(item.monday_off),
      tuesday_off: this.toBoolean(item.tuesday_off),
      wednesday_off: this.toBoolean(item.wednesday_off),
      thursday_off: this.toBoolean(item.thursday_off),
      friday_off: this.toBoolean(item.friday_off),
      saturday_off: this.toBoolean(item.saturday_off),
      saturday_type: `${item.saturday_type ?? ''}`
    };
  }

  private normalizeSaturdayRule(value: string, saturdayOff: boolean): SaturdayRule {
    const normalized = `${value || ''}`.toLowerCase().replace(/_/g, '-');
    if (['none', 'all', 'second-fourth', 'first-third-fifth'].includes(normalized)) return normalized as SaturdayRule;
    return saturdayOff ? 'all' : 'none';
  }

  private toBoolean(value: any): boolean {
    return value === true || value === 1 || `${value}`.toLowerCase() === 'true';
  }

  private errorMessage(error: any, fallback: string): string {
    return error?.error?.message || error?.error?.error || error?.message || fallback;
  }

  private emptyDraft(): { date: string; name: string; description: string; type: string } {
    return { date: '', name: '', description: '', type: 'National' };
  }

  private setDraftFromHoliday(holiday: HolidayEntry): void {
    this.draft = {
      date: holiday.date,
      name: holiday.name,
      description: holiday.description,
      type: this.normalizeHolidayType(holiday.type)
    };
    this.draftDate = this.parseLocalDate(holiday.date);
  }

  private parseLocalDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private formatLocalDate(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
