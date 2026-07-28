import { Component, Input } from '@angular/core';

interface ServerProfile {
  hostName: string;
  role: string;
  environment: 'Production' | 'Staging' | 'Development' | 'DR' | 'Unknown';
  os: string;
  processor: string;
  cpuSockets: number;
  cores: number;
  threads: number;
  memory: string;
  storage: string;
  storageType: string;
  raid: string;
  network: string;
  primaryIp: string;
  virtualization: string;
  datacenter: string;
  rack: string;
}

interface SpecItem {
  label: string;
  value: string;
  icon?: string;
  mono?: boolean;
  copy?: boolean;
}

interface SpecSection {
  title: string;
  description?: string;
  items: SpecItem[];
}

@Component({
  selector: 'app-hardware',
  templateUrl: './hardware.component.html',
  styleUrls: ['./hardware.component.scss']
})
export class HardwareComponent {
  @Input() server: ServerProfile = {
    hostName: 'user-Standard-PC-i440FX-PIIX-1996',
    role: 'Application Server', // or adjust
    environment: 'Development', // change if needed
    os: 'Ubuntu Linux (assumed)',
    processor: 'Common KVM Virtual CPU',
    cpuSockets: 1,
    cores: 8,
    threads: 8,
    memory: '12 GB',
    storage: '300 GB Virtual Disk',
    storageType: 'Virtual (QEMU)',
    raid: 'N/A',
    network: '1 x Virtual NIC',
    primaryIp: '103.183.47.211',
    virtualization: 'KVM (Virtual Machine)',
    datacenter: 'Unknown',
    rack: 'N/A'
  };

  copiedKey: string | null = null;

  get quickCards(): Array<{ label: string; value: string; icon: string; iconBgClass: string; iconTextClass: string }> {
    return [
      { label: 'Processor', value: this.server.processor, icon: 'ri-cpu-line', iconBgClass: 'bg-blue-50', iconTextClass: 'text-blue-600' },
      { label: 'Cores / Threads', value: `${this.server.cores}C / ${this.server.threads}T`, icon: 'ri-cpu-line', iconBgClass: 'bg-violet-50', iconTextClass: 'text-violet-600' },
      { label: 'Memory', value: this.server.memory, icon: 'ri-dashboard-3-line', iconBgClass: 'bg-emerald-50', iconTextClass: 'text-emerald-600' },
      { label: 'Storage', value: this.server.storage, icon: 'ri-hard-drive-3-line', iconBgClass: 'bg-slate-50', iconTextClass: 'text-slate-700' }
    ];
  }

  get overviewItems(): SpecItem[] {
    return [
      { label: 'Hostname', value: this.server.hostName, mono: true, copy: true, icon: 'ri-server-line' },
      { label: 'Primary IP', value: this.server.primaryIp, mono: true, copy: true, icon: 'ri-global-line' },
      { label: 'Role', value: this.server.role, icon: 'ri-stack-line' },
      { label: 'Environment', value: this.server.environment, icon: 'ri-flask-line' },
      { label: 'Operating System', value: this.server.os, icon: 'ri-terminal-box-line' },
      { label: 'Virtualization', value: this.server.virtualization, icon: 'ri-cloud-line' }
    ];
  }

  get sections(): SpecSection[] {
    return [
      {
        title: 'Compute',
        description: 'CPU and processing capacity.',
        items: [
          { label: 'Processor', value: this.server.processor, icon: 'ri-cpu-line' },
          { label: 'CPU Sockets', value: String(this.server.cpuSockets), icon: 'ri-memories-line', mono: true },
          { label: 'Cores', value: String(this.server.cores), icon: 'ri-pie-chart-2-line', mono: true },
          { label: 'Threads', value: String(this.server.threads), icon: 'ri-threads-line', mono: true }
        ]
      },
      {
        title: 'Memory',
        description: 'RAM configuration.',
        items: [{ label: 'Memory', value: this.server.memory, icon: 'ri-dashboard-3-line' }]
      },
      {
        title: 'Storage',
        description: 'Disk layout, RAID and capacity.',
        items: [
          { label: 'Storage', value: this.server.storage, icon: 'ri-hard-drive-3-line' },
          { label: 'Storage Type', value: this.server.storageType, icon: 'ri-database-2-line' },
          { label: 'RAID', value: this.server.raid, icon: 'ri-shield-check-line' }
        ]
      },
    ];
  }

  async copy(value: string, key: string): Promise<void> {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.flashCopied(key);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        this.flashCopied(key);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }

  

  exportJson(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      server: this.server
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.safeFilename(this.server.hostName || 'server')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  trackByLabel(_: number, item: { label: string }): string {
    return item.label;
  }

  private flashCopied(key: string): void {
    this.copiedKey = key;
    window.setTimeout(() => {
      if (this.copiedKey === key) this.copiedKey = null;
    }, 1400);
  }

  private safeFilename(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
