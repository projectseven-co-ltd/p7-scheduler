// src/lib/availability.mjs — Slot calculation engine

import { addMinutes, format, parseISO, getDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { db } from './noco.mjs';
import { tables } from './tables.mjs';

/**
 * Get available slots for an event type on a given date
 * @param {string} userId
 * @param {object} eventType - { duration_minutes, buffer_before, buffer_after, min_notice_minutes }
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {string} timezone - attendee's timezone
 */
export async function getSlots(userId, eventType, dateStr, timezone) {
  const duration = eventType.duration_minutes || 30;
  const bufferBefore = eventType.buffer_before || 0;
  const bufferAfter = eventType.buffer_after || 0;
  const minNotice = eventType.min_notice_minutes || 0;
  const totalBlock = duration + bufferBefore + bufferAfter;

  // Earliest allowed start time (now + min notice)
  const earliestStart = addMinutes(new Date(), minNotice);

  // Get availability rules for this user/day
  const dow = getDay(parseISO(`${dateStr}T00:00:00`)); // 0=Sun

  const availResult = await db.find(
    tables.availability,
    `(user_id,eq,${userId})~and(day_of_week,eq,${dow})`
  );

  if (!availResult.list?.length) return [];

  // Pre-fetch bookings and blocked times once (avoid N+1 per slot)
  const [bookingsRes, blockedRes] = await Promise.all([
    db.find(tables.bookings, `(user_id,eq,${userId})~and(status,eq,confirmed)`),
    db.find(tables.blocked_times, `(user_id,eq,${userId})`),
  ]);
  const bookings = bookingsRes.list || [];
  const blocked = blockedRes.list || [];

  const slots = [];

  for (const window of availResult.list) {
    const windowTz = window.timezone || 'UTC';
    const windowStart = fromZonedTime(parseISO(`${dateStr}T${window.start_time}:00`), windowTz);
    const windowEnd   = fromZonedTime(parseISO(`${dateStr}T${window.end_time}:00`), windowTz);

    let cursor = windowStart;
    while (addMinutes(cursor, totalBlock) <= windowEnd) {
      const slotStart = addMinutes(cursor, bufferBefore);
      const slotEnd   = addMinutes(slotStart, duration);
      const blockEnd  = addMinutes(cursor, totalBlock);

      // Skip slots that don't meet minimum notice requirement
      if (slotStart < earliestStart) {
        cursor = addMinutes(cursor, totalBlock);
        continue;
      }

      if (isSlotFree(slotStart, blockEnd, bookings, blocked)) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          start_local: format(toZonedTime(slotStart, timezone), "yyyy-MM-dd'T'HH:mm:ssxxx"),
          end_local:   format(toZonedTime(slotEnd,   timezone), "yyyy-MM-dd'T'HH:mm:ssxxx"),
        });
      }

      cursor = addMinutes(cursor, totalBlock);
    }
  }

  return slots;
}

function isSlotFree(start, end, bookings, blocked) {
  const startMs = start.getTime();
  const endMs   = end.getTime();

  for (const b of bookings) {
    const bStart = new Date(b.start_time).getTime();
    const bEnd   = new Date(b.end_time).getTime();
    if (bStart < endMs && bEnd > startMs) return false;
  }

  for (const b of blocked) {
    const bStart = new Date(b.start_time).getTime();
    const bEnd   = new Date(b.end_time).getTime();
    if (bStart < endMs && bEnd > startMs) return false;
  }

  return true;
}
