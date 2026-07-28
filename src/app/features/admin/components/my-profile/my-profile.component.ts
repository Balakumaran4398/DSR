import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';
import { SkillDialogComponent, SkillDialogPayload, SkillDialogResult } from './skill-dialog/skill-dialog.component';
import Swal from 'sweetalert2';

interface ProfileHighlight {
  label: string;
  value: string;
  subtitle: string;
  icon: string;
}

interface ProfileInfoItem {
  label: string;
  value: string;
  icon: string;
  mono?: boolean;
}

interface ProfileSkillDetail {
  id: number;
  employeeid: number;
  name: string;
  category: string;
  experience: string;
  level: number;
  icon: string;
  created_date: string;
  updated_date: string;
}

@Component({
  selector: 'app-my-profile',
  templateUrl: './my-profile.component.html',
  styleUrls: ['./my-profile.component.scss']
})
export class MyProfileComponent implements OnInit {
  empid: any = 0;
  username: any;
  profile: any = null;
  loading = true;
  loadFailed = false;
  skillDetails: ProfileSkillDetail[] = [];

  constructor(
    private dialog: MatDialog,
    private authService: AuthService,
    private storageService: StorageService,
    private toasterService: ToasterService
  ) { }

  ngOnInit(): void {
    this.empid = this.storageService.getEmpId();
    this.username = this.storageService.getUsername();
    console.log(this.username);
    
    this.loadProfile();
  }

  loadProfile(): void {
    if (!this.empid) {
      this.loading = false;
      this.loadFailed = true;
      return;
    }

    this.loading = true;
    this.loadFailed = false;

    this.authService.getemployeedetails(this.username).subscribe({
      next: (res: any) => {
        this.profile = this.extractCurrentUser(res);
        this.skillDetails = this.buildSkillDetails(this.profile);
        this.loading = false;
        this.loadFailed = !this.profile;
      },
      error: (err: any) => {
        this.loading = false;
        this.loadFailed = true;
        this.toasterService.error(err?.error?.message || 'Unable to load profile details right now.');
      }
    });
  }

  get fullName(): string {
    const firstName = this.profile?.firstname || this.profile?.employee_name || '';
    const lastName = this.profile?.lastname || '';
    const fullName = `${firstName} ${lastName}`.trim();

    return fullName || this.storageService.getEmpName() || 'Team Member';
  }

  get profileTitle(): string {
    return this.profile?.position || this.storageService.getDesignation() || 'Professional';
  }

  get profileSubtitle(): string {
    return this.profile?.department_name || this.profile?.department || 'Profile overview';
  }

  get avatarUrl(): string | null {
    return this.profile?.profile_image_url || this.profile?.image_url || null;
  }

  get avatarInitials(): string {
    return this.getInitials(this.fullName);
  }

  get heroMeta(): Array<{ icon: string; value: string; label: string }> {
    return [
      { icon: 'ri-mail-line', value: this.profile?.email || '', label: 'email' },
      { icon: 'ri-phone-line', value: this.profile?.mobile || '', label: 'mobile' },
      // { icon: 'ri-building-line', value: this.profile?.department_name || '', label: 'department' },
      { icon: 'ri-time-line', value: this.profile?.shift_type || '', label: 'shift' }
    ].filter((item) => !!item.value);
  }

  get highlights(): ProfileHighlight[] {
    return [
      {
        label: 'Employee ID',
        value: this.profile?.attendanceid || this.profile?.empid || this.empid || 'NA',
        subtitle: 'Attendance / employee reference',
        icon: 'ri-fingerprint-line'
      },
      {
        label: 'Status',
        value: this.profile?.isactive ? 'Active' : 'Inactive',
        subtitle: this.profile?.wfh ? 'Working in hybrid / WFH mode' : 'Working from office',
        icon: this.profile?.isactive ? 'ri-verified-badge-line' : 'ri-close-circle-line'
      },
      {
        label: 'Joined',
        value: this.formatDate(this.profile?.joining_date),
        subtitle: 'Company onboarding date',
        icon: 'ri-calendar-check-line'
      }
    ];
  }

  get professionalItems(): ProfileInfoItem[] {
    return [
      // { label: 'Designation', value: this.profile?.position, icon: 'ri-briefcase-4-line' },
      // { label: 'Department', value: this.profile?.department_name, icon: 'ri-building-2-line' },
      { label: 'Role', value: this.profile?.role, icon: 'ri-shield-user-line' },
      // { label: 'Shift', value: this.profile?.shift_type, icon: 'ri-time-line' },
      // { label: 'Reference No', value: this.profile?.reference_no, icon: 'ri-price-tag-3-line', mono: true },
      { label: 'Attendance ID', value: this.profile?.attendanceid, icon: 'ri-id-card-line', mono: true }
    ];
  }

  get heroProfessionalItems(): ProfileInfoItem[] {
    return this.professionalItems.slice(0, 3);
  }

