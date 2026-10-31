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

describe('Lesson sources', () => {
  it('renders a Sources list with numbered citation buttons for a lesson that cites', async () => {
    const lesson = content.lessons.find((l) => l.sources?.length);
    expect(lesson).toBeTruthy();
    const el = await mount(`#/learn/${lesson!.id}`);
    const items = el.querySelectorAll('section.lesson-sources ol > li');
    expect(items.length).toBe(lesson!.sources!.length);
    expect(el.querySelectorAll('button.cite-btn').length).toBeGreaterThan(0);
  });
  it('renders no Sources section for a lesson without sources', async () => {
    const lesson = content.lessons.find((l) => !l.sources);
    const el = await mount(`#/learn/${lesson!.id}`);
    expect(el.querySelector('.lesson-sources')).toBeNull();
  });
});
