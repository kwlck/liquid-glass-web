// Copy into a React app. No React dependency is required by the core library.
import { useEffect, useRef } from 'react';
import { createLiquidGlass } from '../src/liquid-glass.js';
import '../src/liquid-glass.css';

export function Glass({ children, className, style, options }) {
  const element = useRef(null);
  const glass = useRef(null);
  useEffect(() => {
    glass.current = createLiquidGlass(element.current);
    return () => { glass.current.destroy(); glass.current = null; };
  }, []);
  useEffect(() => { glass.current?.update(options); }, [options]);
  return <div ref={element} className={className} style={style}>{children}</div>;
}
