import type { ReactNode } from 'react';

const PLACEHOLDER = /(\[fill in[^\]]*\])/gi;

export function WithPlaceholders({ text }: { text: string }) {
  const parts: ReactNode[] = text.split(PLACEHOLDER).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="placeholder">
        {part}
      </mark>
    ) : (
      part
    ),
  );
  return <>{parts}</>;
}
