import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
export interface Theme {
  id: string;
  name: string;
  cssClass: string;
  colorHex: string; // For the UI color dot
  bgActive?: string;
  textActive?: string;
  textOnActive?: string;
  isCustom?: boolean;
}

export const APP_THEMES: Theme[] = [
  { id: 'blue', name: 'Blue', cssClass: 'theme-blue', colorHex: '#3B82F6', bgActive: '#EFF6FF', textActive: '#1D4ED8' },
  { id: 'indigo', name: 'Indigo', cssClass: 'theme-indigo', colorHex: '#6366F1', bgActive: '#EEF2FF', textActive: '#4338CA' },
  { id: 'purple', name: 'Purple', cssClass: 'theme-purple', colorHex: '#A855F7', bgActive: '#FAF5FF', textActive: '#7E22CE' },
  { id: 'violet', name: 'Violet', cssClass: 'theme-violet', colorHex: '#8B5CF6', bgActive: '#F5F3FF', textActive: '#6D28D9' },
  { id: 'pink', name: 'Pink', cssClass: 'theme-pink', colorHex: '#EC4899', bgActive: '#FDF2F8', textActive: '#DB2777' },
  { id: 'red', name: 'Red', cssClass: 'theme-red', colorHex: '#EF4444', bgActive: '#FEF2F2', textActive: '#DC2626' },
  { id: 'orange', name: 'Orange', cssClass: 'theme-orange', colorHex: '#F97316', bgActive: '#FFF7ED', textActive: '#C2410C' },
  { id: 'amber', name: 'Amber', cssClass: 'theme-amber', colorHex: '#F59E0B', bgActive: '#FFFBEB', textActive: '#B45309' },
  { id: 'green', name: 'Green', cssClass: 'theme-green', colorHex: '#22C55E', bgActive: '#F0FDF4', textActive: '#15803D' },
  { id: 'teal', name: 'Teal', cssClass: 'theme-teal', colorHex: '#14B8A6', bgActive: '#F0FDFA', textActive: '#0F766E' },
  { id: 'cyan', name: 'Cyan', cssClass: 'theme-cyan', colorHex: '#06B6D4', bgActive: '#ECFEFF', textActive: '#0E7490' },
  { id: 'navy', name: 'Navy', cssClass: 'theme-navy', colorHex: '#1E3A8A', bgActive: '#EFF6FF', textActive: '#1E3A8A' },
];

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private activeThemeSubject = new BehaviorSubject<Theme>(APP_THEMES[0]);
  private isDarkModeSubject = new BehaviorSubject<boolean>(false);
  private readonly themeStorageKey = 'activeThemeId';
  private readonly customColorStorageKey = 'customThemeColor';
  private readonly darkModeStorageKey = 'isDarkMode';
  private readonly customThemeClass = 'theme-custom';

  activeTheme$ = this.activeThemeSubject.asObservable();
  isDarkMode$ = this.isDarkModeSubject.asObservable();

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.initTheme();
  }

  private initTheme() {
    const savedThemeId = localStorage.getItem(this.themeStorageKey);
    const savedCustomColor = localStorage.getItem(this.customColorStorageKey);
    const themeToLoad = savedThemeId === 'custom' && this.isValidHex(savedCustomColor)
      ? this.createCustomTheme(savedCustomColor as string)
      : APP_THEMES.find(t => t.id === savedThemeId) || APP_THEMES[0];
    this.setTheme(themeToLoad);

    const savedDark = localStorage.getItem(this.darkModeStorageKey);
    this.setDarkMode(savedDark === 'true');
  }

  get activeTheme(): Theme {
    return this.activeThemeSubject.value;
  }

  get defaultTheme(): Theme {
    return APP_THEMES[0];
  }

  setTheme(theme: Theme, persist = true) {
    // Remove all other theme classes
    this.clearThemeClasses();
    this.clearCustomThemeStyles();

    // Add new theme class
    this.renderer.addClass(document.body, theme.cssClass);
    if (theme.isCustom) {
      this.applyCustomThemeStyles(theme);
    }

    // Update State
    this.activeThemeSubject.next(theme);
    if (persist) {
      localStorage.setItem(this.themeStorageKey, theme.id);
      if (theme.isCustom) {
        localStorage.setItem(this.customColorStorageKey, theme.colorHex);
      } else {
        localStorage.removeItem(this.customColorStorageKey);
      }
    }
  }

  previewTheme(theme: Theme) {
    this.setTheme(theme, false);
  }

  resetTheme() {
    this.setTheme(this.defaultTheme);
  }

  createCustomTheme(colorHex: string): Theme {
    const color = this.normalizeHex(colorHex) || APP_THEMES[0].colorHex;
    return {
      id: 'custom',
      name: 'Custom',
      cssClass: this.customThemeClass,
      colorHex: color,
      bgActive: this.mixColors(color, '#ffffff', 0.88),
      textActive: color,
      textOnActive: this.getReadableTextColor(color),
      isCustom: true
    };
  }

  toggleDarkMode() {
    this.setDarkMode(!this.isDarkModeSubject.value);
  }

  setDarkMode(isDark: boolean) {
    if (isDark) {
      this.renderer.addClass(document.body, 'dark-mode');
    } else {
      this.renderer.removeClass(document.body, 'dark-mode');
    }

    this.isDarkModeSubject.next(isDark);
    if (this.activeThemeSubject.value.isCustom) {
      this.applyCustomThemeStyles(this.activeThemeSubject.value);
    }
    localStorage.setItem(this.darkModeStorageKey, isDark.toString());
  }

  private clearThemeClasses(): void {
    APP_THEMES.forEach(t => {
      this.renderer.removeClass(document.body, t.cssClass);
    });
    this.renderer.removeClass(document.body, this.customThemeClass);
    this.renderer.removeClass(document.body, 'theme-black');
    this.renderer.removeClass(document.body, 'theme-emerald');
  }

  private applyCustomThemeStyles(theme: Theme): void {
    const activeBackground = this.isDarkModeSubject.value
      ? `color-mix(in srgb, ${theme.colorHex} 18%, transparent)`
      : theme.bgActive || this.mixColors(theme.colorHex, '#ffffff', 0.88);

    this.renderer.setStyle(document.body, '--brand-color', theme.colorHex);
    this.renderer.setStyle(document.body, '--text-active', theme.textActive || theme.colorHex);
    this.renderer.setStyle(document.body, '--bg-active', activeBackground);
    this.renderer.setStyle(document.body, '--text-on-active', theme.textOnActive || this.getReadableTextColor(theme.colorHex));
  }

  private clearCustomThemeStyles(): void {
    ['--brand-color', '--text-active', '--bg-active', '--text-on-active'].forEach(styleName => {
      this.renderer.removeStyle(document.body, styleName);
    });
  }

  private isValidHex(color: string | null): boolean {
    return !!this.normalizeHex(color);
  }

  private normalizeHex(color: string | null): string | null {
    const value = `${color ?? ''}`.trim();
    const match = value.match(/^#?([0-9a-fA-F]{6})$/);
    return match ? `#${match[1].toUpperCase()}` : null;
  }

  private hexToRgb(color: string): { r: number; g: number; b: number } {
    const normalized = this.normalizeHex(color) || '#3B82F6';
    const value = normalized.replace('#', '');
    return {
      r: parseInt(value.substring(0, 2), 16),
      g: parseInt(value.substring(2, 4), 16),
      b: parseInt(value.substring(4, 6), 16)
    };
  }

  private mixColors(firstColor: string, secondColor: string, secondWeight: number): string {
    const first = this.hexToRgb(firstColor);
    const second = this.hexToRgb(secondColor);
    const firstWeight = 1 - secondWeight;
    const toHex = (value: number) => Math.round(value).toString(16).padStart(2, '0').toUpperCase();

    return `#${toHex(first.r * firstWeight + second.r * secondWeight)}${toHex(first.g * firstWeight + second.g * secondWeight)}${toHex(first.b * firstWeight + second.b * secondWeight)}`;
  }

  private getReadableTextColor(color: string): string {
    const { r, g, b } = this.hexToRgb(color);
    const srgb = [r, g, b].map(value => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    return luminance > 0.45 ? '#0F172A' : '#FFFFFF';
  }
}
