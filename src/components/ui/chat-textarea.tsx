"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChatTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Smallest height in px when empty (default 26 — one line) */
  minHeight?: number;
  /** Tallest it may auto-grow to before scrolling (default 130) */
  maxHeight?: number;
}

const ChatTextarea = React.forwardRef<HTMLTextAreaElement, ChatTextareaProps>(
  ({ className, onChange, value, minHeight = 26, maxHeight = 130, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const adjustHeight = () => {
      const textarea = innerRef.current;
      if (!textarea) return;
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${Math.max(newHeight, minHeight)}px`;
    };

    React.useEffect(() => {
      adjustHeight();
    }, [value]);

    return (
      <textarea
        ref={(el) => {
          innerRef.current = el;
          if (typeof ref === "function") {
            ref(el);
          } else if (ref) {
            ref.current = el;
          }
        }}
        rows={1}
        value={value}
        onChange={(e) => {
          adjustHeight();
          onChange?.(e);
        }}
        className={cn(
          "w-full resize-none overflow-y-auto bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground",
          "nice-scroll",
          className
        )}
        style={{ maxHeight: `${maxHeight}px`, minHeight: `${minHeight}px` }}
        {...props}
      />
    );
  }
);
ChatTextarea.displayName = "ChatTextarea";

export { ChatTextarea };
