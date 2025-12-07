// app/room/page.tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { ReservationsBoard } from './ReservationsBoard';

export default function RoomPage() {
  const searchParams = useSearchParams();
  const adminKey = searchParams.get('admin_key') ?? '';

  return <ReservationsBoard adminKey={adminKey} />;
}
