import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import {
  StreamSettings,
  UpdateStreamSettings,
  StreamKeyResponse,
  BackendCategory,
} from '../models/stream-config';

@Injectable({ providedIn: 'root' })
export class StreamConfigService {
  private readonly API_URL = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  private get authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  getMyStream(): Observable<StreamSettings> {
    return this.http.get<StreamSettings>(`${this.API_URL}/streams/me`, {
      headers: this.authHeaders,
    });
  }

  updateMyStream(data: UpdateStreamSettings): Observable<StreamSettings> {
    return this.http.put<StreamSettings>(`${this.API_URL}/streams/me`, data, {
      headers: this.authHeaders,
    });
  }

  getStreamKey(): Observable<StreamKeyResponse> {
    return this.http.get<StreamKeyResponse>(
      `${this.API_URL}/streams/me/stream-key`,
      { headers: this.authHeaders },
    );
  }

  rotateStreamKey(): Observable<StreamKeyResponse> {
    return this.http.post<StreamKeyResponse>(
      `${this.API_URL}/streams/me/stream-key/rotate`,
      {},
      { headers: this.authHeaders },
    );
  }

  getCategories(): Observable<BackendCategory[]> {
    return this.http.get<BackendCategory[]>(`${this.API_URL}/categories`);
  }
}
