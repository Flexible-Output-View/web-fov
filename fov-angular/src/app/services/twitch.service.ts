import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, switchMap, catchError, shareReplay } from 'rxjs/operators';
import { Category } from '../components/category-card/category-card.component';
import { environment } from '../../environments/environment';

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface TwitchGame {
  id: string;
  name: string;
  box_art_url: string;
}

interface TwitchGamesResponse {
  data: TwitchGame[];
}

@Injectable({
  providedIn: 'root'
})
export class TwitchService {

  private readonly CLIENT_ID = environment.twitch.clientId;
  private readonly CLIENT_SECRET = environment.twitch.clientSecret;

  private readonly TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
  private readonly API_URL = 'https://api.twitch.tv/helix';

  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private tokenRequest$: Observable<string> | null = null;

  constructor(private http: HttpClient) {}

  private getAccessToken(): Observable<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return of(this.accessToken);
    }

    if (this.tokenRequest$) {
      return this.tokenRequest$;
    }

    const body = new URLSearchParams();
    body.set('client_id', this.CLIENT_ID);
    body.set('client_secret', this.CLIENT_SECRET);
    body.set('grant_type', 'client_credentials');

    this.tokenRequest$ = this.http.post<TwitchTokenResponse>(
      this.TOKEN_URL,
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ).pipe(
      map(response => {
        this.accessToken = response.access_token;
        this.tokenExpiry = Date.now() + (response.expires_in - 300) * 1000;
        this.tokenRequest$ = null;
        return response.access_token;
      }),
      shareReplay(1),
      catchError(error => {
        console.error('Erreur token Twitch:', error);
        this.tokenRequest$ = null;
        throw error;
      })
    );

    return this.tokenRequest$;
  }

  getTopCategories(limit: number = 30): Observable<Category[]> {
    return this.getAccessToken().pipe(
      switchMap(token => {
        const headers = new HttpHeaders({
          'Client-ID': this.CLIENT_ID,
          'Authorization': `Bearer ${token}`
        });

        return this.http.get<TwitchGamesResponse>(
          `${this.API_URL}/games/top?first=${limit}`,
          { headers }
        );
      }),
      map(response => {
        return response.data.map(game => ({
          name: game.name,
          viewers: '',
          image: game.box_art_url
            .replace('{width}', '285')
            .replace('{height}', '380')
        }));
      }),
      catchError(error => {
        console.error('Erreur récupération catégories:', error);
        return of([]);
      })
    );
  }
}
