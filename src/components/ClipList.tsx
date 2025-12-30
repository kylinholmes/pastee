import React from "react";
import ClipItem, { ClipItemData } from "./ClipItem";

export interface ClipGroup {
  title: string;
  icon: string;
  items: ClipItemData[];
}

const ClipList: React.FC<{ groups: ClipGroup[] }> = ({ groups }) => {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-1">
      {groups.map((group) => (
        <div key={group.title} className="pt-2">
          <h3 className="flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest sticky top-0 backdrop-blur-md z-20 rounded-lg mb-1">
            <span className="material-symbols-outlined text-[14px] fill-1 text-primary">{group.icon}</span>
            {group.title}
          </h3>
          <div className="space-y-1">
            {group.items.map((item, idx) => (
              <ClipItem key={idx} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ClipList;
