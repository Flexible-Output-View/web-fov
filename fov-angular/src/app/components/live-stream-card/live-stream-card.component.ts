import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LiveStreamInfo } from '../../models/live-stream.model';

@Component({
  selector: 'app-live-stream-card',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './live-stream-card.component.html',
  styleUrls: ['./live-stream-card.component.scss']
})
export class LiveStreamCardComponent {
  @Input() stream!: LiveStreamInfo;
}
