import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { FollowedComponent } from './pages/followed/followed.component';
import { DiscoverComponent } from './pages/discover/discover.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { PersonalSettingsComponent } from './pages/profile/personal-settings/personal-settings.component';
import { PublicProfileComponent } from './pages/profile/public-profile/public-profile.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { StreamComponent } from './pages/stream/stream.component';
import { HowDoesItWorkComponent } from './pages/how-does-it-work/how-does-it-work.component';
import { StreamConfigComponent } from './pages/stream-config/stream-config.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'discover', component: DiscoverComponent },
  { path: 'discover/:name', component: DiscoverComponent },
  { path: 'followed', component: FollowedComponent },
  { path: 'profile', component: ProfileComponent },
  { path: 'profile/personal_settings', component: PersonalSettingsComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'stream/:streamId', component: StreamComponent },
  { path: 'how-does-it-work', component: HowDoesItWorkComponent, title: 'Comment ça marche ?' },
  // NOTE: keep the dynamic :username route LAST (just before the wildcard).
  // Angular matches routes in declaration order, so any single-segment static
  // route placed after it (e.g. 'login') would be shadowed by a profile lookup.
  { path: 'dashboard/stream', component: StreamConfigComponent, canActivate: [authGuard], title: 'Configuration du stream' },
  { path: '**', redirectTo: '' },
  { path: ':username', component: PublicProfileComponent },
];
