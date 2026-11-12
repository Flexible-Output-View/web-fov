import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { LoginComponent } from '../pages/login/login.component';
import { FollowedComponent } from '../pages/followed/followed.component';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { LiveStreamsService } from '../services/live-streams.service';

const WCAG_AA_NORMAL_TEXT = 4.5;
const THEMES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];

function parseColor(value: string): [number, number, number] {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const match = trimmed.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (!match) {
    throw new Error(`Couleur non supportée : "${value}"`);
  }
  if (match[4] !== undefined && parseFloat(match[4]) < 1) {
    throw new Error(`Couleur semi-transparente, contraste non calculable : "${value}"`);
  }
  return [+match[1], +match[2], +match[3]];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(parseColor(foreground));
  const l2 = relativeLuminance(parseColor(background));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function applyTheme(theme: Theme): void {
  document.body.classList.toggle('theme-light', theme === 'light');
}

function expectReadable(element: HTMLElement, label: string): void {
  const style = getComputedStyle(element);
  const ratio = contrastRatio(style.color, style.backgroundColor);
  expect(ratio)
    .withContext(`${label} : ${style.color} sur ${style.backgroundColor} = ${ratio.toFixed(2)}:1`)
    .toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
}

describe('Accessibilité — contraste des couleurs (WCAG 2.2 AA)', () => {
  afterEach(() => applyTheme('dark'));

  describe('tokens de thème', () => {
    for (const theme of THEMES) {
      it(`--on-accent est lisible sur les fonds d'accent (thème ${theme})`, () => {
        applyTheme(theme);
        const vars = getComputedStyle(document.body);
        const onAccent = vars.getPropertyValue('--on-accent');
        expect(onAccent.trim()).withContext('--on-accent doit être défini').not.toBe('');

        for (const token of ['--accent-primary', '--accent-secondary']) {
          const ratio = contrastRatio(onAccent, vars.getPropertyValue(token));
          expect(ratio)
            .withContext(`--on-accent sur ${token} = ${ratio.toFixed(2)}:1`)
            .toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
        }
      });
    }
  });

  describe('/login — bouton « Se connecter » (.btn-primary)', () => {
    beforeEach(async () => {
      const auth = jasmine.createSpyObj<AuthService>('AuthService', ['isAuthenticated', 'login']);
      auth.isAuthenticated.and.returnValue(false);

      await TestBed.configureTestingModule({
        imports: [LoginComponent],
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: auth },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { queryParamMap: { get: () => null } } },
          },
        ],
      }).compileComponents();
    });

    for (const theme of THEMES) {
      it(`respecte le ratio 4.5:1 (thème ${theme})`, () => {
        applyTheme(theme);
        const fixture = TestBed.createComponent(LoginComponent);
        fixture.detectChanges();

        const button = fixture.nativeElement.querySelector('button.btn-primary') as HTMLElement;
        expect(button).withContext('bouton .btn-primary introuvable').toBeTruthy();
        expectReadable(button, `.btn-primary (${theme})`);
      });
    }
  });

  describe('/followed (déconnecté) — lien « Se connecter » (.btn-login)', () => {
    beforeEach(async () => {
      const auth = jasmine.createSpyObj<AuthService>('AuthService', ['isAuthenticated']);
      auth.isAuthenticated.and.returnValue(false);
      const users = jasmine.createSpyObj<UserService>('UserService', ['getFollowing']);
      users.getFollowing.and.returnValue(of([]));
      const streams = jasmine.createSpyObj<LiveStreamsService>('LiveStreamsService', [
        'getAvailableStreams',
      ]);
      streams.getAvailableStreams.and.returnValue(of({ streams: [], streamCount: 0 }) as any);

      await TestBed.configureTestingModule({
        imports: [FollowedComponent, HttpClientTestingModule],
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: auth },
          { provide: UserService, useValue: users },
          { provide: LiveStreamsService, useValue: streams },
        ],
      }).compileComponents();
    });

    for (const theme of THEMES) {
      it(`respecte le ratio 4.5:1 (thème ${theme})`, () => {
        applyTheme(theme);
        const fixture = TestBed.createComponent(FollowedComponent);
        fixture.detectChanges();

        const link = fixture.nativeElement.querySelector('a.btn-login') as HTMLElement;
        expect(link).withContext('lien .btn-login introuvable').toBeTruthy();
        expectReadable(link, `.btn-login (${theme})`);
      });
    }
  });
});
