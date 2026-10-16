import type { ComponentChildren } from 'preact';
import { href, markFreshNav } from '../router';

export function Link(props: {
  to: string;
  class?: string;
  children: ComponentChildren;
  'aria-label'?: string;
  'aria-current'?: 'page';
}) {
  return (
    <a
      href={href(props.to)}
      class={props.class}
      aria-label={props['aria-label']}
      aria-current={props['aria-current']}
      onClick={() => markFreshNav()}
    >
      {props.children}
    </a>
  );
}
