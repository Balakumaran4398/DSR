import { Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { LoaderService } from './_core/services/loader.service';
import { ThemeService } from './_core/services/theme.service';
import { StorageService } from './_core/services/storage.service';
import { Subscription, filter } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'ProjectHub';
  isChatOpen = false;
  showChatbot = false;
  chatUrl: SafeResourceUrl | null = null;
  username: string | null = null;
  private routerSubscription?: Subscription;

  constructor(
    private loaderService: LoaderService,
    private themeService: ThemeService,
    private sanitizer: DomSanitizer,
    private storageService: StorageService,
    private router: Router
  ) {
  }

  ngOnInit(): void {
    this.syncChatbotState();
    this.routerSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.syncChatbotState());
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
  }

  toggleChat(): void {
    if (!this.showChatbot) {
      return;
    }
    this.isChatOpen = !this.isChatOpen;
  }

  closeChat(): void {
    this.isChatOpen = false;
  }

  private syncChatbotState(): void {
    this.username = this.storageService.getUsername();
    const isLoginRoute = this.router.url.includes('/login');

    this.showChatbot = this.storageService.isLoggedIn() && !isLoginRoute;

    if (!this.showChatbot) {
      this.isChatOpen = false;
      this.chatUrl = null;
      return;
    }

    // const encodedUsername = encodeURIComponent(this.username ?? '');
    this.chatUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      `http://192.168.1.113:8082/chat.html?username="${this.username}"`
      // `http://103.183.47.213:8585/chat.html?username="${this.username}"`
      // `https://crm.ridsys.in:8080/websocket/chat.html?username="${this.username}"`
    );
  }
}
