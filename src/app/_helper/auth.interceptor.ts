import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { Router } from '@angular/router';

import { StorageService } from '../_core/services/storage.service';
import { LoaderService } from '../_core/services/loader.service';

const LOADER_SKIP_HEADER = 'X-Skip-Loader';
const LOADER_SHOW_HEADER = 'X-Show-Loader';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private storage: StorageService,
    private router: Router,
    private loader: LoaderService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const skipLoader = req.headers.has(LOADER_SKIP_HEADER);
    const showLoader = req.headers.has(LOADER_SHOW_HEADER);
    let headers = req.headers;

    if (skipLoader) {
      headers = headers.delete(LOADER_SKIP_HEADER);
    }

    if (showLoader) {
      headers = headers.delete(LOADER_SHOW_HEADER);
    }

    const cleanedReq = headers === req.headers
      ? req
      : req.clone({ headers });

    const shouldShowLoader = showLoader && !skipLoader;
    if (shouldShowLoader) this.loader.show();

    const token = this.storage.getToken();
    const authReq = token
      ? cleanedReq.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        })
      : cleanedReq;

    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.storage.clearAll();
          this.router.navigate(['/login']);
        }
        return throwError(() => error);
      }),
      finalize(() => {
        if (shouldShowLoader) this.loader.hide();
      })
    );
  }
}
