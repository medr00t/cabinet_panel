import React from 'react';
import { useToast } from '../contexts/ToastContext';

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  const getToastStyles = (type: string) => {
    const baseStyles = {
      padding: '12px 16px',
      borderRadius: '8px',
      marginBottom: '8px',
      minWidth: '300px',
      maxWidth: '400px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      border: '1px solid transparent',
      fontSize: '14px',
      fontWeight: '500',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      animation: 'slideIn 0.3s ease-out forwards',
      cursor: 'pointer',
    };

    const typeStyles = {
      success: {
        background: '#f0f9ff',
        color: '#166534',
        borderColor: '#bbf7d0',
      },
      error: {
        background: '#fef2f2',
        color: '#dc2626',
        borderColor: '#fecaca',
      },
      warning: {
        background: '#fffbeb',
        color: '#d97706',
        borderColor: '#fed7aa',
      },
      info: {
        background: '#f0f9ff',
        color: '#2563eb',
        borderColor: '#bfdbfe',
      },
    };

    return { ...baseStyles, ...typeStyles[type as keyof typeof typeStyles] };
  };

  if (toasts.length === 0) {
    return null;
  }

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
        
        .toast-exit {
          animation: slideOut 0.3s ease-in forwards;
        }
      `}</style>
      
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          pointerEvents: 'auto',
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={getToastStyles(toast.type)}
            onClick={() => removeToast(toast.id)}
          >
           
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600', marginBottom: '2px' }}>
                {toast.title}
              </div>
              {toast.message && (
                <div style={{ 
                  fontWeight: '400', 
                  fontSize: '13px',
                  opacity: 0.9,
                  lineHeight: '1.4'
                }}>
                  {toast.message}
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: '0',
                fontSize: '16px',
                opacity: 0.7,
                lineHeight: '1',
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
};

export default ToastContainer;