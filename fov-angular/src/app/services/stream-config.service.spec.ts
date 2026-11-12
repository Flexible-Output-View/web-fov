import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { StreamConfigService } from './stream-config.service';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import {
  StreamSettings,
  UpdateStreamSettings,
  StreamKeyResponse,
  BackendCategory,
} from '../models/stream-config';

describe('StreamConfigService', () => {
  let service: StreamConfigService;
  let httpMock: HttpTestingController;
  let authService: jasmine.SpyObj<AuthService>;

  const mockSettings: StreamSettings = {
    streamId: 's-123',
    title: 'Live Coding',
    description: 'Angular & HLS',
    visibility: 'public',
    thumbnailUrl: 'https://img.test/thumb.jpg',
    categoryId: 1,
    category: 'Science & Technology',
    streamKey: 'live_test_key_123',
    isLive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  };

  const mockKeyResponse: StreamKeyResponse = {
    streamKey: 'live_test_key_123',
    streamId: 's-123',
    isLive: false,
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockCategories: BackendCategory[] = [
    { id: 1, name: 'Gaming', viewers: 1200, image_url: 'img1.jpg' },
    { id: 2, name: 'Just Chatting', viewers: 3400, image_url: 'img2.jpg' },
  ];

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['getToken']);
    authService.getToken.and.returnValue('mock-token-xyz');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        StreamConfigService,
        { provide: AuthService, useValue: authService },
      ],
    });

    service = TestBed.inject(StreamConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── getMyStream ───────────────────────────────────────────────
  describe('getMyStream', () => {
    it('should send GET to /api/streams/me with Authorization header', () => {
      service.getMyStream().subscribe((res) => {
        expect(res).toEqual(mockSettings);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/streams/me`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-token-xyz');
      expect(req.request.headers.get('Content-Type')).toBe('application/json');
      req.flush(mockSettings);
    });
  });

  // ── updateMyStream ────────────────────────────────────────────
  describe('updateMyStream', () => {
    it('should send PUT to /api/streams/me with update payload', () => {
      const update: UpdateStreamSettings = {
        title: 'New Title',
        visibility: 'unlisted',
        categoryId: 2,
      };

      service.updateMyStream(update).subscribe((res) => {
        expect(res.title).toBe('New Title');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/streams/me`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(update);
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-token-xyz');
      req.flush({ ...mockSettings, ...update });
    });
  });

  // ── getStreamKey ──────────────────────────────────────────────
  describe('getStreamKey', () => {
    it('should send GET to /api/streams/me/stream-key', () => {
      service.getStreamKey().subscribe((res) => {
        expect(res.streamKey).toBe('live_test_key_123');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/streams/me/stream-key`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-token-xyz');
      req.flush(mockKeyResponse);
    });
  });

  // ── rotateStreamKey ───────────────────────────────────────────
  describe('rotateStreamKey', () => {
    it('should send POST to /api/streams/me/stream-key/rotate with empty body', () => {
      const newKeyResponse: StreamKeyResponse = {
        ...mockKeyResponse,
        streamKey: 'live_new_rotated_key',
      };

      service.rotateStreamKey().subscribe((res) => {
        expect(res.streamKey).toBe('live_new_rotated_key');
      });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/streams/me/stream-key/rotate`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-token-xyz');
      req.flush(newKeyResponse);
    });
  });

  // ── getCategories ─────────────────────────────────────────────
  describe('getCategories', () => {
    it('should send GET to /api/categories', () => {
      service.getCategories().subscribe((res) => {
        expect(res.length).toBe(2);
        expect(res[0].name).toBe('Gaming');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/categories`);
      expect(req.request.method).toBe('GET');
      req.flush(mockCategories);
    });
  });

  // ── authHeaders edge cases ────────────────────────────────────
  describe('authHeaders', () => {
    it('should set Authorization to Bearer null when token is null', () => {
      authService.getToken.and.returnValue(null);

      service.getMyStream().subscribe();
      const req = httpMock.expectOne(`${environment.apiUrl}/streams/me`);
      expect(req.request.headers.get('Authorization')).toBe('Bearer null');
      req.flush(mockSettings);
    });
  });
});
