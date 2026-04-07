import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (input?: string) => void;
  title: string;
  message: string;
  type?: 'alert' | 'confirm' | 'prompt';
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  validationString?: string;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'confirm',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  validationString
}: ConfirmationModalProps) {
  const [inputValue, setInputValue] = useState('');
  
  // Reset input when modal opens
  useEffect(() => {
    if (isOpen) {
      setInputValue('');
    }
  }, [isOpen]);

  const isValid = !validationString || inputValue === validationString;

  const handleConfirm = () => {
    if (type === 'prompt' && !isValid) return;
    onConfirm(type === 'prompt' ? inputValue : undefined);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay" onClick={onClose}>
          <motion.div 
            className="modal-content"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px' }}
          >
            <div className="modal-header">
              <h3 className="modal-title">{title}</h3>
              <button className="modal-close" onClick={onClose}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="modal-message" style={{ marginBottom: type === 'prompt' ? '16px' : '0' }}>{message}</p>
              
              {type === 'prompt' && (
                <div style={{ marginTop: '16px' }}>
                  <input
                    type="text"
                    className={`form-input ${!isValid && inputValue ? 'error' : ''}`}
                    placeholder={validationString ? `Type '${validationString}' to confirm` : 'Enter value...'}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && isValid && handleConfirm()}
                  />
                  {validationString && inputValue && !isValid && (
                    <p className="error-msg">Please type {validationString} exactly as shown</p>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {type !== 'alert' && (
                <button className="btn btn-ghost" onClick={onClose}>{cancelText}</button>
              )}
              <button 
                className={`btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`} 
                onClick={handleConfirm}
                disabled={type === 'prompt' && !isValid}
                style={{ opacity: (type === 'prompt' && !isValid) ? 0.5 : 1 }}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
