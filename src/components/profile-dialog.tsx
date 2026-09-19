"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, MapPin, Phone, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/chat-bits";
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
  const [phone, setPhone] = useState(me.phone ?? "");
  const [address, setAddress] = useState(me.address ?? "");
  const [city, setCity] = useState(me.city ?? "");
  const [state, setState] = useState(me.state ?? "");
  const [postalCode, setPostalCode] = useState(me.postalCode ?? "");
  const [country, setCountry] = useState(me.country ?? "");
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
      setPhone(me.phone ?? "");
      setAddress(me.address ?? "");
      setCity(me.city ?? "");
      setState(me.state ?? "");
      setPostalCode(me.postalCode ?? "");
      setCountry(me.country ?? "");
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
          phone: phone.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
          country: country.trim(),
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
      <DialogContent className="flex max-h-[92dvh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Your public profile — photo, name and personal info.</DialogDescription>
        </DialogHeader>

        <div className="nice-scroll flex-1 overflow-y-auto px-4 py-4 sm:px-5">
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
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="h-10" />
          </div>

          <div className="w-full space-y-1.5">
            <Label htmlFor="profile-bio">About</Label>
            <Input id="profile-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="About" className="h-10" />
          </div>

          {/* Personal info — clean section, no nested card masking */}
          <div className="w-full space-y-3 border-t border-border/70 pt-4 text-left">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MapPin className="size-3" /> Personal info
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="profile-address" className="text-xs">Address</Label>
              <Input id="profile-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Flat 204, Madhapur…" className="h-10 bg-card" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-city" className="text-xs">City / Province</Label>
                <Input id="profile-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hyderabad" className="h-10 bg-card" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-state" className="text-xs">State</Label>
                <Input id="profile-state" value={state} onChange={(e) => setState(e.target.value)} placeholder="Telangana" className="h-10 bg-card" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-postal" className="text-xs">Postal / ZIP</Label>
                <Input id="profile-postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="500081" className="h-10 bg-card" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-country" className="text-xs">Country</Label>
                <Input id="profile-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="India" className="h-10 bg-card" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone" className="flex items-center gap-1 text-xs">
                <Phone className="size-3" /> Phone
              </Label>
              <Input id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className="h-10 bg-card" />
            </div>
          </div>
        </div>
        </div>

        {/* Footer — actions pinned bottom-right like a professional dialog */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !name.trim()} className="gap-1.5">
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
