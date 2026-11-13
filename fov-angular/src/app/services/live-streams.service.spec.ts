import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { LiveStreamsService } from './live-streams.service';
import { environment } from '../../environments/environment';

describe('LiveStreamsService', () => {
  let service: LiveStreamsService;
  let httpMock: HttpTestingController;

  const mockStreams = [
    {
      streamId: 'test-stream',
      title: 'Test Stream',
      trackCount: 2,
      viewers: 10,
      category: 'Gaming',
    },
    {
      streamId: 'empty-stream',
      title: 'Empty',
      trackCount: 0,
      viewers: 0,
      category: '',
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LiveStreamsService],
    });
    service = TestBed.inject(LiveStreamsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.match(() => true).forEach((r) => r.flush([]));
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── getAvailableStreams ───────────────────────────────────────
  describe('getAvailableStreams', () => {
    it('should filter out streams with trackCount 0 when receiving array', (done) => {
      service.getAvailableStreams().subscribe((response) => {
        expect(response.streams.length).toBe(1);
        expect(response.streams[0].streamId).toBe('test-stream');
        expect(response.streamCount).toBe(1);
        done();
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush(mockStreams);
    });

    it('should handle object response with streams key', (done) => {
      service.getAvailableStreams().subscribe((response) => {
        expect(response.streams.length).toBe(1);
        expect(response.streams[0].streamId).toBe('test-stream');
        done();
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush({ streams: mockStreams });
    });

    it('should return empty object on HTTP error', (done) => {
      service.getAvailableStreams().subscribe((response) => {
        expect(response.streams.length).toBe(0);
        expect(response.streamCount).toBe(0);
        done();
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush('Server error', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    });

    it('should handle unexpected null payload gracefully', (done) => {
      service.getAvailableStreams().subscribe((response) => {
        expect(response.streams).toEqual([]);
        expect(response.streamCount).toBe(0);
        done();
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush(null);
    });
  });

  // ── getStreamById ─────────────────────────────────────────────
  describe('getStreamById', () => {
    it('should find stream by id', (done) => {
      service.getStreamById('test-stream').subscribe((stream) => {
        expect(stream).toBeTruthy();
        expect(stream?.streamId).toBe('test-stream');
        done();
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush(mockStreams);
    });

    it('should return null if stream not found', (done) => {
      service.getStreamById('unknown').subscribe((stream) => {
        expect(stream).toBeNull();
        done();
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush(mockStreams);
    });
  });

  // ── Polling & Streams state ───────────────────────────────────
  describe('polling', () => {
    it('should not start polling twice', () => {
      expect((service as any).isPolling).toBeFalse();
      (service as any).isPolling = true;
      service.startPolling();
      expect((service as any).isPolling).toBeTrue();
    });

    it('should stop polling and set isPolling to false', () => {
      (service as any).isPolling = true;
      service.stopPolling();
      expect((service as any).isPolling).toBeFalse();
    });

    it('should poll every 5000ms and push to liveStreams$', fakeAsync(() => {
      service.startPolling();

      // First tick triggers startWith(0)
      const req1 = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req1.flush(mockStreams);

      expect(service.getCurrentStreams().length).toBe(1);

      // Advance 5000ms to trigger next poll
      tick(5000);
      const req2 = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req2.flush(mockStreams);

      expect(service.getCurrentStreams().length).toBe(1);

      discardPeriodicTasks();
    }));

    it('should return current streams as array', () => {
      const streams = service.getCurrentStreams();
      expect(Array.isArray(streams)).toBeTrue();
      expect(streams).toEqual([]);
    });
  });
});
