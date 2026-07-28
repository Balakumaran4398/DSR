import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';


// Swallow known Tabulator unhandled promise rejections so navigation/data refresh stays smooth.
// (We still fix the root causes in the individual components.)
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason: any = (event as any)?.reason;
  const message = reason?.message ? String(reason.message) : String(reason);
  const stack = reason?.stack ? String(reason.stack) : '';

  const looksLikeTabulator = /tabulator|RowManager|Tabulator\.js/i.test(message + ' ' + stack);
  const knownRace = /verticalFillMode|renderer is null/i.test(message + ' ' + stack);

  if (looksLikeTabulator && knownRace) {
    event.preventDefault();
  }
});


platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
