import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ChatService } from './chat.service';
import { ViewerCount } from '../models/live-stream.model';
import {
  HEARTBEAT_INTERVAL_MS,
  VISITOR_ID_KEY,
  ViewerPresenceService,
} from './viewer-presence.service';

describe('ViewerPresenceService', () => {
  let service: ViewerPresenceService;
  let httpMock: HttpTestingController;
  let userSubject: BehaviorSubject<any>;
  let socketCounts: Subject<ViewerCount>;

  let loggedIn: boolean;

  const heartbeatUrl = (streamId = '1') =>
    `${environment.apiUrl}/streams/${streamId}/viewers/heartbeat`;
  const leaveUrl = (streamId = '1') =>
    `${environment.apiUrl}/streams/${streamId}/viewers/leave`;

  const viewerCount = (overrides: Partial<ViewerCount> = {}): ViewerCount => ({
    streamId: '1',
    total: 2,
    authenticated: 1,
    anonymous: 1,
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    sessionStorage.removeItem(VISITOR_ID_KEY);
    loggedIn = false;
    userSubject = new BehaviorSubject<any>(null);
    socketCounts = new Subject<ViewerCount>();

    const authMock = {
      currentUser$: userSubject.asObservable(),
      getToken: () => (loggedIn ? 'test-token' : null),
    };
    const chatMock = {
      viewerCount$: socketCounts.asObservable(),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ViewerPresenceService,
        { provide: AuthService, useValue: authMock },
        { provide: ChatService, useValue: chatMock },
      ],
    });

    service = TestBed.inject(ViewerPresenceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.match(() => true).forEach((req) =>
      req.flush(null, { status: 204, statusText: 'No Content' }),
    );
    httpMock.verify();
    sessionStorage.removeItem(VISITOR_ID_KEY);
  });

  it('creates a stable visitor id stored in sessionStorage', () => {
    expect(service.visitor).toBeTruthy();
    expect(sessionStorage.getItem(VISITOR_ID_KEY)).toBe(service.visitor);
  });

  it('sends an immediate heartbeat and stores the returned count', fakeAsync(() => {
    const counts = viewerCount();
    service.counts$.subscribe((value) => {
      if (value) {
        expect(value).toEqual(counts);
      }
    });

    service.start('1');
    tick(0);

    const req = httpMock.expectOne(heartbeatUrl());
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ visitorId: service.visitor });
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush(counts);

    expect(service.streamId).toBe('1');
    discardPeriodicTasks();
  }));

  it('repeats the heartbeat on the configured interval', fakeAsync(() => {
    let latest: ViewerCount | null = null;
    service.counts$.subscribe((value) => (latest = value));

    service.start('1');
    tick(0);
    httpMock.expectOne(heartbeatUrl()).flush(viewerCount());

    tick(HEARTBEAT_INTERVAL_MS);
    httpMock.expectOne(heartbeatUrl()).flush(viewerCount({ total: 3 }));

    tick(HEARTBEAT_INTERVAL_MS);
    httpMock.expectOne(heartbeatUrl()).flush(viewerCount({ total: 4 }));

    expect(latest!.total).toBe(4);
    discardPeriodicTasks();
  }));

  it('does not restart polling for the same stream', fakeAsync(() => {
    service.start('1');
    tick(0);
    httpMock.expectOne(heartbeatUrl()).flush(viewerCount());

    service.start('1');
    tick(0);

    httpMock.expectNone(heartbeatUrl());
    expect(service.streamId).toBe('1');
    discardPeriodicTasks();
  }));

  it('sends the bearer token when the viewer is logged in', fakeAsync(() => {
    loggedIn = true;

    service.start('1');
    tick(0);

    const req = httpMock.expectOne(heartbeatUrl());
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush(viewerCount());
    discardPeriodicTasks();
  }));

  it('reports again immediately when the user logs in', fakeAsync(() => {
    service.start('1');
    tick(0);
    httpMock.expectOne(heartbeatUrl()).flush(viewerCount({ authenticated: 0 }));

    loggedIn = true;
    userSubject.next({ id: 1, username: 'alice' });
    tick(0);

    const req = httpMock.expectOne(heartbeatUrl());
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush(viewerCount({ authenticated: 1 }));
    discardPeriodicTasks();
  }));

  it('applies viewer counts pushed over the chat socket', fakeAsync(() => {
    service.start('1');
    tick(0);
    httpMock.expectOne(heartbeatUrl()).flush(viewerCount({ total: 1 }));

    let latest: ViewerCount | null = null;
    service.counts$.subscribe((value) => (latest = value));

    socketCounts.next(viewerCount({ total: 7 }));
    expect(latest!.total).toBe(7);

    socketCounts.next(viewerCount({ streamId: '2', total: 99 }));
    expect(latest!.total).toBe(7);
    discardPeriodicTasks();
  }));

  it('keeps the last count when a heartbeat fails', fakeAsync(() => {
    let latest: ViewerCount | null = null;
    service.counts$.subscribe((value) => (latest = value));

    service.start('1');
    tick(0);
    httpMock.expectOne(heartbeatUrl()).flush(viewerCount({ total: 5 }));
    expect(latest!.total).toBe(5);

    tick(HEARTBEAT_INTERVAL_MS);
    httpMock
      .expectOne(heartbeatUrl())
      .flush('Server error', { status: 500, statusText: 'Internal Server Error' });

    expect(latest!.total).toBe(5);
    discardPeriodicTasks();
  }));

  it('leaves the stream and stops heartbeats on stop()', fakeAsync(() => {
    service.start('1');
    tick(0);
    httpMock.expectOne(heartbeatUrl()).flush(viewerCount());

    service.stop();
    const leave = httpMock.expectOne(leaveUrl());
    expect(leave.request.method).toBe('POST');
    expect(leave.request.body).toEqual({ visitorId: service.visitor });
    leave.flush(null, { status: 204, statusText: 'No Content' });

    tick(HEARTBEAT_INTERVAL_MS * 2);
    httpMock.expectNone(heartbeatUrl());
    expect(service.streamId).toBeNull();
  }));

  it('switches streams and leaves the previous one', fakeAsync(() => {
    service.start('1');
    tick(0);
    httpMock.expectOne(heartbeatUrl('1')).flush(viewerCount());

    service.start('2');
    httpMock.expectOne(leaveUrl('1')).flush(null, { status: 204, statusText: 'No Content' });

    tick(0);
    httpMock.expectOne(heartbeatUrl('2')).flush(viewerCount({ streamId: '2' }));
    expect(service.streamId).toBe('2');
    discardPeriodicTasks();
  }));

  it('sends a leave beacon when the page is hidden', fakeAsync(() => {
    const beaconSpy = spyOn(navigator, 'sendBeacon').and.returnValue(true);

    service.start('1');
    tick(0);
    httpMock.expectOne(heartbeatUrl()).flush(viewerCount());

    window.dispatchEvent(new Event('pagehide'));

    expect(beaconSpy).toHaveBeenCalled();
    const [url, payload] = beaconSpy.calls.mostRecent().args as [string, Blob];
    expect(url).toBe(leaveUrl());
    expect(payload).toEqual(jasmine.any(Blob));
    discardPeriodicTasks();
  }));

  it('ignores start() with empty streamId', fakeAsync(() => {
    service.start('');
    tick(0);
    httpMock.expectNone(heartbeatUrl());
    expect(service.streamId).toBeNull();
  }));

  it('calls stop() on ngOnDestroy', fakeAsync(() => {
    service.start('1');
    tick(0);
    httpMock.expectOne(heartbeatUrl()).flush(viewerCount());

    spyOn(service, 'stop').and.callThrough();
    service.ngOnDestroy();
    expect(service.stop).toHaveBeenCalled();
    expect(service.streamId).toBeNull();

    httpMock.expectOne(leaveUrl()).flush(null, { status: 204, statusText: 'No Content' });
  }));

  it('falls back to fetch keepalive when sendBeacon returns false', fakeAsync(() => {
    spyOn(navigator, 'sendBeacon').and.returnValue(false);
    const fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response()));

    service.start('1');
    tick(0);
    httpMock.expectOne(heartbeatUrl()).flush(viewerCount());

    window.dispatchEvent(new Event('pagehide'));

    expect(navigator.sendBeacon).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      leaveUrl(),
      jasmine.objectContaining({ method: 'POST', keepalive: true }),
    );
    discardPeriodicTasks();
  }));

  it('does not send leave beacon when no stream is active', () => {
    const beaconSpy = spyOn(navigator, 'sendBeacon');
    window.dispatchEvent(new Event('pagehide'));
    expect(beaconSpy).not.toHaveBeenCalled();
  });

  it('generates a fallback visitor id when crypto.randomUUID is unavailable', () => {
    sessionStorage.removeItem(VISITOR_ID_KEY);
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

    // Re-create service to trigger resolveVisitorId
    TestBed.resetTestingModule();
    const authMock = { currentUser$: userSubject.asObservable(), getToken: () => null };
    const chatMock = { viewerCount$: socketCounts.asObservable() };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ViewerPresenceService,
        { provide: AuthService, useValue: authMock },
        { provide: ChatService, useValue: chatMock },
      ],
    });
    const freshService = TestBed.inject(ViewerPresenceService);

    expect(freshService.visitor).toMatch(/^viewer-\d+-[a-z0-9]+$/);

    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
  });
});

