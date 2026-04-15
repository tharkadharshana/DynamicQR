import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
<<<<<<< HEAD
=======
import ConfirmationModal from '../components/ConfirmationModal';
import ToastContainer from '../components/ToastContainer';
>>>>>>> ab398943b2bb0b7cc73fb004455863abb1874e97

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
<<<<<<< HEAD
      {/* Modals and Toasts will be rendered in a Container component included in Layout */}
      <div id="ui-portal-root">
        {/* We'll pass state to a specialized container or render directly if it's easier */}
      </div>
      {/* 
          Wait, I'll pass the state down or expose it to a component that uses this context.
          Actually, I'll export a hook and the provider. 
      */}
=======
>>>>>>> ab398943b2bb0b7cc73fb004455863abb1874e97
      <InternalUIComponents modal={modal} toasts={toasts} onCloseModal={closeModal} removeToast={removeToast} />
    </UIContext.Provider>
  );
}

<<<<<<< HEAD
// Internal component to render the actual UI elements to avoid re-rendering the whole context on every toast change
import ConfirmationModal from '../components/ConfirmationModal';
import ToastContainer from '../components/ToastContainer';

=======
>>>>>>> ab398943b2bb0b7cc73fb004455863abb1874e97
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
