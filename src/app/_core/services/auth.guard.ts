import { Injectable } from '@angular/core';
import { CanActivate, CanActivateChild, CanMatch, Route, Router, UrlSegment, UrlTree } from '@angular/router';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate, CanActivateChild, CanMatch {
  constructor(private router: Router, private storageService: StorageService) { }

  canActivate(): boolean | UrlTree {
    return this.checkAuth();
  }

  canActivateChild(): boolean | UrlTree {
    return this.checkAuth();
  }

  canMatch(_route: Route, _segments: UrlSegment[]): boolean | UrlTree {
    return this.checkAuth();
  }

  private checkAuth(): boolean | UrlTree {
    return this.storageService.isLoggedIn()
      ? true
      : this.router.createUrlTree(['/login']);
  }
}
