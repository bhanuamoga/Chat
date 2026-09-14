"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChatTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const ChatTextarea = React.forwardRef<HTMLTextAreaElement, ChatTextareaProps>(
  ({ className, onChange, value, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const adjustHeight = () => {
      const textarea = innerRef.current;
      if (!textarea) return;
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 130);
      textarea.style.height = `${Math.max(newHeight, 26)}px`;
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
        style={{ maxHeight: "130px", minHeight: "26px" }}
        {...props}
      />
    );
  }
);
ChatTextarea.displayName = "ChatTextarea";

export { ChatTextarea };
