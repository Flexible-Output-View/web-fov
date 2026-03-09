import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, RouterModule, NavbarComponent, SidebarComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})

export class AppComponent {
    title = 'FOV - Flexible Output View';

    isSidebarCollapsed = true;

    onSidebarToggle() {
      this.isSidebarCollapsed = !this.isSidebarCollapsed;
    }
}
