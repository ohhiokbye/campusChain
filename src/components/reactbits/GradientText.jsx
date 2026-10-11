// CSS animation adaptation of React Bits GradientText / David Haz.
// See THIRD_PARTY_NOTICES.md. No animation dependency is needed.
export default function GradientText({
  children,
  className = '',
  animationSpeed = 10,
}) {
  return (
    <span
      className={`animated-gradient-text ${className}`}
      style={{ '--gradient-duration': `${animationSpeed}s` }}
    >
      {children}
    </span>
  );
}
