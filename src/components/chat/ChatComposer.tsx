import { memo, useState, useRef, useEffect } from 'react';
import type { ChangeEvent, FormEvent, RefObject } from 'react';
import { X, Mic, Paperclip, Camera, Send } from 'lucide-react';

export type PendingChatAttachment = {
  id: string;
  file: File;
  messageType: string;
  previewUrl: string | null;
  label: string;
  sizeLabel: string;
};

interface ChatComposerProps {
  disabled: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  pendingAttachments: PendingChatAttachment[];
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onPasteFiles: (files: File[]) => void;
  onRemovePendingAttachment: (id: string) => void;
  onCaptureScreenshot: () => void;
  onStartRecording: () => void;
  onSendMessage: (message: string) => Promise<void> | void;
}

const ChatComposer = memo(function ChatComposer({
  disabled,
  fileInputRef,
  pendingAttachments,
  onFileUpload,
  onPasteFiles,
  onRemovePendingAttachment,
  onCaptureScreenshot,
  onStartRecording,
  onSendMessage,
}: ChatComposerProps) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = (draft.trim().length > 0 || pendingAttachments.length > 0) && !disabled;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [draft]);

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;

    const messageText = draft;
    setDraft('');
    void onSendMessage(messageText);
  };

  return (
    <div className="space-y-2">
      {pendingAttachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto rounded-lg bg-[#111b21] px-3 py-2">
          {pendingAttachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative flex w-28 shrink-0 flex-col gap-1 overflow-hidden rounded-lg bg-[#202c33] p-2"
            >
              <button
                type="button"
                aria-label="Remover anexo"
                onClick={() => onRemovePendingAttachment(attachment.id)}
                className="absolute right-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-slate-950/80 text-slate-200 transition-colors hover:bg-rose-500 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>

              <div className="grid h-16 place-items-center overflow-hidden rounded-md bg-[#111b21]">
                {attachment.messageType === 'image' && attachment.previewUrl ? (
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.label}
                    className="h-full w-full object-cover"
                  />
                ) : attachment.messageType === 'video' && attachment.previewUrl ? (
                  <video src={attachment.previewUrl} className="h-full w-full object-cover" muted />
                ) : attachment.messageType === 'audio' ? (
                  <Mic className="h-5 w-5 text-emerald-300" />
                ) : (
                  <Paperclip className="h-5 w-5 text-slate-300" />
                )}
              </div>

              <span className="truncate text-[10px] font-medium text-slate-200" title={attachment.label}>
                {attachment.label}
              </span>
              <span className="text-[9px] text-slate-500">{attachment.sizeLabel}</span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-none">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileUpload}
        accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
        multiple
      />

      <div className="flex items-center gap-1 shrink-0 pb-1">
        <button
          type="button"
          aria-label="Anexar arquivos"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="grid h-10 w-10 place-items-center rounded-full text-slate-300 transition-colors hover:bg-white/8 hover:text-[#00a884] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <button
          type="button"
          aria-label="Preparar captura de tela"
          onClick={onCaptureScreenshot}
          disabled={disabled}
          className="hidden sm:grid h-10 w-10 place-items-center rounded-full text-slate-300 transition-colors hover:bg-white/8 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Camera className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-w-0 rounded-lg bg-[#2a3942] px-4 py-2 focus-within:ring-1 focus-within:ring-[#00a884]/35">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={(event) => {
            if (disabled) return;
            const clipboardFiles = Array.from(event.clipboardData?.files || []);
            const pastedFiles = clipboardFiles.length
              ? clipboardFiles
              : Array.from(event.clipboardData?.items || [])
                  .filter((item) => item.kind === 'file')
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => !!file);

            if (!pastedFiles.length) return;

            event.preventDefault();
            onPasteFiles(pastedFiles);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={pendingAttachments.length > 0 ? 'Adicione uma legenda ou envie o anexo' : 'Digite uma mensagem'}
          disabled={disabled}
          rows={1}
          className="block max-h-[120px] min-h-[24px] w-full resize-none bg-transparent text-[15px] leading-6 text-slate-100 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {canSend ? (
        <button
          type="submit"
          aria-label="Enviar mensagem"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#111b21] transition-colors hover:bg-[#06cf9c]"
        >
          <Send className="w-4 h-4" />
        </button>
      ) : !disabled ? (
        <button
          type="button"
          aria-label="Gravar áudio"
          onClick={onStartRecording}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#111b21] transition-colors hover:bg-[#06cf9c]"
        >
          <Mic className="w-5 h-5" />
        </button>
      ) : null}
      </form>
    </div>
  );
});

export default ChatComposer;
