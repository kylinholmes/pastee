import { useEffect, useState, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useClipStore } from "../store/clipStore";
import { ImagePreview } from "./ImagePreview";
import { cn } from "../lib/utils";
import {
  Search,
  Trash2,
  Moon,
  Sun,
  Lock,
  Unlock,
  Pin,
  PinOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Image as ImageIcon,
  Code,
  Palette,
  File,
  RefreshCw,
  LucideIcon
} from "lucide-react";

// --- Types & Constants ---

// Redefine locally since it's not exported from store
interface ClipItem {
  id: number;
  content_type: string;
  preview: string;
  created_at: number;
  is_pinned: boolean;
  tags: string[];
  loading?: boolean;
}

interface FilterOption {
  label: string;
  icon: LucideIcon;
}

const FILTER_OPTIONS: FilterOption[] = [
    { label: "Text", icon: FileText },
    { label: "Html", icon: Code },
    { label: "Color", icon: Palette },
    { label: "Image", icon: ImageIcon },
    { label: "Files", icon: File },
];

/**
 * 顶部操作栏组件
 * 包含：搜索框、清空按钮、锁定按钮、主题切换
 */
const TopBar = memo(({ 
    searchQuery, 
    setSearchQuery, 
    onClearUnpinned, 
    keepWindowOpen, 
    onToggleKeepOpen, 
    isDarkMode, 
    onToggleTheme 
}: {
    searchQuery: string;
    setSearchQuery: (v: string) => void;
    onClearUnpinned: () => void;
    keepWindowOpen: boolean;
    onToggleKeepOpen: (v: boolean) => void;
    isDarkMode: boolean;
    onToggleTheme: () => void;
}) => {
    return (
        <div className="flex items-center gap-3 mb-3">
            {/* Search Input */}
            <div className={cn(
                "relative flex-1 flex items-center h-9 px-3 rounded-xl border transition-all",
                "bg-gray-50 border-gray-200 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500/50 focus-within:bg-white",
                "dark:bg-zinc-900/50 dark:border-zinc-800 dark:focus-within:ring-blue-500/20 dark:focus-within:bg-zinc-900"
            )}>
                <Search className="w-4 h-4 mr-2.5 text-gray-400 dark:text-zinc-500" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type to search..."
                    className="flex-1 w-full bg-transparent border-none outline-none text-sm placeholder:text-gray-400 dark:placeholder:text-zinc-600"
                />
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-1.5">
                <ActionButton 
                    onClick={onClearUnpinned} 
                    title="Clear unpinned"
                    className="hover:bg-red-50 text-red-500 hover:text-red-600 dark:hover:bg-red-900/20 dark:text-red-400/80 dark:hover:text-red-400"
                >
                    <Trash2 className="w-4.5 h-4.5" />
                </ActionButton>
                
                <ActionButton
                    onClick={() => onToggleKeepOpen(!keepWindowOpen)}
                    title={keepWindowOpen ? "Window Locked Open" : "Auto Close"}
                    active={keepWindowOpen}
                    activeClass="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                    inactiveClass="hover:bg-gray-100 text-gray-500 dark:hover:bg-zinc-800 dark:text-zinc-400"
                >
                    {keepWindowOpen ? <Lock className="w-4.5 h-4.5" /> : <Unlock className="w-4.5 h-4.5" />}
                </ActionButton>

                <ActionButton
                    onClick={onToggleTheme}
                    className="bg-gray-100/50 text-zinc-600 hover:bg-gray-200/80 dark:bg-zinc-800/50 dark:text-yellow-400/90 dark:hover:bg-zinc-800"
                >
                    {isDarkMode ? <Moon className="w-4.5 h-4.5" /> : <Sun className="w-4.5 h-4.5" />}
                </ActionButton>
            </div>
        </div>
    );
});

