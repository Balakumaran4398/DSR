import { Component } from '@angular/core';
import { APP_THEMES, Theme, ThemeService } from 'src/app/_core/services/theme.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent {
  themes = APP_THEMES;
  isDarkMode$ = this.themeService.isDarkMode$;
  selectedTheme: Theme = this.themeService.activeTheme;
  appliedTheme: Theme = this.themeService.activeTheme;
  customColor = this.selectedTheme.isCustom ? this.selectedTheme.colorHex : '#0EA5E9';

  constructor(private themeService: ThemeService) { }

  onThemeSelect(theme: Theme) {
    this.selectedTheme = theme;
    this.themeService.previewTheme(theme);
  }

  onCustomColorChange(color: string) {
    this.customColor = this.normalizeHex(color) || this.customColor;
    this.selectedTheme = this.themeService.createCustomTheme(this.customColor);
    this.themeService.previewTheme(this.selectedTheme);
  }

  applyTheme() {
    this.themeService.setTheme(this.selectedTheme);
    this.appliedTheme = this.selectedTheme;
  }

  resetTheme() {
    this.themeService.resetTheme();
    this.selectedTheme = this.themeService.defaultTheme;
    this.appliedTheme = this.selectedTheme;
    this.customColor = '#0EA5E9';
  }

  onToggleDark() {
    this.themeService.toggleDarkMode();
  }

  isSelected(theme: Theme): boolean {
    return this.selectedTheme.id === theme.id;
  }

  get selectedThemeName(): string {
    return this.selectedTheme?.isCustom ? 'Custom' : this.selectedTheme?.name || 'Blue';
  }

  get selectedThemeColor(): string {
    return this.selectedTheme?.colorHex || this.customColor;
  }

  get hasPendingChanges(): boolean {
    return this.selectedTheme.id !== this.appliedTheme.id || this.selectedTheme.colorHex !== this.appliedTheme.colorHex;
  }

  private normalizeHex(color: string | null): string | null {
    const match = `${color ?? ''}`.trim().match(/^#?([0-9a-fA-F]{6})$/);
    return match ? `#${match[1].toUpperCase()}` : null;
  }
}
