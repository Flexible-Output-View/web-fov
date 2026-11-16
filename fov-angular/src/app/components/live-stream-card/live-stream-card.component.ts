import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import * as API from '../../models/APIModels'

@Component({
  selector: 'app-live-stream-card',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './live-stream-card.component.html',
  styleUrls: ['./live-stream-card.component.scss']
})
export class LiveStreamCardComponent {
  @Input() stream!: API.LiveStreamInfo;

  /** Channel name, falling back to the stream id for legacy payloads. */
  get streamerName(): string {
    return this.stream.streamer || this.stream.streamId;
  }

  /** Username used by the public profile route. */
  get streamerRoute(): string {
    return this.stream.streamerUsername || this.streamerName;
  }

  get streamerInitial(): string {
    return this.streamerName.charAt(0).toUpperCase();
  }
}
