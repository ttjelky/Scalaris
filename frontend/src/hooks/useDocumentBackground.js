import { useEffect } from 'react';

/**
 * iOS 26 Safari (Liquid Glass) tints its floating top/bottom toolbars by
 * sampling the html/body background-color directly — not whatever your
 * React content renders further down the tree. If html/body stay on the
 * default light color while a screen is dark (or vice versa), you get
 * white bars behind the toolbars no matter how tall you make the screen.
 *
 * Call this once per screen with that screen's real background color.
 * https://1ar.io/updates/safari-26-liquid-glass-web/
 */
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
