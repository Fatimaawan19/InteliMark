// Simple student desk SVG illustration for login page
export default function StudentDeskSVG({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="400" height="300" rx="32" fill="#F5F7FA" />
      <ellipse cx="200" cy="180" rx="120" ry="80" fill="#E3E7F1" />
      <rect x="120" y="170" width="160" height="18" rx="6" fill="#C1C7D0" />
      <rect x="160" y="120" width="80" height="50" rx="10" fill="#FFF" stroke="#C1C7D0" strokeWidth="2" />
      <rect x="180" y="140" width="40" height="10" rx="3" fill="#F5F7FA" />
      <circle cx="200" cy="110" r="28" fill="#FFB366" />
      <rect x="185" y="155" width="30" height="8" rx="2" fill="#C1C7D0" />
      <rect x="130" y="190" width="30" height="12" rx="4" fill="#FFF" stroke="#C1C7D0" strokeWidth="1" />
      <rect x="240" y="190" width="30" height="12" rx="4" fill="#FFF" stroke="#C1C7D0" strokeWidth="1" />
      <circle cx="145" cy="196" r="4" fill="#C1C7D0" />
      <circle cx="255" cy="196" r="4" fill="#C1C7D0" />
      <rect x="170" y="90" width="60" height="10" rx="5" fill="#FFB366" />
      <rect x="210" y="60" width="40" height="8" rx="4" fill="#C1C7D0" />
      <rect x="150" y="60" width="40" height="8" rx="4" fill="#C1C7D0" />
      <rect x="90" y="60" width="40" height="8" rx="4" fill="#C1C7D0" />
      <rect x="270" y="60" width="40" height="8" rx="4" fill="#C1C7D0" />
      {/* Add more details for a modern look if needed */}
    </svg>
  );
}
