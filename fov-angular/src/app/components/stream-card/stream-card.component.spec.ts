import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StreamCardComponent, Stream } from './stream-card.component';

describe('StreamCardComponent', () => {
  let component: StreamCardComponent;
  let fixture: ComponentFixture<StreamCardComponent>;

  const mockStream: Stream = {
    streamer: 'TestUser',
    title: 'Test Stream',
    category: 'Gaming',
    viewers: '1.2k',
    thumbnail: 'https://example.com/thumb.jpg',
    avatar: 'https://example.com/avatar.jpg',
    isLive: true,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StreamCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamCardComponent);
    component = fixture.componentInstance;
    component.stream = mockStream;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should receive stream via @Input', () => {
    expect(component.stream).toEqual(mockStream);
  });
});
