import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoaderComponent } from './components/loader/loader.component';
import { ConfirmAlertComponent } from './components/confirm-alert/confirm-alert.component';
import { DrawerComponent } from './components/drawer/drawer.component';
import { UserFormComponent } from './components/drawer/user-form/user-form.component';

import { MaterialModule } from '../_core/modules/material.module';
import { ProjectFormComponent } from './components/drawer/project-form/project-form.component';
import { ObserversModule } from "@angular/cdk/observers";
import { OverlayModule } from '@angular/cdk/overlay';
import { TaskFormComponent } from './components/drawer/task-form/task-form.component';
import { AddTeammateFormComponent } from './components/drawer/add-teammate-form/add-teammate-form.component';
import { DateRangeFilterComponent } from './components/date-range-filter/date-range-filter.component';
import { ReleaseFormComponent } from './components/drawer/release-form/release-form.component';
import { PhaseFormComponent } from './components/drawer/phase-form/phase-form.component';
import { SubtaskFormComponent } from './components/drawer/subtask-form/subtask-form.component';
import { DsrFormComponent } from './components/drawer/dsr-form/dsr-form.component';
import { ReleieveFormComponent } from './components/drawer/releieve-form/releieve-form.component';
import { MomdialogComponent } from '../features/admin/components/projects/project-info/_core/momdialog/momdialog.component';
import { SelfTicketFormComponent } from './components/drawer/self-ticket-form/self-ticket-form.component';
import { AssignTicketFormComponent } from './components/drawer/assign-ticket-form/assign-ticket-form.component';
import { ClientFormComponent } from './components/drawer/client-form/client-form.component';
import { ProductFormComponent } from './components/drawer/product-form/product-form.component';
import { NotificationsComponent } from './components/drawer/notifications/notifications.component';
@NgModule({
  declarations: [
    LoaderComponent,
    ConfirmAlertComponent,
    DrawerComponent,
    UserFormComponent,
    ProjectFormComponent,
    TaskFormComponent,
    AddTeammateFormComponent,
    DateRangeFilterComponent,
    ReleaseFormComponent,
    PhaseFormComponent,
    SubtaskFormComponent,
    DsrFormComponent,
    ReleieveFormComponent,
    MomdialogComponent,
    SelfTicketFormComponent,
    AssignTicketFormComponent,
    ClientFormComponent,
    ProductFormComponent,
    NotificationsComponent,
  ],
  imports: [
    CommonModule,
    MaterialModule,
    ObserversModule,
    OverlayModule
],
  exports: [LoaderComponent, ConfirmAlertComponent,DrawerComponent,DateRangeFilterComponent]
})
export class SharedModule { }
