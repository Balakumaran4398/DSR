interface TabulatorPaginationState {
  page: number;
  pageSize?: number;
}

export const APP_TABLE_DEFAULT_PAGE_SIZE = 10;
export const APP_TABLE_VISIBLE_ROW_COUNT = 10;
export const APP_TABLE_PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50, 100];

const TABULATOR_PAGINATION_PREFIX = 'tabulator-pagination-state';

export function normalizeTablePageSize(value: unknown): number {
  const pageSize = Number(value);
  return APP_TABLE_PAGE_SIZE_OPTIONS.includes(pageSize)
    ? pageSize
    : APP_TABLE_DEFAULT_PAGE_SIZE;
}

export function buildTablePageNumbers(totalPages: number): number[] {
  const normalizedTotal = Math.max(1, Math.floor(Number(totalPages) || 1));
  return Array.from({ length: normalizedTotal }, (_value, index) => index + 1);
}

function getStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readState(key: string): TabulatorPaginationState | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as TabulatorPaginationState;
  } catch {
    return null;
  }
}

function writeState(key: string, state: TabulatorPaginationState): void {
  const storage = getStorage();
  if (storage) {
    storage.setItem(key, JSON.stringify(state));
  }
}

function getTableRoot(table: any): HTMLElement | null {
  const element = table?.element;
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  return element.classList.contains('tabulator')
    ? element
    : element.querySelector<HTMLElement>('.tabulator');
}

function renderTabulatorPagination(table: any, resetBodyScroll = false): void {
  const root = getTableRoot(table);
  if (!root) {
    return;
  }

  const setNavigationLabel = (page: 'first' | 'prev' | 'next' | 'last', label: string) => {
    const button = root.querySelector<HTMLButtonElement>(`.tabulator-page[data-page="${page}"]`);
    if (!button) {
      return;
    }
    button.textContent = label;
    button.title = label;
    button.setAttribute('aria-label', label);
  };

  setNavigationLabel('first', 'First');
  setNavigationLabel('prev', 'Prev');
  setNavigationLabel('next', 'Next');
  setNavigationLabel('last', 'Last');

  const select = root.querySelector<HTMLSelectElement>('.tabulator-page-size');
  if (select) {
    select.setAttribute('aria-label', 'Page size');
  }

  root.querySelectorAll('.app-table-page-size-label').forEach(label => label.remove());

  const pages = root.querySelector<HTMLElement>('.tabulator-pages');
  const counter = root.querySelector<HTMLElement>('.tabulator-page-counter');
  const totalPages = Math.max(1, Number(table.getPageMax?.()) || 1);
  const currentPage = Math.max(1, Math.min(totalPages, Number(table.getPage?.()) || 1));
  const pageSize = normalizeTablePageSize(table.getPageSize?.());
  const totalRows = Math.max(0, Number(table.getDataCount?.('active')) || 0);

  root.classList.toggle(
    'app-tabulator--ten-row-viewport',
    pageSize > APP_TABLE_VISIBLE_ROW_COUNT
  );

  if (resetBodyScroll) {
    const tableHolder = root.querySelector<HTMLElement>('.tabulator-tableholder');
    if (tableHolder) {
      tableHolder.scrollTop = 0;
    }
  }

  if (pages) {
    pages.replaceChildren(...buildTablePageNumbers(totalPages).map(page => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tabulator-page${page === currentPage ? ' active' : ''}`;
      button.dataset['page'] = String(page);
      button.textContent = String(page);
      button.title = `Show page ${page}`;
      button.setAttribute('aria-label', `Go to page ${page}`);
      if (page === currentPage) {
        button.setAttribute('aria-current', 'page');
      }
      button.addEventListener('click', () => {
        if (page !== Number(table.getPage?.()) && typeof table.setPage === 'function') {
          void Promise.resolve(table.setPage(page)).catch(() => undefined);
        }
      });
      return button;
    }));
  }

  if (counter) {
    const showingFrom = totalRows ? ((currentPage - 1) * pageSize) + 1 : 0;
    const showingTo = totalRows ? Math.min(currentPage * pageSize, totalRows) : 0;
    counter.textContent = `Showing ${showingFrom}-${showingTo} of ${totalRows} records`;
  }
}

export function buildTabulatorPaginationKey(scope: string): string {
  const path = typeof window !== 'undefined' ? window.location.pathname : 'app';
  return `${TABULATOR_PAGINATION_PREFIX}:${path}:${scope}`;
}

export function attachStandardTabulatorPagination(table: any, key?: string): void {
  if (!table?.on) {
    return;
  }

  let restoring = false;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let shouldResetBodyScroll = false;

  const scheduleRender = (resetBodyScroll = false) => {
    shouldResetBodyScroll = shouldResetBodyScroll || resetBodyScroll;
    if (renderTimer) {
      clearTimeout(renderTimer);
    }
    renderTimer = setTimeout(() => {
      renderTabulatorPagination(table, shouldResetBodyScroll);
      shouldResetBodyScroll = false;
    }, 0);
  };

  const persistState = (partial: Partial<TabulatorPaginationState>) => {
    if (!key) {
      return;
    }
    const current = readState(key) || { page: 1 };
    writeState(key, {
      page: partial.page ?? current.page ?? 1,
      pageSize: partial.pageSize ?? current.pageSize
    });
  };

  const restoreState = () => {
    const state = key ? readState(key) : null;
    if (!state || restoring) {
      scheduleRender();
      return;
    }

    restoring = true;
    Promise.resolve()
      .then(async () => {
        const savedPageSize = normalizeTablePageSize(state.pageSize);
        const currentPageSize = Number(table.getPageSize?.() || 0);
        if (currentPageSize !== savedPageSize && typeof table.setPageSize === 'function') {
          await Promise.resolve(table.setPageSize(savedPageSize)).catch(() => undefined);
        }

        const maxPage = Math.max(1, Number(table.getPageMax?.()) || 1);
        const targetPage = Math.max(1, Math.min(Number(state.page || 1), maxPage));
        const currentPage = Number(table.getPage?.() || 1);
        if (targetPage !== currentPage && typeof table.setPage === 'function') {
          await Promise.resolve(table.setPage(targetPage)).catch(() => undefined);
        }
        persistState({ page: targetPage, pageSize: savedPageSize });
      })
      .finally(() => {
        restoring = false;
        scheduleRender();
      });
  };

  table.on('pageLoaded', (page: number) => {
    if (!restoring) {
      persistState({ page: Number(page) || 1 });
    }
    scheduleRender(true);
  });

  table.on('pageSizeChanged', (pageSize: number) => {
    const normalizedPageSize = normalizeTablePageSize(pageSize);
    if (Number(pageSize) !== normalizedPageSize && typeof table.setPageSize === 'function') {
      void Promise.resolve(table.setPageSize(normalizedPageSize)).catch(() => undefined);
      return;
    }
    if (!restoring) {
      persistState({ page: 1, pageSize: normalizedPageSize });
    }
    scheduleRender(true);
  });

  table.on('tableBuilt', restoreState);
  table.on('dataProcessed', restoreState);
  scheduleRender();
}

export function attachTabulatorPaginationPersistence(table: any, key: string): void {
  attachStandardTabulatorPagination(table, key);
}
