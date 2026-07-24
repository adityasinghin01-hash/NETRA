import React, { useRef, useEffect } from 'react';
import type { ReactNode, MouseEventHandler, CSSProperties, ButtonHTMLAttributes } from 'react';
import './SpecularButton.css';

export interface SpecularProps {
  radius?: number;
  lineColor?: string;
  baseColor?: string;
  intensity?: number;
  shineSize?: number;
  shineFade?: number;
  thickness?: number;
  speed?: number;
  followMouse?: boolean;
  proximity?: number;
  autoAnimate?: boolean;
}

export function useSpecularCanvas(
  targetRef: React.RefObject<HTMLElement | null>,
  // Kept for call-site compatibility; the effect draws on targetRef only.
  _fxRef: React.RefObject<HTMLElement | null>,
  props: SpecularProps
) {
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    let pointerAngle: number | null = null;
    let isHovered = false;

    const onPointerEnter = () => { isHovered = true; };
    const onPointerLeave = () => { isHovered = false; };
    const onPointerMove = (e: PointerEvent) => {
      if (!isHovered) return;
      const rect = target.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      pointerAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    };

    target.addEventListener('pointerenter', onPointerEnter);
    target.addEventListener('pointerleave', onPointerLeave);
    target.addEventListener('pointermove', onPointerMove);

    let angle = 0;
    let idleAngle = 0;
    let bright = 0;
    let last = performance.now();
    let raf = 0;

    const update = (now: number) => {
      raf = requestAnimationFrame(update);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const p = propsRef.current;

      idleAngle += (p.speed ?? 0.35) * dt;
      // CSS conic-gradient starts from top (12 o'clock), whereas atan2 is from right (3 o'clock).
      // The null check is repeated inline so TypeScript can narrow pointerAngle here.
      const steer = (p.followMouse ?? true) && isHovered;
      const targetAngle = steer && pointerAngle != null ? pointerAngle + Math.PI / 2 : idleAngle;
      
      let diff = targetAngle - angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      angle += diff * (1 - Math.exp(-dt * 10));

      const brightTarget = (p.autoAnimate || isHovered) ? 1 : 0;
      bright += (brightTarget - bright) * (1 - Math.exp(-dt * 12));

      target.style.setProperty('--sb-angle', `${angle}rad`);
      target.style.setProperty('--sb-intensity-mul', bright.toString());
      target.style.setProperty('--sb-intensity', (p.intensity ?? 1).toString());
      target.style.setProperty('--sb-thickness', `${p.thickness ?? 1}px`);
      target.style.setProperty('--sb-base-color', p.baseColor ?? '#525252');
      target.style.setProperty('--sb-line-color', p.lineColor ?? '#ffffff');
    };
    raf = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(raf);
      target.removeEventListener('pointerenter', onPointerEnter);
      target.removeEventListener('pointerleave', onPointerLeave);
      target.removeEventListener('pointermove', onPointerMove);
    };
  }, [targetRef]);
}

export interface SpecularButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, SpecularProps {
  children?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'custom';
  radius?: number;
  tint?: string;
  tintOpacity?: number;
  blur?: number;
  textColor?: string;
  lineColor?: string;
  baseColor?: string;
  intensity?: number;
  shineSize?: number;
  shineFade?: number;
  thickness?: number;
  speed?: number;
  followMouse?: boolean;
  proximity?: number;
  autoAnimate?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  style?: CSSProperties;
}

const SpecularButton: React.FC<SpecularButtonProps> = ({
  children = 'Get Started',
  size = 'lg',
  radius = 18,
  tint = '#ffffff',
  tintOpacity = 0,
  blur = 0,
  textColor = '#f5f5f5',
  lineColor = '#ffffff',
  baseColor = '#525252',
  intensity = 1,
  shineSize = 10,
  shineFade = 40,
  thickness = 1,
  speed = 0.35,
  followMouse = true,
  proximity = 250,
  autoAnimate = false,
  disabled = false,
  onClick,
  className = '',
  type = 'button',
  style,
  ...restProps
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const fxRef = useRef<HTMLSpanElement>(null);

  useSpecularCanvas(btnRef, fxRef, {
    radius,
    lineColor,
    baseColor,
    intensity,
    shineSize,
    shineFade,
    thickness,
    speed,
    followMouse,
    proximity,
    autoAnimate
  });

  const sizeClass = size === 'custom' ? 'specular-button--custom' : `specular-button--${size}`;

  return (
    <button
      ref={btnRef}
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`specular-button ${sizeClass}${className ? ` ${className}` : ''}`}
      style={{
        '--sb-radius': `${radius}px`,
        '--sb-tint': tint,
        '--sb-tint-opacity': tintOpacity,
        '--sb-blur': `${blur}px`,
        '--sb-text-color': textColor,
        ...style
      } as CSSProperties}
      {...restProps}
    >
      <span ref={fxRef} className="specular-button__fx" aria-hidden="true" />
      <span className="specular-button__label">{children}</span>
    </button>
  );
};

export interface SpecularCardProps extends React.HTMLAttributes<HTMLDivElement>, SpecularProps {
  children?: ReactNode;
  radius?: number;
  tint?: string;
  tintOpacity?: number;
  blur?: number;
  lineColor?: string;
  baseColor?: string;
  intensity?: number;
  shineSize?: number;
  shineFade?: number;
  thickness?: number;
  speed?: number;
  followMouse?: boolean;
  proximity?: number;
  autoAnimate?: boolean;
  className?: string;
}

export const SpecularCard: React.FC<SpecularCardProps> = ({
  children,
  radius = 12,
  tint = '#0ea5e9',
  tintOpacity = 0.03,
  blur = 0,
  lineColor = '#38bdf8',
  baseColor = '#1e293b',
  intensity = 1.2,
  shineSize = 12,
  shineFade = 35,
  thickness = 1.2,
  speed = 0.35,
  followMouse = true,
  proximity = 300,
  autoAnimate = false,
  className = '',
  style,
  ...restProps
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLSpanElement>(null);

  useSpecularCanvas(cardRef, fxRef, {
    radius,
    lineColor,
    baseColor,
    intensity,
    shineSize,
    shineFade,
    thickness,
    speed,
    followMouse,
    proximity,
    autoAnimate
  });

  return (
    <div
      ref={cardRef}
      className={`specular-card ${className}`}
      style={{
        '--sb-radius': `${radius}px`,
        '--sb-tint': tint,
        '--sb-tint-opacity': tintOpacity,
        '--sb-blur': `${blur}px`,
        ...style
      } as CSSProperties}
      {...restProps}
    >
      <span ref={fxRef} className="specular-card__fx" aria-hidden="true" />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
};

export default SpecularButton;
