import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ConfirmationModal from '../components/ConfirmationModal';
import ToastContainer from '../components/ToastContainer';

type ModalType = 'alert' | 'confirm' | 'prompt';

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  validationString?: string;
  onConfirm: (input?: string) => void;
  onCancel?: () => void;
}

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface UIContextType {
  showModal: (options: Omit<ModalState, 'isOpen'>) => void;
  closeModal: () => void;
  showToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [toasts, setToasts] = useState<Toast[]>([]);

  const showModal = useCallback((options: Omit<ModalState, 'isOpen'>) => {
    setModal({ ...options, isOpen: true });
  }, []);

  const closeModal = useCallback(() => {
    setModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <UIContext.Provider value={{ showModal, closeModal, showToast, removeToast }}>
      {children}
      <InternalUIComponents modal={modal} toasts={toasts} onCloseModal={closeModal} removeToast={removeToast} />
    </UIContext.Provider>
  );
}

function InternalUIComponents({ 
  modal, 
  toasts, 
  onCloseModal, 
  removeToast 
}: { 
  modal: ModalState; 
  toasts: Toast[]; 
  onCloseModal: () => void;
  removeToast: (id: string) => void;
}) {
  return (
    <>
      <ConfirmationModal 
        isOpen={modal.isOpen}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        isDestructive={modal.isDestructive}
        validationString={modal.validationString}
        onConfirm={modal.onConfirm}
        onClose={onCloseModal}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}
