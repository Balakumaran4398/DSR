import { AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { AuthService } from 'src/app/_core/services/auth.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

interface HierarchyManager {
  id: number;
  name: string;
  role: string;
  email: string;
  initials: string;
  accent: string;
}

interface HierarchyProject {
  id: number;
  title: string;
  memberCount: number;
}

interface HierarchyProductOwner {
  id: number;
  name: string;
  role: string;
  email: string;
  initials: string;
  accent: string;
}

interface HierarchyMember {
  id: number;
  name: string;
  initials: string;
  accent: string;
  role?: string;
}

@Component({
  selector: 'app-hierarchy',
  templateUrl: './hierarchy.component.html',
  styleUrls: ['./hierarchy.component.scss']
})
export class HierarchyComponent implements OnInit, AfterViewInit {
  @ViewChild('treeShell') treeShellRef?: ElementRef<HTMLDivElement>;
  @ViewChild('treeContent') treeContentRef?: ElementRef<HTMLDivElement>;

  managers: HierarchyManager[] = [];
  managerOwners: Record<number, HierarchyProductOwner[]> = {};
  ownerProjects: Record<number, HierarchyProject[]> = {};
  managerMembers: Record<number, HierarchyMember[]> = {};
  projectMembers: Record<number, HierarchyMember[]> = {};
  rootEmployeeName = 'Management';
  rootEmployeeRole = 'Admin';

  loadingManagers = false;
  activeManagerId: number | null = null;
  activeOwnerId: number | null = null;
  activeProjectId: number | null = null;
  treeScale = 1;
  treeShellHeight = 'auto';

  isDarkMode = false;

  readonly palette = [
    'var(--hc-person-tone-1)',
    'var(--hc-person-tone-2)',
    'var(--hc-person-tone-3)',
    'var(--hc-person-tone-4)',
    'var(--hc-person-tone-5)',
    'var(--hc-person-tone-6)'
  ];
  private readonly desktopBreakpoint = 1024;
  employee_id: any;
  constructor(
    private authService: AuthService,
    public storageService: StorageService,
    private toasterService: ToasterService
  ) {
    this.isDarkMode = sessionStorage.getItem('isDarkMode')==="true";
    console.log(this.isDarkMode);
    
    this.employee_id = storageService.getEmpId();
   

  }

  ngOnInit(): void {
    this.loadManagers();
  }

  ngAfterViewInit(): void {
    this.queueTreeLayoutUpdate();
  }

  get rootTitle(): string {
    return this.rootEmployeeName;
  }

  get rootRoleLabel(): string {
    return this.rootEmployeeRole;
  }

  get isAdminView(): boolean {
    return this.storageService.roles.isAdmin;
  }

  get isManagerView(): boolean {
    return !this.storageService.roles.isAdmin && this.storageService.roles.isManager;
  }

  get pageTitle(): string {
    return 'Organization Flow Chart';
  }

  get pageDescription(): string {
    return 'Tree view with the admin at the top, then managers, product owners, projects, and connected members.';
  }

  get totalProjectCount(): number {
    return this.allProjects.length;
  }

  get totalMemberCount(): number {
    return this.allProjects.reduce((count, project) => {
      return count + (this.getMembersForProject(project.id).length || project.memberCount);
    }, 0);
  }

  get allProjects(): HierarchyProject[] {
    return this.managers.reduce((projects: HierarchyProject[], manager) => {
      return projects.concat(
        this.getProductOwnersForManager(manager.id).reduce((ownerProjects: HierarchyProject[], owner) => {
          return ownerProjects.concat(this.getProjectsForOwner(owner.id));
        }, [])
      );
    }, []);
  }

  get selectedManager(): HierarchyManager | null {
    if (!this.activeManagerId) {
      return null;
    }

    return this.managers.find((manager) => manager.id === this.activeManagerId) || null;
  }

  get primaryManager(): HierarchyManager | null {
    return this.managers[0] || null;
  }

  get currentManager(): HierarchyManager | null {
    return this.selectedManager || this.findLoggedInManager() || this.primaryManager;
  }

  loadManagers(): void {
    this.loadingManagers = true;
    this.managers = [];
    this.managerOwners = {};
    this.ownerProjects = {};
    this.managerMembers = {};
    this.projectMembers = {};

    this.authService.getHierarchydetails(this.employee_id).subscribe({
      next: (res: any) => {
        const payload = Array.isArray(res) ? { manager_list: res } : (res?.data ?? res ?? {});
        const list = Array.isArray(payload?.manager_list)
          ? payload.manager_list
          : (Array.isArray(payload?.product_owner_list) || Array.isArray(payload?.project_list) || this.extractManagerMembers(payload).length)
            ? [{
              employee_id: this.employee_id,
              employee: payload?.employee || payload?.employee_name || this.storageService.getEmpName() || 'Manager',
              product_owner_list: payload.product_owner_list ?? [],
              project_list: payload.project_list ?? [],
              team_members: this.extractManagerMembers(payload)
            }]
          : (payload?.hierarchy ?? payload?.managers ?? []);

        const managerOwners: Record<number, HierarchyProductOwner[]> = {};
        const ownerProjects: Record<number, HierarchyProject[]> = {};
        const managerMembers: Record<number, HierarchyMember[]> = {};
        const projectMembers: Record<number, HierarchyMember[]> = {};

        const rootDetails = this.resolveRootDetails(payload);
        this.rootEmployeeName = rootDetails.name;
        this.rootEmployeeRole = rootDetails.role;
        this.managers = (Array.isArray(list) ? list : []).map((manager: any, index: number) => {
          const normalizedManager = this.normalizeManager(manager, index);
          const productOwnerList = this.extractProductOwnerList(manager);

          managerOwners[normalizedManager.id] = productOwnerList.map((owner: any, ownerIndex: number) => {
            const normalizedOwner = this.normalizeProductOwner(owner, (normalizedManager.id * 1000) + ownerIndex + 1);
            const projectList = this.extractProjectList(owner);

            ownerProjects[normalizedOwner.id] = projectList.map((project: any, projectIndex: number) => {
              const normalizedProject = this.normalizeProject(project, (normalizedOwner.id * 1000) + projectIndex + 1);
              const members = Array.isArray(project?.project_members)
                ? project.project_members
                : (project?.employee_list ?? project?.assigned_employee_list ?? project?.members ?? []);

              projectMembers[normalizedProject.id] = (Array.isArray(members) ? members : []).map((member: any, memberIndex: number) =>
                this.normalizeMember(member, (normalizedProject.id * 1000) + memberIndex + 1)
              );

              return normalizedProject;
            });

            return normalizedOwner;
          });

          managerMembers[normalizedManager.id] = this.extractManagerMembers(manager)
            .map((member: any, memberIndex: number) =>
              this.normalizeMember(member, (normalizedManager.id * 1000) + memberIndex + 1)
            );

          return normalizedManager;
        });

        this.managerOwners = managerOwners;
        this.ownerProjects = ownerProjects;
        this.managerMembers = managerMembers;
        this.projectMembers = projectMembers;
        this.syncActiveSelection();
        this.loadingManagers = false;
        this.queueTreeLayoutUpdate();
      },
      error: (err: any) => {
        this.loadingManagers = false;
        this.managers = [];
        this.rootEmployeeName = this.storageService.getEmpName() || 'Management';
        this.rootEmployeeRole = this.storageService.roles.isManager ? 'Manager' : 'Admin';
        this.treeScale = 1;
        this.treeShellHeight = 'auto';
        this.toasterService.error(err?.error?.message || 'Unable to load hierarchy details.');
      }
    });
  }

  getProductOwnersForManager(managerId: number): HierarchyProductOwner[] {
    return this.managerOwners[managerId] || [];
  }

  getProjectsForOwner(ownerId: number): HierarchyProject[] {
    return this.ownerProjects[ownerId] || [];
  }

  getProjectCountForManager(managerId: number): number {
    return this.getProductOwnersForManager(managerId).reduce((count, owner) => {
      return count + this.getProjectsForOwner(owner.id).length;
    }, 0);
  }

  getMembersForProject(projectId: number): HierarchyMember[] {
    return this.projectMembers[projectId] || [];
  }

  getDirectMembersForManager(managerId: number): HierarchyMember[] {
    return this.managerMembers[managerId] || [];
  }

  getSelectedOwnerForManager(managerId: number): HierarchyProductOwner | null {
    const owners = this.getProductOwnersForManager(managerId);
    if (!owners.length || !this.activeOwnerId) {
      return null;
    }

    return owners.find((owner) => owner.id === this.activeOwnerId) || null;
  }

  getSelectedProjectForOwner(ownerId: number): HierarchyProject | null {
    const projects = this.getProjectsForOwner(ownerId);
    if (!projects.length || !this.activeProjectId) {
      return null;
    }

    return projects.find((project) => project.id === this.activeProjectId) || null;
  }

  selectManager(managerId: number): void {
    if (this.activeManagerId === managerId) {
      this.activeManagerId = null;
      this.activeOwnerId = null;
      this.activeProjectId = null;
      this.queueTreeLayoutUpdate();
      return;
    }

    this.activeManagerId = managerId;
    this.syncOwnerSelection();
    this.queueTreeLayoutUpdate();
  }

  selectOwner(ownerId: number): void {
    if (this.activeOwnerId === ownerId) {
      this.activeOwnerId = null;
      this.activeProjectId = null;
      this.queueTreeLayoutUpdate();
      return;
    }

    this.activeOwnerId = ownerId;
    this.syncProjectSelection();
    this.queueTreeLayoutUpdate();
  }

  selectProject(projectId: number): void {
    if (this.activeProjectId === projectId) {
      this.activeProjectId = null;
      this.queueTreeLayoutUpdate();
      return;
    }

    this.activeProjectId = projectId;
    this.queueTreeLayoutUpdate();
  }

  trackByManager(_: number, manager: HierarchyManager): number {
    return manager.id;
  }

  trackByProject(_: number, project: HierarchyProject): number {
    return project.id;
  }

  trackByProductOwner(_: number, owner: HierarchyProductOwner): number {
    return owner.id;
  }

  trackByMember(_: number, member: HierarchyMember): number {
    return member.id;
  }

  getAvatarStyle(accent: string): Record<string, string> {
    return { '--avatar-tone': accent };
  }

  get treeTransform(): string {
    return this.treeScale < 1 ? `scale(${this.treeScale})` : 'none';
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.queueTreeLayoutUpdate();
  }

  private normalizeManager(manager: any, index: number): HierarchyManager {
    const name = manager?.employee || manager?.employee_name || manager?.manager_name || manager?.name || `Manager ${index + 1}`;
    const id = this.resolveNumericId(
      [manager?.employee_id, manager?.employeeid, manager?.manager_id, manager?.id],
      index + 1
    );

    return {
      id,
      name,
      role: manager?.position || manager?.designation || 'Manager',
      email: manager?.email || manager?.official_email || '',
      initials: this.getInitials(name),
      accent: this.palette[index % this.palette.length]
    };
  }

  private normalizeProject(project: any, fallbackId: number): HierarchyProject {
    return {
      id: this.resolveNumericId([project?.id, project?.project_id], fallbackId),
      title: project?.project_title || project?.project_name || project?.title || 'Untitled Project',
      memberCount: this.extractProjectMemberCount(project)
    };
  }

  private normalizeProductOwner(owner: any, fallbackId: number): HierarchyProductOwner {
    const name =
      owner?.employee ||
      owner?.employee_name ||
      owner?.product_onwer ||
      owner?.product_owner ||
      owner?.product_owner_name ||
      owner?.owner ||
      owner?.name ||
      `Product Owner ${fallbackId}`;
    const id = this.resolveNumericId(
      [owner?.employee_id, owner?.employeeid, owner?.product_owner_id, owner?.owner_id, owner?.id],
      fallbackId
    );

    return {
      id,
      name,
      role: owner?.position || owner?.designation || 'Product Owner',
      email: owner?.email || owner?.official_email || '',
      initials: this.getInitials(name),
      accent: this.palette[(fallbackId - 1) % this.palette.length]
    };
  }

  private normalizeMember(member: any, fallbackId: number): HierarchyMember {
    const isNameOnly = typeof member === 'string';
    const name = isNameOnly
      ? member
      : `${member?.firstname ?? member?.employee_name ?? member?.name ?? ''} ${member?.lastname ?? ''}`.trim() || member?.employee_name || member?.name || 'Team Member';
    const id = this.resolveNumericId(
      [isNameOnly ? null : member?.id, isNameOnly ? null : member?.employee_id, isNameOnly ? null : member?.employeeid],
      fallbackId
    );

    return {
      id,
      name,
      initials: this.getInitials(name),
      accent: this.palette[(fallbackId - 1) % this.palette.length],
      role: isNameOnly ? undefined : (member?.position || member?.designation || member?.role || '')
    };
  }

  private extractProjectMemberCount(project: any): number {
    const directCount = Number(project?.member_count || project?.members_count || project?.team_size || 0);
    if (directCount > 0) {
      return directCount;
    }

    if (Array.isArray(project?.employee_list)) {
      return project.employee_list.length;
    }

    if (Array.isArray(project?.assigned_employee_list)) {
      return project.assigned_employee_list.length;
    }

    if (Array.isArray(project?.project_members)) {
      return project.project_members.length;
    }

    return 0;
  }

  private extractProjectList(manager: any): any[] {
    const projectList =
      manager?.project_list ??
      manager?.projectlist ??
      manager?.projects ??
      manager?.projectList;

    return Array.isArray(projectList) ? projectList : [];
  }

  private extractProductOwnerList(manager: any): any[] {
    const productOwnerList =
      manager?.product_owner_list ??
      manager?.productOwnerList ??
      manager?.product_owners ??
      manager?.owner_list ??
      manager?.owners;

    if (Array.isArray(productOwnerList)) {
      return productOwnerList;
    }

    return [];
  }

  private extractManagerMembers(manager: any): any[] {
    const directMembers =
      manager?.team_members ??
      manager?.team_member_list ??
      manager?.manager_members ??
      manager?.employee_list ??
      manager?.assigned_employee_list ??
      manager?.members;

    return Array.isArray(directMembers) ? directMembers : [];
  }

  private getInitials(value: string): string {
    return value
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'NA';
  }

  private resolveNumericId(candidates: any[], fallback: number): number {
    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return fallback;
  }

  private syncActiveSelection(): void {
    const managerIds = this.managers.map((manager) => manager.id);
    const preferredManagerId = this.findLoggedInManager()?.id ?? this.primaryManager?.id ?? null;

    this.activeManagerId = managerIds.includes(Number(this.activeManagerId))
      ? this.activeManagerId
      : preferredManagerId;
    this.syncOwnerSelection();
  }

  private syncOwnerSelection(): void {
    const manager = this.currentManager;
    const ownerIds = manager ? this.getProductOwnersForManager(manager.id).map((owner) => owner.id) : [];

    this.activeOwnerId = ownerIds.includes(Number(this.activeOwnerId))
      ? this.activeOwnerId
      : null;
    this.syncProjectSelection();
  }

  private syncProjectSelection(): void {
    const manager = this.currentManager;
    const owner = manager ? this.getSelectedOwnerForManager(manager.id) : null;
    const projectIds = owner ? this.getProjectsForOwner(owner.id).map((project) => project.id) : [];

    this.activeProjectId = projectIds.includes(Number(this.activeProjectId))
      ? this.activeProjectId
      : null;
  }

  private findProjectById(projectId: number): HierarchyProject | null {
    for (const manager of this.managers) {
      for (const owner of this.getProductOwnersForManager(manager.id)) {
        const project = this.getProjectsForOwner(owner.id).find((item) => item.id === projectId);
        if (project) {
          return project;
        }
      }
    }

    return null;
  }

  private findLoggedInManager(): HierarchyManager | null {
    const employeeId = Number(this.employee_id);
    const employeeName = `${this.storageService.getEmpName() || ''}`.trim().toLowerCase();

    return this.managers.find((manager) => {
      if (employeeId > 0 && manager.id === employeeId) {
        return true;
      }

      return !!employeeName && manager.name.trim().toLowerCase() === employeeName;
    }) || null;
  }

  private resolveRootDetails(payload: any): { name: string; role: string } {
    const adminLikeObject =
      payload?.admin_details ??
      payload?.admin ??
      payload?.root_admin ??
      payload?.organization_head ??
      payload?.root_employee ??
      null;

    const rootNameCandidates = [
      adminLikeObject?.employee,
      adminLikeObject?.employee_name,
      adminLikeObject?.name,
      payload?.admin_name,
      payload?.admin,
      payload?.root_name,
      payload?.root_employee_name,
      payload?.organization_head_name,
      payload?.employee,
      payload?.employee_name,
      this.storageService.getEmpName(),
      'Management'
    ];

    const rootRoleCandidates = [
      adminLikeObject?.position,
      adminLikeObject?.designation,
      payload?.admin_role,
      payload?.root_role,
      payload?.organization_head_role,
      'Admin'
    ];

    return {
      name: rootNameCandidates.find((value: any) => `${value ?? ''}`.trim()) || 'Management',
      role: rootRoleCandidates.find((value: any) => `${value ?? ''}`.trim()) || 'Admin'
    };
  }

  private queueTreeLayoutUpdate(): void {
    requestAnimationFrame(() => this.updateTreeLayout());
  }

  private updateTreeLayout(): void {
    const shell = this.treeShellRef?.nativeElement;
    const tree = this.treeContentRef?.nativeElement;

    if (!shell || !tree || this.loadingManagers || !this.managers.length) {
      this.treeScale = 1;
      this.treeShellHeight = 'auto';
      return;
    }

    this.treeScale = 1;
    this.treeShellHeight = 'auto';

    if (window.innerWidth < this.desktopBreakpoint) {
      return;
    }

    const availableWidth = shell.clientWidth;
    const requiredWidth = tree.scrollWidth;
    const requiredHeight = tree.scrollHeight;

    if (!availableWidth || !requiredWidth || requiredWidth <= availableWidth) {
      return;
    }

    const nextScale = Math.max(0.58, Math.min(1, availableWidth / requiredWidth));
    this.treeScale = Number(nextScale.toFixed(3));
    this.treeShellHeight = `${Math.ceil(requiredHeight * this.treeScale)}px`;
  }
}
