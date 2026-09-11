import type { SVGProps } from 'react';

const base = (d: string) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d={d} />
      </svg>
    );
  };

export const IconJournal = base('M4 5h16v14H4zM8 9h8M8 13h5');
export const IconChart = base('M3 3v18h18M7 15l4-6 4 4 5-8');
export const IconChat = base('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z');
export const IconUser = base('M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm-7 17a7 7 0 0 1 14 0');
export const IconPlus = base('M12 5v14M5 12h14');
export const IconLeft = base('M15 6l-6 6 6 6');
export const IconRight = base('M9 6l6 6-6 6');
export const IconClose = base('M6 6l12 12M18 6L6 18');
export const IconSearch = base('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4');
export const IconScan = base('M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10');
export const IconCamera = base('M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z');
export const IconSend = base('M22 2L11 13M22 2l-7 20-4-9-9-4z');
export const IconStar = base('M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z');
export const IconTrash = base('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13');
export const IconCopy = base('M8 8h12v12H8zM4 16V4h12');
export const IconCheck = base('M5 12l5 5L20 7');
export const IconDumbbell = base('M3 10v4M6 8v8M9 10h6M18 8v8M21 10v4M6 12h3M15 12h3');
export const IconBed = base('M3 18V8M3 12h18v6M7 12V9h6v3');
export const IconMore = base('M12 6h.01M12 12h.01M12 18h.01');
export const IconDownload = base('M12 4v12m0 0l-4-4m4 4l4-4M4 20h16');
export const IconUpload = base('M12 16V4m0 0L8 8m4-4l4 4M4 20h16');
export const IconBell = base('M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4');
export const IconKey = base('M14 4a6 6 0 1 0 4.5 10L22 10l-2-2-1 1-1-1 1-1-1-1a6 6 0 0 0-4-2zM8 16l-4 4');
export const IconEdit = base('M4 20h4l10-10-4-4L4 16zM13 7l4 4');
export const IconInfo = base('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01');
export const IconScale = base('M12 3v18M4 7h16M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0z');
