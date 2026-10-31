import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TwitchService } from './twitch.service';
import { environment } from '../../environments/environment';
import { Category } from '../components/category-card/category-card.component';

describe('TwitchService', () => {
  let service: TwitchService;
  let httpMock: HttpTestingController;

  const mockCategories: Category[] = [
    { name: 'Just Chatting', viewers: '300k', image: 'jc.jpg' },
    { name: 'League of Legends', viewers: '150k', image: 'lol.jpg' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TwitchService],
    });
    service = TestBed.inject(TwitchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── getTopCategories ──────────────────────────────────────────
  describe('getTopCategories', () => {
    it('should send GET with default limit 30', (done) => {
      service.getTopCategories().subscribe((cats) => {
        expect(cats).toEqual(mockCategories);
        expect(cats.length).toBe(2);
        done();
      });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/twitch/top-categories?limit=30`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockCategories);
    });

    it('should send GET with custom limit', (done) => {
      service.getTopCategories(5).subscribe((cats) => {
        expect(cats.length).toBe(2);
        done();
      });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/twitch/top-categories?limit=5`,
      );
      req.flush(mockCategories);
    });

    it('should return empty array on HTTP error', (done) => {
      service.getTopCategories(10).subscribe((cats) => {
        expect(cats).toEqual([]);
        done();
      });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/twitch/top-categories?limit=10`,
      );
      req.flush('Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    });

    it('should return empty array on network error', (done) => {
      service.getTopCategories().subscribe((cats) => {
        expect(cats).toEqual([]);
        done();
      });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/twitch/top-categories?limit=30`,
      );
      req.error(new ProgressEvent('error'));
    });
  });
});
