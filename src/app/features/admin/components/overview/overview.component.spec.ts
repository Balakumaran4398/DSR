import { OverviewComponent } from './overview.component';

describe('OverviewComponent page persistence', () => {
  afterEach(() => {
    sessionStorage.removeItem('overviewCurrentView:management');
    sessionStorage.removeItem('overviewCurrentView:standard');
  });

  it('restores the last page for an admin after refresh', () => {
    sessionStorage.setItem('overviewCurrentView:management', 'releases');
    const component = new OverviewComponent({
      roles: { isAdmin: true, isManager: false }
    } as any);

    component.ngOnInit();

    expect(component.activeTabId).toBe('releases');
  });

  it('restores the last page for a manager after refresh', () => {
    sessionStorage.setItem('overviewCurrentView:management', 'timelogs');
    const component = new OverviewComponent({
      roles: { isAdmin: false, isManager: true }
    } as any);

    component.ngOnInit();

    expect(component.activeTabId).toBe('timelogs');
  });

  it('defaults management users to Overall Performance without a valid saved page', () => {
    sessionStorage.setItem('overviewCurrentView:management', 'invalid');
    const component = new OverviewComponent({
      roles: { isAdmin: true, isManager: false }
    } as any);

    component.ngOnInit();

    expect(component.activeTabId).toBe('Overall Performance');
  });

  it('stores a newly selected management page', () => {
    const component = new OverviewComponent({
      roles: { isAdmin: false, isManager: true }
    } as any);
    component.ngOnInit();

    component.setActiveTab('releases');

    expect(component.activeTabId).toBe('releases');
    expect(sessionStorage.getItem('overviewCurrentView:management')).toBe('releases');
  });
});
