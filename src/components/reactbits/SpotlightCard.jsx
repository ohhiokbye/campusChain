// Adapted from React Bits / David Haz. See THIRD_PARTY_NOTICES.md.
import { useRef } from 'react';

export default function SpotlightCard({
  as: Element = 'section',
  children,
  className = '',
  spotlightColor = 'var(--spotlight)',
  ...props
}) {
  const card = useRef(null);
  function move(event) {
    if (event.pointerType === 'touch') return;
    const rect = card.current.getBoundingClientRect();
    card.current.style.setProperty(
      '--mouse-x',
      `${event.clientX - rect.left}px`,
    );
    card.current.style.setProperty(
      '--mouse-y',
      `${event.clientY - rect.top}px`,
    );
  }
  return (
    <Element
      ref={card}
      onPointerMove={move}
      className={`card-spotlight ${className}`}
      style={{ '--spotlight-color': spotlightColor }}
      {...props}
    >
      {children}
    </Element>
  );
}