// Helper for icon buttons
const ActionButton = ({ onClick, title, className, active, activeClass, inactiveClass, children }: any) => (
    <button
        onClick={onClick}
        title={title}
        className={cn("p-2 rounded-lg transition-all", className, active ? activeClass : inactiveClass)}
    >
        {children}
    </button>
);

/**
 * 过滤器栏组件
 * 改为 Segmented Control (分段控制器) 风格，视觉更整体、更现代
 */
const FilterBar = memo(({ currentFilter, onSelectFilter }: { currentFilter: string, onSelectFilter: (f: string) => void }) => {
    return (
        <div className="flex overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className={cn(
                "flex items-center p-1 rounded-xl bg-gray-100/80 dark:bg-zinc-900/80 border border-gray-200/50 dark:border-zinc-800/50 backdrop-blur-sm"
            )}>
                <FilterChip 
                    label="All" 
                    active={currentFilter === ""} 
                    onClick={() => onSelectFilter("")} 
                />
                
                {/* 垂直分隔线 */}
                <div className="w-px h-4 bg-gray-200 dark:bg-zinc-800 mx-1 shrink-0" />

                {FILTER_OPTIONS.map((type) => (
                    <FilterChip 
                        key={type.label}
                        label={type.label}
                        icon={type.icon}
                        active={currentFilter === type.label}
                        onClick={() => onSelectFilter(type.label)}
                    />
                ))}
            </div>
        </div>
    );
});

const FilterChip = ({ label, icon: Icon, active, onClick }: { label: string, icon?: LucideIcon, active: boolean, onClick: () => void }) => (
    <button
        onClick={onClick}
        className={cn(
            "relative px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 outline-none select-none",
            active
                ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/50 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-700/50"
        )}
    >
        {Icon && <Icon className={cn("w-3.5 h-3.5", active ? "text-blue-500 dark:text-blue-400" : "opacity-70")} />}
        <span>{label}</span>
    </button>
);


/**
 * 单条剪贴板记录展示组件
 */
