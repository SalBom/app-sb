# backend/tools/upload_media.py
import os, sys, glob, json, mimetypes, re
import psycopg2, psycopg2.extras
import boto3
from urllib.parse import quote
from botocore.config import Config
from typing import List, Dict

# ===== ENV R2 / DB =====
R2_S3_ENDPOINT       = (os.getenv("R2_S3_ENDPOINT") or os.getenv("S3_ENDPOINT") or "").strip()
R2_BUCKET            = (os.getenv("R2_BUCKET") or os.getenv("S3_BUCKET") or "").strip()
R2_PUBLIC_BASE_URL   = (os.getenv("R2_PUBLIC_BASE_URL") or os.getenv("S3_PUBLIC_CDN") or "").strip().rstrip("/")
R2_ACCESS_KEY_ID     = (os.getenv("R2_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
R2_SECRET_ACCESS_KEY = (os.getenv("R2_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
DB_URL               = os.getenv("DATABASE_URL")

IMG_EXTS = (".jpg",".jpeg",".png",".webp",".gif",".bmp")
PDF_EXTS = (".pdf",)

def _s3():
    cfg = Config(
        s3={"addressing_style": "virtual"},
        retries={"max_attempts": 2, "mode": "standard"},
        signature_version="s3v4",
    )
    return boto3.client(
        "s3",
        endpoint_url=R2_S3_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=cfg,
    )

def _sort_order_from_name(name: str) -> int:
    m = re.search(r"(\d+)", name or "")
    return int(m.group(1)) if m else 0

def _classify_kind(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in PDF_EXTS:  return "pdf"
    if ext in IMG_EXTS:  return "image"
    return "other"

def _upload_one(local_path: str, key: str) -> str:
    s3 = _s3()
    ct = mimetypes.guess_type(local_path)[0] or "application/octet-stream"
    with open(local_path, "rb") as f:
        s3.put_object(
            Bucket=R2_BUCKET,
            Key=key,
            Body=f.read(),
            ContentType=ct,
            CacheControl="public, max-age=31536000, immutable",
        )
    return f"{R2_PUBLIC_BASE_URL}/{quote(key)}"

def _register(product_tmpl_id: int, assets: List[Dict]):
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()
    cur.execute("DELETE FROM product_asset WHERE product_tmpl_id=%s", (product_tmpl_id,))
    for a in assets:
        cur.execute("""
            INSERT INTO product_asset (product_tmpl_id, kind, variant, title, sort_order, url, key, meta)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
        """, (product_tmpl_id, a["kind"], a.get("variant"), a.get("title"),
              a.get("sort_order",0), a["url"], a.get("key"), json.dumps(a.get("meta") or {})))
    conn.commit()
    conn.close()

def main():
    import argparse, os
    p = argparse.ArgumentParser(description="Sube y registra media para un producto.")
    p.add_argument("product_id", type=int, help="ID de product.template")
    p.add_argument("--dir", help="Carpeta local con archivos (sube todo lo que sea imagen o PDF)")
    p.add_argument("--files", nargs="+", help="Lista de archivos sueltos")
    p.add_argument("--title-from-name", action="store_true", help="Titulo = nombre de archivo sin extensión")
    args = p.parse_args()

    if not args.dir and not args.files:
        print("Usar --dir <carpeta> o --files <f1> <f2> ...")
        sys.exit(1)

    paths: List[str] = []
    if args.dir:
        for ext in [*IMG_EXTS, *PDF_EXTS]:
            paths.extend(glob.glob(os.path.join(args.dir, f"*{ext}")))
    if args.files:
        for f in args.files:
            if os.path.isfile(f):
                paths.append(f)

    if not paths:
        print("No se encontraron archivos válidos.")
        sys.exit(0)

    assets: List[Dict] = []
    for pth in sorted(paths):
        kind = _classify_kind(pth)
        if kind == "other":
            continue
        filename = os.path.basename(pth)
        base, _ = os.path.splitext(filename)
        key = f"products/{args.product_id}/{filename}"
        url = _upload_one(pth, key)
        assets.append({
            "kind": kind,
            "variant": "orig" if kind == "image" else None,
            "title": (base if args.title_from_name else (base.replace("_"," ").title() if kind=="pdf" else base)),
            "sort_order": (_sort_order_from_name(base) if kind=="image" else 100 + _sort_order_from_name(base)),
            "url": url,
            "key": key,
            "meta": {}
        })

    # imágenes primero por orden, luego pdfs
    assets.sort(key=lambda a: (a["kind"] != "image", a.get("sort_order",0), a.get("title","")))
    _register(args.product_id, assets)
    print(f"✅ Registrados {len(assets)} assets para product_id={args.product_id}")
    for a in assets:
        print(" -", a["kind"], a["title"], "→", a["url"])

if __name__ == "__main__":
    main()
