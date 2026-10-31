import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { StreamConfigComponent } from './stream-config.component';
import { StreamConfigService } from '../../services/stream-config.service';
import {
  StreamSettings,
  StreamKeyResponse,
  BackendCategory,
} from '../../models/stream-config';

describe('StreamConfigComponent', () => {
  let component: StreamConfigComponent;
  let fixture: ComponentFixture<StreamConfigComponent>;
  let configService: jasmine.SpyObj<StreamConfigService>;

  const mockSettings: StreamSettings = {
    streamId: 'stream-abc',
    title: 'Mon Super Stream',
    description: 'Une description détaillée',
    visibility: 'public',
    thumbnailUrl: 'https://img.test/thumb.png',
    categoryId: 10,
    category: 'Gaming',
    streamKey: 'live_key_xyz_1234567890',
    isLive: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  };

  const mockCategories: BackendCategory[] = [
    { id: 10, name: 'Gaming', viewers: 100, image_url: 'g.png' },
    { id: 20, name: 'Musique', viewers: 50, image_url: 'm.png' },
  ];

  const mockKeyRes: StreamKeyResponse = {
    streamKey: 'live_key_xyz_1234567890',
    streamId: 'stream-abc',
    isLive: false,
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    configService = jasmine.createSpyObj('StreamConfigService', [
      'getCategories',
      'getMyStream',
      'getStreamKey',
      'updateMyStream',
      'rotateStreamKey',
    ]);

    configService.getCategories.and.returnValue(of(mockCategories));
    configService.getMyStream.and.returnValue(of(mockSettings));
    configService.getStreamKey.and.returnValue(of(mockKeyRes));
    configService.updateMyStream.and.returnValue(of(mockSettings));
    configService.rotateStreamKey.and.returnValue(
      of({ ...mockKeyRes, streamKey: 'live_key_rotated_999' }),
    );

    await TestBed.configureTestingModule({
      imports: [StreamConfigComponent, ReactiveFormsModule],
      providers: [{ provide: StreamConfigService, useValue: configService }],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamConfigComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── ngOnInit / Data Loading ───────────────────────────────────
  describe('ngOnInit & loadData', () => {
    it('should initialize the form with default controls', () => {
      fixture.detectChanges();
      expect(component.streamForm).toBeDefined();
      expect(component.streamForm.get('title')).toBeTruthy();
      expect(component.streamForm.get('description')).toBeTruthy();
      expect(component.streamForm.get('visibility')).toBeTruthy();
      expect(component.streamForm.get('categoryId')).toBeTruthy();
      expect(component.streamForm.get('thumbnailUrl')).toBeTruthy();
    });

    it('should load categories, stream settings, and stream key on init', () => {
      fixture.detectChanges();
      expect(configService.getCategories).toHaveBeenCalled();
      expect(configService.getMyStream).toHaveBeenCalled();
      expect(configService.getStreamKey).toHaveBeenCalled();
      expect(component.backendCategories).toEqual(mockCategories);
      expect(component.streamSettings).toEqual(mockSettings);
      expect(component.streamKey).toBe('live_key_xyz_1234567890');
      expect(component.isLoading).toBeFalse();
    });

    it('should patch form with loaded settings values', () => {
      fixture.detectChanges();
      expect(component.streamForm.value).toEqual({
        title: 'Mon Super Stream',
        description: 'Une description détaillée',
        visibility: 'public',
        categoryId: 10,
        thumbnailUrl: 'https://img.test/thumb.png',
      });
      expect(component.thumbnailPreview).toBe('https://img.test/thumb.png');
    });

    it('should handle getCategories error gracefully and still load settings', () => {
      configService.getCategories.and.returnValue(throwError(() => new Error()));
      fixture.detectChanges();
      expect(component.backendCategories).toEqual([]);
      expect(configService.getMyStream).toHaveBeenCalled();
    });

    it('should handle getMyStream error by showing toast and disabling loading', () => {
      configService.getMyStream.and.returnValue(throwError(() => new Error()));
      fixture.detectChanges();
      expect(component.isLoading).toBeFalse();
      expect(component.toastMessage).toBe('Erreur lors du chargement');
      expect(component.toastType).toBe('error');
    });
  });

  // ── Clé de stream ──────────────────────────────────────────────
  describe('stream key features', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should return masked dots when streamKeyVisible is false', () => {
      component.streamKey = '12345';
      component.streamKeyVisible = false;
      expect(component.maskedKey).toBe('•••••');
    });

    it('should return 40 dots if streamKey is empty and not visible', () => {
      component.streamKey = '';
      component.streamKeyVisible = false;
      expect(component.maskedKey).toBe('•'.repeat(40));
    });

    it('should return plain key when streamKeyVisible is true', () => {
      component.streamKey = '12345';
      component.streamKeyVisible = true;
      expect(component.maskedKey).toBe('12345');
    });

    it('should toggle streamKeyVisible', () => {
      expect(component.streamKeyVisible).toBeFalse();
      component.toggleKeyVisibility();
      expect(component.streamKeyVisible).toBeTrue();
      component.toggleKeyVisibility();
      expect(component.streamKeyVisible).toBeFalse();
    });

    it('should copy stream key to clipboard and show toast', fakeAsync(() => {
      spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
      component.streamKey = 'my-secret-key';
      component.copyStreamKey();
      tick();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('my-secret-key');
      expect(component.toastMessage).toBe('Clé copiée !');
      expect(component.toastType).toBe('success');
    }));

    it('should build correct streamLink', () => {
      component.streamSettings = { ...mockSettings, streamId: 'abc-xyz' };
      expect(component.streamLink).toBe(`${window.location.origin}/stream/abc-xyz`);
    });

    it('should fallback to "me" in streamLink when streamSettings is null', () => {
      component.streamSettings = null;
      expect(component.streamLink).toBe(`${window.location.origin}/stream/me`);
    });

    it('should copy stream link to clipboard', fakeAsync(() => {
      spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
      component.copyStreamLink();
      tick();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(component.streamLink);
      expect(component.toastMessage).toBe('Lien copié !');
    }));
  });

  // ── rotateStreamKey ───────────────────────────────────────────
  describe('rotateStreamKey', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should abort if user cancels confirmation', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.rotateStreamKey();
      expect(configService.rotateStreamKey).not.toHaveBeenCalled();
      expect(component.isRotatingKey).toBeFalse();
    });

    it('should call rotateStreamKey and update state on confirm', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      component.streamKeyVisible = true;
      component.rotateStreamKey();
      expect(configService.rotateStreamKey).toHaveBeenCalled();
      expect(component.streamKey).toBe('live_key_rotated_999');
      expect(component.streamKeyVisible).toBeFalse();
      expect(component.isRotatingKey).toBeFalse();
      expect(component.toastMessage).toBe('Clé régénérée');
      expect(component.toastType).toBe('success');
    });

    it('should handle error when rotation fails', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      configService.rotateStreamKey.and.returnValue(throwError(() => new Error()));
      component.rotateStreamKey();
      expect(component.isRotatingKey).toBeFalse();
      expect(component.toastMessage).toBe('Erreur lors de la régénération');
      expect(component.toastType).toBe('error');
    });
  });

  // ── Miniature ──────────────────────────────────────────────────
  describe('thumbnail management', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should ignore selection when no file is present', () => {
      const event = { target: { files: [] } } as any;
      component.onThumbnailSelected(event);
      expect(component.thumbnailPreview).toBe(mockSettings.thumbnailUrl);
    });

    it('should reject file > 5 Mo with error toast', () => {
      const file = new File(['x'], 'heavy.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 });
      const target = { files: [file], value: 'fake-path' };

      component.onThumbnailSelected({ target } as any);
      expect(component.toastMessage).toBe('Image trop lourde (max 5 Mo)');
      expect(component.toastType).toBe('error');
      expect(target.value).toBe('');
    });

    it('should read valid file as data URL and update form control', () => {
      const file = new File(['content'], 'valid.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 1024 });

      // Mock FileReader
      const dummyReader = {
        readAsDataURL: jasmine.createSpy('readAsDataURL').and.callFake(function (this: any) {
          this.result = 'data:image/png;base64,mockDataUrl';
          if (this.onload) this.onload();
        }),
        result: '',
        onload: null as any,
      };
      spyOn(window as any, 'FileReader').and.returnValue(dummyReader as any);

      component.onThumbnailSelected({ target: { files: [file] } } as any);

      expect(dummyReader.readAsDataURL).toHaveBeenCalledWith(file);
      expect(component.thumbnailPreview).toBe('data:image/png;base64,mockDataUrl');
      expect(component.streamForm.get('thumbnailUrl')?.value).toBe('data:image/png;base64,mockDataUrl');
      expect(component.streamForm.get('thumbnailUrl')?.dirty).toBeTrue();
    });

    it('should clear thumbnail and mark form dirty', () => {
      component.thumbnailPreview = 'https://img.test/thumb.png';
      component.clearThumbnail();
      expect(component.thumbnailPreview).toBeNull();
      expect(component.streamForm.get('thumbnailUrl')?.value).toBe('');
      expect(component.streamForm.get('thumbnailUrl')?.dirty).toBeTrue();
    });
  });

  // ── save ───────────────────────────────────────────────────────
  describe('save', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should not submit if isSaving is already true', () => {
      component.isSaving = true;
      component.save();
      expect(configService.updateMyStream).not.toHaveBeenCalled();
    });

    it('should not submit if form is invalid', () => {
      component.streamForm.patchValue({ title: '' }); // required
      component.save();
      expect(configService.updateMyStream).not.toHaveBeenCalled();
    });

    it('should show toast and return if no fields have changed', () => {
      component.save();
      expect(configService.updateMyStream).not.toHaveBeenCalled();
      expect(component.toastMessage).toBe('Aucune modification');
      expect(component.toastType).toBe('success');
      expect(component.isSaving).toBeFalse();
    });

    it('should send only modified fields', () => {
      component.streamForm.patchValue({
        title: 'Titre Modifié',
        description: 'Nouvelle description',
      });

      component.save();

      expect(configService.updateMyStream).toHaveBeenCalledWith({
        title: 'Titre Modifié',
        description: 'Nouvelle description',
      });
    });

    it('should send categoryId if changed', () => {
      component.streamForm.patchValue({ categoryId: 20 });
      component.save();

      expect(configService.updateMyStream).toHaveBeenCalledWith({
        categoryId: 20,
      });
    });

    it('should send thumbnailUrl only if control is dirty', () => {
      component.streamForm.patchValue({ thumbnailUrl: 'https://new.url/img.png' });
      component.streamForm.get('thumbnailUrl')?.markAsDirty();

      component.save();

      expect(configService.updateMyStream).toHaveBeenCalledWith({
        thumbnailUrl: 'https://new.url/img.png',
      });
    });

    it('should update originalValues, mark form pristine, and show success toast on save success', () => {
      const updatedSettings = {
        ...mockSettings,
        title: 'Titre Confirmé',
        visibility: 'unlisted' as const,
      };
      configService.updateMyStream.and.returnValue(of(updatedSettings));

      component.streamForm.patchValue({
        title: 'Titre Confirmé',
        visibility: 'unlisted',
      });

      component.save();

      expect(component.streamSettings).toEqual(updatedSettings);
      expect(component.streamForm.pristine).toBeTrue();
      expect(component.isSaving).toBeFalse();
      expect(component.toastMessage).toBe('Paramètres sauvegardés');
      expect(component.toastType).toBe('success');
    });

    it('should handle backend validation errors (fieldErrors object)', () => {
      const errorResponse = new HttpErrorResponse({
        status: 422,
        error: {
          errors: {
            title: 'Le titre est obligatoire',
            description: 'Trop long',
          },
          message: 'Erreur de validation',
        },
      });

      configService.updateMyStream.and.returnValue(throwError(() => errorResponse));

      component.streamForm.patchValue({ title: 'Invalid' });
      component.save();

      expect(component.isSaving).toBeFalse();
      expect(component.fieldErrors).toEqual({
        title: 'Le titre est obligatoire',
        description: 'Trop long',
      });
      expect(component.toastMessage).toBe('Erreur de validation');
      expect(component.toastType).toBe('error');
    });

    it('should handle backend error with body.error fallback', () => {
      const errorResponse = new HttpErrorResponse({
        status: 500,
        error: { error: 'Erreur interne de la base' },
      });

      configService.updateMyStream.and.returnValue(throwError(() => errorResponse));

      component.streamForm.patchValue({ title: 'Titre Test' });
      component.save();

      expect(component.toastMessage).toBe('Erreur interne de la base');
      expect(component.toastType).toBe('error');
    });
  });

  // ── showToast ─────────────────────────────────────────────────
  describe('showToast auto-clear', () => {
    it('should clear toast after 3000ms', fakeAsync(() => {
      (component as any).showToast('Test Message', 'success');
      expect(component.toastMessage).toBe('Test Message');
      expect(component.toastType).toBe('success');

      tick(3000);
      expect(component.toastMessage).toBe('');
    }));
  });

  // ── ngOnDestroy ───────────────────────────────────────────────
  it('should complete destroy$ on destroy', () => {
    fixture.detectChanges();
    const spy = spyOn((component as any).destroy$, 'complete');
    component.ngOnDestroy();
    expect(spy).toHaveBeenCalled();
  });
});
