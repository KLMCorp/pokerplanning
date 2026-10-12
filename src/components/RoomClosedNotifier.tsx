'use client';

/**
 * Notifie la fermeture de la room (PO parti, expiration) par un toast traduit
 * et ramène à l'accueil si l'utilisateur est sur une page de room.
 */

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSocket } from '@/contexts/SocketContext';
import { useToast } from './Toast';
import { getRoomClosedMessageKey } from '@/lib/roomEvents';

export default function RoomClosedNotifier(): null {
  const { roomClosedNotice, clearRoomClosedNotice } = useSocket();
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('room');

  useEffect(() => {
    if (!roomClosedNotice) return;

    showToast(t(getRoomClosedMessageKey(roomClosedNotice.reason)), 'error', 6000);
    if (pathname?.startsWith('/room/')) {
      router.push('/');
    }
    clearRoomClosedNotice();
  }, [roomClosedNotice, clearRoomClosedNotice, showToast, router, pathname, t]);

  return null;
}
