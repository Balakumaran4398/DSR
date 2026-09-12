import { fakeAsync, tick } from '@angular/core/testing';
import {
  APP_TABLE_DEFAULT_PAGE_SIZE,
  APP_TABLE_PAGE_SIZE_OPTIONS,
  APP_TABLE_VISIBLE_ROW_COUNT,
  attachStandardTabulatorPagination,
  buildTablePageNumbers,
  normalizeTablePageSize
} from './tabulator-pagination.util';

describe('standard table pagination', () => {
  it('uses the application page sizes and normalizes unsupported values', () => {
    expect(APP_TABLE_DEFAULT_PAGE_SIZE).toBe(10);
    expect(APP_TABLE_VISIBLE_ROW_COUNT).toBe(10);
    expect(APP_TABLE_PAGE_SIZE_OPTIONS).toEqual([10, 25, 50, 100]);
    expect(normalizeTablePageSize(25)).toBe(25);
    expect(normalizeTablePageSize(15)).toBe(10);
    expect(normalizeTablePageSize(undefined)).toBe(10);
  });

  it('builds every page number and always supplies page one', () => {
    expect(buildTablePageNumbers(0)).toEqual([1]);
    expect(buildTablePageNumbers(4)).toEqual([1, 2, 3, 4]);
  });

  it('keeps the size selector in the footer and renders every page number', fakeAsync(() => {
    const element = document.createElement('div');
    element.className = 'tabulator';
    element.innerHTML = `
      <div class="tabulator-header"></div>
      <div class="tabulator-footer">
        <span class="tabulator-page-counter"></span>
        <select class="tabulator-page-size"><option value="10">10</option></select>
        <span class="tabulator-paginator"><span class="tabulator-pages"></span></span>
      </div>`;

    const handlers = new Map<string, (...args: any[]) => void>();
    const table = {
      element,
      on: (event: string, handler: (...args: any[]) => void) => handlers.set(event, handler),
      getPage: () => 2,
      getPageMax: () => 4,
      getPageSize: () => 10,
      getDataCount: () => 34,
      setPage: jasmine.createSpy('setPage')
    };

    attachStandardTabulatorPagination(table);
    tick();

    const pages = Array.from(element.querySelectorAll('.tabulator-pages .tabulator-page'));
    expect(element.querySelector('.tabulator-footer .tabulator-page-size')).not.toBeNull();
    expect(element.querySelector('.app-table-page-size-label')).toBeNull();
    expect(pages.map(page => page.textContent)).toEqual(['1', '2', '3', '4']);
    expect(pages[1].getAttribute('aria-current')).toBe('page');
    expect(element.querySelector('.tabulator-page-counter')?.textContent)
      .toBe('Showing 11-20 of 34 records');
  }));

  it('limits pages above ten rows and resets the body scroll position', fakeAsync(() => {
    const element = document.createElement('div');
    element.className = 'tabulator';
    element.innerHTML = `
      <div class="tabulator-tableholder"></div>
      <div class="tabulator-footer">
        <span class="tabulator-page-counter"></span>
        <select class="tabulator-page-size"></select>
        <span class="tabulator-pages"></span>
      </div>`;

    const tableHolder = element.querySelector<HTMLElement>('.tabulator-tableholder')!;
    const handlers = new Map<string, (...args: any[]) => void>();
    let pageSize = 10;
    const table = {
      element,
      on: (event: string, handler: (...args: any[]) => void) => handlers.set(event, handler),
      getPage: () => 1,
      getPageMax: () => 1,
      getPageSize: () => pageSize,
      getDataCount: () => pageSize
    };

    attachStandardTabulatorPagination(table);
    tick();
    expect(element.classList.contains('app-tabulator--ten-row-viewport')).toBeFalse();

    [25, 50, 100].forEach(expandedPageSize => {
      tableHolder.scrollTop = 320;
      pageSize = expandedPageSize;
      handlers.get('pageSizeChanged')!(pageSize);
      tick();
      expect(element.classList.contains('app-tabulator--ten-row-viewport')).toBeTrue();
      expect(tableHolder.scrollTop).toBe(0);
    });

    tableHolder.scrollTop = 128;
    handlers.get('pageLoaded')!(2);
    tick();
    expect(tableHolder.scrollTop).toBe(0);

    pageSize = 10;
    handlers.get('pageSizeChanged')!(pageSize);
    tick();
    expect(element.classList.contains('app-tabulator--ten-row-viewport')).toBeFalse();
  }));
});
