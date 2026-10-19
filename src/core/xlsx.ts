// Lector mínimo de .xlsx en el navegador (zip + XML), sin librerías: se usa
// para mostrar la vista previa del Excel REAL que generó la tool.

export interface Sheet {
  name: string;
  rows: string[][];
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
}

function entries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  let eocd = buffer.byteLength - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('El archivo no es un .xlsx válido');
  const count = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const list: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    list.push({
      method: view.getUint16(pointer + 10, true),
      compressedSize: view.getUint32(pointer + 20, true),
      offset: view.getUint32(pointer + 42, true),
      name: decoder.decode(new Uint8Array(buffer, pointer + 46, nameLength)),
    });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return list;
}

async function readEntry(buffer: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const view = new DataView(buffer);
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = new Uint8Array(buffer, start, entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}

const xml = (text: string) => new DOMParser().parseFromString(text, 'application/xml');

function columnIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '');
  return [...letters].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0) - 1;
}

export async function readXlsx(url: string): Promise<{ sheets: Sheet[]; blobUrl: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar el Excel (${response.status})`);
  const buffer = await response.arrayBuffer();
  const files = new Map(entries(buffer).map((entry) => [entry.name, entry]));
  const read = async (name: string) => {
    const entry = files.get(name);
    return entry ? xml(await readEntry(buffer, entry)) : null;
  };

  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  const shared = await read('xl/sharedStrings.xml');
  const strings = shared ? [...shared.getElementsByTagName('si')].map((si) => si.textContent ?? '') : [];
  const targets = new Map(
    [...(rels?.getElementsByTagName('Relationship') ?? [])].map((rel) => [rel.getAttribute('Id'), rel.getAttribute('Target')]),
  );

  const sheets: Sheet[] = [];
  for (const sheet of workbook?.getElementsByTagName('sheet') ?? []) {
    const relId = [...sheet.attributes].find((attr) => attr.localName === 'id')?.value ?? null;
    const target = (targets.get(relId) ?? '').replace(/^\/?xl\//, '');
    const doc = await read(`xl/${target}`);
    const rows: string[][] = [];
    for (const row of doc?.getElementsByTagName('row') ?? []) {
      const values: string[] = [];
      for (const cell of row.getElementsByTagName('c')) {
        const type = cell.getAttribute('t');
        const raw = cell.getElementsByTagName('v')[0]?.textContent ?? '';
        let value = raw;
        if (type === 's') value = strings[Number(raw)] ?? '';
        else if (type === 'inlineStr') value = cell.getElementsByTagName('is')[0]?.textContent ?? '';
        values[columnIndex(cell.getAttribute('r') ?? 'A1')] = value;
      }
      rows.push(Array.from(values, (v) => v ?? ''));
    }
    sheets.push({ name: sheet.getAttribute('name') ?? '', rows });
  }

  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { sheets, blobUrl: URL.createObjectURL(blob) };
}
