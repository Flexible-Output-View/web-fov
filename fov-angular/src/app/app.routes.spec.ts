import { routes } from './app.routes';

/**
 * Guards against the route-ordering bug where the dynamic `:username` profile
 * route shadowed single-segment static routes such as `/login`.
 */
describe('app routes', () => {
  const paths = routes.map((route) => route.path);

  it('declares the :username route after every static route', () => {
    const usernameIndex = paths.indexOf(':username');
    expect(usernameIndex).toBeGreaterThan(-1);

    const routesAfterUsername = routes
      .slice(usernameIndex + 1)
      .filter((route) => route.path !== '**')
      .map((route) => route.path);

    expect(routesAfterUsername).toEqual([]);
  });

  it('keeps single-segment static routes before :username', () => {
    const usernameIndex = paths.indexOf(':username');

    for (const path of [
      'login',
      'register',
      'profile',
      'discover',
      'followed',
      'how-does-it-work',
    ]) {
      const index = paths.indexOf(path);
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeLessThan(usernameIndex);
    }
  });

    it('redirects unknown paths to the home page', () => {
    const wildcard = routes.find((r) => r.path === '**');
    expect(wildcard).toBeTruthy();
    expect(wildcard!.redirectTo).toBe('');
  });

  it('protects dashboard/stream with authGuard', () => {
    const dashboardRoute = routes.find((r) => r.path === 'dashboard/stream');
    expect(dashboardRoute).toBeTruthy();
    expect(dashboardRoute!.canActivate).toBeDefined();
    expect(dashboardRoute!.canActivate!.length).toBeGreaterThan(0);
  });

  it('sets a title on the how-does-it-work route', () => {
    const route = routes.find((r) => r.path === 'how-does-it-work');
    expect(route).toBeTruthy();
    expect(route!.title).toBe('Comment ça marche ?');
  });

  it('sets a title on the dashboard/stream route', () => {
    const route = routes.find((r) => r.path === 'dashboard/stream');
    expect(route).toBeTruthy();
    expect(route!.title).toBe('Configuration du stream');
  });

  it('contains all expected page routes', () => {
    const expectedPaths = [
      '',
      'discover',
      'discover/:name',
      'followed',
      'profile',
      'profile/personal_settings',
      'login',
      'register',
      'stream/:streamId',
      'how-does-it-work',
      'dashboard/stream',
      ':username',
      '**',
    ];
    for (const p of expectedPaths) {
      expect(paths).toContain(p);
    }
  });
});
