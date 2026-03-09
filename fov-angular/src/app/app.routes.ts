import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { FollowedComponent } from './pages/followed/followed.component';
import { DiscoverComponent } from './pages/discover/discover.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { StreamComponent } from './pages/stream/stream.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'discover', component: DiscoverComponent },
  { path: 'discover/:name', component: DiscoverComponent },
  { path: 'followed', component: FollowedComponent },
  { path: 'profile', component: ProfileComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'stream/:streamId', component: StreamComponent },
  { path: '**', redirectTo: '' }
];
