import { useId } from "react";

import type { SVGProps } from "react";

type BearIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  variant?: "normal" | "thinking";
};

export const BearIcon = ({
  size = 24,
  variant = "normal",
  width,
  height,
  ...props
}: BearIconProps) => {
  const id = useId().replace(/:/g, "");
  const isThinking = variant === "thinking";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width || size}
      height={height || size}
      viewBox="0 0 24 24"
      {...props}
    >
      <defs>
        <linearGradient id={`${id}-fur`} x1="8" y1="3" x2="17" y2="22">
          <stop stopColor="#2c2c2e" />
          <stop offset="0.62" stopColor="#151515" />
          <stop offset="1" stopColor="#080808" />
        </linearGradient>
        <linearGradient id={`${id}-towel`} x1="12" y1="16" x2="12" y2="22">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#e9e9eb" />
        </linearGradient>
      </defs>

      <circle cx="5.1" cy="6" r="3.25" fill="#111" />
      <circle cx="18.9" cy="6" r="3.25" fill="#111" />
      <ellipse cx="12" cy="18.4" rx="7.2" ry="4.5" fill={`url(#${id}-fur)`} />
      <rect
        x="3.2"
        y="3.4"
        width="17.6"
        height="16.2"
        rx="8.1"
        fill={`url(#${id}-fur)`}
      />
      <path
        d="M5.2 7.2C7.3 4.7 16.8 4.45 19 7.3"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.08"
        strokeWidth="0.65"
        strokeLinecap="round"
      />

      {isThinking ? (
        <>
          <path
            d="M6.5 10.8C7.55 11.65 9.45 11.65 10.5 10.8"
            fill="none"
            stroke="#fff"
            strokeWidth="1.55"
            strokeLinecap="round"
          />
          <path
            d="M13.5 10.8C14.55 11.65 16.45 11.65 17.5 10.8"
            fill="none"
            stroke="#fff"
            strokeWidth="1.55"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <ellipse cx="8.6" cy="11.1" rx="2.15" ry="2.65" fill="#fff" />
          <ellipse cx="15.4" cy="11.1" rx="2.15" ry="2.65" fill="#fff" />
          <circle cx="8.85" cy="11.45" r="0.78" fill="#111" />
          <circle cx="15.15" cy="11.45" r="0.78" fill="#111" />
        </>
      )}

      <path
        d="M6.1 17.2C6.95 17.7 7.85 18.05 8.8 18.25L8.2 23.45L5.7 23.15L6.1 17.2Z"
        fill={`url(#${id}-towel)`}
        stroke="#d7d7da"
        strokeWidth="0.35"
      />
      <path
        d="M4.45 15.15C8.35 16.9 15.65 16.9 19.55 15.1L19.15 17.25C15.35 19.9 8.7 19.9 4.85 17.3L4.45 15.15Z"
        fill={`url(#${id}-towel)`}
        stroke="#d7d7da"
        strokeWidth="0.35"
      />
      <path
        d="M5.15 16.95C8.85 19 15.2 19 18.85 16.9"
        fill="none"
        stroke="#cfcfd2"
        strokeWidth="0.35"
        strokeLinecap="round"
        opacity="0.72"
      />
    </svg>
  );
};
