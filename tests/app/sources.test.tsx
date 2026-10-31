import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { AppProviders } from '../../src/app/context';
import { MemoryStorage } from '../../src/app/storage';
import { Store } from '../../src/app/store';
import { buildContent } from '../../src/content/load';

const content = buildContent(process.cwd());

async function mount(hash: string) {
  location.hash = hash;
  const el = document.createElement('div');
  document.body.appendChild(el);
  await act(() => {
    render(
      <AppProviders content={content} store={new Store(new MemoryStorage())}>
        <App />
      </AppProviders>,
      el,
    );
  });
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Sources screen', () => {
  it('shows the intro, a back link and every group', async () => {
    const el = await mount('#/sources');
    expect(el.querySelector('h1')?.textContent).toBe('Sources');
    expect(el.querySelector('a.back')?.getAttribute('href')).toBe('#/more');
    expect(el.textContent).toContain('Every figure in this app is computed by the app itself');
    const groups = [...el.querySelectorAll('section h2')].map((h) => h.textContent);
    expect(groups).toEqual(content.sources.map((g) => g.group));
    expect(groups).toEqual(
      expect.arrayContaining(['Rules & strategy', 'Algorithms', 'Trademarks', 'Software', 'Help']),
    );
  });
  it('credits the owner of the trademark', async () => {
    const el = await mount('#/sources');
    expect(el.textContent).toContain('registered trademark of Bally Gaming, Inc.');
    expect(el.textContent).toContain('Roger Snow');
  });
  it('every item with a url has a valid https url that opens externally', async () => {
    for (const g of content.sources)
      for (const it of g.items) if (it.url) expect(new URL(it.url).protocol).toBe('https:');
    const el = await mount('#/sources');
    const links = [...el.querySelectorAll<HTMLAnchorElement>('.source-list a')];
    expect(links.length).toBeGreaterThan(10);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });
  it('has unique ids', () => {
    const ids = content.sources.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('is linked from More, Strategy (practical lens) and About', async () => {
    for (const h of ['#/more', '#/strategy?lens=practical', '#/about']) {
      const el = await mount(h);
      expect(el.querySelector('a[href="#/sources"]'), h).toBeTruthy();
      document.body.innerHTML = '';
    }
  });
});
