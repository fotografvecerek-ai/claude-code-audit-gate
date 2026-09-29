// FS-BEZPECNE — kopírování a mazání složek bez fs.cpSync / fs.rmSync.
// Node 22+/24 má cpSync (a rmSync) v C++ přes std::filesystem; na Windows s diakritikou v cestě („…\projekt-hlavní\…") selže
// nesmyslnou chybou „The operation completed successfully" (errno 0). Tady jen readdirSync/copyFileSync/unlinkSync/rmdirSync (libuv, UTF-16).
import fs from 'node:fs'; import path from 'node:path';
export function copyTree(src, dst, filter = () => true) {
  if (!filter(src)) return; const st = fs.statSync(src);
  if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const e of fs.readdirSync(src)) copyTree(path.join(src, e), path.join(dst, e), filter); return; }
  try { fs.copyFileSync(src, dst); } catch (e) { if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e; fs.chmodSync(dst, 0o666); fs.copyFileSync(src, dst); }   // soubor jen pro čtení
}
export function rmTree(p) {
  let st; try { st = fs.lstatSync(p); } catch { return; }   // neexistuje = hotovo; odkazy se mažou jako odkazy (nesleduje je)
  if (st.isDirectory()) { for (const e of fs.readdirSync(p)) rmTree(path.join(p, e)); fs.rmdirSync(p); return; }
  try { fs.unlinkSync(p); } catch (e) { if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e; fs.chmodSync(p, 0o666); fs.unlinkSync(p); }
}
