import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DatePipe } from '@angular/common';

import { AdminRoutingModule } from './admin-routing.module';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ProjectStatusReportComponent } from './core/charts/project-status-report/project-status-report.component';
import { OverdueComponent } from './core/charts/overdue/overdue.component';
import { ProjectsComponent } from './components/projects/projects.component';
import { TeamComponent } from './components/team/team.component';
import { ProjectInfoComponent } from './components/projects/project-info/project-info.component';
import { TasksComponent } from './components/projects/project-info/tasks/tasks.component';
import { TeammatesComponent } from './components/projects/project-info/teammates/teammates.component';
import { TaskOverviewComponent } from './components/task-overview/task-overview.component';
import { MaterialModule } from 'src/app/_core/modules/material.module';
import { IssuesComponent } from './components/projects/project-info/issues/issues.component';
import { SharedModule } from 'src/app/_shared/shared.module';
import { SettingsComponent } from './components/settings/settings.component';
import { PrjDashboardComponent } from './components/projects/project-info/prj-dashboard/prj-dashboard.component';
import { ReleaseManagerComponent } from './components/projects/project-info/release-manager/release-manager.component';
import { PhasesComponent } from './components/projects/project-info/phases/phases.component';
import { TaskDetailsComponent } from './components/projects/project-info/task-details/task-details.component';
import { TaskContentAccessComponent } from './components/projects/project-info/_core/task-content-access/task-content-access.component';
import { ReportsComponent } from './components/projects/project-info/reports/reports.component';
import { OverviewComponent } from './components/overview/overview.component';
import { OverviewTaskComponent } from './components/overview/overview-task/overview-task.component';
import { OverviewReleasesComponent } from './components/overview/overview-releases/overview-releases.component';
import { OverviewTaskGanttComponent } from './components/overview/overview-task-gantt/overview-task-gantt.component';
import { DashBoardComponent } from './components/dash-board/dash-board.component';
import { DocumentsComponent } from './components/projects/project-info/documents/documents.component';
import { DocUploadComponent } from './components/projects/project-info/_core/doc-upload/doc-upload.component';
import { ReleaseMailsListComponent } from './core/mails/release-mails-list/release-mails-list.component';
import { AttendanceComponent } from './components/attendance/attendance.component';
import { AttendanceDocComponent } from './components/team/attendance-doc/attendance-doc.component';
import { HardwareComponent } from './components/hardware/hardware.component';
import { NotSendDsrComponent } from './components/projects/project-info/_core/not-send-dsr/not-send-dsr.component';
import { MyProfileComponent } from './components/my-profile/my-profile.component';
import { SkillDialogComponent } from './components/my-profile/skill-dialog/skill-dialog.component';
import { ProfileEditDialogComponent } from './components/my-profile/profile-edit-dialog/profile-edit-dialog.component';
import { MomComponent } from './components/projects/project-info/mom/mom.component';
import { HierarchyComponent } from './components/hierarchy/hierarchy.component';
import { OverviewTaskViewDialogComponent } from './components/overview/overview-task/overview-task-view-dialog/overview-task-view-dialog.component';
import { AdminDocumentsComponent } from './components/admin-documents/admin-documents.component';
import { MailComponent } from './components/mail/mail.component';
import { MailListComponent } from './components/mail-list/mail-list.component';
import { TicketInfoComponent } from './components/Tickets/ticket-info/ticket-info.component';
import { TicketsComponent } from './components/Tickets/tickets/tickets.component';
import { ClientsComponent } from './components/Tickets/clients/clients.component';
import { ProductsComponent } from './components/Tickets/products/products.component';
import { HomeComponent } from './components/home/home.component';
import { OverallComponent } from './components/overall/overall.component';
import { OverallDetailsDialogComponent } from './components/overall/overall-details-dialog/overall-details-dialog.component';
import { OverallPerformanceReportComponent } from './components/overview/overall-performance-report/overall-performance-report.component';
import { PerformanceComponent } from './components/performance/performance.component';
import { GoogleSheetComponent } from './components/google-sheet/google-sheet.component';
@NgModule({
  declarations: [
    DashboardComponent,
    ProjectStatusReportComponent,
    OverdueComponent,
    ProjectsComponent,
    TeamComponent,
    ProjectInfoComponent,
    TasksComponent,
    TeammatesComponent,
    TaskOverviewComponent,
    IssuesComponent,
    SettingsComponent,
    PrjDashboardComponent,
    ReleaseManagerComponent,
    PhasesComponent,
    TaskDetailsComponent,
    TaskContentAccessComponent,
    ReportsComponent,
    OverviewComponent,
    OverviewTaskComponent,
    OverviewReleasesComponent,
    OverviewTaskGanttComponent,
    DashBoardComponent,
    DocumentsComponent,
    DocUploadComponent,
    ReleaseMailsListComponent,
    AttendanceComponent,
    AttendanceDocComponent,
    HardwareComponent,
    NotSendDsrComponent,
    MyProfileComponent,
    SkillDialogComponent,
    ProfileEditDialogComponent,
    MomComponent,
    HierarchyComponent,
    OverviewTaskViewDialogComponent,
    AdminDocumentsComponent,
    MailComponent,
    MailListComponent,
    TicketInfoComponent,
    TicketsComponent,
    ClientsComponent,
    ProductsComponent,
    HomeComponent,
    OverallComponent,
    OverallDetailsDialogComponent,
    OverallPerformanceReportComponent,
    PerformanceComponent,
    GoogleSheetComponent,

  ],
  imports: [
    CommonModule,
    AdminRoutingModule,
    MaterialModule,
    SharedModule,
  ]
})
export class AdminModule { }
