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
});
