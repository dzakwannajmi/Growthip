"use client";
import { useState, useEffect } from "react";

interface ModalProps {
  show: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function Modal({ show, onClose, children, maxWidth = "480px" }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (show) {
      setMounted(true);
      setClosing(false);
    } else if (mounted && !closing) {
      // show changed to false (e.g. X button called onClose) — play close animation
      setClosing(true);
      setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 280);
    }
  }, [show]);

  function handleBackdropClick() {
    // Backdrop click: tell parent first, animation triggered by useEffect above
    onClose();
  }

  if (!mounted) return null;

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        zIndex: 1000, display: "flex", alignItems: "center",
        justifyContent: "center", padding: "20px",
        animation: closing ? "fadeOut 0.28s ease forwards" : "fadeIn 0.2s ease",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes bounceIn {
          0% { transform: scale(0.82) translateY(24px); opacity: 0; }
          60% { transform: scale(1.04) translateY(-4px); opacity: 1; }
          80% { transform: scale(0.98) translateY(2px); }
          100% { transform: scale(1) translateY(0); }
        }
        @keyframes bounceOut {
          0% { transform: scale(1) translateY(0); opacity: 1; }
          30% { transform: scale(1.04) translateY(-4px); }
          100% { transform: scale(0.82) translateY(24px); opacity: 0; }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white", borderRadius: "20px",
          width: "100%", maxWidth, padding: "24px",
          maxHeight: "85vh", overflowY: "auto",
          animation: closing
            ? "bounceOut 0.28s cubic-bezier(0.36,0,0.66,0) forwards"
            : "bounceIn 0.4s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
