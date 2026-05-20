'use client';
import { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  allowFreeText?: boolean;   // true = có thể nhập tự do (cho Dự án), false = chỉ chọn từ list
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
  className?: string;
}

export default function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Chọn hoặc tìm kiếm...',
  allowFreeText = false,
  disabled = false,
  loading = false,
  required = false,
  className = '',
}: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLUListElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState(-1);

  // Lọc options theo query
  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Khi value thay đổi từ bên ngoài (edit task), sync query
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Click ngoài → đóng
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        commit();
      }
    }
    if (open) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open, query]);

  // Scroll highlighted item vào view
  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const el = listRef.current.children[highlighted] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted]);

  function openDropdown() {
    if (disabled) return;
    setQuery('');
    setHighlighted(-1);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function select(opt: string) {
    onChange(opt);
    setQuery('');
    setOpen(false);
    setHighlighted(-1);
  }

  function commit() {
    if (allowFreeText && query.trim()) {
      onChange(query.trim());
    } else if (highlighted >= 0 && filtered[highlighted]) {
      onChange(filtered[highlighted]);
    }
    setOpen(false);
    setQuery('');
    setHighlighted(-1);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlighted(h => Math.min(h + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted(h => Math.max(h - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlighted >= 0 && filtered[highlighted]) {
          select(filtered[highlighted]);
        } else if (allowFreeText && query.trim()) {
          select(query.trim());
        } else if (filtered.length === 1) {
          select(filtered[0]);
        }
        break;
      case 'Escape':
        setOpen(false);
        setQuery('');
        break;
      case 'Tab':
        commit();
        break;
    }
  }

  const displayValue = open ? query : value;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Input trigger */}
      <div
        onClick={openDropdown}
        className={`flex items-center border rounded-lg px-3 py-2 text-sm bg-white cursor-text transition-colors ${
          open
            ? 'border-green-500 ring-1 ring-green-200'
            : 'border-gray-200 hover:border-gray-300'
        } ${disabled ? 'bg-gray-50 cursor-not-allowed opacity-60' : ''}`}
      >
        {open ? (
          <input
            ref={inputRef}
            id={id}
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlighted(-1); }}
            onKeyDown={onKeyDown}
            placeholder={loading ? 'Đang tải...' : placeholder}
            className="flex-1 outline-none bg-transparent text-gray-800 placeholder-gray-400 min-w-0"
            required={required && !value}
            autoComplete="off"
          />
        ) : (
          <span className={`flex-1 truncate ${value ? 'text-gray-800' : 'text-gray-400'}`}>
            {loading ? 'Đang tải...' : (value || placeholder)}
          </span>
        )}

        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          {value && !open && !disabled && (
            <button
              type="button"
              onClick={clear}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <X size={13} />
            </button>
          )}
          <ChevronDown
            size={15}
            className={`text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Không có kết quả */}
          {filtered.length === 0 && (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">
              {allowFreeText
                ? <span>Nhấn Enter để thêm <strong>&quot;{query}&quot;</strong></span>
                : 'Không tìm thấy kết quả'}
            </div>
          )}

          {/* Danh sách */}
          <ul
            ref={listRef}
            className="max-h-52 overflow-y-auto py-1"
          >
            {filtered.map((opt, i) => (
              <li
                key={opt}
                onMouseDown={e => { e.preventDefault(); select(opt); }}
                onMouseEnter={() => setHighlighted(i)}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-2 ${
                  i === highlighted
                    ? 'bg-green-50 text-green-800'
                    : opt === value
                    ? 'bg-gray-50 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="truncate">{opt}</span>
                {opt === value && (
                  <span className="shrink-0 text-green-600 text-xs">✓</span>
                )}
              </li>
            ))}
          </ul>

          {/* Gợi ý tự nhập nếu allowFreeText */}
          {allowFreeText && query.trim() && !options.includes(query.trim()) && (
            <div
              onMouseDown={e => { e.preventDefault(); select(query.trim()); }}
              className="border-t border-gray-100 px-3 py-2 text-sm text-green-700 cursor-pointer hover:bg-green-50 flex items-center gap-2"
            >
              <span className="text-green-500">+</span>
              Thêm mới: <strong>&quot;{query}&quot;</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
