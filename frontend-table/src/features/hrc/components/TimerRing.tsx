interface TimerRingProps {
  /** 0-100 percentage remaining */
  percent: number;
  /** Seconds left to display */
  secondsLeft: number;
  /** Diameter of the ring in px */
  size: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Whether player is in personal time bank mode */
  inTimeBank?: boolean;
  /** Time bank seconds remaining (shown when inTimeBank) */
  timeBankRemaining?: number;
  /** Is this the hero player */
  isHero?: boolean;
  className?: string;
}

function getTimerColor(percent: number, inTimeBank: boolean): string {
  if (inTimeBank) return "#f59e0b"; // amber
  if (percent > 50) return "#10b981"; // green
  if (percent > 25) return "#eab308"; // yellow
  return "#ef4444"; // red
}

function getUrgencyClass(percent: number, inTimeBank: boolean): string {
  if (inTimeBank) return "timer-critical-pulse";
  if (percent <= 10) return "timer-critical-pulse";
  if (percent <= 20) return "timer-urgent-pulse";
  return "";
}

export function TimerRing({
  percent,
  secondsLeft,
  size,
  strokeWidth = 4,
  inTimeBank = false,
  timeBankRemaining = 0,
  isHero = false,
  className = "",
}: TimerRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * Math.max(0, Math.min(100, percent))) / 100;
  const color = getTimerColor(percent, inTimeBank);
  const urgencyClass = getUrgencyClass(percent, inTimeBank);

  const displaySeconds = inTimeBank ? timeBankRemaining : secondsLeft;

  return (
    <div
      className={`absolute pointer-events-none z-20 ${urgencyClass} ${className}`}
      style={{
        width: size,
        height: size,
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + (percent <= 20 ? 1 : 0)}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 0.1s linear, stroke 0.3s ease",
            filter: `drop-shadow(0 0 ${percent <= 20 ? 6 : 3}px ${color})`,
          }}
        />
      </svg>

      {/* Seconds display at bottom of ring */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
        style={{ bottom: -2 }}
      >
        <div
          className="px-1.5 py-0.5 rounded-full text-[0.5625rem] font-mono font-bold leading-none backdrop-blur-sm"
          style={{
            background: "rgba(0,0,0,0.75)",
            color,
            border: `1px solid ${color}40`,
            minWidth: 24,
            textAlign: "center",
          }}
        >
          {inTimeBank && <span className="text-[7px] mr-0.5">TB</span>}
          {displaySeconds}s
        </div>
      </div>

      {/* Glow overlay for urgency */}
      {percent <= 20 && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: `0 0 ${percent <= 10 ? 16 : 10}px ${color}50`,
          }}
        />
      )}
    </div>
  );
}
