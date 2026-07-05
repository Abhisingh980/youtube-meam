"use client";

interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

export default function Pagination({ page, totalPages, onChange, disabled }: Props) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap py-8">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={disabled || page === 1}
        className="px-3 py-1.5 rounded-md bg-panel border border-white/10 disabled:opacity-30 hover:border-accent transition-colors"
      >
        Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          disabled={disabled}
          className={`w-9 h-9 rounded-md text-sm font-medium transition-colors ${
            p === page
              ? "bg-gradient-to-r from-accent to-accent2 text-white"
              : "bg-panel border border-white/10 text-white/70 hover:border-accent"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={disabled || page === totalPages}
        className="px-3 py-1.5 rounded-md bg-panel border border-white/10 disabled:opacity-30 hover:border-accent transition-colors"
      >
        Next
      </button>
    </div>
  );
}
