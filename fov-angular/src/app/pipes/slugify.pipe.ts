import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'slugify',
  standalone: true
})
export class SlugifyPipe implements PipeTransform {

  transform(value: string): string {
    if (!value) return '';
    
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

}
