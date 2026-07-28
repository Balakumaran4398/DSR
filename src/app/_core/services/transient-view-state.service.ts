import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TransientViewStateService {
  private readonly viewState = new Map<string, unknown>();

  getState<T>(key: string): T | null {
    if (!this.viewState.has(key)) {
      return null;
    }

    return this.clone(this.viewState.get(key) as T);
  }

  setState<T>(key: string, state: T): void {
    this.viewState.set(key, this.clone(state));
  }

  clearState(key: string): void {
    this.viewState.delete(key);
  }

  private clone<T>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }

    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }
}
