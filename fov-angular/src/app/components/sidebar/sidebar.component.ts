import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
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
  styleUrls: ['./sidebar.component.scss']
})
//TODO: HIDE IF THE USER IS NOT CONNECTED
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() isCollapsed = false;
  @Output() toggleCollapse = new EventEmitter<void>();
  
  liveChannels: LiveStreamInfo[] = [];
  private destroy$ = new Subject<void>();

  constructor(private liveStreamsService: LiveStreamsService) {}

  ngOnInit() {
    interval(15000).pipe(
      startWith(0),
      switchMap(() => this.liveStreamsService.getAvailableStreams()),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.liveChannels = response.streams || [];
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onToggleCollapse() {
    this.toggleCollapse.emit();
  }
}