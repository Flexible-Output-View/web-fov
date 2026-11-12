import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LiveStreamsService } from '../../services/live-streams.service';
import { LiveStreamInfo } from '../../models/live-stream.model';
import { Subject, takeUntil, interval, startWith, switchMap } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() isCollapsed = false;
  @Output() toggleCollapse = new EventEmitter<void>();

  liveChannels: LiveStreamInfo[] = [];

  /**
   * Détecté via matchMedia. Sous 1024px le CSS force le mode collapsed
   * même si isCollapsed (le @Input) vaut false. Sans cette variable,
   * les liens perdraient leur texte visible sans aria-label de secours.
   */
  isNarrow = false;

  private destroy$ = new Subject<void>();
  private mql?: MediaQueryList;

  constructor(private liveStreamsService: LiveStreamsService) {}

  ngOnInit() {
    // Détection responsive
    this.mql = window.matchMedia('(max-width: 1024px)');
    this.isNarrow = this.mql.matches;
    this.mql.addEventListener('change', this.onMediaChange);

    // Polling des streams
    interval(15000)
      .pipe(
        startWith(0),
        switchMap(() => this.liveStreamsService.getAvailableStreams()),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (response) => {
          this.liveChannels = response.streams || [];
        },
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.mql?.removeEventListener('change', this.onMediaChange);
  }

  onToggleCollapse() {
    this.toggleCollapse.emit();
  }

  /**
   * Vrai quand le texte des liens est caché (soit par le bouton toggle,
   * soit par le CSS responsive).
   */
  get isVisuallyCollapsed(): boolean {
    return this.isCollapsed || this.isNarrow;
  }

  private onMediaChange = (e: MediaQueryListEvent): void => {
    this.isNarrow = e.matches;
  };
}
