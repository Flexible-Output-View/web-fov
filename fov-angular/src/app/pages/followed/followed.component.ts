import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StreamService } from '../../services/stream-service.service';
import { Stream, StreamCardComponent } from '../../components/stream-card/stream-card.component';
import { Category, CategoryCardComponent } from '../../components/category-card/category-card.component';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-followed',
  standalone: true,
  imports: [CommonModule, StreamCardComponent, CategoryCardComponent, RouterModule],
  templateUrl: './followed.component.html',
  styleUrls: ['./followed.component.scss']
})
//TODO: HIDE IF THE USER IS NOT CONNECTED
export class FollowedComponent implements OnInit {

  liveChannels: Stream[] = [];
  offlineChannels: Stream[] = [];
  followedCategories: Category[] = [];
  activeTab: string = 'channels';

  constructor(private streamService: StreamService) {}

  ngOnInit() {
    const allFollowed = this.streamService.getFollowedChannels();
    this.liveChannels = allFollowed.filter(channel => channel.isLive);
    this.offlineChannels = allFollowed.filter(channel => !channel.isLive);
    //TODO: fetch followed categories from user data
    //this.followedCategories = this.streamService.getFallbackCategories();
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }
}