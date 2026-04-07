import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
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
  isLive = false;
  errorMessage = '';

  streamEndedMessage = '';
  redirectCountdown = 5;
  private redirectInterval: any = null;

  private destroy$ = new Subject<void>();

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
      this.checkStream();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.redirectInterval) {
      clearInterval(this.redirectInterval);
    }
  }

  private checkStream() {
    this.isLoading = true;
    this.errorMessage = '';
    this.streamEndedMessage = '';
    this.isLive = false;

    let attempts = 0;
    const maxAttempts = 5;
    const pollDelay = 2000;

    const tryCheck = () => {
      this.liveStreamsService.getStreamById(this.streamId).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (stream) => {
          if (stream) {
            this.streamInfo = stream;
            this.isLive = true;
            this.isLoading = false;
          } else {
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(tryCheck, pollDelay);
            } else {
              this.isLoading = false;
              this.isLive = false;
            }
          }
        },
        error: (err) => {
          console.error('Erreur chargement stream:', err);
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(tryCheck, pollDelay);
          } else {
            this.isLoading = false;
            this.errorMessage = 'Impossible de se connecter au serveur';
          }
        }
      });
    };

    tryCheck();
  }

  onStreamEnded() {
    this.isLive = false;
    this.streamEndedMessage = `${this.streamInfo?.title || this.streamId} a terminé sa diffusion`;
    this.redirectCountdown = 5;

    this.redirectInterval = setInterval(() => {
      this.redirectCountdown--;
      if (this.redirectCountdown <= 0) {
        clearInterval(this.redirectInterval);
        this.router.navigate(['/']);
      }
    }, 1000);
  }

  goBack() {
    if (this.redirectInterval) {
      clearInterval(this.redirectInterval);
    }
    this.router.navigate(['/']);
  }

  retry() {
    this.checkStream();
  }
}
