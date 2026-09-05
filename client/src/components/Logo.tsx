import logoUrl from '../assets/helpyou-logo.png';

export default function Logo({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <img src={logoUrl} alt="HelpYou" draggable={false} className={`${className} object-contain select-none`} />
  );
}