const ClipCard = memo(({ item, onPin, onDelete }: { item: ClipItem, onPin: (id: number) => void, onDelete: (id: number) => void }) => {
    return (
        <div className={cn(
            "group relative border rounded-2xl p-4 transition-all duration-300 ease-out",
            "bg-white border-gray-200/60 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08)] hover:border-gray-300",
            "dark:bg-zinc-900/40 dark:border-zinc-800 dark:shadow-none dark:hover:bg-zinc-900 dark:hover:border-zinc-700",
            item.is_pinned && "ring-1 ring-yellow-400/30 bg-yellow-50/50 dark:bg-yellow-900/5 dark:ring-yellow-500/20"
        )}>
            {/* Hover Actions */}
            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 scale-95 group-hover:scale-100 bg-transparent z-10">
                <button 
                    onClick={() => onPin(item.id)} 
                    disabled={item.loading}
                    className={cn(
                        "p-1.5 rounded-lg transition-colors shadow-sm",
                        item.is_pinned
                        ? "text-yellow-600 bg-yellow-100 hover:bg-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50"
                        : "bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50 border border-gray-100 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-700"
                    )}
                    title={item.is_pinned ? "Unpin" : "Pin"}
                >
                    {item.is_pinned ? <PinOff className="w-3.5 h-3.5 fill-current" /> : <Pin className="w-3.5 h-3.5" />}
                </button>
                <button 
                    onClick={() => onDelete(item.id)}
                    disabled={item.loading}
                    className="p-1.5 rounded-lg transition-colors shadow-sm bg-white text-gray-400 hover:text-red-500 hover:bg-red-50 border border-gray-100 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-zinc-700"
                    title="Delete"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="pr-14">
                {/* Meta Header */}
                <div className="flex items-center gap-2 mb-2 text-xs">
                    <span className="font-mono text-gray-400 dark:text-zinc-600">#{item.id}</span>
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
                        "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"
                    )}>
                        {item.content_type}
                    </span>
                    <span className="text-gray-400 dark:text-zinc-600 tabular-nums">
                        {new Date(item.created_at / 1000).toLocaleString(undefined, { 
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                        })}
                    </span>
                </div>
                
                {/* Content Body */}
                <ClipContentBody item={item} />
            </div>

            {/* Footer Tags */}
            {item.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-dashed border-gray-100 dark:border-zinc-800">
                    {item.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-100 dark:border-blue-500/10">
                            #{tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
});

const ClipContentBody = ({ item }: { item: ClipItem }) => {
    return (
        <div className="relative min-h-[28px] text-[15px] text-gray-700 dark:text-zinc-300">
            {item.content_type === "Color" && (
                <div className="flex items-center gap-4 p-3 rounded-lg border border-dashed border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50">
                    <div 
                        className="w-10 h-10 rounded-full shadow-sm ring-2 ring-white dark:ring-zinc-800" 
                        style={{ backgroundColor: item.preview }} 
                    />
                    <span className="font-mono text-sm font-medium">{item.preview}</span>
                </div>
            )}

            {item.loading ? (
                <div className="flex items-center gap-3 py-6 text-sm text-gray-400 dark:text-zinc-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processing content...</span>
                </div>
            ) : item.content_type === "Image" ? (
                <ImagePreview id={item.id} preview={item.preview} />
            ) : (
                <div className="line-clamp-6 font-mono text-[14px] leading-relaxed whitespace-pre-wrap break-all opacity-90">
                    {item.preview}
                </div>
            )}
        </div>
    );
}

/**
 * 空状态展示
 */
const EmptyState = ({ searchQuery }: { searchQuery: string }) => (
    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 dark:bg-zinc-800/50">
            <Search className="w-8 h-8 text-gray-400 dark:text-zinc-500" />
        </div>
        <p className="text-base font-medium text-gray-500 dark:text-zinc-400">
            {searchQuery.trim() ? "No matching results" : "Clipboard history is empty"}
        </p>
    </div>
);

/**
 * 底部翻页组件
 */
const PaginationFooter = memo(({ 
    searchQuery, 
    offset, 
    limit, 
    totalCount, 
    hasLoadingImages, 
    onSetOffset 
}: {
    searchQuery: string;
    offset: number;
    limit: number;
    totalCount: number;
    hasLoadingImages: boolean;
    onSetOffset: (o: number) => void;
}) => {
    if (searchQuery.trim()) return null; // 搜索时不显示分页

    return (
        <div className="flex justify-between items-center px-6 py-2 text-xs border-t bg-white border-gray-200 text-gray-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-500">
            <div className="flex items-center gap-2">
                 <button 
                    onClick={() => onSetOffset(Math.max(0, offset - limit))} 
                    disabled={offset === 0} 
                    className={cn("p-2 rounded-lg border transition-all",
                         offset === 0 
                            ? "opacity-30 cursor-not-allowed bg-gray-50 border-gray-100" 
                            : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800"
                    )}
                 >
                     <ChevronLeft className="w-4 h-4" />
                 </button>
                 <span className="font-medium min-w-[3ch] text-center text-sm">{Math.floor(offset / limit) + 1}</span>
                 <button 
                    onClick={() => onSetOffset(offset + limit)} 
                    disabled={offset + limit >= totalCount}
                    className={cn("p-2 rounded-lg border transition-all",
                        offset + limit >= totalCount
                            ? "opacity-30 cursor-not-allowed bg-gray-50 border-gray-100" 
                            : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800"
                    )}
                 >
                     <ChevronRight className="w-4 h-4" />
                 </button>
            </div>
            
            <div className="flex items-center gap-4">
                 <span className="flex items-center gap-2 text-sm font-medium opacity-80">
                    {hasLoadingImages ? (
                         <RefreshCw className="w-4 h-4 animate-spin text-amber-500" /> 
                    ) : ( 
                         <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" /> 
                    )}
                    {totalCount} items
                 </span>
            </div>
        </div>
    );
});


// --- Custom Hooks ---

function useTheme() {
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        const isDark = localStorage.theme === 'dark' || 
          (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
        setIsDarkMode(isDark);
        document.documentElement.classList.toggle('dark', isDark);
    }, []);

    const toggleTheme = () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        document.documentElement.classList.toggle('dark', newMode);
        localStorage.theme = newMode ? 'dark' : 'light';
    };

    return { isDarkMode, toggleTheme };
}

