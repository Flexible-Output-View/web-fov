import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { StreamComponent } from './stream.component';
import { ActivatedRoute, Router } from '@angular/router';
import { LiveStreamsService } from '../../services/live-streams.service';
import { of, throwError } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';

// Mock FovPlayerComponent pour éviter de charger HLS etc.
@Component({ selector: 'app-fov-player', template: '', standalone: true })
class MockFovPlayerComponent {
  @Input() streamId = '';
  @Output() streamEnded = new EventEmitter<void>();
}

const mockStream = {
  streamId: 'test-stream',
  title: 'Test Stream',
  trackCount: 2,
  viewers: 10,
  category: 'Gaming'
};

describe('StreamComponent', () => {
  let component: StreamComponent;
  let routerSpy: jasmine.SpyObj<Router>;
  let liveStreamsSpy: jasmine.SpyObj<LiveStreamsService>;

  beforeEach(async () => {
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    liveStreamsSpy = jasmine.createSpyObj('LiveStreamsService', ['getStreamById']);
    liveStreamsSpy.getStreamById.and.returnValue(of(mockStream as any));

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        StreamComponent,
        MockFovPlayerComponent
      ],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { params: of({ streamId: 'test-stream' }) }
        },
        { provide: Router, useValue: routerSpy },
        { provide: LiveStreamsService, useValue: liveStreamsSpy }
      ]
    })
    .overrideComponent(StreamComponent, {
      remove: { imports: [] },
      add: { imports: [CommonModule, MockFovPlayerComponent] }
    })
    .compileComponents();

    const fixture = TestBed.createComponent(StreamComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load streamId from route params', () => {
    expect(component.streamId).toBe('test-stream');
  });

  it('should set isLive true when stream found', () => {
    expect(component.isLive).toBeTrue();
    expect(component.streamInfo?.streamId).toBe('test-stream');
    expect(component.isLoading).toBeFalse();
  });

  it('should set isLive false when stream not found', fakeAsync(() => {
    liveStreamsSpy.getStreamById.and.returnValue(of(null));
    component['checkStream']();
    tick(10000); // attendre les retries
    expect(component.isLive).toBeFalse();
  }));

  it('should navigate to home on goBack()', () => {
    component.goBack();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
  });

  it('should handle stream ended', fakeAsync(() => {
    component.isLive = true;
    component.streamInfo = mockStream as any;
    component.onStreamEnded();

    expect(component.isLive).toBeFalse();
    expect(component.streamEndedMessage).toContain('Test Stream');
    expect(component.redirectCountdown).toBe(5);

    tick(1000);
    expect(component.redirectCountdown).toBe(4);

    tick(4000);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
  }));

  it('should clear interval on goBack after stream ended', fakeAsync(() => {
    component.onStreamEnded();
    tick(1000);
    component.goBack();
    tick(5000); // pas de navigation supplémentaire
    expect(routerSpy.navigate).toHaveBeenCalledTimes(1);
  }));

  it('should handle HTTP error and retry', fakeAsync(() => {
    liveStreamsSpy.getStreamById.and.returnValue(throwError(() => new Error('Network error')));
    component['checkStream']();
    tick(10000);
    expect(component.isLoading).toBeFalse();
    expect(component.errorMessage).toBeTruthy();
  }));
});
