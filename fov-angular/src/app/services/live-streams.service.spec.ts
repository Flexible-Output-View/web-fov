import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LiveStreamsService } from './live-streams.service';
import { environment } from '../../environments/environment';

describe('LiveStreamsService', () => {
  let service: LiveStreamsService;
  let httpMock: HttpTestingController;

  const mockStreams = [
    { streamId: 'test-stream', title: 'Test Stream', trackCount: 2, viewers: 10, category: 'Gaming' },
    { streamId: 'empty-stream', title: 'Empty', trackCount: 0, viewers: 0, category: '' }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LiveStreamsService]
    });
    service = TestBed.inject(LiveStreamsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should filter out streams with trackCount 0', (done) => {
    service.getAvailableStreams().subscribe(response => {
      expect(response.streams.length).toBe(1);
      expect(response.streams[0].streamId).toBe('test-stream');
      expect(response.streamCount).toBe(1);
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
    req.flush(mockStreams);
  });

  it('should handle array response', (done) => {
    service.getAvailableStreams().subscribe(response => {
      expect(response.streams).toBeDefined();
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
    req.flush({ streams: mockStreams });
  });

  it('should return empty on error', (done) => {
    service.getAvailableStreams().subscribe(response => {
      expect(response.streams.length).toBe(0);
      expect(response.streamCount).toBe(0);
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
    req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });
  });

  it('should find stream by id', (done) => {
    service.getStreamById('test-stream').subscribe(stream => {
      expect(stream).toBeTruthy();
      expect(stream?.streamId).toBe('test-stream');
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
    req.flush(mockStreams);
  });

  it('should return null if stream not found', (done) => {
    service.getStreamById('unknown').subscribe(stream => {
      expect(stream).toBeNull();
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
    req.flush(mockStreams);
  });

  it('should not start polling twice', () => {
    const spy = spyOn<any>(service, 'getAvailableStreams').and.callThrough();
    service.startPolling();
    service.startPolling(); // deuxième appel ignoré
    expect(service['isPolling']).toBeTrue();
  });

  it('should return current streams', () => {
    const streams = service.getCurrentStreams();
    expect(Array.isArray(streams)).toBeTrue();
  });
});
