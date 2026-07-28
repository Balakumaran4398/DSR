import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
export interface Theme {
  id: string;
  name: string;
  cssClass: string;
  colorHex: string; // For the UI color dot
}

export const APP_THEMES: Theme[] = [
  { id: 'violet', name: 'Violet', cssClass: 'theme-violet', colorHex: '#8B5CF6' },
  { id: 'orange', name: 'Orange', cssClass: 'theme-orange', colorHex: '#FF7043' },
  { id: 'emerald', name: 'Emerald', cssClass: 'theme-emerald', colorHex: '#10B981' },
  { id: 'blue', name: 'Blue', cssClass: 'theme-blue', colorHex: '#3B82F6' },
  { id: 'black', name: 'Monochrome', cssClass: 'theme-black', colorHex: '#18181B' },
];

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private activeThemeSubject = new BehaviorSubject<Theme>(APP_THEMES[0]);
  private isDarkModeSubject = new BehaviorSubject<boolean>(false);

  activeTheme$ = this.activeThemeSubject.asObservable();
  isDarkMode$ = this.isDarkModeSubject.asObservable();

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.initTheme();
  }

  private initTheme() {
    // 1. Load Dark Mode Preference
    const savedDark = localStorage.getItem('isDarkMode');
    if (savedDark === 'true') {
      this.setDarkMode(false);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      // Auto-detect system preference
      this.setDarkMode(false);
    }

    // 2. Load Brand Theme Preference
    const savedThemeId = localStorage.getItem('activeThemeId');
    const themeToLoad = APP_THEMES.find(t => t.id === savedThemeId) || APP_THEMES[0];
    this.setTheme(themeToLoad);
  }

  setTheme(theme: Theme) {
    // Remove all other theme classes
    APP_THEMES.forEach(t => {
      this.renderer.removeClass(document.body, t.cssClass);
    });

    // Add new theme class
    this.renderer.addClass(document.body, theme.cssClass);

    // Update State
    this.activeThemeSubject.next(theme);
    localStorage.setItem('activeThemeId', theme.id);
  }

  toggleDarkMode() {
    const newStatus = !this.isDarkModeSubject.value;
    this.setDarkMode(false);
  }

  private setDarkMode(isDark: boolean) {
    if (isDark) {
      this.renderer.addClass(document.body, 'dark-mode');
    } else {
      this.renderer.removeClass(document.body, 'dark-mode');
    }

    this.isDarkModeSubject.next(isDark);
    localStorage.setItem('isDarkMode', false.toString());
  }
}