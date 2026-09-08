import { Component, inject, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

interface ReadonlySkillDetail {
  name: string;
  category: string;
  experience: string;
  level: number;
  icon: string;
}

interface RoleOption {
  id: number;
  name: string;
  value: string;
}

@Component({
  selector: 'app-user-form',
  templateUrl: './user-form.component.html',
  styleUrls: ['./user-form.component.scss']
})
export class UserFormComponent implements OnInit, OnChanges {
  private fb = inject(FormBuilder);
  @Input() data: any
  userForm: FormGroup;
  submittedData: any = null;
  previewUrl: string | ArrayBuffer | null = null;
  isEditMode = false;
  hidePassword = true;
  skillDetails: ReadonlySkillDetail[] = [];
  isSubmitting = false;

  // Mock data for dropdowns
  bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

  private readonly defaultRole = 'ROLE_EMPLOYEE';
  private readonly allRoles: RoleOption[] = [
    { id: 1, name: 'Admin', value: "ROLE_ADMIN" },
    { id: 2, name: 'Manager', value: "ROLE_MANAGER" },
    { id: 3, name: 'Employee', value: "ROLE_EMPLOYEE" }
  ];

  roles: RoleOption[] = [...this.allRoles];

  departments: any = [];

  positions: any = [];

  shifts: any = [];

  constructor(private authService: AuthService, private toasterService: ToasterService, private drawerService: DrawerService, private storageService: StorageService) {
    this.userForm = this.fb.group({
      firstname: ['', Validators.required],
      lastname: ['', Validators.required],
      gender: [''],
      marital_status: [''],
      blood_group: [''],
      date_of_birth: ['',Validators.required],
      image_url: [''],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      alternate_email: ['', Validators.email],
      mobile: ['', Validators.required],
      shiftid: [''],
      role: ['', Validators.required],
      deptid: ['', Validators.required],
      positionid: ['', Validators.required],
      attendanceid: ['', Validators.required],
      reference_no: [''],
      joining_date: ['', Validators.required],
      wfh: [false],
      isactive: [true]
    });
  }

  get canManageSystemRole(): boolean {
    const roles = this.storageService.roles;
    return !!roles?.isAdmin;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.applyInputData();
    }
  }
  ngOnInit(): void {
    this.getAllShifts();
    this.getAllDepartments();
    this.applyInputData();
  }

  private hasEditData(): boolean {
    return !!this.data && typeof this.data === 'object';
  }

  private applyInputData(): void {
    if (!this.userForm) return;

    if (this.hasEditData()) {
      this.isEditMode = true;
      this.userForm.get('password')?.clearValidators();
      this.userForm.get('password')?.updateValueAndValidity();
      this.getDesignationByDepartment({ value: this.data.deptid })
      this.patchForm(this.data);
      this.previewUrl = this.data?.profile_image_url
      this.skillDetails = this.buildReadonlySkillDetails(this.data);
    } else {
      this.resetForm();
    }

    this.applyRoleAccess();
  }

  onFileChange(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        this.previewUrl = reader.result;
        this.userForm.patchValue({ image_url: this.previewUrl });
      };
      reader.readAsDataURL(file);
    }
  }

  get rf() {
    return {
      firstname: this.userForm.get('firstname'),
      lastname: this.userForm.get('lastname'),
      gender: this.userForm.get('gender'),
      marital_status: this.userForm.get('marital_status'),
      blood_group: this.userForm.get('blood_group'),
      date_of_birth: this.userForm.get('date_of_birth'),
      image_url: this.userForm.get('image_url'),
      email: this.userForm.get('email'),
      password: this.userForm.get('password'),
      alternate_email: this.userForm.get('alternate_email'),
      mobile: this.userForm.get('mobile'),
      skypeid: this.userForm.get('skypeid'),
      role: this.userForm.get('role'),
      deptid: this.userForm.get('deptid'),
      positionid: this.userForm.get('positionid'),
      shiftid: this.userForm.get('shiftid'),
      attendanceid: this.userForm.get('attendanceid'),
      joining_date: this.userForm.get('joining_date'),
      wfh: this.userForm.get('wfh'),
      isactive: this.userForm.get('isactive'),
      reference_no: this.userForm.get('reference_no')
    };
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.userForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  onSubmit() {
    if (this.isSubmitting) return;

    if (this.userForm.valid) {
      this.isSubmitting = true;
      this.submittedData = this.userForm.value;
      const formatDate = (date: any) => {
        if (!date) return null;
        const d = new Date(date);
        if (isNaN(d.getTime())) return date;

        const month = '' + (d.getMonth() + 1);
        const day = '' + d.getDate();
        const year = d.getFullYear();

        return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
      };

      this.submittedData.date_of_birth = formatDate(this.submittedData.date_of_birth);
      this.submittedData.joining_date = formatDate(this.submittedData.joining_date);
      this.submittedData.username = this.storageService.getUsername();
      if (this.hasEditData() && this.isEditMode) {
        this.data = { ...this.data, ...this.userForm.value }
        this.authService.updateUser(this.data)
          .pipe(finalize(() => {
            this.isSubmitting = false;
          }))
          .subscribe({
          next: ((res: any) => {
            this.toasterService.success(res?.message);
            this.drawerService.notifyAction({
              source: 'member',
              action: 'updated',
              payload: res
            });
            this.resetForm();
            this.drawerService.close();
          }),
          error: (err: any) => {
            this.toasterService.error(err?.error?.message);
          }
        })
      } else {

        this.authService.createUser(this.userForm.value)
          .pipe(finalize(() => {
            this.isSubmitting = false;
          }))
          .subscribe((res: any) => {
            this.toasterService.success(res?.message);
            this.drawerService.notifyAction({
              source: 'member',
              action: 'created',
              payload: res
            });
            this.resetForm();
            this.drawerService.close();
          }, err => {
            this.toasterService.error(err?.error?.message);
          })
      }
    } else {
      this.userForm.markAllAsTouched();
    }
  }

  resetForm() {
    this.isEditMode = false;
    this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    this.userForm.get('password')?.updateValueAndValidity({ emitEvent: false });
    this.userForm.reset({
      firstname: '',
      lastname: '',
      gender: '',
      marital_status: '',
      blood_group: '',
      date_of_birth: '',
      image_url: '',
      email: '',
      password: '',
      alternate_email: '',
      mobile: '',
      shiftid: '',
      role: '',
      deptid: '',
      positionid: '',
      attendanceid: '',
      reference_no: '',
      joining_date: '',
      wfh: false,
      isactive: true
    });
    this.previewUrl = null;
    this.submittedData = null;
    this.positions = [];
    this.skillDetails = [];
    this.applyRoleAccess();
    this.userForm.markAsPristine();
    this.userForm.markAsUntouched();
  }

  private applyRoleAccess(): void {
    const roleControl = this.userForm.get('role');
    if (!roleControl) return;

    this.roles = this.canManageSystemRole
      ? [...this.allRoles]
      : this.allRoles.filter(role => role.value !== 'ROLE_ADMIN');

    if (this.canManageSystemRole) {
      return;
    }

    if (this.hasEditData()) {
      roleControl.setValue(roleControl.value || this.data?.role || this.defaultRole, { emitEvent: false });
      return;
    }

    if (!roleControl.value) {
      roleControl.setValue(this.defaultRole, { emitEvent: false });
    }
  }


  getAllShifts() {
    this.authService.getAllShifts().subscribe(res => {
      console.log(res);
      this.shifts = res
    })
  }
  getAllDepartments() {
    this.authService.getAllDepartments().subscribe(res => {
      this.departments = res;
    })
  }
  getDesignationByDepartment(e: any) {
    console.log(e.value);

    if (e.value) {
      this.authService.getDesignationByDepartment(e.value).subscribe(res => {
        this.positions = res
      })
    }
  }
  patchForm(user: any) {
    this.userForm.patchValue({
      firstname: user.firstname ?? '',
      lastname: user.lastname ?? '',
      gender: user.gender ?? '',
      marital_status: user.marital_status ?? '',
      blood_group: user.blood_group ?? '',
      date_of_birth: user.date_of_birth ? new Date(user.date_of_birth) : '',
      image_url: user.profile_image_url ?? '',
      email: user.email ?? '',
      alternate_email: user.alternate_email ?? '',
      mobile: user.mobile ?? '',
      shiftid: user.shiftid ?? '',
      role: user.role ?? '',
      deptid: user.deptid ?? '',
      positionid: user.positionid ?? '',
      attendanceid: user.attendanceid ?? '',
      joining_date: user.joining_date ? new Date(user.joining_date) : '',
      wfh: user.wfh ?? false,
      isactive: user.isactive ?? true,
      password: user.password ?? '',
      reference_no: user.reference_no ?? ''
    });
  }

  trackBySkill(index: number, skill: ReadonlySkillDetail): string {
    return `${index}-${skill.name}-${skill.category}`;
  }

  clampSkillLevel(level: number): number {
    return Math.max(0, Math.min(100, Number(level) || 0));
  }

  private buildReadonlySkillDetails(user: any): ReadonlySkillDetail[] {
    const rawSkills = user?.skill_set || user?.skillset || user?.skills || user?.skill_details || user?.technologies || user?.tech_stack;
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
          // Fall through to delimiter parsing.
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
}
