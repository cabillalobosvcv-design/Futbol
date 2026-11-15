import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  or,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { markNotificationRead } from '../services/firestoreService';
import type { SigdNotification } from '../types/sigd';
import { useAuth } from './AuthContext';

export type NotificationCategory =
  | 'match_result'
  | 'schedule_published'
  | 'general';

export interface ToastNotification {
  id: string;
  notificationId?: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  category: NotificationCategory;
  entityType?: string;
  entityId?: string;
  createdAtMs: number;
}

interface NotificationContextValue {
  notifications: SigdNotification[];
  unreadNotifications: SigdNotification[];
  unreadCount: number;
  toasts: ToastNotification[];
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissToast: (toastId: string) => void;
  dismissAllToasts: () => void;
  pauseToastTimer: (toastId: string) => void;
  resumeToastTimer: (toastId: string) => void;
  pushLocalToast: (
    toast: Omit<ToastNotification, 'id' | 'createdAtMs'>
  ) => void;
}

const MAX_VISIBLE_TOASTS = 3;
const TOAST_AUTO_DISMISS_MS = 7000;

const NotificationContext = createContext<NotificationContextValue | null>(null);

function classifyNotificationCategory(
  notif: Pick<SigdNotification, 'entityType' | 'title'>
): NotificationCategory {
  if (
    notif.entityType === 'matches' ||
    notif.entityType === 'matchResults' ||
    /partido|acta|marcador|resultado/i.test(notif.title)
  ) {
    return 'match_result';
  }
  if (
    notif.entityType === 'categories' ||
    notif.entityType === 'tournaments' ||
    /roles publicados|calendario/i.test(notif.title)
  ) {
    return 'schedule_published';
  }
  return 'general';
}

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { firebaseUser, authReady } = useAuth();
  const [notifications, setNotifications] = useState<SigdNotification[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialLoadedUidRef = useRef<string | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const clearTimer = useCallback((toastId: string) => {
    const existing = timersRef.current.get(toastId);
    if (existing) {
      clearTimeout(existing);
      timersRef.current.delete(toastId);
    }
  }, []);

  const dismissToast = useCallback(
    (toastId: string) => {
      clearTimer(toastId);
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    },
    [clearTimer]
  );

  const dismissAllToasts = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const scheduleAutoDismiss = useCallback(
    (toastId: string, delayMs = TOAST_AUTO_DISMISS_MS) => {
      clearTimer(toastId);
      const timer = setTimeout(() => {
        dismissToast(toastId);
      }, delayMs);
      timersRef.current.set(toastId, timer);
    },
    [clearTimer, dismissToast]
  );

  const pauseToastTimer = useCallback(
    (toastId: string) => {
      clearTimer(toastId);
    },
    [clearTimer]
  );

  const resumeToastTimer = useCallback(
    (toastId: string) => {
      scheduleAutoDismiss(toastId, 4000);
    },
    [scheduleAutoDismiss]
  );

  const enqueueToast = useCallback(
    (toast: ToastNotification) => {
      setToasts((prev) => {
        if (prev.some((item) => item.id === toast.id)) return prev;
        const next = [toast, ...prev];
        if (next.length > MAX_VISIBLE_TOASTS) {
          const evicted = next.slice(MAX_VISIBLE_TOASTS);
          evicted.forEach((item) => clearTimer(item.id));
          return next.slice(0, MAX_VISIBLE_TOASTS);
        }
        return next;
      });
      scheduleAutoDismiss(toast.id);
    },
    [clearTimer, scheduleAutoDismiss]
  );

  const pushLocalToast = useCallback(
    (toast: Omit<ToastNotification, 'id' | 'createdAtMs'>) => {
      const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      enqueueToast({
        ...toast,
        id,
        createdAtMs: Date.now(),
      });
    },
    [enqueueToast]
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setNotifications([]);
      seenIdsRef.current.clear();
      initialLoadedUidRef.current = null;
      dismissAllToasts();
      return;
    }

    const activeUid = firebaseUser.uid;
    seenIdsRef.current.clear();
    initialLoadedUidRef.current = null;
    dismissAllToasts();

    const notifQuery = query(
      collection(db, 'notifications'),
      or(
        where('recipientUid', '==', activeUid),
        where('isBroadcast', '==', true)
      )
    );

    const unsubscribe = onSnapshot(
      notifQuery,
      (snap) => {
        const items = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as SigdNotification
        );
        items.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
        setNotifications(items);

        // Skip toasts for historical notifications on initial subscription load
        if (initialLoadedUidRef.current !== activeUid) {
          items.forEach((item) => seenIdsRef.current.add(item.id));
          initialLoadedUidRef.current = activeUid;
          return;
        }

        // Trigger real-time toast popups only for newly arrived unread notifications
        for (const change of snap.docChanges()) {
          if (change.type !== 'added') continue;
          const notif = {
            id: change.doc.id,
            ...change.doc.data(),
          } as SigdNotification;

          if (seenIdsRef.current.has(notif.id)) continue;
          seenIdsRef.current.add(notif.id);

          if (notif.readBy?.includes(activeUid)) continue;

          const category = classifyNotificationCategory(notif);
          enqueueToast({
            id: notif.id,
            notificationId: notif.id,
            title: notif.title,
            message: notif.message,
            type: notif.type,
            category,
            entityType: notif.entityType,
            entityId: notif.entityId,
            createdAtMs: notif.createdAt?.toMillis?.() || Date.now(),
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubscribe();
    };
  }, [authReady, firebaseUser, dismissAllToasts, enqueueToast]);

  const unreadNotifications = useMemo(() => {
    if (!firebaseUser) return [];
    return notifications.filter((n) => !n.readBy?.includes(firebaseUser.uid));
  }, [notifications, firebaseUser]);

  const unreadCount = unreadNotifications.length;

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!firebaseUser) return;
      dismissToast(notificationId);
      await markNotificationRead(notificationId, firebaseUser.uid);
    },
    [firebaseUser, dismissToast]
  );

  const markAllAsRead = useCallback(async () => {
    if (!firebaseUser || unreadNotifications.length === 0) return;
    const uid = firebaseUser.uid;
    try {
      const chunkSize = 400;
      for (let i = 0; i < unreadNotifications.length; i += chunkSize) {
        const chunk = unreadNotifications.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const notif of chunk) {
          batch.update(doc(db, 'notifications', notif.id), {
            readBy: arrayUnion(uid),
          });
        }
        await batch.commit();
      }
      dismissAllToasts();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications');
    }
  }, [firebaseUser, unreadNotifications, dismissAllToasts]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadNotifications,
      unreadCount,
      toasts,
      markAsRead,
      markAllAsRead,
      dismissToast,
      dismissAllToasts,
      pauseToastTimer,
      resumeToastTimer,
      pushLocalToast,
    }),
    [
      notifications,
      unreadNotifications,
      unreadCount,
      toasts,
      markAsRead,
      markAllAsRead,
      dismissToast,
      dismissAllToasts,
      pauseToastTimer,
      resumeToastTimer,
      pushLocalToast,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      'useNotifications debe utilizarse dentro de NotificationProvider'
    );
  }
  return ctx;
}
