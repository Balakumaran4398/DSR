import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { TeamComponent } from './components/team/team.component';
import { ProjectsComponent } from './components/projects/projects.component';
import { ProjectInfoComponent } from './components/projects/project-info/project-info.component';
import { TaskOverviewComponent } from './components/task-overview/task-overview.component';
import { SettingsComponent } from './components/settings/settings.component';
import { TaskDetailsComponent } from './components/projects/project-info/task-details/task-details.component';
import { OverviewComponent } from './components/overview/overview.component';
import { DashBoardComponent } from './components/dash-board/dash-board.component';
import { AttendanceComponent } from './components/attendance/attendance.component';
import { HardwareComponent } from './components/hardware/hardware.component';
import { NotSendDsrComponent } from './components/projects/project-info/_core/not-send-dsr/not-send-dsr.component';
import { MyProfileComponent } from './components/my-profile/my-profile.component';
import { HierarchyComponent } from './components/hierarchy/hierarchy.component';
import { MomComponent } from './components/projects/project-info/mom/mom.component';
import { RoleGuard } from 'src/app/_core/services/role.guard';
import { AdminDocumentsComponent } from './components/admin-documents/admin-documents.component';
import { MailComponent } from './components/mail/mail.component';
import { TicketInfoComponent } from './components/Tickets/ticket-info/ticket-info.component';



const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashBoardComponent },
  { path: 'team', component: TeamComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'projects', component: ProjectsComponent, },
  { path: 'task-overview', component: TaskOverviewComponent, },
  { path: 'overview', component: OverviewComponent, },
  { path: 'mom', component: MomComponent},
  { path: 'theme-settings', component: SettingsComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'projects/project-content/:projectid', component: ProjectInfoComponent },
  { path: 'projects/project-content/:projectid/:taskid', component: TaskDetailsComponent },
  { path: 'attendance', component: AttendanceComponent, },
  { path: 'hardware', component: HardwareComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'notsenddsr', component: NotSendDsrComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'my-profile', component: MyProfileComponent, },
  { path: 'hierarchy', component: HierarchyComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'admin-documents', component: AdminDocumentsComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN'] } },
  { path: 'mail', component: MailComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'ticket-info', component: TicketInfoComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] }}      

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule { }
