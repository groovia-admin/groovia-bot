"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { errorStyle } from "./settingsStyles";

export default function ShopLogoUpload({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/shop/logo", { method: "POST", body: formData });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to upload logo");
        toast(data.error || "Failed to upload logo", "error");
        return;
      }

      setLogoUrl(data.logo_url);
      toast("Shop logo updated");
    } catch {
      setError("Failed to upload logo. Please try again.");
      toast("Failed to upload logo", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 12,
          background: "#F7F8FA",
          border: "1px solid var(--surface-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Shop logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)" }}>No logo</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--surface-border)",
            background: "var(--surface-hover)",
            color: "var(--ink)",
            fontSize: "var(--text-base)",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            opacity: uploading ? 0.5 : 1,
            width: "fit-content",
          }}
        >
          <Upload size={14} />
          {uploading ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
        </button>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)", margin: 0 }}>JPEG, PNG, or WebP. Up to 5MB.</p>
        {error && <div style={{ ...errorStyle, padding: "6px 10px" }}>{error}</div>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
    </div>
  );
}
