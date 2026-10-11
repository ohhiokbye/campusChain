// Original decorative SVG: an auditorium rendered as a small campus sculpture.
// No event data, interaction, or blockchain state is represented here.
export default function CampusScene() {
  const seats = [155, 195, 235, 275].flatMap((radius, row) =>
    Array.from({ length: 12 + row * 4 }, (_, index) => {
      const angle = ((18 + (144 * index) / (11 + row * 4)) * Math.PI) / 180;
      return {
        x: 360 + Math.cos(angle) * radius,
        y: 232 + Math.sin(angle) * radius * 0.47,
        row,
        index,
      };
    }),
  );
  return (
    <div className="campus-scene" aria-hidden="true">
      <div className="scene-aura" />
      <svg viewBox="0 0 720 440" fill="none" className="campus-sculpture">
        <defs>
          <linearGradient
            id="scene-floor"
            x1="180"
            y1="160"
            x2="550"
            y2="420"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="var(--sculpture-top)" />
            <stop offset="1" stopColor="var(--sculpture-bottom)" />
          </linearGradient>
          <linearGradient
            id="scene-metal"
            x1="286"
            y1="114"
            x2="460"
            y2="260"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="var(--sculpture-highlight)" />
            <stop offset=".48" stopColor="var(--sculpture-face)" />
            <stop offset="1" stopColor="var(--sculpture-bottom)" />
          </linearGradient>
          <linearGradient
            id="scene-edge"
            x1="145"
            y1="190"
            x2="570"
            y2="355"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="var(--accent-line)" stopOpacity=".08" />
            <stop offset=".5" stopColor="var(--scene-highlight)" />
            <stop offset="1" stopColor="var(--accent-line)" stopOpacity=".12" />
          </linearGradient>
          <radialGradient id="scene-shadow">
            <stop stopColor="var(--sculpture-shadow)" stopOpacity=".7" />
            <stop
              offset="1"
              stopColor="var(--sculpture-shadow)"
              stopOpacity="0"
            />
          </radialGradient>
        </defs>
        <g className="scene-orbits" stroke="var(--scene-line)" strokeWidth=".8">
          <ellipse cx="360" cy="247" rx="333" ry="164" strokeDasharray="2 9" />
          <ellipse cx="360" cy="247" rx="309" ry="145" />
          <path d="M360 64V92M360 397V427M15 247H40M680 247H705" />
          <path d="M124 112L143 126M577 365L597 379M123 379L143 365M577 126L597 112" />
        </g>
        <ellipse cx="360" cy="350" rx="303" ry="83" fill="url(#scene-shadow)" />
        <g className="scene-platform">
          <path
            d="M72 232C72 164 201 109 360 109S648 164 648 232V254C648 322 519 377 360 377S72 322 72 254Z"
            fill="var(--sculpture-side)"
            stroke="var(--scene-line)"
          />
          <ellipse
            cx="360"
            cy="232"
            rx="288"
            ry="123"
            fill="url(#scene-floor)"
            stroke="var(--scene-line)"
          />
          <path
            d="M73 243C86 307 210 355 360 355S634 307 647 243"
            stroke="url(#scene-edge)"
            strokeWidth="2"
          />
          {[155, 195, 235, 275].map((radius) => (
            <path
              key={radius}
              d={`M${360 - radius} 232a${radius} ${radius * 0.47} 0 0 0 ${radius * 2} 0`}
              stroke="var(--scene-line)"
              strokeWidth=".6"
            />
          ))}
          {seats.map((seat) => (
            <rect
              key={`${seat.row}-${seat.index}`}
              x={seat.x - 4}
              y={seat.y - 4}
              width="8"
              height="9"
              rx="2"
              fill="var(--sculpture-seat)"
              stroke="var(--scene-line)"
              strokeWidth=".5"
            />
          ))}
          <ellipse
            cx="360"
            cy="222"
            rx="116"
            ry="47"
            fill="var(--sculpture-stage)"
            stroke="url(#scene-edge)"
          />
          <ellipse
            cx="360"
            cy="222"
            rx="91"
            ry="35"
            stroke="var(--scene-highlight)"
            strokeOpacity=".16"
          />
        </g>
        <g className="scene-pavilion">
          <path
            d="M282 130L360 94L438 130V210L360 246L282 210Z"
            fill="url(#scene-metal)"
            stroke="var(--scene-line)"
          />
          <path
            d="M282 130L360 166L438 130L360 94Z"
            fill="var(--sculpture-top)"
            stroke="var(--scene-line)"
          />
          <path
            d="M360 166V246L438 210V130Z"
            fill="var(--sculpture-face)"
            stroke="var(--scene-line)"
          />
          <path
            d="M300 128L360 100L420 128L360 156Z"
            stroke="var(--scene-highlight)"
            strokeOpacity=".55"
          />
          <path
            d="M298 149V201L342 221V169M309 154V205M322 160V212M335 166V218"
            stroke="var(--sculpture-highlight)"
            strokeOpacity=".35"
          />
          <path
            d="M377 175L422 155V201L377 222Z"
            fill="var(--sculpture-stage)"
            stroke="var(--scene-line)"
          />
          <path
            d="M393 217V186L406 180V211"
            stroke="var(--scene-highlight)"
            strokeOpacity=".7"
          />
        </g>
        <g className="scene-lights" fill="var(--scene-highlight)">
          <circle cx="101" cy="294" r="3" />
          <circle cx="620" cy="174" r="3" />
          <circle cx="359" cy="72" r="2" />
        </g>
      </svg>
      <div className="scene-caption">
        <span className="scene-caption-dot" /> A PLACE FOR EVERY IDEA{' '}
        <span>VIT / CHENNAI</span>
      </div>
    </div>
  );
}