function useWindowKeeper() {
    const [keepWindowOpen, setKeepWindowOpen] = useState(false);
    
    const handleToggleKeepOpen = async (checked: boolean) => {
        setKeepWindowOpen(checked);
        try {
          await invoke('set_keep_window_open', { keep: checked });
        } catch (error) {
          console.error('❌ 设置窗口保持失败:', error);
        }
    };
    return { keepWindowOpen, handleToggleKeepOpen };
}

// --- Main Component ---

export default function DebugPage() {
  const store = useClipStore();
  
  // Local hooks
  const { isDarkMode, toggleTheme } = useTheme();
  const { keepWindowOpen, handleToggleKeepOpen } = useWindowKeeper();

  // Derived state
  const list = store.displayList();
  const hasLoadingImages = list.some(item => item.loading);

  // Effects
  useEffect(() => {
    store.fetchAllClips();
    store.fetchTotalCount();
  }, []);

  useEffect(() => {
    const cleanup = store.initListener();
    return () => {
      cleanup.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        invoke("toggle_window").catch(console.error);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleClearUnpinned = async () => {
    if (!confirm('确定要清空所有未置顶的记录吗？此操作不可撤销。')) return;
    try {
      const deleted = await invoke<number>('clear_unpinned_clips');
      alert(`已清空 ${deleted} 条未置顶记录`);
      store.fetchAllClips();
      store.fetchTotalCount();
    } catch (error) {
      console.error('❌ 清空失败:', error);
      alert('清空失败，请重试');
    }
  };

  return (
    <div className="font-sans text-sm h-screen overflow-hidden flex flex-col bg-gray-50 text-gray-900 transition-colors duration-300 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      
      {/* Header Area */}
      <div className="sticky top-0 z-20 px-6 py-3 backdrop-blur-xl shadow-sm bg-white/80 border-b border-gray-200/80 dark:bg-zinc-950/80 dark:border-zinc-800/80">
        <TopBar 
            searchQuery={store.searchQuery}
            setSearchQuery={store.setSearchQuery}
            onClearUnpinned={handleClearUnpinned}
            keepWindowOpen={keepWindowOpen}
            onToggleKeepOpen={handleToggleKeepOpen}
            isDarkMode={isDarkMode}
            onToggleTheme={toggleTheme}
        />
        <FilterBar 
            currentFilter={store.filterType}
            onSelectFilter={store.setFilterType}
        />
      </div>

      {/* Main Content Area */}
      <div className={cn(
          "flex-1 overflow-y-auto px-6 py-4",
          // Scrollbar styling
          "[&::-webkit-scrollbar]:w-2",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:bg-gray-200/50 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-300/80",
          "dark:[&::-webkit-scrollbar-thumb]:bg-zinc-800/50 dark:hover:[&::-webkit-scrollbar-thumb]:bg-zinc-700/80"
      )}>
        {list.length === 0 ? (
          <EmptyState searchQuery={store.searchQuery} />
        ) : (
          <div className="max-w-4xl mx-auto space-y-3">
            {list.map((item) => (
              <ClipCard 
                key={item.id} 
                item={item as ClipItem} 
                onPin={store.handlePin} 
                onDelete={store.handleDelete} 
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Area */}
      <PaginationFooter 
          searchQuery={store.searchQuery}
          offset={store.offset}
          limit={store.limit}
          totalCount={store.totalCount}
          hasLoadingImages={hasLoadingImages}
          onSetOffset={store.setOffset}
      />
    </div>
  );
}