  get contactItems(): ProfileInfoItem[] {
    return [
      { label: 'Official Email', value: this.profile?.email, icon: 'ri-mail-open-line' },
      { label: 'Alternate Email', value: this.profile?.alternate_email, icon: 'ri-mail-add-line' },
      { label: 'Mobile Number', value: this.profile?.mobile, icon: 'ri-smartphone-line', mono: true },
      { label: 'Employee Login', value: this.storageService.getUsername(), icon: 'ri-user-settings-line' }
    ];
  }

  get personalItems(): ProfileInfoItem[] {
    return [
      { label: 'Date of Birth', value: this.formatDate(this.profile?.date_of_birth), icon: 'ri-cake-2-line' },
      { label: 'Gender', value: this.profile?.gender, icon: 'ri-user-heart-line' },
      { label: 'Blood Group', value: this.profile?.blood_group, icon: 'ri-heart-pulse-line' },
      { label: 'Marital Status', value: this.profile?.marital_status, icon: 'ri-group-line' },
      { label: 'Work Mode', value: this.profile?.wfh ? 'WFH Enabled' : 'Office Based', icon: 'ri-home-office-line' },
      { label: 'Current Status', value: this.profile?.isactive ? 'Available' : 'Inactive', icon: 'ri-pulse-line' }
    ];
  }

  get showSkillsCard(): boolean {
    return !this.storageService.roles.isAdmin;
  }

  get timelineCards(): Array<{ title: string; value: string; helper: string }> {
    return [
      {
        title: 'Profile Completion',
        value: `${this.profileCompletion}%`,
        helper: 'Based on available profile fields'
      },
      {
        title: 'Department',
        value: this.profile?.department_name || 'Not assigned',
        helper: 'Current working unit'
      },
      {
        title: 'Primary Role',
        value: this.profile?.position || 'Not assigned',
        helper: 'Current designation'
      }
    ];
  }

  get profileCompletion(): number {
    const checks = [
      this.profile?.firstname || this.profile?.employee_name,
      this.profile?.lastname,
      this.profile?.email,
      this.profile?.mobile,
      this.profile?.department_name,
      this.profile?.position,
      this.profile?.joining_date,
      this.profile?.attendanceid,
      this.profile?.date_of_birth,
      this.profile?.profile_image_url || this.profile?.image_url
    ];

    const availableCount = checks.filter((item) => !!item).length;
    return Math.round((availableCount / checks.length) * 100);
  }

  get completionGradient(): string {
    const progress = this.profileCompletion * 3.6;
    return `conic-gradient(var(--text-active) 0deg ${progress}deg, rgba(148, 163, 184, 0.18) ${progress}deg 360deg)`;
  }

  trackByLabel(index: number, item: ProfileInfoItem | ProfileHighlight | { label: string }): string {
    return `${index}-${item.label}`;
  }

  trackByValue(index: number, item: string): string {
    return `${index}-${item}`;
  }

  trackBySkill(index: number, item: ProfileSkillDetail): string {
    return `${item.id || index}-${item.name}-${item.category}`;
  }

  openSkillDialog(skill?: ProfileSkillDetail): void {
    const dialogRef = this.dialog.open(SkillDialogComponent, {
      width: '100%',
      maxWidth: '32rem',
      panelClass: 'profile-skill-dialog-panel',
      autoFocus: false,
      data: skill ? { skill: this.mapSkillForDialog(skill) } : null
    });

    dialogRef.afterClosed().subscribe((result: SkillDialogResult | undefined) => {
      if (!result?.saved) {
        return;
      }
      this.loadProfile();
    });
  }

