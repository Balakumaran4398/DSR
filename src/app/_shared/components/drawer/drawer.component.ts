import { Component, OnInit } from '@angular/core';
import { DrawerService } from 'src/app/_core/services/drawer.service';


@Component({
  selector: 'app-drawer',
  templateUrl: './drawer.component.html'
})
export class DrawerComponent implements OnInit {
  isOpen = false;
  activeType: any = '';
  data: any = null;
  formType: any = null;
  constructor(private drawerService: DrawerService) {

  }
  ngOnInit() {
    this.drawerService.drawerState$.subscribe(state => {
      this.isOpen = state.isOpen;
      this.activeType = state.type;
      this.data = state.data;
      this.formType = state?.formType;
    });
  }

  close() {
    this.drawerService.close();
  }
}
