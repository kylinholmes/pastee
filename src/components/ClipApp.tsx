import React from "react";

const ClipApp: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="bg-background-light dark:bg-background-dark font-display min-h-screen flex items-center justify-center overflow-hidden">
      {/* 背景图片与模糊层 */}
      <div className="fixed inset-0 z-0">
        <img
          alt="Background Wallpaper"
          className="w-full h-full object-cover opacity-60 pointer-events-none"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuASSbZDExd5QTOmgEQf9MiPR6U4C2qBYyQ4XtlMhwW8UTUshqul1OfPIInmpZ91J7cLLnlBsC7Mt8L1RRTBLWmLcGOnVqV7hxGNaBvTvAk1mNUMiGoDifoUyyDJuvDHhr2ugox9jbysXo91X1UCmj42zLxQDm7YYQmTA8ADZ6sKEj1I0fi3yKE9HM08sV_IDXKqeuJemT9Wd4_kBV2VMnQp4S3eHKWrJ_0N-kWg2c837uXkE1XrdRjZoFkr0jiXz4Cn5nNn1G8AAqPO"
        />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"></div>
      </div>
      {/* 主窗口内容 */}
      <main className="relative z-10 w-full max-w-[420px] h-[750px] flex flex-col rounded-xl border border-white/10 shadow-2xl overflow-hidden acrylic-bg text-white ring-1 ring-black/50">
        {children}
      </main>
    </div>
  );
};

export default ClipApp;
