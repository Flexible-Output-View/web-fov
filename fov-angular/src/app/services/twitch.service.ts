import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { Category } from '../components/category-card/category-card.component';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TwitchService {

  private readonly API_URL = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getTopCategories(limit: number = 30): Observable<Category[]> {
    return this.http.get<Category[]>(
      `${this.API_URL}/twitch/top-categories?limit=${limit}`
    ).pipe(
      catchError(error => {
        console.error('Error fetching top categories:', error);
        return of([]);
      })
    );
  }
}

