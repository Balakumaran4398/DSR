import { Injectable } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

@Injectable({
  providedIn: 'root'
})
export class ToasterService {

  constructor(private toastr: ToastrService) { }

  success(message: string, title: string = 'Success', timeOut: number = 3000) {
    this.toastr.success(message, title, {
      timeOut,
      progressBar: true,
      closeButton: true,
    });
  }

  error(message: string, title: string = 'Error', timeOut: number = 3000) {
    this.toastr.error(message, title, {
      timeOut,
      progressBar: true,
      closeButton: true,
    });
  }

  info(message: string, title: string = 'Info', timeOut: number = 3000) {
    this.toastr.info(message, title, {
      timeOut,
      progressBar: true,
      closeButton: true,
    });
  }

  warning(message: string, title: string = 'Warning', timeOut: number = 3000) {
    this.toastr.warning(message, title, {
      timeOut,
      progressBar: true,
      closeButton: true,
    });
  }
}