  removeSkill(skill: ProfileSkillDetail): void {
    if (!skill) {
      this.toasterService.error('Skill details are not available for delete.');
      return;
    }

    const payload = this.mapSkillForDialog(skill);

    Swal.fire({
      title: 'Delete Skill?',
      text: `Are you sure you want to delete "${skill.name}" from your skill set?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }

      this.authService.deleteSkill(payload).subscribe({
        next: (res: any) => {
          this.toasterService.success(res?.message || `${skill.name} deleted successfully.`);
          this.loadProfile();
        },
        error: (err: any) => {
          this.toasterService.error(err?.error?.message || 'Unable to delete skill.');
        }
      });
    });
  }

  private extractCurrentUser(response: any): any {
    const collection = this.normalizeResponse(response);
    if (!collection.length) {
      return null;
    }

    return collection.find((item: any) => this.matchesEmployee(item)) || collection[0];
  }

  private normalizeResponse(response: any): any[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (Array.isArray(response?.data)) {
      return response.data;
    }

    if (response?.data && typeof response.data === 'object') {
      return [response.data];
    }

    if (response && typeof response === 'object') {
      return [response];
    }

    return [];
  }

  private matchesEmployee(item: any): boolean {
    const currentId = `${this.empid ?? ''}`;
    const keys = [item?.empid, item?.employee_id, item?.employeeid, item?.id, item?.attendanceid];

    return keys.some((value) => `${value ?? ''}` === currentId);
  }

  private buildSkillDetails(profile: any): ProfileSkillDetail[] {
    const rawSkills = profile?.skill_set || profile?.skillset || profile?.skills || profile?.technologies || profile?.tech_stack;
    const defaultLevels = [92, 84, 76, 88, 72, 81];
    const defaultIcons = [
      'ri-code-s-slash-line',
      'ri-palette-line',
      'ri-database-2-line',
      'ri-layout-4-line',
      'ri-settings-3-line',
      'ri-terminal-box-line'
    ];

    if (Array.isArray(rawSkills) && rawSkills.length) {
      return rawSkills.map((skill: any, index: number) => {
        if (typeof skill === 'object' && skill !== null) {
          return {
            id: Number(skill.id || skill.skill_id) || 0,
            employeeid: Number(skill.employeeid || skill.employee_id || skill.empid || this.empid) || 0,
            name: skill.name || skill.skill || skill.title || `Skill ${index + 1}`,
            category: skill.category || skill.type || 'Technical Skill',
            experience: skill.experience || skill.years || 'Demo experience',
            level: Number(skill.level || skill.percentage || skill.score || defaultLevels[index % defaultLevels.length]),
            icon: skill.icon || defaultIcons[index % defaultIcons.length],
            created_date: skill.created_date || '',
            updated_date: skill.updated_date || ''
          };
        }

        return this.createSkillDetail(String(skill), index);
      });
    }

    if (typeof rawSkills === 'string' && rawSkills.trim()) {
      return rawSkills
        .split(/[,/|]/)
        .map((skill: string) => skill.trim())
        .filter(Boolean)
        .map((skill: string, index: number) => ({
          ...this.createSkillDetail(skill, index)
        }));
    }

    return [];
  }

  private createSkillDetail(skillName: string, index: number, experience?: string): ProfileSkillDetail {
    const normalizedSkill = skillName.trim();
    const value = normalizedSkill.toLowerCase();
    const defaults = [
      { level: 92, category: 'Frontend', experience: '3+ years', icon: 'ri-angularjs-line' },
      { level: 88, category: 'Programming', experience: '3+ years', icon: 'ri-code-s-slash-line' },
      { level: 81, category: 'Design', experience: '2+ years', icon: 'ri-palette-line' },
      { level: 79, category: 'Integration', experience: '2+ years', icon: 'ri-links-line' },
      { level: 74, category: 'Database', experience: '2+ years', icon: 'ri-database-2-line' },
      { level: 68, category: 'Tooling', experience: '1+ year', icon: 'ri-settings-3-line' }
    ];
    const fallback = defaults[index % defaults.length];

    if (value.includes('angular') || value.includes('react') || value.includes('vue')) {
      return this.buildSkillDetail({
        name: normalizedSkill,
        category: 'Frontend',
        experience: experience || '3+ years',
        level: 92,
        icon: 'ri-layout-4-line'
      });
    }

    if (value.includes('typescript') || value.includes('javascript') || value.includes('java') || value.includes('python')) {
      return this.buildSkillDetail({
        name: normalizedSkill,
        category: 'Programming',
        experience: experience || '3+ years',
        level: 88,
        icon: 'ri-code-s-slash-line'
      });
    }

    if (value.includes('api') || value.includes('postman') || value.includes('integration')) {
      return this.buildSkillDetail({
        name: normalizedSkill,
        category: 'Integration',
        experience: experience || '2+ years',
        level: 79,
        icon: 'ri-links-line'
      });
    }

    if (value.includes('sql') || value.includes('mysql') || value.includes('database')) {
      return this.buildSkillDetail({
        name: normalizedSkill,
        category: 'Database',
        experience: experience || '2+ years',
        level: 74,
        icon: 'ri-database-2-line'
      });
    }

    if (value.includes('figma') || value.includes('ui') || value.includes('ux') || value.includes('design')) {
      return this.buildSkillDetail({
        name: normalizedSkill,
        category: 'Design',
        experience: experience || '2+ years',
        level: 81,
        icon: 'ri-palette-line'
      });
    }

    return this.buildSkillDetail({
      name: normalizedSkill,
      category: fallback.category,
      experience: experience || fallback.experience,
      level: fallback.level,
      icon: fallback.icon
    });
  }

  private buildSkillDetail(skill: Pick<ProfileSkillDetail, 'name' | 'category' | 'experience' | 'level' | 'icon'>): ProfileSkillDetail {
    return {
      id: 0,
      employeeid: Number(this.empid) || 0,
      created_date: '',
      updated_date: '',
      ...skill
    };
  }

  private mapSkillForDialog(skill: ProfileSkillDetail): SkillDialogPayload {
    const timestamp = new Date().toISOString();

    return {
      id: skill.id || 0,
      employeeid: skill.employeeid || Number(this.empid) || 0,
      skill: skill.name,
      experience: skill.experience,
      created_date: skill.created_date || timestamp,
      updated_date: skill.updated_date || timestamp
    };
  }

  private formatDate(value: any): string {
    if (!value) {
      return 'Not available';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    return parsedDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'MP';
  }
}
