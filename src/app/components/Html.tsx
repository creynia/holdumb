/** Trusted, build-time-compiled HTML (repo content only). */
export function Html(props: { html: string; class?: string }) {
  return (
    <div
      class={`prose ${props.class ?? ''}`.trim()}
      dangerouslySetInnerHTML={{ __html: props.html }}
    />
  );
}
