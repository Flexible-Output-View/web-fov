import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ChatService, SOCKET_FACTORY } from './chat.service';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import { ChatMessage } from '../models/chat';
import { ViewerCount } from '../models/live-stream.model';

describe('ChatService', () => {
  let service: ChatService;
  let httpMock: HttpTestingController;
  let authService: jasmine.SpyObj<AuthService>;
  let mockSocket: any;
  let socketEventHandlers: Record<string, Function>;

  const mockMsg: ChatMessage = {
    id: 101,
    streamId: 's-live',
    userId: 1,
    username: 'viewer1',
    message: 'Hello world',
    createdAt: '2024-01-01T12:00:00Z',
  };

  beforeEach(() => {
    socketEventHandlers = {};
    mockSocket = {
      connected: false,
      on: jasmine.createSpy('on').and.callFake((evt: string, cb: Function) => {
        socketEventHandlers[evt] = cb;
      }),
      emit: jasmine.createSpy('emit'),
      removeAllListeners: jasmine.createSpy('removeAllListeners'),
      disconnect: jasmine.createSpy('disconnect'),
    };

    authService = jasmine.createSpyObj('AuthService', ['getToken']);
    authService.getToken.and.returnValue('chat-auth-jwt');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ChatService,
        { provide: AuthService, useValue: authService },
        { provide: SOCKET_FACTORY, useValue: () => mockSocket },
      ],
    });

    service = TestBed.inject(ChatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('joinStream', () => {
    it('should connect socket and register event listeners', () => {
      service.joinStream('s-live');
      expect(mockSocket.on).toHaveBeenCalledWith('connect', jasmine.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', jasmine.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('chat-message', jasmine.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('viewer-count', jasmine.any(Function));
    });

    it('should emit join-stream when connect triggers', () => {
      service.joinStream('s-live');
      socketEventHandlers['connect']();
      expect(mockSocket.emit).toHaveBeenCalledWith('join-stream', 's-live');

      let isConnected = false;
      service.connected$.subscribe((val) => (isConnected = val));
      expect(isConnected).toBeTrue();
    });

    it('should set connected$ to false on disconnect event', () => {
      service.joinStream('s-live');
      socketEventHandlers['connect']();
      socketEventHandlers['disconnect']();

      let isConnected = true;
      service.connected$.subscribe((val) => (isConnected = val));
      expect(isConnected).toBeFalse();
    });

    it('should ignore duplicate joinStream call if already connected to same stream', () => {
      mockSocket.connected = true;
      (service as any).currentStreamId = 's-live';
      (service as any).socket = mockSocket;

      const leaveSpy = spyOn(service, 'leaveStream');
      service.joinStream('s-live');
      expect(leaveSpy).not.toHaveBeenCalled();
    });

    it('should append incoming message on chat-message event for current stream', () => {
      service.joinStream('s-live');
      socketEventHandlers['chat-message'](mockMsg);
      expect(service.messages).toEqual([mockMsg]);
    });

    it('should reject message for another stream', () => {
      service.joinStream('s-live');
      socketEventHandlers['chat-message']({ ...mockMsg, streamId: 'other-stream' });
      expect(service.messages).toEqual([]);
    });

    it('should update viewerCount$ on viewer-count event', () => {
      service.joinStream('s-live');
      const count: ViewerCount = {
        streamId: 's-live',
        total: 10,
        authenticated: 8,
        anonymous: 2,
        updatedAt: '2024-01-01',
      };
      let currentCount: ViewerCount | null = null;
      service.viewerCount$.subscribe((c) => (currentCount = c));
      socketEventHandlers['viewer-count'](count);
      expect(currentCount as ViewerCount | null).toEqual(count);
    });
  });

  describe('leaveStream & disconnect', () => {
    it('should emit leave-stream and clean up socket', () => {
      service.joinStream('s-live');
      service.leaveStream();
      expect(mockSocket.emit).toHaveBeenCalledWith('leave-stream', 's-live');
      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(service.messages).toEqual([]);
    });

    it('should call leaveStream on ngOnDestroy', () => {
      const leaveSpy = spyOn(service, 'leaveStream');
      service.ngOnDestroy();
      expect(leaveSpy).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('should return of(null) if message is empty or whitespace', (done) => {
      service.sendMessage('s-live', '   ').subscribe((res) => {
        expect(res).toBeNull();
        done();
      });
      httpMock.expectNone(`${environment.apiUrl}/chat/s-live`);
    });

    it('should send POST with authorization header and append returned message', (done) => {
      service.sendMessage('s-live', 'Salut tout le monde').subscribe((res) => {
        expect(res).toEqual(mockMsg);
        expect(service.messages).toContain(mockMsg);
        done();
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/chat/s-live`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Authorization')).toBe('Bearer chat-auth-jwt');
      expect(req.request.body).toEqual({ message: 'Salut tout le monde' });
      req.flush({ message: mockMsg });
    });

    it('should truncate message to 500 characters', () => {
      const longText = 'a'.repeat(600);
      service.sendMessage('s-live', longText).subscribe();
      const req = httpMock.expectOne(`${environment.apiUrl}/chat/s-live`);
      expect(req.request.body.message.length).toBe(500);
      req.flush({ message: mockMsg });
    });
  });

  describe('appendMessage', () => {
    it('should not add duplicate message by id', () => {
      (service as any).appendMessage(mockMsg);
      (service as any).appendMessage(mockMsg);
      expect(service.messages.length).toBe(1);
    });

    it('should cap messages at 200 items', () => {
      for (let i = 0; i < 210; i++) {
        (service as any).appendMessage({ ...mockMsg, id: i, message: `Msg ${i}` });
      }
      expect(service.messages.length).toBe(200);
      expect(service.messages[0].id).toBe(10);
      expect(service.messages[199].id).toBe(209);
    });
  });
});
