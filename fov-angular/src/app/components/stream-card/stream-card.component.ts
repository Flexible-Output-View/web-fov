import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Stream {
  streamer: string;
  title: string;
  category: string;
  viewers: string | number;
  thumbnail: string;
  avatar: string;
  isLive: boolean;
}

@Component({
  selector: 'app-stream-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stream-card.component.html',
  styleUrls: ['./stream-card.component.scss']
})
export class StreamCardComponent {
  @Input() stream!: Stream; 
}