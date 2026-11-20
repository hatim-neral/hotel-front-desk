import { useState } from 'react';
import type { Guest, Room, Settings } from '../types';
import { newId, saveGuest, updateRoom } from '../storage';
import { findRoom, rateFor, roomViews, typeLabel } from '../rooms';
import { gstRateFor, nowTime, rupees, todayStr } from '../utils';
import { Field, Segmented } from './ui';

// Shift an in-house guest to another room. The move is kept in the stay's room movement record,
// and the old room goes to housekeeping.
export default function RoomChange({
  guest: g, guests, rooms, settings, onDone, onCancel,
}: {
  guest: Guest;
  guests: Guest[];
  rooms: Room[];
  settings: Settings;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [rateChoice, setRateChoice] = useState<'Keep current rate' | 'New room rate'>('Keep current rate');
  const [tried, setTried] = useState(false);

  const free = roomViews(rooms, guests).filter((v) => !v.guest && v.state !== 'out-of-order');
  const room = findRoom(rooms, to);
  const newRate = room ? rateFor(settings, room.type) : '';
  const rateDiffers = !!newRate && Number(newRate) !== Number(g.ratePerNight);
  const occupant = guests.find((x) => x.status === 'in' && x.id !== g.id && x.roomNumber.toLowerCase() === to.trim().toLowerCase());
  const error = !to.trim()
    ? 'Enter the new room number'
    : to.trim().toLowerCase() === g.roomNumber.toLowerCase()
      ? 'The guest is already in this room'
      : !room
        ? `Room ${to.trim()} is not in your room list`
        : room.housekeeping === 'out-of-order'
          ? 'This room is marked out of order'
          : occupant
            ? `Room is occupied by ${occupant.fullName}`
            : '';

  const save = async () => {
    setTried(true);
    if (error || !room) return;
    const ratePerNight = rateDiffers && rateChoice === 'New room rate' ? newRate : g.ratePerNight;
    await saveGuest({
      ...g,
      roomNumber: room.number,
      roomType: room.type,
      ratePerNight,
      gstRate: g.gstRoomOnly ? gstRateFor(settings, ratePerNight) : g.gstRate,
      roomMoves: [
        ...g.roomMoves,
        { id: newId(), date: todayStr(), time: nowTime(), from: g.roomNumber, to: room.number, fromType: g.roomType, toType: room.type, reason: reason.trim() },
      ],
    });
    await updateRoom(g.roomNumber, { housekeeping: 'dirty' }); // old room needs cleaning
    onDone(`${g.fullName} moved from room ${g.roomNumber} to ${room.number}`);
  };

  return (
    <div className="add-charge no-print">
      <strong>Change room — now in {g.roomNumber}</strong>
      <div className="form grid">
        <Field
          label="Move to room"
          required
          error={tried ? error : undefined}
          hint={room ? `${typeLabel(settings, room.type)}${room.housekeeping === 'dirty' ? ' · ⚠ not cleaned yet' : ''}` : `${free.length} room(s) free`}
        >
          <input className="input-big" list="move-room-list" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" autoFocus />
          <datalist id="move-room-list">
            {free.map((v) => <option key={v.room.number} value={v.room.number}>{typeLabel(settings, v.room.type)}</option>)}
          </datalist>
        </Field>
        <Field label="Reason" hint="Optional, e.g. AC not working, guest asked for a bigger room">
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {rateDiffers && (
          <Field
            label="Price per night"
            hint="Applies to the whole stay"
            wide
          >
            <Segmented
              options={['Keep current rate', 'New room rate'] as const}
              value={rateChoice}
              onChange={setRateChoice}
            />
            <span className="muted small">
              Current {rupees(Number(g.ratePerNight) || 0)} · {room!.type} {rupees(Number(newRate))}
            </span>
          </Field>
        )}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save}>Move guest</button>
      </div>
    </div>
  );
}
