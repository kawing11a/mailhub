'use client';

import { useState } from 'react';
import { Download, CheckCircle2, MonitorSmartphone, Info, X } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

interface InstallPWAButtonProps {
  variant?: 'sidebar' | 'banner' | 'settings';
}

export function InstallPWAButton({ variant = 'sidebar' }: InstallPWAButtonProps) {
  const { isInstallable, isInstalled, installPWA } = usePWAInstall();
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const success = await installPWA();
      if (!success) {
        setShowInstructionsModal(true);
      }
    } else {
      setShowInstructionsModal(true);
    }
  };

  return (
    <>
      {variant === 'sidebar' && (
        <button
          onClick={handleClick}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-xs font-semibold text-accent-700 bg-accent-50 hover:bg-accent-100 border border-accent-200 rounded-md transition-colors shadow-sm"
          title="Install MailHub as Desktop/Mobile App"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install MailHub App</span>
        </button>
      )}

      {variant === 'banner' && (
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-accent-600 to-indigo-600 text-white rounded-lg shadow-md mb-4">
          <div className="flex items-center space-x-3">
            <MonitorSmartphone className="w-5 h-5 text-accent-200" />
            <div>
              <p className="text-sm font-semibold">Install MailHub Desktop App</p>
              <p className="text-xs text-accent-100">Get quick access, standalone window, and offline support.</p>
            </div>
          </div>
          <button
            onClick={handleClick}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white text-accent-700 hover:bg-accent-50 rounded-md text-xs font-bold transition-all shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>
        </div>
      )}

      {variant === 'settings' && (
        <button
          onClick={handleClick}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>Install MailHub App</span>
        </button>
      )}

      {/* Manual Instructions Modal when native browser prompt is unavailable */}
      {showInstructionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 relative">
            <button
              onClick={() => setShowInstructionsModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2 text-accent-600">
              <Info className="w-6 h-6" />
              <h3 className="text-lg font-bold text-gray-900">How to Install MailHub</h3>
            </div>

            <div className="text-sm text-gray-600 space-y-3">
              <p>Follow these quick steps to install MailHub in your browser:</p>
              
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                <p className="font-semibold text-gray-800">Chrome / Edge (Desktop)</p>
                <p className="text-xs text-gray-600">
                  Look at the right side of your address bar and click the <span className="font-semibold text-gray-800">Install MailHub</span> icon or open menu (<span className="font-bold">⋮</span>) → <span className="font-semibold">Install MailHub</span>.
                </p>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                <p className="font-semibold text-gray-800">iOS Safari</p>
                <p className="text-xs text-gray-600">
                  Tap the <span className="font-semibold text-gray-800">Share</span> button at the bottom → scroll down and tap <span className="font-semibold text-gray-800">Add to Home Screen</span>.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowInstructionsModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-md transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
