import { Component } from '@angular/core';
import { APP_THEMES, Theme, ThemeService } from 'src/app/_core/services/theme.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent {
  themes = APP_THEMES;
  currentTheme$ = this.themeService.activeTheme$;
  isDarkMode$ = this.themeService.isDarkMode$;

  constructor(private themeService: ThemeService) { }

  onThemeSelect(theme: Theme) {
    this.themeService.setTheme(theme);
  }

  onToggleDark() {
    this.themeService.toggleDarkMode();
  }
}