// Verkleinert zu große Bilder und entfernt Metadaten (z. B. GPS-Standort aus Handyfotos).
// Dateiname und Format bleiben gleich, damit die Pfade in content/*.json gültig bleiben.
// Aufruf: node tools/optimize-images.mjs images
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const MAX_SIDE = 1600;          // längste Seite in Pixel
const MAX_BYTES = 500 * 1024;   // Zielgröße; bei Überschreitung wird die Qualität schrittweise gesenkt
const QUALITIES = [80, 70, 60];
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

sharp.cache(false); // Quelldateien nicht offen halten, damit sie überschrieben werden können

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (EXTS.has(path.extname(entry.name).toLowerCase())) yield p;
  }
}

function encode(input, format, quality) {
  const img = sharp(input)
    .rotate() // Drehung aus den Metadaten anwenden, bevor sie entfernt werden
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true });
  if (format === 'jpeg') return img.jpeg({ quality, mozjpeg: true }).toBuffer();
  if (format === 'webp') return img.webp({ quality }).toBuffer();
  return img.png({ compressionLevel: 9 }).toBuffer();
}

let changed = 0;
for (const dir of process.argv.slice(2).length ? process.argv.slice(2) : ['images']) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const input = fs.readFileSync(file);
    const meta = await sharp(input).metadata();
    if ((meta.pages || 1) > 1) continue; // animierte Bilder unverändert lassen

    const tooLarge = Math.max(meta.width, meta.height) > MAX_SIDE;
    const hasMetadata = Boolean(meta.exif || meta.xmp || meta.iptc || (meta.orientation && meta.orientation > 1));
    // Nur diese beiden Auslöser: Danach ist das Bild klein genug und ohne Metadaten,
    // ein weiterer Lauf ändert es also nicht mehr (kein wiederholtes Neukomprimieren).
    if (!tooLarge && !hasMetadata) continue;

    const before = input.length;
    let out;
    for (const q of QUALITIES) {
      out = await encode(input, meta.format, q);
      if (out.length <= MAX_BYTES || meta.format === 'png') break;
    }
    fs.writeFileSync(file, out);
    changed++;
    const after = await sharp(out).metadata();
    console.log(`${file}: ${meta.width}x${meta.height}, ${before >> 10} KB → ${after.width}x${after.height}, ${out.length >> 10} KB` +
      (hasMetadata ? ' (Metadaten entfernt)' : '') +
      (out.length > MAX_BYTES ? ` – Achtung: noch über ${MAX_BYTES >> 10} KB` : ''));
  }
}
console.log(changed ? `${changed} Bild(er) optimiert.` : 'Alle Bilder sind bereits optimiert.');
