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
import { HomeComponent } from './components/home/home.component';
import { OverallComponent } from './components/overall/overall.component';
import { PerformanceComponent } from './components/performance/performance.component';
import { GoogleSheetComponent } from './components/google-sheet/google-sheet.component';



const routes: Routes = [
  { path: '', redirectTo: 'overall', pathMatch: 'full' },
  { path: 'home', component: HomeComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'overall', component: OverallComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'dashboard', component: DashBoardComponent },
  { path: 'team', component: TeamComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'projects', component: ProjectsComponent, },
  { path: 'task-overview', component: TaskOverviewComponent, },
  { path: 'overview', component: OverviewComponent, },
  { path: 'mom', component: MomComponent},
  { path: 'general', redirectTo: 'theme-settings', pathMatch: 'full' },
  { path: 'settings', redirectTo: 'theme-settings', pathMatch: 'full' },
  { path: 'security', redirectTo: 'theme-settings', pathMatch: 'full' },
  { path: 'theme-settings', component: SettingsComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'projects/project-content/:projectid', component: ProjectInfoComponent },
  { path: 'projects/project-content/:projectid/:taskid', component: TaskDetailsComponent },
  { path: 'attendance', component: AttendanceComponent, },
  { path: 'hardware', component: HardwareComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'notsenddsr', component: NotSendDsrComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'my-profile', component: MyProfileComponent, },
  { path: 'hierarchy', component: HierarchyComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'admin-documents', component: AdminDocumentsComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN'] } },
  { path: 'performance', component: PerformanceComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER'] } },
  { path: 'google-sheet', component: GoogleSheetComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'mail', component: MailComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] } },
  { path: 'ticket-info', component: TicketInfoComponent, canActivate: [RoleGuard], data: { roles: ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_EMPLOYEE'] }}      

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule { }
