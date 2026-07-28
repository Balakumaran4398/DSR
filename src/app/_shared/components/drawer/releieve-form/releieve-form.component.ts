import { Component, Input } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from 'src/app/_core/services/auth.service';
import { DrawerService } from 'src/app/_core/services/drawer.service';
import { StorageService } from 'src/app/_core/services/storage.service';
import { ToasterService } from 'src/app/_core/services/toaster.service';

@Component({
  selector: 'app-releieve-form',
  templateUrl: './releieve-form.component.html',
  styleUrls: ['./releieve-form.component.scss']
})
export class ReleieveFormComponent {

  @Input() data: any;   
  empid:any = 0;
  relieveForm!: FormGroup;
  username:any;
  constructor(private fb: FormBuilder,private authService: AuthService,private toaster: ToasterService,private drawerService: DrawerService,private storageService: StorageService) {
    this.empid = this.storageService.getEmpId();

    this.username=this.storageService.getUsername()
  }

  ngOnInit() {
    this.relieveForm = this.fb.group({
      releave_date: [null, Validators.required],
      reason: ['', Validators.required],
      // isactive: [false, Validators.required]
    });

    console.log("Relieve Data:", this.data); 
  }

  submit() {

    if (this.relieveForm.invalid) return;

    const payload = {
      employeeid: this.data?.id,
      username: this.username,
      reason: this.relieveForm.value.reason,
      releave_date: this.formatDate(this.relieveForm.value.releave_date)
    };

    console.log("Relieve Payload:", payload);

    this.authService.relieveuser(payload).subscribe({
      next: (res: any) => {
        this.toaster.success(res?.message);
        this.drawerService.notifyAction({
          source: 'relieve',
          action: 'updated'
        });
    
        this.drawerService.close();
      },
      error: (err: any) => {
        this.toaster.error(err?.error?.message || 'Something went wrong');
      }
    });
    
  }

  close() {
    this.drawerService.close();
  }

  formatDate(date: Date): string {
    const d = new Date(date);
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
  }
  

}
