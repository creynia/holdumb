// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const ICONS: Record<string, number> = {
  'icon-192.png': 192,
  'icon-512.png': 512,
  'icon-maskable-512.png': 512,
  'apple-touch-icon.png': 180,
};

describe('gen-icons', () => {
  beforeAll(() => {
    execFileSync('node', ['scripts/gen-icons.mjs'], { stdio: 'pipe' });
  });

  for (const [name, size] of Object.entries(ICONS)) {
    it(`${name} is a ${size}x${size} PNG`, () => {
      const buf = readFileSync(`public/icons/${name}`);
      expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
      expect(buf.readUInt32BE(16)).toBe(size);
      expect(buf.readUInt32BE(20)).toBe(size);
    });
  }
});

describe('manifest', () => {
  const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
    name: string;
    short_name: string;
    description: string;
    theme_color: string;
    background_color: string;
    display: string;
    icons: { src: string; purpose: string }[];
  };
  it('has the navy theme and standalone display', () => {
    expect(m.short_name).toBe('holdumb');
    expect(m.name).toMatch(/^Ultimate Texas Hold'em/);
    expect(m.description).toMatch(/Ultimate Texas Hold'em/);
    expect(m.theme_color).toBe('#0b2e4a');
    expect(m.background_color).toBe('#0b2e4a');
    expect(m.display).toBe('standalone');
  });
  it('lists a maskable icon and files that exist', () => {
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const i of m.icons) {
      const path = i.src.startsWith('icons/') ? `public/${i.src}` : `public/${i.src}`;
      expect(() => readFileSync(path)).not.toThrow();
    }
  });
});
