import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StreamEngineStats } from '../../services/stream-engine-interface';

@Component({
  selector: 'app-fov-stats-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stats-overlay.component.html',
  styleUrls: ['./stats-overlay.component.scss'],
})
export class StatsOverlayComponent {
  @Input() isOpen = false;
  @Input() stats!: StreamEngineStats;
  @Output() close = new EventEmitter<void>();

  closeOverlay(): void {
    this.close.emit();
  }

  getDriftClass(driftMs: number): string {
    const abs = Math.abs(driftMs);
    if (abs < 50) return 'tier-excellent';
    if (abs <= 100) return 'tier-very-good';
    if (abs <= 150) return 'tier-good';
    if (abs <= 200) return 'tier-poor';
    return 'tier-very-poor';
  }

  getLatencyClass(latencyMs: number): string {
    const sec = latencyMs / 1000;
    if (sec < 10) return 'tier-excellent';
    if (sec <= 15) return 'tier-very-good';
    if (sec <= 25) return 'tier-good';
    if (sec <= 40) return 'tier-poor';
    return 'tier-very-poor';
  }

  getBufferClass(bufferMs?: number): string {
    const val = bufferMs ?? 0;
    const sec = val / 1000;
    if (sec >= 8) return 'tier-excellent';
    if (sec >= 5) return 'tier-good';
    if (sec >= 2) return 'tier-poor';
    return 'tier-very-poor';
  }
}
