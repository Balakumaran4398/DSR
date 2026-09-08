import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  constructor(private storageService: StorageService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean | UrlTree {
    const allowedRoles = (route.data?.['roles'] as string[] | undefined) ?? [];

    return this.storageService.hasAnyRole(allowedRoles)
      ? true
      : this.router.createUrlTree(['/main/home']);
  }
}
