import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Snowflake, Flame, ShoppingBag, ThumbsDown, User } from 'lucide-react';
import { LeadStatus } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const leadStatusConfig: Record<LeadStatus, { label: string; icon: React.ReactNode; color: string }> = {
  novo: { label: 'Novo', icon: <User className="w-4 h-4" />, color: 'bg-gray-500' },
  frio: { label: 'Frio', icon: <Snowflake className="w-4 h-4" />, color: 'bg-blue-500' },
  quente: { label: 'Quente', icon: <Flame className="w-4 h-4" />, color: 'bg-orange-500' },
  comprador: { label: 'Comprador', icon: <ShoppingBag className="w-4 h-4" />, color: 'bg-green-500' },
  sem_interesse: { label: 'Sem Interesse', icon: <ThumbsDown className="w-4 h-4" />, color: 'bg-red-500' },
};

interface LeadStatusSelectProps {
  value: LeadStatus;
  onChange: (value: LeadStatus) => void;
  disabled?: boolean;
}

export const LeadStatusSelect = ({ value, onChange, disabled }: LeadStatusSelectProps) => {
  const config = leadStatusConfig[value] || leadStatusConfig.novo;

  return (
    <Select value={value} onValueChange={(v) => onChange(v as LeadStatus)} disabled={disabled}>
      <SelectTrigger className="w-[160px] h-8">
        <SelectValue>
          <span className="flex items-center gap-2">
            <span className={cn('w-2 h-2 rounded-full', config.color)} />
            {config.label}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(leadStatusConfig) as LeadStatus[]).map((status) => (
          <SelectItem key={status} value={status}>
            <span className="flex items-center gap-2">
              <span className={cn('w-2 h-2 rounded-full', leadStatusConfig[status].color)} />
              {leadStatusConfig[status].icon}
              {leadStatusConfig[status].label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export const LeadStatusBadge = ({ status }: { status: LeadStatus }) => {
  const config = leadStatusConfig[status] || leadStatusConfig.novo;

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white',
      config.color
    )}>
      {config.icon}
      {config.label}
    </span>
  );
};
