import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, HardDrive, Trash2, ImageIcon, RefreshCw, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { uploadStoreAsset } from "@/lib/imageUpload";

interface ImageUploaderProps {
  label?: string;
  description?: string;
  value: string;
  onChange: (url: string) => void;
  folder: "logos" | "products";
  storeId?: string;
  className?: string;
  aspectRatio?: "square" | "wide";
  onColorsExtracted?: (colors: { primary: string; accent: string } | null) => void;
}

export default function ImageUploader({
  label = "Imagem",
  description = "Formatos aceites: JPG, PNG, WEBP (Máx. 5MB)",
  value,
  onChange,
  folder,
  storeId,
  className = "",
  aspectRatio = "square",
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const processFile = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith("image/") && !/\.(jpg|jpeg|png|webp|gif)$/i.test(file.name)) {
      toast({
        title: "Ficheiro inválido",
        description: "Por favor selecione um ficheiro de imagem válido (JPG, PNG, WEBP).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Ficheiro demasiado grande",
        description: "O tamanho máximo permitido é de 5MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const url = await uploadStoreAsset(file, folder, storeId);
      onChange(url);
      toast({
        title: "Imagem selecionada com sucesso",
        description: `${file.name} foi carregada e processada.`,
      });
    } catch (err) {
      console.error("Erro no processamento da imagem:", err);
      toast({
        title: "Erro ao processar imagem",
        description: (err as Error).message || "Ocorreu um erro ao ler o ficheiro do disco.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const triggerSelect = () => {
    fileInputRef.current?.click();
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{label}</label>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        onChange={handleFileChange}
        className="hidden"
        disabled={uploading}
      />

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={triggerSelect}
        className={`group relative border-2 border-dashed rounded-xl p-4 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center gap-3 ${
          dragOver
            ? "border-primary bg-primary/5 scale-[0.99]"
            : value
            ? "border-border bg-card hover:border-primary/50"
            : "border-muted-foreground/25 bg-muted/20 hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        {value ? (
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="relative">
              <img
                src={value}
                alt="Pré-visualização"
                className={`rounded-lg object-contain border bg-background shadow-sm max-h-36 ${
                  aspectRatio === "wide" ? "w-full max-w-xs h-32" : "w-28 h-28"
                }`}
              />
              <div className="absolute -top-2 -right-2 flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7 rounded-full shadow-md hover:scale-105 transition-transform"
                  onClick={handleRemove}
                  title="Remover imagem"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                disabled={uploading}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerSelect();
                }}
              >
                {uploading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> A carregar...
                  </>
                ) : (
                  <>
                    <HardDrive className="h-3.5 w-3.5" /> Escolher outra imagem do disco
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-3 px-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              {uploading ? (
                <RefreshCw className="h-6 w-6 animate-spin" />
              ) : (
                <HardDrive className="h-6 w-6" />
              )}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {uploading ? "A carregar e processar imagem..." : "Clique para escolher imagem do disco duro"}
              </p>
              <p className="text-xs text-muted-foreground">
                Ou arraste e solte o ficheiro de imagem aqui
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={uploading}
              className="gap-2 mt-1 shadow-sm font-medium"
              onClick={(e) => {
                e.stopPropagation();
                triggerSelect();
              }}
            >
              <Upload className="h-4 w-4" /> Procurar no computador
            </Button>
          </div>
        )}
      </div>

      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
