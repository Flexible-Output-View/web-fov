import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { StreamComponent } from './stream.component';
import { ActivatedRoute, Router } from '@angular/router';
import { LiveStreamsService } from '../../services/live-streams.service';
import { of, throwError } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({ selector: 'app-fov-player', template: '', standalone: true })
class MockFovPlayerComponent {
  @Input() streamId = '';
  @Output() streamEnded = new EventEmitter<void>();
}

@Component({ selector: 'app-stream-chat', template: '', standalone: true })
class MockStreamChatComponent {
  @Input() streamId = '';
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
  let fixture: ComponentFixture<StreamComponent>;
  let routerSpy: jasmine.SpyObj<Router>;
  let liveStreamsSpy: jasmine.SpyObj<LiveStreamsService>;

  beforeEach(async () => {
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    liveStreamsSpy = jasmine.createSpyObj('LiveStreamsService', ['getStreamById']);
    liveStreamsSpy.getStreamById.and.returnValue(of(mockStream as any));

    await TestBed.configureTestingModule({
      imports: [CommonModule, MockFovPlayerComponent, MockStreamChatComponent],
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
      set: {
        imports: [CommonModule, MockFovPlayerComponent, MockStreamChatComponent]
      }
    })
    .compileComponents();

    fixture = TestBed.createComponent(StreamComponent);
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

  it('should navigate to home on goBack()', () => {
    component.goBack();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
  });

  it('should handle stream ended and start countdown', fakeAsync(() => {
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
    component.streamInfo = mockStream as any;
    component.onStreamEnded();
    tick(1000);
    component.goBack();
    tick(5000);
    // navigate appelé une seule fois (goBack)
    expect(routerSpy.navigate).toHaveBeenCalledTimes(1);
  }));

  it('should set error message after max retries on HTTP error', fakeAsync(() => {
    liveStreamsSpy.getStreamById.and.returnValue(throwError(() => new Error('Network error')));
    component['checkStream']();
    tick(10000);
    expect(component.isLoading).toBeFalse();
    expect(component.errorMessage).toBeTruthy();
  }));

  it('should set isLive false after max retries when stream not found', fakeAsync(() => {
    liveStreamsSpy.getStreamById.and.returnValue(of(null));
    component['checkStream']();
    tick(10000);
    expect(component.isLive).toBeFalse();
    expect(component.isLoading).toBeFalse();
  }));
});
