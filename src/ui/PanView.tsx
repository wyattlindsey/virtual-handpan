/**
 * Overhead view of the instrument. Geometry comes entirely from the layout,
 * so a photorealistic skin can replace the drawn shell later without touching
 * the interaction layer.
 */
import type { PointerEvent } from 'react';
import {
  type FieldPosition, type FieldSide, type Layout, bottomFieldPositions, dingPosition, fieldXY, topFieldPositions,
} from '../model/layout';
import { type Spelling, formatPitch } from '../model/pitch';

export interface StrikeInfo {
  fieldId: string;
  pitch: string;
  side: FieldSide;
  velocity: number;
}

interface Props {
  layout: Layout;
  spelling: Spelling;
  /** Field id to a counter that increments on each strike; drives the flash animation. */
  flashes: Record<string, number>;
  keyHints?: Record<string, string>;
  /** Draw bottom notes faintly as if seen through the shell. */
  showBottomGhosts?: boolean;
  onStrike: (info: StrikeInfo) => void;
}

const FIELD_RX = 0.135;
const FIELD_RY = 0.105;

export function PanView({ layout, spelling, flashes, keyHints, showBottomGhosts = true, onStrike }: Props) {
  const ding = dingPosition(layout);
  const top = topFieldPositions(layout);
  const bottom = bottomFieldPositions(layout);

  return (
    <svg className="pan" viewBox="-1.12 -1.12 2.24 2.24" role="group" aria-label="Handpan, top view">
      <defs>
        <radialGradient id="pv-shell" cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#5d6572" />
          <stop offset="55%" stopColor="#3a404a" />
          <stop offset="100%" stopColor="#22262d" />
        </radialGradient>
        <radialGradient id="pv-field" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#7c8593" />
          <stop offset="70%" stopColor="#4a515c" />
          <stop offset="100%" stopColor="#333941" />
        </radialGradient>
        <radialGradient id="pv-dimple" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1d2026" />
          <stop offset="100%" stopColor="#3c434d" />
        </radialGradient>
        <radialGradient id="pv-dome" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#8f98a6" />
          <stop offset="60%" stopColor="#535b66" />
          <stop offset="100%" stopColor="#353b44" />
        </radialGradient>
      </defs>

      <circle r="1" fill="url(#pv-shell)" />
      <circle r="1" fill="none" stroke="#12151a" strokeWidth="0.03" />
      <circle r="0.985" fill="none" stroke="#6a7380" strokeWidth="0.006" opacity="0.6" />
      <ellipse cx="-0.25" cy="-0.35" rx="0.55" ry="0.3" fill="#ffffff" opacity="0.035" transform="rotate(-30)" />

      {showBottomGhosts && bottom.map((f) => <GhostField key={f.id} field={f} spelling={spelling} />)}

      {top.map((f) => (
        <ToneField key={f.id} field={f} spelling={spelling} flash={flashes[f.id]} keyHint={keyHints?.[f.id]} onStrike={onStrike} />
      ))}

      <Ding field={ding} spelling={spelling} flash={flashes[ding.id]} keyHint={keyHints?.[ding.id]} onStrike={onStrike} />
    </svg>
  );
}

interface FieldProps {
  field: FieldPosition;
  spelling: Spelling;
  flash: number | undefined;
  keyHint: string | undefined;
  onStrike: (info: StrikeInfo) => void;
}

function ToneField({ field, spelling, flash, keyHint, onStrike }: FieldProps) {
  const { x, y } = fieldXY(field);
  const rx = FIELD_RX * field.size;
  const ry = FIELD_RY * field.size;
  return (
    <g
      className="field"
      transform={`translate(${x} ${y})`}
      onPointerDown={(e) => onStrike({ fieldId: field.id, pitch: field.pitch, side: field.side, velocity: pointerVelocity(e) })}
      role="button"
      aria-label={`${formatPitch(field.pitch, spelling)} tone field`}
    >
      <g transform={`rotate(${field.angleDeg})`}>
        <ellipse rx={rx * 1.08} ry={ry * 1.08} fill="#1a1d23" opacity="0.55" />
        <ellipse rx={rx} ry={ry} fill="url(#pv-field)" stroke="#20242b" strokeWidth="0.006" />
        <circle r={0.032 * field.size} fill="url(#pv-dimple)" />
        {flash !== undefined && <ellipse key={flash} className="flash" rx={rx} ry={ry} />}
      </g>
      <text className="label" y={ry + 0.085} textAnchor="middle">{formatPitch(field.pitch, spelling)}</text>
      {keyHint && <text className="key-hint" y={-ry - 0.035} textAnchor="middle">{keyHint}</text>}
    </g>
  );
}

function Ding({ field, spelling, flash, keyHint, onStrike }: FieldProps) {
  const r = 0.17 * field.size;
  return (
    <g
      className="field ding"
      onPointerDown={(e) => onStrike({ fieldId: field.id, pitch: field.pitch, side: 'ding', velocity: pointerVelocity(e) })}
      role="button"
      aria-label={`${formatPitch(field.pitch, spelling)} ding`}
    >
      <circle r={r * 1.1} fill="#1a1d23" opacity="0.6" />
      <circle r={r} fill="url(#pv-dome)" stroke="#20242b" strokeWidth="0.006" />
      <circle r={r * 0.45} fill="url(#pv-dimple)" opacity="0.7" />
      {flash !== undefined && <circle key={flash} className="flash" r={r} />}
      <text className="label ding-label" y={r + 0.1} textAnchor="middle">{formatPitch(field.pitch, spelling)}</text>
      {keyHint && <text className="key-hint" y={-r - 0.04} textAnchor="middle">{keyHint}</text>}
    </g>
  );
}

function GhostField({ field, spelling }: { field: FieldPosition; spelling: Spelling }) {
  const { x, y } = fieldXY(field);
  const rx = FIELD_RX * field.size * 0.75;
  const ry = FIELD_RY * field.size * 0.75;
  return (
    <g className="ghost" transform={`translate(${x} ${y})`} aria-hidden="true">
      <ellipse rx={rx} ry={ry} transform={`rotate(${field.angleDeg})`} fill="none" stroke="#c9d1dc" strokeWidth="0.005" strokeDasharray="0.02 0.014" opacity="0.4" />
      <text className="ghost-label" y={0.03} textAnchor="middle">{formatPitch(field.pitch, spelling)}</text>
    </g>
  );
}

/** Harder toward the centre of the field, softer at the edge; honours stylus pressure when reported. */
export function pointerVelocity(e: PointerEvent<SVGElement>): number {
  const box = e.currentTarget.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const dx = (e.clientX - cx) / (box.width / 2 || 1);
  const dy = (e.clientY - cy) / (box.height / 2 || 1);
  const dist = Math.min(1, Math.hypot(dx, dy));
  let v = 1 - 0.4 * dist;
  if (e.pointerType === 'pen' && e.pressure > 0) v *= 0.5 + e.pressure;
  return Math.min(1, Math.max(0.35, v));
}
