import blackSeal from '../../assets/logo/seal-black.png';
import whiteSeal from '../../assets/logo/seal-white.png';

interface LogoProps {
  /** white on dark backgrounds (sidebar, login, splash), black on light ones */
  tone?: 'white' | 'black';
  size?: number;
  className?: string;
}

/** The clinic's seal (crown, olive branches, serpent in a heart, "Centre Dentaire Riad El Ansari"). */
const Logo = ({ tone = 'white', size = 44, className }: LogoProps) => (
  <img src={tone === 'white' ? whiteSeal : blackSeal} width={size} height={size} className={className}
    alt="Centre Dentaire Riad El Ansari" draggable={false} style={{ display: 'block', userSelect: 'none' }} />
);

export default Logo;
