import './Branding.css'

const SITE_HOME = '/'
const COFFEE_URL = 'https://www.buymeacoffee.com/awmPhysics'
const CONTACT_EMAIL = 'hello@alexmoorephysics.com'
const LOGO_SRC = `${import.meta.env.BASE_URL}favicon.svg`

export function BrandLogo({ className = '' }) {
  return (
    <a
      className={`awm-logo-link ${className}`.trim()}
      href={SITE_HOME}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="More simulations at alexmoorephysics.com"
      title="More simulations"
    >
      <img src={LOGO_SRC} alt="" />
    </a>
  )
}

export function SoundIcon({ className = '' }) {
  return (
    <svg className={`awm-sound-icon ${className}`.trim()} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#2166d1" />
      <path d="M9 11.5 L12 9 V19 L9 16.5 Z" fill="#fff" />
      <rect x="7" y="11.5" width="3" height="5" rx="0.5" fill="#fff" />
      <path d="M15 10.5 Q18 14 15 17.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M17.2 8.5 Q21.5 14 17.2 19.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function LessonNav({ onBack }) {
  return (
    <nav className="awm-lesson-nav" onClick={onBack} role="link" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBack(); } }}>
      <SoundIcon />
      <span className="awm-lesson-nav-label">Sound</span>
      <span className="awm-lesson-nav-chevron">‹</span>
    </nav>
  )
}

export function SiteFooter() {
  return (
    <footer className="awm-footer">
      <a href={SITE_HOME} target="_blank" rel="noopener noreferrer">More simulations</a>
      <span aria-hidden="true">·</span>
      <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer">Support the project ☕</a>
      <span aria-hidden="true">·</span>
      <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    </footer>
  )
}
