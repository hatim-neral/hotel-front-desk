import type { Guest } from '../types';
import { StatusBadge } from '../components/ui';
import { isSample } from '../sampleData';
import { formatDate, formatTime, guestIdLabel, isDueOutToday, maskId } from '../utils';

export default function GuestRows({ guests }: { guests: Guest[] }) {
  if (!guests.length) return null;
  return (
    <ul className="rows">
      {guests.map((g) => {
        const [idName, ...idRest] = guestIdLabel(g).split(' ');
        return (
          <li key={g.id}>
            <a className="row" href={`#/guest/${g.id}`}>
              <span className="room">{g.roomNumber}</span>
              <span className="row-main">
                <strong>{g.fullName}{isSample(g) && <span className="badge badge-sample">Sample</span>}</strong>
                <span className="muted">
                  {g.phone} · {idName} {maskId(idRest.join(' '))}
                  {g.adults + g.children > 1 && ` · ${g.adults + g.children} guests`}
                </span>
              </span>
              <span className="row-dates">
                <span>In: {formatDate(g.checkInDate)}</span>
                <span>Out: {formatDate(g.checkOutDate)} {formatTime(g.checkOutTime)}</span>
              </span>
              <StatusBadge status={g.status} dueOut={isDueOutToday(g)} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
