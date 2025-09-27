import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { FollowedComponent } from './pages/followed/followed.component';
import { DiscoverComponent } from './pages/discover/discover.component';
import { ProfileComponent } from './pages/profile/profile.component';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'followed', component: FollowedComponent },
    { path: 'discover', component: DiscoverComponent },
    { path: 'profile', component: ProfileComponent },
    { path: '**', redirectTo: '' }
];
