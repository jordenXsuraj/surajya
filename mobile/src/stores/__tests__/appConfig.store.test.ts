import type { AppConfig } from '@/api/endpoints/app';
import { useAppConfig } from '@/stores/appConfig.store';

const config = (patch: Partial<AppConfig> = {}): AppConfig => ({
  minVersion: { ios: '0.0.0', android: '0.0.0' },
  latestVersion: { ios: '1.0.0', android: '1.0.0' },
  storeUrl: { ios: '', android: 'https://play.google.com/store/apps/details?id=com.themeetnet.app' },
  features: { confessionsEnabled: { ios: true, android: true }, pdfUploads: true },
  maintenance: { enabled: false, message: '' },
  ...patch,
});

const initial = useAppConfig.getState();
beforeEach(() => useAppConfig.setState(initial, true));

describe('app config (jest-expo runs as iOS)', () => {
  it('starts with everything on and nothing blocking', () => {
    const s = useAppConfig.getState();
    expect(s.confessionsEnabled).toBe(true);
    expect(s.updateRequired).toBe(false);
    expect(s.maintenance.enabled).toBe(false);
  });

  it('blocks only when the installed version is below this platform’s minimum', () => {
    useAppConfig.getState().apply(config({ minVersion: { ios: '1.0.1', android: '0.0.0' } }), '1.0.0');
    expect(useAppConfig.getState().updateRequired).toBe(true);
    expect(useAppConfig.getState().storeUrl).toBe(''); // iOS: no App Store page yet

    useAppConfig.getState().apply(config({ minVersion: { ios: '0.0.0', android: '9.9.9' } }), '1.0.0');
    expect(useAppConfig.getState().updateRequired).toBe(false);

    useAppConfig.getState().apply(config({ minVersion: { ios: '1.0.0', android: '1.0.0' } }), '1.0.0');
    expect(useAppConfig.getState().updateRequired).toBe(false);
  });

  it('never blocks on an unknown installed version', () => {
    useAppConfig.getState().apply(config({ minVersion: { ios: '9.9.9', android: '9.9.9' } }), null);
    expect(useAppConfig.getState().updateRequired).toBe(false);
  });

  it('maintenance with its message', () => {
    useAppConfig
      .getState()
      .apply(config({ maintenance: { enabled: true, message: ' Back at 6 pm ' } }), '1.0.0');
    expect(useAppConfig.getState().maintenance).toEqual({ enabled: true, message: 'Back at 6 pm' });
  });
});
