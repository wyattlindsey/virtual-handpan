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
import { DingGraphic, FieldGraphic, Shell, SkinDefs } from './skin';

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
      <SkinDefs prefix="pv" />
      <Shell prefix="pv" />

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
      <FieldGraphic prefix="pv" rx={rx} ry={ry} angleDeg={field.angleDeg} size={field.size} flash={flash} />
      <text className="label" y={ry + 0.09} textAnchor="middle">{formatPitch(field.pitch, spelling)}</text>
      {keyHint && <text className="key-hint" y={-ry - 0.04} textAnchor="middle">{keyHint}</text>}
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
      <DingGraphic prefix="pv" r={r} flash={flash} />
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
      <ellipse rx={rx} ry={ry} transform={`rotate(${field.angleDeg})`} fill="none" stroke="#c9d9f0" strokeWidth="0.005" strokeDasharray="0.02 0.014" opacity="0.35" />
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
