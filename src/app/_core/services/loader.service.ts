import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LoaderService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private requestsCount = 0;

  private readonly showDelayMs = 200;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private isVisible = false;

  show(): void {
    this.requestsCount++;

    if (this.isVisible || this.showTimer) return;

    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      if (this.requestsCount > 0) {
        this.isVisible = true;
        this.loadingSubject.next(true);
      }
    }, this.showDelayMs);
  }

  hide(): void {
    if (this.requestsCount > 0) {
      this.requestsCount--;
    }

    if (this.requestsCount > 0) return;

    this.requestsCount = 0;

    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }

    if (this.isVisible) {
      this.isVisible = false;
      this.loadingSubject.next(false);
    }
  }
}
