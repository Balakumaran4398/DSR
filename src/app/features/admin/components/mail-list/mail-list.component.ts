import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-mail-list',
  templateUrl: './mail-list.component.html',
  styleUrls: ['./mail-list.component.scss']
})
export class MailListComponent {
  mail: any;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public matDialog: MatDialog
  ) { }

  ngOnInit() {
    // Use the clicked mail directly
    this.mail = this.data;
    console.log('Selected Mail:', this.mail);
  }

  getReleaseMailType(mail: any): string {
    return mail.release_type || 'INTERNAL';
  }

  getReleaseMailTypeClasses(mail: any): string {
    const type = this.getReleaseMailType(mail);
    if (type.toUpperCase() === 'INTERNAL') {
      return 'border-blue-200 bg-blue-50 text-blue-700';
    }
    return 'border-purple-200 bg-purple-50 text-purple-700';
  }

  getReleaseMailMessageClasses(mail: any): string {
    const type = this.getReleaseMailType(mail);
    if (type.toUpperCase() === 'INTERNAL') {
      return 'border-blue-100 bg-blue-50/50';
    }
    return 'border-purple-100 bg-purple-50/50';
  }

  downloadFile(url: string) {
    if (!url) return;
    const a = document.createElement('a');
    a.href = encodeURI(url);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  get recipients(): string[] {
    return this.mail?.team_members
      ?.split(',')
      .map((x: any) => x.trim())
      .filter(Boolean) || [];
  }

}
