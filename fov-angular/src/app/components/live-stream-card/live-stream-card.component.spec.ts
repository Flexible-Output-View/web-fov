import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveStreamCardComponent } from './live-stream-card.component';
import { LiveStreamInfo } from '../../models/live-stream.model';
import { provideRouter } from '@angular/router';

describe('LiveStreamCardComponent', () => {
  let component: LiveStreamCardComponent;
  let fixture: ComponentFixture<LiveStreamCardComponent>;

  const mockStream: LiveStreamInfo = {
    streamId: 'abc-123',
    trackCount: 2,
    tracks: [],
    title: 'Test Stream',
    category: 'Gaming',
    viewers: 500,
    streamer: 'TestStreamer',
    streamerUsername: 'teststreamer',
    avatarUrl: 'https://example.com/avatar.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LiveStreamCardComponent],
      providers: [provideRouter([])],   // ← ligne ajoutée
    }).compileComponents();

    fixture = TestBed.createComponent(LiveStreamCardComponent);
    component = fixture.componentInstance;
    component.stream = mockStream;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('streamerName', () => {
    it('should return streamer when available', () => {
      expect(component.streamerName).toBe('TestStreamer');
    });

    it('should fallback to streamId when streamer is empty', () => {
      component.stream = { ...mockStream, streamer: '' };
      expect(component.streamerName).toBe('abc-123');
    });
  });

  describe('streamerRoute', () => {
    it('should return streamerUsername when available', () => {
      expect(component.streamerRoute).toBe('teststreamer');
    });

    it('should fallback to streamerName when streamerUsername is null', () => {
      component.stream = { ...mockStream, streamerUsername: null };
      expect(component.streamerRoute).toBe('TestStreamer');
    });

    it('should fallback to streamerName when streamerUsername is undefined', () => {
      component.stream = { ...mockStream, streamerUsername: undefined };
      expect(component.streamerRoute).toBe('TestStreamer');
    });
  });

  describe('streamerInitial', () => {
    it('should return uppercase first letter', () => {
      expect(component.streamerInitial).toBe('T');
    });

    it('should uppercase a lowercase name', () => {
      component.stream = { ...mockStream, streamer: 'alice' };
      expect(component.streamerInitial).toBe('A');
    });
  });
});
