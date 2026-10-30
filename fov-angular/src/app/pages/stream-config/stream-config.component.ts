import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { StreamConfigService } from '../../services/stream-config.service';
import {
  StreamSettings,
  UpdateStreamSettings,
  BackendCategory,
} from '../../models/stream-config';

@Component({
  selector: 'app-stream-config',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './stream-config.component.html',
  styleUrls: ['./stream-config.component.scss'],
})
export class StreamConfigComponent implements OnInit, OnDestroy {
  streamForm!: FormGroup;

  streamSettings: StreamSettings | null = null;

  /** Catégories venant de GET /api/categories (source de vérité) */
  backendCategories: BackendCategory[] = [];

  streamKey = '';
  streamKeyVisible = false;

  isLoading = true;
  isSaving = false;
  isRotatingKey = false;

  thumbnailPreview: string | null = null;

  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  fieldErrors: Record<string, string> = {};

  private destroy$ = new Subject<void>();
  private originalValues: Partial<StreamSettings> = {};

  constructor(
    private fb: FormBuilder,
    private streamConfigService: StreamConfigService,
  ) {}

  ngOnInit() {
    this.initForm();
    this.loadData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /* ── Formulaire ───────────────────────────────── */

  private initForm() {
    this.streamForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(255)]],
      description: ['', [Validators.maxLength(2000)]],
      visibility: ['public'],
      categoryId: [null],
      thumbnailUrl: [''],
    });
  }

  /* ── Chargement ───────────────────────────────── */

  private loadData() {
    this.isLoading = true;

    // 1. Charger les catégories backend
    this.streamConfigService.getCategories().subscribe({
      next: (categories) => {
        this.backendCategories = categories;
        // 2. Puis charger les settings du stream
        this.loadStreamSettings();
      },
      error: () => {
        this.backendCategories = [];
        this.loadStreamSettings();
      },
    });
  }

  private loadStreamSettings() {
    this.streamConfigService
      .getMyStream()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.streamSettings = s;

          this.streamForm.patchValue({
            title: s.title || '',
            description: s.description || '',
            visibility: s.visibility || 'public',
            categoryId: s.categoryId,
            thumbnailUrl: s.thumbnailUrl || '',
          });

          this.originalValues = {
            title: s.title,
            description: s.description,
            visibility: s.visibility,
            categoryId: s.categoryId,
            thumbnailUrl: s.thumbnailUrl,
          };
          this.thumbnailPreview = s.thumbnailUrl || null;
          this.isLoading = false;
        },
        error: () => {
          this.showToast('Erreur lors du chargement', 'error');
          this.isLoading = false;
        },
      });

    this.streamConfigService
      .getStreamKey()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => (this.streamKey = res.streamKey),
        error: () => {},
      });
  }

  /* ── Clé de stream ────────────────────────────── */

  get maskedKey(): string {
    return this.streamKeyVisible
      ? this.streamKey
      : '•'.repeat(this.streamKey.length || 40);
  }

  toggleKeyVisibility() {
    this.streamKeyVisible = !this.streamKeyVisible;
  }

  copyStreamKey() {
    navigator.clipboard.writeText(this.streamKey).then(() => {
      this.showToast('Clé copiée !', 'success');
    });
  }

  get streamLink(): string {
    const streamId = this.streamSettings?.streamId || 'me';
    return `${window.location.origin}/stream/${streamId}`;
  }

  copyStreamLink() {
    navigator.clipboard.writeText(this.streamLink).then(() => {
      this.showToast('Lien copié !', 'success');
    });
  }

  rotateStreamKey() {
    if (
      !confirm(
        '⚠️ Régénérer la clé de stream ?\n\nL\'ancienne clé sera immédiatement révoquée.',
      )
    )
      return;

    this.isRotatingKey = true;
    this.streamConfigService
      .rotateStreamKey()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.streamKey = res.streamKey;
          this.streamKeyVisible = false;
          this.isRotatingKey = false;
          this.showToast('Clé régénérée', 'success');
        },
        error: () => {
          this.isRotatingKey = false;
          this.showToast('Erreur lors de la régénération', 'error');
        },
      });
  }

  /* ── Miniature ────────────────────────────────── */

  onThumbnailSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.showToast('Image trop lourde (max 5 Mo)', 'error');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.thumbnailPreview = dataUrl;
      this.streamForm.patchValue({ thumbnailUrl: dataUrl });
      this.streamForm.get('thumbnailUrl')?.markAsDirty();
    };
    reader.readAsDataURL(file);
  }

  clearThumbnail() {
    this.thumbnailPreview = null;
    this.streamForm.patchValue({ thumbnailUrl: '' });
    this.streamForm.get('thumbnailUrl')?.markAsDirty();
  }

  /* ── Sauvegarde ───────────────────────────────── */

  save() {
    if (this.isSaving) return;
    if (this.streamForm.invalid) return;

    this.isSaving = true;
    this.fieldErrors = {};

    const v = this.streamForm.value;
    const update: UpdateStreamSettings = {};

    if (v.title !== this.originalValues.title) update.title = v.title;
    if (v.description !== this.originalValues.description)
      update.description = v.description;
    if (v.visibility !== this.originalValues.visibility)
      update.visibility = v.visibility;

    // categoryId est maintenant un vrai ID backend, comparaison directe
    if (v.categoryId !== this.originalValues.categoryId)
      update.categoryId = v.categoryId;

    if (this.streamForm.get('thumbnailUrl')?.dirty)
      update.thumbnailUrl = v.thumbnailUrl;

    if (Object.keys(update).length === 0) {
      this.isSaving = false;
      this.showToast('Aucune modification', 'success');
      return;
    }

    this.streamConfigService
      .updateMyStream(update)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.streamSettings = s;
          this.originalValues = {
            title: s.title,
            description: s.description,
            visibility: s.visibility,
            categoryId: s.categoryId,
            thumbnailUrl: s.thumbnailUrl,
          };
          this.streamForm.markAsPristine();
          this.isSaving = false;
          this.showToast('Paramètres sauvegardés', 'success');
        },
        error: (err) => {
          this.isSaving = false;
          const body = err.error;
          console.error('PUT /api/streams/me →', body);

          if (
            body?.errors &&
            typeof body.errors === 'object' &&
            !Array.isArray(body.errors)
          ) {
            this.fieldErrors = body.errors as Record<string, string>;
          }

          this.showToast(
            body?.message || body?.error || 'Erreur lors de la sauvegarde',
            'error',
          );
        },
      });
  }

  /* ── Utilitaire ───────────────────────────────── */

  private showToast(message: string, type: 'success' | 'error') {
    this.toastMessage = message;
    this.toastType = type;
    setTimeout(() => (this.toastMessage = ''), 3000);
  }
}