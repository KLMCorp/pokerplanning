import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a2e',
          borderRadius: '32px',
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="140" height="140">
          <ellipse cx="50" cy="65" rx="30" ry="25" fill="#1a1a1a" />
          <circle cx="50" cy="35" r="25" fill="#1a1a1a" />
          <polygon points="30,20 20,0 38,15" fill="#1a1a1a" />
          <polygon points="70,20 80,0 62,15" fill="#1a1a1a" />
          <polygon points="30,18 24,6 35,15" fill="#ff9999" />
          <polygon points="70,18 76,6 65,15" fill="#ff9999" />
          <ellipse cx="40" cy="32" rx="6" ry="7" fill="#ffcc00" />
          <ellipse cx="60" cy="32" rx="6" ry="7" fill="#ffcc00" />
          <ellipse cx="40" cy="32" rx="2" ry="5" fill="#000" />
          <ellipse cx="60" cy="32" rx="2" ry="5" fill="#000" />
          <polygon points="50,40 47,44 53,44" fill="#ff6b6b" />
          <path d="M47,46 Q50,50 53,46" stroke="#333" strokeWidth="1.5" fill="none" />
          <line x1="30" y1="42" x2="15" y2="38" stroke="#333" strokeWidth="1" />
          <line x1="30" y1="45" x2="15" y2="45" stroke="#333" strokeWidth="1" />
          <line x1="30" y1="48" x2="15" y2="52" stroke="#333" strokeWidth="1" />
          <line x1="70" y1="42" x2="85" y2="38" stroke="#333" strokeWidth="1" />
          <line x1="70" y1="45" x2="85" y2="45" stroke="#333" strokeWidth="1" />
          <line x1="70" y1="48" x2="85" y2="52" stroke="#333" strokeWidth="1" />
          <path d="M75,70 Q95,50 90,30" stroke="#1a1a1a" strokeWidth="8" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
