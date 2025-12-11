"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";

type ImageDropzoneProps = {
  name: string;              // form field name (e.g. "logoFile" or "avatarFile")
  label: string;             // label text
  initialUrl?: string | null; // existing image URL (for edit mode)
};

export default function ImageDropzone({
  name,
  label,
  initialUrl = null,
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Solo se permiten imágenes (PNG, JPG, WEBP, etc.)");
      return;
    }

    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    handleFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0] ?? null;
    if (!file) return;

    // Mete el file en el input hidden, para que vaya en el FormData del server action
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputRef.current.files = dt.files;
    }

    handleFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-600">
        {label}
      </label>

      {/* Hidden real input – this is what the form / server action will read */}
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />

      {/* Dropzone / clickable area */}
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={[
          "flex items-center gap-3 rounded-md border border-dashed px-3 py-2 cursor-pointer transition",
          isDragging
            ? "border-purple-500 bg-purple-50"
            : "border-slate-300 bg-slate-50 hover:border-purple-400",
        ].join(" ")}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="preview"
            className="h-10 w-10 rounded-full object-cover border border-slate-200"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-600">
            +
          </div>
        )}

        <div className="flex flex-col">
          <span className="text-xs text-slate-700">
            Arrastra una imagen aquí o haz clic para seleccionar
          </span>
          <span className="text-[11px] text-slate-400">
            PNG, JPG o WEBP. Tamaño sugerido: 256x256px.
          </span>
          {fileName && (
            <span className="text-[11px] text-slate-500 mt-1">
              Archivo: {fileName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
