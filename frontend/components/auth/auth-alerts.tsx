// components/auth/auth-alerts.tsx
"use client";

import { CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface AlertProps {
  message: string;
  duration?: number;
  onClose?: () => void;
}

export function AuthLoadingAlert({ message, onClose }: AlertProps) {
  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
      <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 min-w-[320px] backdrop-blur-sm border border-white/20">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
}

export function AuthSuccessAlert({ message, duration = 3000, onClose }: AlertProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
      <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 min-w-[320px] backdrop-blur-sm border border-white/20">
        <div className="flex-shrink-0">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-medium">{message}</p>
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            onClose?.();
          }}
          className="flex-shrink-0 hover:bg-white/20 rounded p-1 transition-colors"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AuthErrorAlert({ message, duration = 5000, onClose }: AlertProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
      <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 min-w-[320px] max-w-md backdrop-blur-sm border border-white/20">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-medium">{message}</p>
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            onClose?.();
          }}
          className="flex-shrink-0 hover:bg-white/20 rounded p-1 transition-colors"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Toast manager hook
export function useAuthToast() {
  const [alerts, setAlerts] = useState<Array<{ id: string; type: string; message: string }>>([]);

  const showLoading = (message: string) => {
    const id = Date.now().toString();
    setAlerts((prev) => [...prev, { id, type: "loading", message }]);
    return id;
  };

  const showSuccess = (message: string) => {
    const id = Date.now().toString();
    setAlerts((prev) => [...prev, { id, type: "success", message }]);
    setTimeout(() => dismissAlert(id), 3000);
  };

  const showError = (message: string) => {
    const id = Date.now().toString();
    setAlerts((prev) => [...prev, { id, type: "error", message }]);
    setTimeout(() => dismissAlert(id), 5000);
  };

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  };

  const AlertContainer = () => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {alerts.map((alert) => {
        if (alert.type === "loading") {
          return (
            <AuthLoadingAlert
              key={alert.id}
              message={alert.message}
              onClose={() => dismissAlert(alert.id)}
            />
          );
        }
        if (alert.type === "success") {
          return (
            <AuthSuccessAlert
              key={alert.id}
              message={alert.message}
              onClose={() => dismissAlert(alert.id)}
            />
          );
        }
        if (alert.type === "error") {
          return (
            <AuthErrorAlert
              key={alert.id}
              message={alert.message}
              onClose={() => dismissAlert(alert.id)}
            />
          );
        }
        return null;
      })}
    </div>
  );

  return { showLoading, showSuccess, showError, dismissAlert, AlertContainer };
}