import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { StreamService } from '../../services/stream-service.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {

  @Input() isCollapsed = false;
  @Output() toggleCollapse = new EventEmitter<void>();
  
  followedChannels: any[] = [];

  constructor(private streamService: StreamService) {}

  ngOnInit() {
    this.followedChannels = this.streamService.getFollowedChannels();
  }

  onToggleCollapse() {
    this.toggleCollapse.emit();
  }

}
