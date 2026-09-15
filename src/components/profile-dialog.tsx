"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/chat-bits";
import { ConnectionStatus } from "@/components/connection-status";
import { ModeToggle, ThemeMenu } from "@/components/theme-toggle";
import { AVATAR_COLORS, AVATAR_EMOJIS, cn } from "@/lib/utils";
import type { UserRow } from "@/lib/types";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  me: UserRow;
  onSaved: (user: UserRow) => void;
}

export function ProfileDialog({ open, onOpenChange, me, onSaved }: ProfileDialogProps) {
  const [name, setName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio);
  const [emoji, setEmoji] = useState(me.avatarEmoji);
  const [color, setColor] = useState(me.avatarColor);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatarUrl ?? null);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setName(me.displayName);
      setBio(me.bio);
      setEmoji(me.avatarEmoji);
      setColor(me.avatarColor);
      setAvatarUrl(me.avatarUrl ?? null);
    }
  }, [open, me]);

  const handlePhotoUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (PNG, JPG, WebP)");
      return;
    }

    setUploadingPic(true);
    try {
      // 1. Try uploading to storage API
      const formData = new FormData();
      formData.append("file", file);
      formData.append("conversationId", "profiles");

      let photoUrl: string | null = null;
      try {
        const res = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok && data?.url) {
          photoUrl = data.url;
        }
      } catch {
        // Fallback to base64 data URL if upload route fails (e.g. read-only filesystem or missing storage bucket)
      }

      // If server upload failed, generate an inline data URL so photo ALWAYS works!
      if (!photoUrl) {
        photoUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      setAvatarUrl(photoUrl);
      toast.success("Photo selected! Click 'Save changes' to apply.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to process photo");
    } finally {
      setUploadingPic(false);
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/users/${me.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name.trim(),
          bio,
          avatarEmoji: emoji,
          avatarColor: color,
          avatarUrl,
        }),
      });
      const j = await r.json();
      if (j.user) {
        onSaved(j.user);
        toast.success("Profile updated successfully!");
        onOpenChange(false);
      } else {
        throw new Error(j.error || "Save failed");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Customise your photo, name and avatar.</DialogDescription>
        </DialogHeader>

        {/* Appearance quick settings (dark/light + color presets) */}
        <div className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium text-muted-foreground">Appearance</span>
          <div className="flex items-center gap-1">
            <ModeToggle />
            <ThemeMenu />
          </div>
        </div>

        <div className="flex flex-col items-center gap-3.5 w-full">
          {/* Avatar with Photo Upload Button */}
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <UserAvatar
              emoji={emoji}
              color={color}
              avatarUrl={avatarUrl}
              name={name}
              size={96}
              ring
              className="shadow-md"
            />
            {/* Upload Button Overlay */}
            <div
              className={cn(
                "absolute inset-0 rounded-full bg-black/45 text-white flex flex-col items-center justify-center transition-opacity",
                uploadingPic ? "opacity-100" : "opacity-0 group-hover:opacity-100 active:opacity-100"
              )}
              title="Upload profile photo"
            >
              {uploadingPic ? (
                <Loader2 className="size-6 animate-spin text-white" />
              ) : (
                <>
                  <Camera className="size-6 text-white" />
                  <span className="text-[10px] font-semibold mt-0.5 text-white">Change</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePhotoUpload(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* Upload and Clear photo buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 rounded-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPic}
            >
              <Upload className="size-3.5" />
              <span>{avatarUrl ? "Change Photo" : "Upload Photo"}</span>
            </Button>
            {avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-destructive rounded-full"
                onClick={() => {
                  setAvatarUrl(null);
                  toast.info("Switched back to emoji avatar. Click Save changes to apply.");
                }}
              >
                Remove Photo
              </Button>
            )}
          </div>

          {(me.email || me.supabaseId) && (
            <div className="flex flex-col items-center gap-1">
              {me.email && <span className="text-xs text-muted-foreground truncate max-w-[260px]">{me.email}</span>}
              {me.supabaseId && <Badge variant="success" className="text-[10px] py-0">Supabase Auth linked</Badge>}
            </div>
          )}

          {/* Emoji Avatar Picker (shown as fallback or alternative) */}
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">
                {avatarUrl ? "Fallback Avatar Emoji" : "Choose Avatar Emoji"}
              </Label>
              {avatarUrl && (
                <span className="text-[11px] text-muted-foreground italic">(used if photo is removed)</span>
              )}
            </div>
            <div className="max-h-32 min-h-28 overflow-y-auto no-scrollbar rounded-xl border border-border bg-muted/30 p-2">
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                {AVATAR_EMOJIS.map((e) => (
                  <Button
                    key={e}
                    variant={emoji === e ? "secondary" : "ghost"}
                    size="icon"
                    className={cn(
                      "size-10 sm:size-11 text-2xl rounded-xl transition-all",
                      emoji === e ? "bg-primary/20 scale-110 shadow-xs border border-primary/40" : "hover:bg-muted/60 active:scale-95"
                    )}
                    onClick={() => setEmoji(e)}
                    aria-label={`Avatar ${e}`}
                  >
                    {e}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Color palette */}
          <div className="w-full space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Accent Color</Label>
            <div className="flex flex-wrap justify-center gap-2.5 p-1 rounded-xl bg-muted/20 border border-border/50" role="radiogroup" aria-label="Avatar color">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-7 rounded-full transition-transform hover:scale-110 active:scale-95",
                    color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-card scale-110 shadow-sm" : "opacity-80 hover:opacity-100"
                  )}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="w-full space-y-1.5">
            <Label htmlFor="profile-name">Display name</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>

          <div className="w-full space-y-1.5">
            <Label htmlFor="profile-bio">About</Label>
            <Input id="profile-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="About" />
          </div>

          <Button onClick={save} disabled={saving || !name.trim()} className="w-full mt-1">
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "Saving…" : "Save changes"}
          </Button>

          <div className="w-full space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connections</p>
            <ConnectionStatus />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
