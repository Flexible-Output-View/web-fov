import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SlugifyPipe } from '../../pipes/slugify.pipe';

export interface Category {
  name: string;
  viewers: string | number;
  image: string;
}

@Component({
  selector: 'app-category-card',
  standalone: true,
  imports: [CommonModule, RouterModule, SlugifyPipe],
  templateUrl: './category-card.component.html',
  styleUrls: ['./category-card.component.scss']
})
export class CategoryCardComponent {
  @Input() category!: Category;
}
