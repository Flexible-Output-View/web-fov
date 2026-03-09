import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, switchMap, interval, startWith } from 'rxjs';
import { FovPlayerComponent } from '../../components/fov-player/fov-player.component';
import { LiveStreamsService } from '../../services/live-streams.service';
import { LiveStreamInfo } from '../../models/live-stream.model';

@Component({
  selector: 'app-stream',
  standalone: true,
  imports: [CommonModule, FovPlayerComponent],
  templateUrl: './stream.component.html',
  styleUrls: ['./stream.component.scss']
})
export class StreamComponent implements OnInit, OnDestroy {
  streamId: string = '';
  streamInfo: LiveStreamInfo | null = null;
  isLoading = true;
  errorMessage = '';
  
  private destroy$ = new Subject<void>();
  private pollInterval = 3000;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private liveStreamsService: LiveStreamsService
  ) {}

  ngOnInit() {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      this.streamId = params['streamId'];
      this.loadStream();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadStream() {
    this.isLoading = true;
    this.errorMessage = '';

    interval(this.pollInterval).pipe(
      startWith(0),
      switchMap(() => this.liveStreamsService.getStreamById(this.streamId)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (stream) => {
        if (stream) {
          this.streamInfo = stream;
          this.isLoading = false;
          this.destroy$.next();
        }
      },
      error: (err) => {
        console.error('Erreur chargement stream:', err);
        this.errorMessage = 'Impossible de charger le stream';
        this.isLoading = false;
      }
    });

    setTimeout(() => {
      if (this.isLoading) {
        this.isLoading = false;
        this.errorMessage = 'Le stream n\'est pas disponible';
      }
    }, 30000);
  }

  goBack() {
    this.router.navigate(['/']);
  }

  retry() {
    this.destroy$.next();
    this.destroy$ = new Subject<void>();
    this.loadStream();
  }
}
