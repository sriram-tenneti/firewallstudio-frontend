import { useState, useCallback } from 'react';

export interface NotificationState {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export function useNotification(timeout = 4000) {
  const [notification, setNotification] = useState<NotificationState | null>(null);

  const showNotification = useCallback((message: string, type: NotificationState['type'] = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), timeout);
  }, [timeout]);

  const clearNotification = useCallback(() => setNotification(null), []);

  return { notification, showNotification, clearNotification };
}
