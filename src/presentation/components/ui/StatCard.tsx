import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: string;
  trendPositive?: boolean;
  accentColor?: 'moss' | 'mustard' | 'emerald' | 'amber' | 'indigo' | 'sky';
}

const COLOR_MAP = {
  moss: 'bg-moss/10 text-moss border-moss/20',
  mustard: 'bg-mustard/30 text-moss-900 border-mustard/40',
  emerald: 'bg-emerald-600/10 text-emerald-800 border-emerald-600/20',
  amber: 'bg-amber-500/10 text-amber-800 border-amber-500/20',
  indigo: 'bg-indigo-500/10 text-indigo-800 border-indigo-500/20',
  sky: 'bg-sky-500/10 text-sky-800 border-sky-500/20',
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendPositive,
  accentColor = 'moss',
}: StatCardProps) {
  return (
    <div className="erp-card erp-card-hover p-5 relative overflow-hidden transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-ink-muted tracking-wide">{title}</p>
          <h3 className="text-2xl font-bold text-ink mt-1 tracking-tight">{value}</h3>
          {subtitle && (
            <p className="text-xs text-ink-muted mt-1 flex items-center gap-1.5 font-medium">
              {subtitle}
            </p>
          )}
        </div>

        <div className={`p-3 rounded-xl border ${COLOR_MAP[accentColor]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {trend && (
        <div className="mt-3 pt-3 border-t border-moss/10 flex items-center gap-2 text-xs">
          <span className={`font-semibold ${trendPositive ? 'text-emerald-700' : 'text-amber-700'}`}>
            {trend}
          </span>
          <span className="text-ink-muted">vs periodo anterior</span>
        </div>
      )}
    </div>
  );
}
