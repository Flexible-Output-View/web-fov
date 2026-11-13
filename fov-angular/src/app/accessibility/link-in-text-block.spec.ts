import { TestBed } from '@angular/core/testing';
import { HowDoesItWorkComponent } from '../pages/how-does-it-work/how-does-it-work.component';

const THEMES = ['dark', 'light'] as const;

describe('Accessibilité — liens distinguables sans la couleur (WCAG 2.2 1.4.1)', () => {
  afterEach(() => document.body.classList.remove('theme-light'));

  describe('/how-does-it-work', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [HowDoesItWorkComponent],
      }).compileComponents();
    });

    for (const theme of THEMES) {
      it(`souligne les liens placés dans un bloc de texte (thème ${theme})`, () => {
        document.body.classList.toggle('theme-light', theme === 'light');
        const fixture = TestBed.createComponent(HowDoesItWorkComponent);
        fixture.detectChanges();

        const links = Array.from(
          fixture.nativeElement.querySelectorAll('p a, li a'),
        ) as HTMLAnchorElement[];
        expect(links.length).withContext('aucun lien en ligne trouvé').toBeGreaterThan(0);
        expect(
          fixture.nativeElement.querySelector('.all-releases > a[target="_blank"]'),
        ).withContext('lien « GitHub Releases » introuvable').toBeTruthy();

        for (const link of links) {
          expect(getComputedStyle(link).textDecorationLine)
            .withContext(`« ${link.textContent?.trim()} » doit être souligné`)
            .toContain('underline');
        }
      });
    }
  });
});
