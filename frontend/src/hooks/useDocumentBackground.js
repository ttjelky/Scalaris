import { useEffect } from 'react';

export default function useDocumentBackground(color) {
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;

    const previousHtml = html.style.backgroundColor;
    const previousBody = body.style.backgroundColor;

    html.style.backgroundColor = color;
    body.style.backgroundColor = color;

    return () => {
      html.style.backgroundColor = previousHtml;
      body.style.backgroundColor = previousBody;
    };
  }, [color]);
}
