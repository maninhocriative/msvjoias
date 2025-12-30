import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  contactName: string;
  className?: string;
}

const TypingIndicator = ({ contactName, className }: TypingIndicatorProps) => {
  return (
    <div className={cn('flex items-center gap-2 px-4 py-2', className)}>
      <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" />
        </div>
        <span className="text-xs text-muted-foreground ml-1">
          {contactName} está digitando...
        </span>
      </div>
    </div>
  );
};

export default TypingIndicator;
