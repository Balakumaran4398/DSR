interface TabulatorPaginationState {
  page: number;
  pageSize?: number;
}

const TABULATOR_PAGINATION_PREFIX = 'tabulator-pagination-state';

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
  if (!storage) {
    return;
  }

  storage.setItem(key, JSON.stringify(state));
}

export function buildTabulatorPaginationKey(scope: string): string {
  const path = typeof window !== 'undefined' ? window.location.pathname : 'app';
  return `${TABULATOR_PAGINATION_PREFIX}:${path}:${scope}`;
}

export function attachTabulatorPaginationPersistence(table: any, key: string): void {
  if (!table?.on) {
    return;
  }

  let restoring = false;

  const persistState = (partial: Partial<TabulatorPaginationState>) => {
    const current = readState(key) || { page: 1 };
    writeState(key, {
      page: partial.page ?? current.page ?? 1,
      pageSize: partial.pageSize ?? current.pageSize
    });
  };

  const restoreState = () => {
    const state = readState(key);
    if (!state || restoring) {
      return;
    }

    restoring = true;

    Promise.resolve()
      .then(async () => {
        const savedPageSize = Number(state.pageSize || 0);
        const currentPageSize = Number(table.getPageSize?.() || 0);

        if (savedPageSize > 0 && currentPageSize !== savedPageSize && typeof table.setPageSize === 'function') {
          await Promise.resolve(table.setPageSize(savedPageSize)).catch(() => undefined);
        }

        const maxPage = Number(table.getPageMax?.() || state.page || 1);
        const targetPage = Math.max(1, Math.min(Number(state.page || 1), maxPage || 1));
        const currentPage = Number(table.getPage?.() || 1);

        if (targetPage !== currentPage && typeof table.setPage === 'function') {
          await Promise.resolve(table.setPage(targetPage)).catch(() => undefined);
        }
      })
      .finally(() => {
        restoring = false;
      });
  };

  table.on('pageLoaded', (page: number) => {
    if (restoring) {
      return;
    }

    persistState({ page: Number(page) || 1 });
  });

  table.on('pageSizeChanged', (pageSize: number) => {
    if (restoring) {
      return;
    }

    persistState({ pageSize: Number(pageSize) || undefined });
  });

  table.on('tableBuilt', () => {
    setTimeout(() => restoreState(), 0);
  });

  table.on('dataProcessed', () => {
    setTimeout(() => restoreState(), 0);
  });

  setTimeout(() => restoreState(), 0);
}
