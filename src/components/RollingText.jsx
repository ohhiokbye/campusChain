// Each letter rolls upward on hover/focus without duplicating accessible text.
export default function RollingText({ children }) {
  return (
    <span className="rolling-text">
      <span className="visually-hidden">{children}</span>
      <span className="rolling-letters" aria-hidden="true">
        {[...children].map((letter, index) => (
          <span
            className="rolling-letter"
            key={index}
            style={{ '--letter-delay': `${index * 18}ms` }}
          >
            <span>{letter === ' ' ? '\u00a0' : letter}</span>
            <span>{letter === ' ' ? '\u00a0' : letter}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
