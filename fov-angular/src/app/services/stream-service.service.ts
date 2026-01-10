import { Injectable } from '@angular/core';
import { Stream } from '../components/stream-card/stream-card.component';
import { Category } from '../components/category-card/category-card.component';

@Injectable({
  providedIn: 'root'
})
export class StreamService {

  //TODO : Replace with real API data fetching
  private allStreams: Stream[] = [
    {
      streamer: 'Skyyart',
      title: 'Grand tournoi League of Legends ! 🏆',
      category: 'League of Legends',
      viewers: '91.2K',
      thumbnail: 'assets/stream-thumbnail1.png',
      avatar: 'assets/profile-avatar.png',
      isLive: true
    },
    {
      streamer: 'Domingo',
      title: 'Just chatting avec la communauté 💬',
      category: 'Just Chatting',
      viewers: '8.6K',
      thumbnail: 'assets/stream-thumbnail2.png',
      avatar: 'assets/profile-avatar.png',
      isLive: true
    },
    {
      streamer: 'Squeezie',
      title: 'Tryhard Valorant avec les potes !',
      category: 'Valorant',
      viewers: '28.1K',
      thumbnail: 'assets/stream-thumbnail3.png',
      avatar: 'assets/profile-avatar.png',
      isLive: true
    },
    {
      streamer: 'Mushway',
      title: 'Minecraft à l\'ancienne !',
      category: 'Minecraft',
      viewers: '5K',
      thumbnail: 'assets/stream-thumbnail4.png',
      avatar: 'assets/profile-avatar.png',
      isLive: true
    },
    {
      streamer: 'Inoxtag',
      title: 'Z-Event !',
      category: 'Just Chatting',
      viewers: '120K',
      thumbnail: 'assets/stream-thumbnail5.png',
      avatar: 'assets/profile-avatar.png',
      isLive: false
    },
    {
      streamer: 'Lofi Girl',
      title: 'Chill beats to relax/study to',
      category: 'Music',
      viewers: '7.2K',
      thumbnail: 'assets/stream-thumbnail6.png',
      avatar: 'assets/profile-avatar.png',
      isLive: false
    }
  ];

  constructor() {}

  getRecommendedStreams(): Stream[] {
    return this.allStreams.slice(0, 3);
  }

  getFeaturedStreams(): Stream[] {
    return this.allStreams.filter(stream => stream.isLive).slice(0, 3);
  }

  getLiveStreams(): Stream[] {
    return this.allStreams.filter(stream => stream.isLive);
  }

  //TODO : Replace with real API data fetching
  getFollowedChannels(): Stream[] {
    return [
      {
        streamer: 'Skyyart',
        title: 'Grand tournoi League of Legends ! 🏆',
        category: 'League of Legends',
        viewers: '91.2K',
        thumbnail: 'assets/stream-thumbnail1.png',
        avatar: 'assets/stream-thumbnail1.png',
        isLive: true
      },
      {
        streamer: 'Domingo',
        title: 'Just chatting avec la communauté 💬',
        category: 'Just Chatting',
        viewers: '8.6K',
        thumbnail: 'assets/stream-thumbnail2.png',
        avatar: 'assets/stream-thumbnail2.png',
        isLive: true
      },
      {
        streamer: 'Zerator',
        title: '',
        category: '',
        viewers: '',
        thumbnail: '',
        avatar: 'assets/stream-thumbnail3.png',
        isLive: false
      }
    ];
  }

  //TODO : Replace with real API data fetching
  getFollowedCategories(): Category[] {
    return [
      { name: 'League of Legends', viewers: '125K', image: 'https://static-cdn.jtvnw.net/ttv-boxart/21779-285x380.jpg' },
      { name: 'Just Chatting', viewers: '98K', image: 'https://static-cdn.jtvnw.net/ttv-boxart/509658-285x380.jpg' },
    ];
  }

  getStreamsByCategory(categoryName: string): Stream[] {
    return this.allStreams.filter(
      stream => stream.category === categoryName && stream.isLive
    );
  }

  getStreamsByCategorySlug(slug: string): Stream[] {
    return this.allStreams.filter(stream => {
      const streamSlug = stream.category
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return streamSlug === slug && stream.isLive;
    });
  }
}
