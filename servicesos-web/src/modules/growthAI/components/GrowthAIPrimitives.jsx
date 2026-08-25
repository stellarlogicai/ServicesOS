import { useCallback, useState } from 'react';

export function GrowthAISurface({ children, className = '', as: Component = 'section' }) {
  return <Component className={`growth-ai-surface ${className}`.trim()}>{children}</Component>;
}

export function GrowthAIField({ label, children }) {
  return <label className="growth-ai-field"><span>{label}</span>{children}</label>;
}

export function GrowthAIButton({ children, className = '', disabled, onClick, tone = 'primary', ...buttonProps }) {
  const toneClass = tone === 'success'
    ? 'growth-ai-button-success'
    : tone === 'secondary'
      ? 'v1-button-secondary'
      : 'v1-button-primary';

  return (
    <button
      type="button"
      className={`v1-button growth-ai-button ${toneClass} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      {...buttonProps}
    >
      {children}
    </button>
  );
}

export function GrowthAICopyButton({ label, text }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    const fallback = () => {
      const textarea = document.createElement('textarea');
      try {
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand?.('copy');
      } finally {
        textarea.remove();
      }
    };

    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else fallback();
      setCopied(true);
    } catch {
      fallback();
      setCopied(true);
    }
  }, [text]);

  return (
    <GrowthAIButton tone="secondary" disabled={!text} onClick={copy}>
      {copied ? 'Copied' : label}
    </GrowthAIButton>
  );
}
