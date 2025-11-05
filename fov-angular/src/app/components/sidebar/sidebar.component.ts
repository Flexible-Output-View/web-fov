import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {

  @Input() isCollapsed = false;

  @Output() toggleCollapse = new EventEmitter<void>();
  
  followedChannels = [
    { 
      name: 'StreamerPro', 
      game: 'League of Legends', 
      avatar: 'assets/stream-thumbnail1.png', 
      isLive: true,
      viewers: '1.2K'
    },
    { 
      name: 'Domingo', 
      game: 'Just Chatting', 
      avatar: 'assets/stream-thumbnail2.png', 
      isLive: false 
    },
    { 
      name: 'ProPlayer', 
      game: 'Valorant', 
      avatar: 'assets/stream-thumbnail3.png', 
      isLive: true,
      viewers: '876'
    }
  ];

  onToggleCollapse() {
    this.toggleCollapse.emit();
  }

}
