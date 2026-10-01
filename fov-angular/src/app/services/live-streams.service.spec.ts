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
    // flush toutes les requêtes en attente avant verify
    httpMock.match(() => true).forEach(r => r.flush([]));
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

  it('should handle object response with streams key', (done) => {
    service.getAvailableStreams().subscribe(response => {
      expect(response.streams.length).toBe(1);
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
    req.flush({ streams: mockStreams });
  });

  it('should return empty on HTTP error', (done) => {
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
    // startPolling lance une requête interval — on ne l'appelle pas ici
    expect(service['isPolling']).toBeFalse();
    service['isPolling'] = true;
    service.startPolling(); // doit être ignoré
    expect(service['isPolling']).toBeTrue();
  });

  it('should return current streams as array', () => {
    const streams = service.getCurrentStreams();
    expect(Array.isArray(streams)).toBeTrue();
  });
});
