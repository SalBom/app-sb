# backend/tools/register_all_from_bucket.py
"""
Registra en la tabla product_asset los archivos que ya están en R2.

Uso típico (desde /backend):
  set PYTHONPATH=%cd%   (Windows)   |   export PYTHONPATH=$PWD  (Linux/Mac)
  python tools/register_all_from_bucket.py --prefix products/ --only 6060 --dry
  python tools/register_all_from_bucket.py --prefix products/ --only 6060

- --prefix: prefijo raíz dentro del bucket (ej: "products/")
- --only:   lista separada por comas con las carpetas a procesar (ej: "6060,6061")
- --map:    CSV con columnas folder,product_id para mapear carpetas → IDs
- --dry:    no escribe en DB; solo muestra
"""

import os
import sys
import re
import csv
from urllib.parse import quote
from typing import List, Dict, Optional

import boto3
from botocore.config import Config

# Asegurar import de repos.py desde /backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from repos import replace_product_assets_db, db_query  # noqa: E402

# ====== ENV R2/S3 (R2 primero; S3/AWS fallback) ======
R2_S3_ENDPOINT        = (os.getenv("R2_S3_ENDPOINT") or os.getenv("S3_ENDPOINT") or "").strip()
R2_BUCKET             = (os.getenv("R2_BUCKET") or os.getenv("S3_BUCKET") or "").strip()
R2_PUBLIC_BASE_URL    = (os.getenv("R2_PUBLIC_BASE_URL") or os.getenv("S3_PUBLIC_CDN") or "").strip().rstrip("/")
R2_ACCESS_KEY_ID      = (os.getenv("R2_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
R2_SECRET_ACCESS_KEY  = (os.getenv("R2_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()

# ====== (Opcional) Odoo para resolver IDs si no están en DB ======
ODOO_AVAILABLE = True
try:
    from odooly import Client as OdooClient
    ODOO_SERVER   = os.getenv("ODOO_SERVER")
    ODOO_DB       = os.getenv("ODOO_DB")
    ODOO_USER     = os.getenv("ODOO_USER")
    ODOO_PASSWORD = os.getenv("ODOO_PASSWORD")
except Exception:
    ODOO_AVAILABLE = False
    ODOO_SERVER = ODOO_DB = ODOO_USER = ODOO_PASSWORD = None  # type: ignore

IMG_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp")
PDF_EXTS = (".pdf",)

# ========= S3 Client (forzamos PATH-STYLE para evitar TLS en bucket.accountid...) =========
def s3():
    missing = []
    if not R2_S3_ENDPOINT:        missing.append("R2_S3_ENDPOINT / S3_ENDPOINT")
    if not R2_BUCKET:             missing.append("R2_BUCKET / S3_BUCKET")
    if not R2_PUBLIC_BASE_URL:    missing.append("R2_PUBLIC_BASE_URL / S3_PUBLIC_CDN")
    if not R2_ACCESS_KEY_ID:      missing.append("R2_ACCESS_KEY_ID / AWS_ACCESS_KEY_ID")
    if not R2_SECRET_ACCESS_KEY:  missing.append("R2_SECRET_ACCESS_KEY / AWS_SECRET_ACCESS_KEY")
    if missing:
        raise SystemExit(f"Faltan envs: {', '.join(missing)}")

    cfg = Config(
        s3={"addressing_style": "path"},  # << clave para R2
        retries={"max_attempts": 2, "mode": "standard"},
        signature_version="s3v4",
    )
    return boto3.client(
        "s3",
        endpoint_url=R2_S3_ENDPOINT,  # ej: https://<ACCOUNT>.r2.cloudflarestorage.com
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=cfg,
    )

# ========= Helpers de listado =========
def list_top_folders(prefix: str = "") -> List[str]:
    """
    Devuelve carpetas (CommonPrefixes) de primer nivel bajo 'prefix'.
    Ej: con prefix='products/' → ['products/6060', 'products/6061', ...]
    """
    c = s3()
    token = None
    folders: List[str] = []
    while True:
        params = {"Bucket": R2_BUCKET, "Prefix": prefix, "Delimiter": "/"}
        if token:
            params["ContinuationToken"] = token
        resp = c.list_objects_v2(**params)
        for cp in resp.get("CommonPrefixes", []) or []:
            folders.append(cp["Prefix"].rstrip("/"))
        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")
    return folders

def list_keys(prefix: str) -> List[str]:
    """Devuelve todas las claves bajo el prefijo dado (sin incluir 'carpetas')."""
    c = s3()
    token = None
    keys: List[str] = []
    while True:
        params = {"Bucket": R2_BUCKET, "Prefix": prefix}
        if token:
            params["ContinuationToken"] = token
        resp = c.list_objects_v2(**params)
        for it in resp.get("Contents", []) or []:
            key = it["Key"]
            if key.endswith("/"):  # pseudo-carpetas
                continue
            keys.append(key)
        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")
    return keys

# ========= Helpers de negocio =========
def guess_sort_order(name: str) -> int:
    m = re.search(r"(\d+)", name or "")
    return int(m.group(1)) if m else 0

def load_code_map(path: Optional[str]) -> Dict[str, int]:
    """
    Carga CSV con columnas:
      folder,product_id
    Acepta también variantes "code" o "id" si preferís.
    """
    if not path:
        return {}
    m: Dict[str, int] = {}
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            folder = (row.get("folder") or row.get("code") or "").strip()
            pid = (row.get("product_id") or row.get("id") or "").strip()
            if folder and pid.isdigit():
                m[folder] = int(pid)
    return m

def resolve_from_db(folder: str) -> Optional[int]:
    """
    Si 'folder' es un default_code (ej: 'SH-S8'), intenta resolver a product_tmpl_id
    usando la tabla productos_cache.
    """
    rows = db_query("SELECT id FROM productos_cache WHERE default_code=%s LIMIT 1", (folder,))
    return int(rows[0]["id"]) if rows else None

def connect_odoo():
    if not ODOO_AVAILABLE:
        return None
    if not all([ODOO_SERVER, ODOO_DB, ODOO_USER, ODOO_PASSWORD]):
        return None
    cli = OdooClient(ODOO_SERVER)
    cli.login(ODOO_USER, ODOO_PASSWORD, ODOO_DB)
    return cli

def resolve_product_id(folder: str, code_map: Dict[str, int], odoo_cli) -> Optional[int]:
    """
    folder puede ser:
      - un ID numérico (ej: '6060')  → retorna 6060
      - un default_code (ej: 'SH-S8') → resuelve vía CSV / DB / Odoo
    """
    # 1) numérico → es el ID directo
    if folder.isdigit():
        return int(folder)
    # 2) CSV de mapeo
    if folder in code_map:
        return code_map[folder]
    # 3) DB local (productos_cache)
    pid = resolve_from_db(folder)
    if pid:
        return pid
    # 4) Odoo (si está configurado)
    if odoo_cli:
        Product = odoo_cli.env["product.template"]
        rec = Product.search([("default_code", "=", folder)], limit=1)
        if rec:
            return int(rec[0].id)
    return None

def build_assets(keys: List[str]) -> List[Dict]:
    """
    Convierte las claves en una lista de assets para product_asset.
    - Imágenes: kind='image', variant='orig', sort_order por número en el nombre
    - PDFs:     kind='pdf',   variant=None,   sort_order = 100 + número
    """
    assets: List[Dict] = []
    for key in keys:
        filename = key.split("/")[-1]
        base = filename.rsplit(".", 1)[0] if "." in filename else filename
        low = filename.lower()
        url = f"{R2_PUBLIC_BASE_URL}/{quote(key)}"

        if low.endswith(PDF_EXTS):
            assets.append({
                "kind": "pdf",
                "variant": None,
                "title": base.replace("_", " ").title(),
                "sort_order": 100 + guess_sort_order(base),
                "url": url,
                "key": key,
                "meta": {}
            })
        elif low.endswith(IMG_EXTS):
            assets.append({
                "kind": "image",
                "variant": "orig",
                "title": base,
                "sort_order": guess_sort_order(base),
                "url": url,
                "key": key,
                "meta": {}
            })
        else:
            # ignorar otros tipos
            continue

    # ordenar: imágenes primero por sort_order, luego PDFs
    assets.sort(key=lambda a: (a["kind"] != "image", a.get("sort_order", 0), a.get("title", "")))
    return assets

# ========= Main =========
def main():
    import argparse
    p = argparse.ArgumentParser(description="Registra assets del bucket R2 en product_asset.")
    p.add_argument("--prefix", help="Prefijo raíz dentro del bucket (p.ej. 'products/')", default="")
    p.add_argument("--only", help="Procesar solo estas carpetas (separadas por coma).")
    p.add_argument("--map", help="CSV con columnas folder,product_id como fallback.")
    p.add_argument("--dry", action="store_true", help="No escribe en DB; solo muestra.")
    args = p.parse_args()

    code_map = load_code_map(args.map) if args.map else {}
    odoo_cli = connect_odoo()

    # 1) Listar carpetas de primer nivel bajo el prefijo
    folders = list_top_folders(args.prefix or "")
    # Nos quedamos con el último segmento (ej: 'products/6060' → '6060')
    folders = [f.split("/")[-1] for f in folders]

    if args.only:
        whitelist = {x.strip() for x in args.only.split(",") if x.strip()}
        folders = [f for f in folders if f in whitelist]

    if not folders:
        print("No hay carpetas para procesar.")
        return

    unmatched: List[str] = []
    ok, fail = 0, 0

    for folder in folders:
        try:
            pid = resolve_product_id(folder, code_map, odoo_cli)
            if not pid:
                unmatched.append(folder)
                print(f"❓ {folder}: sin product_id (añadilo en CSV --map o asegurá default_code en DB/Odoo)")
                continue

            prefix = f"{args.prefix}{folder}/" if args.prefix else f"{folder}/"
            keys = list_keys(prefix)
            if not keys:
                print(f"~ {folder}: sin objetos en el bucket (prefix='{prefix}')")
                continue

            assets = build_assets(keys)
            if args.dry:
                print(f"[DRY] {folder} → pid={pid} → {len(assets)} assets")
            else:
                replace_product_assets_db(pid, assets)
                print(f"✅ {folder} → pid={pid} | {len(assets)} assets registrados")
            ok += 1
        except Exception as e:
            print(f"❌ {folder}: {e}")
            fail += 1

    if unmatched:
        out = "unmatched.csv"
        with open(out, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["folder", "product_id"])
            for name in unmatched:
                w.writerow([name, ""])
        print(f"\n📝 Generado {out}. Completalo y re-ejecutá con --map {out}")

    print(f"\nDone. OK={ok}  FAIL={fail}  UNMATCHED={len(unmatched)}")

if __name__ == "__main__":
    main()
