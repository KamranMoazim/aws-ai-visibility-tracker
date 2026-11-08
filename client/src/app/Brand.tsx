export function Wordmark({ large = false }: { large?: boolean }) {
  return (
    <span className={large ? 'wordmark wordmark-large' : 'wordmark'}>
      Answer<mark>Share</mark>
    </span>
  );
}
