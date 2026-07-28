import { Component } from '@angular/core';
import { LoaderService } from 'src/app/_core/services/loader.service';

@Component({
  selector: 'app-loader',
  templateUrl: './loader.component.html',
  styleUrls: ['./loader.component.scss']
})
export class LoaderComponent {
  constructor(private loaderService: LoaderService) { 
    // loaderService.show()
    
  }
  isLoading = this.loaderService.loading$;
}
