/**
 * Rysowanie punktów instalacji na obrazie rzutu (do pobrania „planu z punktami”).
 * Funkcja przyjmuje kontekst canvas, więc da się ją sprawdzić bez przeglądarki.
 */
export interface RenderPoint { x: number; y: number; code: string; color: string }
export interface LegendItem { label: string; color: string }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function drawPointsOnCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, points: RenderPoint[], legend: LegendItem[] = []) {
  const r = clamp(width * 0.0075, 9, 28);   // promień znacznika zależny od szerokości obrazu
  const font = Math.round(r * 1.1);

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `bold ${font}px sans-serif`;

  for (const p of points) {
    const cx = p.x * width;
    const cy = p.y * height;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();

    // numer pod znacznikiem, na ciemnej plakietce
    const textW = ctx.measureText(p.code).width;
    const padX = r * 0.35;
    const boxH = font * 1.25;
    const boxY = cy + r + 2;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(cx - textW / 2 - padX, boxY, textW + padX * 2, boxH);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(p.code, cx, boxY + boxH / 2);
  }

  if (legend.length > 0) {
    const lf = Math.round(r * 1.05);
    ctx.font = `${lf}px sans-serif`;
    ctx.textAlign = 'left';
    const rowH = lf * 1.6;
    const maxLabel = Math.max(...legend.map((l) => ctx.measureText(l.label).width));
    const boxW = maxLabel + lf * 3;
    const boxH = legend.length * rowH + lf * 0.8;
    const x0 = lf * 0.8;
    const y0 = height - boxH - lf * 0.8;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(x0, y0, boxW, boxH);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, boxW, boxH);
    legend.forEach((l, i) => {
      const y = y0 + lf * 0.4 + rowH * i + rowH / 2;
      ctx.beginPath();
      ctx.arc(x0 + lf * 1.1, y, lf * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = l.color;
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.fillText(l.label, x0 + lf * 2, y);
    });
  }
  ctx.restore();
}

/** Nazwa pliku do pobrania: "gora.jpg" -> "gora-z-punktami.png" */
export function exportFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim() || 'plan';
  return `${base}-z-punktami.png`;
}
