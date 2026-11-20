import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FeaturedCarouselComponent } from './featured-carousel.component';
import { LiveStreamInfo } from '../../models/live-stream.model';

describe('FeaturedCarouselComponent', () => {
  let component: FeaturedCarouselComponent;
  let fixture: ComponentFixture<FeaturedCarouselComponent>;

  const mockStreams: LiveStreamInfo[] = [
    { streamId: '1', trackCount: 1, tracks: [], title: 'S1', category: 'Gaming', viewers: 100, streamer: 'u1', avatarUrl: '', thumbnailUrl: '' },
    { streamId: '2', trackCount: 1, tracks: [], title: 'S2', category: 'Music', viewers: 200, streamer: 'u2', avatarUrl: '', thumbnailUrl: '' },
    { streamId: '3', trackCount: 1, tracks: [], title: 'S3', category: 'Art', viewers: 50, streamer: 'u3', avatarUrl: '', thumbnailUrl: '' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturedCarouselComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FeaturedCarouselComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default currentSlide to 0', () => {
    expect(component.currentSlide).toBe(0);
  });

  it('should default streams to empty array', () => {
    expect(component.streams).toEqual([]);
  });

  it('should default isLoading to false', () => {
    expect(component.isLoading).toBeFalse();
  });

  // ── nextSlide ─────────────────────────────────────────────────
  describe('nextSlide', () => {
    it('should advance to next slide', () => {
      component.streams = mockStreams;
      component.nextSlide();
      expect(component.currentSlide).toBe(1);
    });

    it('should wrap around to 0 after last slide', () => {
      component.streams = mockStreams;
      component.currentSlide = 2;
      component.nextSlide();
      expect(component.currentSlide).toBe(0);
    });

    it('should do nothing when streams is empty', () => {
      component.streams = [];
      component.nextSlide();
      expect(component.currentSlide).toBe(0);
    });
  });

  // ── prevSlide ─────────────────────────────────────────────────
  describe('prevSlide', () => {
    it('should go to previous slide', () => {
      component.streams = mockStreams;
      component.currentSlide = 2;
      component.prevSlide();
      expect(component.currentSlide).toBe(1);
    });

    it('should wrap around to last slide from 0', () => {
      component.streams = mockStreams;
      component.currentSlide = 0;
      component.prevSlide();
      expect(component.currentSlide).toBe(2);
    });

    it('should do nothing when streams is empty', () => {
      component.streams = [];
      component.prevSlide();
      expect(component.currentSlide).toBe(0);
    });
  });

  describe('thumbnail placeholder', () => {
    function placeholderText(stream: LiveStreamInfo): string | undefined {
      component.streams = [stream];
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      return el.querySelector('.thumbnail-placeholder .placeholder-text')?.textContent?.trim();
    }

    it('shows the stream title instead of the stream id', () => {
      expect(placeholderText({ ...mockStreams[0], streamId: 'u1', title: 'Le stream de lucas' }))
        .toBe('Le stream de lucas');
    });

    it('falls back to the stream id when the title is empty', () => {
      expect(placeholderText({ ...mockStreams[0], streamId: 'u1', title: '' })).toBe('u1');
    });

    it('is not rendered when the stream has a thumbnail', () => {
      component.streams = [{ ...mockStreams[0], thumbnailUrl: 'https://example.com/t.png' }];
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.thumbnail-placeholder')).toBeNull();
    });
  });
});
