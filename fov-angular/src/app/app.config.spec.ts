import { appConfig } from './app.config';

describe('appConfig', () => {
  it('should be defined', () => {
    expect(appConfig).toBeTruthy();
  });

  it('should have a providers array', () => {
    expect(appConfig.providers).toBeDefined();
    expect(Array.isArray(appConfig.providers)).toBeTrue();
    expect(appConfig.providers!.length).toBeGreaterThan(0);
  });
});
