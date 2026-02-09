# r2_debug.py
import os
import time
from typing import List, Dict, Any, Optional
from urllib.parse import quote_plus

import boto3
from botocore.config import Config

# ========= ENV (R2 primero; S3/AWS como fallback) =========
R2_ACCOUNT_ID         = (os.getenv("R2_ACCOUNT_ID") or "").strip()
R2_ACCESS_KEY_ID      = (os.getenv("R2_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
R2_SECRET_ACCESS_KEY  = (os.getenv("R2_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
R2_BUCKET             = (os.getenv("R2_BUCKET") or os.getenv("S3_BUCKET") or "").strip()
R2_PUBLIC_BASE_URL    = (os.getenv("R2_PUBLIC_BASE_URL") or os.getenv("S3_PUBLIC_CDN") or "").strip().rstrip("/") or None
# Endpoint base recomendado por Cloudflare (SIN bucket)
R2_S3_ENDPOINT        = (os.getenv("R2_S3_ENDPOINT") or os.getenv("S3_ENDPOINT") or "").strip() \
                        or (f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else "")
# Forzamos PATH por defecto para evitar handshake en bucket.accountid...
R2_ADDRESSING_STYLE   = (os.getenv("R2_ADDRESSING_STYLE") or "path").strip().lower()  # 'path' | 'virtual'

# ========= Helpers =========
def _summarize_config(style: Optional[str] = None) -> Dict[str, Any]:
    return {
        "has_R2_ACCOUNT_ID": bool(R2_ACCOUNT_ID),
        "has_R2_ACCESS_KEY_ID": bool(R2_ACCESS_KEY_ID),
        "has_R2_SECRET_ACCESS_KEY": bool(R2_SECRET_ACCESS_KEY),
        "bucket": R2_BUCKET or "(vacío)",
        "endpoint_url": R2_S3_ENDPOINT or "(vacío)",
        "public_base_url": R2_PUBLIC_BASE_URL or "(no configurado)",
        "addressing_style": (style or R2_ADDRESSING_STYLE),
    }

def _new_s3_client(style: Optional[str] = None):
    """
    Crea cliente S3 para R2.
    - addressing_style = 'path' (default) para evitar TLS en bucket.accountid...
    - firma v4
    """
    cfg = Config(
        s3={"addressing_style": (style or R2_ADDRESSING_STYLE)},
        retries={"max_attempts": 2, "mode": "standard"},
        signature_version="s3v4",
    )
    session = boto3.session.Session()
    return session.client(
        "s3",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        endpoint_url=R2_S3_ENDPOINT,
        region_name="auto",
        config=cfg,
    )

def _safe_key_url(key: str) -> Optional[str]:
    if not R2_PUBLIC_BASE_URL:
        return None
    # Encode respetando '/'
    parts = [quote_plus(p, safe="/:@") for p in key.split("/")]
    return f"{R2_PUBLIC_BASE_URL}/" + "/".join(parts)

# ========= Operaciones =========
def list_keys(prefix: str = "", max_keys: int = 200) -> Dict[str, Any]:
    """
    Lista objetos bajo un prefijo (UNA página, hasta max_keys).
    Default = PATH style para evitar handshake TLS.
    """
    if not R2_BUCKET:
        return {"ok": False, "error": "R2_BUCKET no configurado", "config": _summarize_config()}

    s3 = _new_s3_client()  # path-style por defecto
    started = time.time()
    items: List[Dict[str, Any]] = []
    try:
        resp = s3.list_objects_v2(Bucket=R2_BUCKET, Prefix=prefix, MaxKeys=max_keys)
        for obj in resp.get("Contents", []) or []:
            key = obj["Key"]
            items.append({
                "key": key,
                "size": obj.get("Size"),
                "last_modified": obj.get("LastModified").isoformat() if obj.get("LastModified") else None,
                "public_url": _safe_key_url(key),
            })
        took = round((time.time() - started) * 1000)
        return {
            "ok": True,
            "count": len(items),
            "items": items,
            "took_ms": took,
            "config": _summarize_config(),
            "s3_response_truncated": bool(resp.get("IsTruncated")),
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "config": _summarize_config()}

def list_all_keys(max_page: int = 1000) -> Dict[str, Any]:
    """
    Lista TODO el bucket paginando (útil para auditoría).
    """
    if not R2_BUCKET:
        return {"ok": False, "error": "R2_BUCKET no configurado", "config": _summarize_config()}

    s3 = _new_s3_client()
    keys: List[Dict[str, Any]] = []
    token: Optional[str] = None
    try:
        while True:
            kwargs = {"Bucket": R2_BUCKET, "MaxKeys": max(1, min(max_page, 1000))}
            if token:
                kwargs["ContinuationToken"] = token
            resp = s3.list_objects_v2(**kwargs)
            for obj in resp.get("Contents", []) or []:
                keys.append({
                    "key": obj["Key"],
                    "size": obj.get("Size"),
                    "last_modified": obj.get("LastModified").isoformat() if obj.get("LastModified") else None,
                    "public_url": _safe_key_url(obj["Key"]),
                })
            if resp.get("IsTruncated"):
                token = resp.get("NextContinuationToken")
            else:
                break
        return {"ok": True, "total": len(keys), "items": keys, "config": _summarize_config()}
    except Exception as e:
        return {"ok": False, "error": str(e), "config": _summarize_config()}

def head_key(key: str) -> Dict[str, Any]:
    """
    HEAD de un objeto para verificar existencia/metadatos.
    """
    if not R2_BUCKET:
        return {"ok": False, "error": "R2_BUCKET no configurado", "config": _summarize_config()}
    s3 = _new_s3_client()
    try:
        resp = s3.head_object(Bucket=R2_BUCKET, Key=key)
        out = {
            "ok": True,
            "key": key,
            "content_length": resp.get("ContentLength"),
            "content_type": resp.get("ContentType"),
            "last_modified": resp.get("LastModified").isoformat() if resp.get("LastModified") else None,
            "etag": resp.get("ETag"),
            "public_url": _safe_key_url(key),
        }
        if not out["public_url"]:
            url = s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": R2_BUCKET, "Key": key},
                ExpiresIn=3600,
            )
            out["presigned_url"] = url
        return out
    except Exception as e:
        return {"ok": False, "key": key, "error": str(e), "config": _summarize_config()}

# ========= Buscador por código (para casos heredados) =========
def guess_prefixes_for_code(code: str) -> List[str]:
    raw = (code or "").strip()
    up  = raw.upper()
    low = raw.lower()
    alnum = "".join(ch for ch in raw if ch.isalnum())
    alnum_up = alnum.upper()
    alnum_low = alnum.lower()

    ordered: List[str] = []
    for base in [raw, up]:
        if base:
            ordered += [f"{base}/", f"{base}-", f"{base}_", f"{base}"]
    for base in [alnum_up, alnum]:
        if base:
            ordered += [f"{base}/", f"{base}-", f"{base}_", f"{base}"]
    for base in [low, alnum_low]:
        if base:
            ordered += [f"{base}/", f"{base}-", f"{base}_", f"{base}"]

    seen, uniq = set(), []
    for p in ordered:
        if p and p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq[:16]

def find_media_for_code(code: str, limit_per_prefix: int = 50) -> Dict[str, Any]:
    prefixes = guess_prefixes_for_code(code)
    found: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    for pfx in prefixes:
        res = list_keys(prefix=pfx, max_keys=limit_per_prefix)
        if not res.get("ok"):
            errors.append({"prefix": pfx, "error": res.get("error", "unknown")})
            continue
        for it in res.get("items", []) or []:
            key = it["key"]
            ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
            kind = "image" if ext in {"png", "jpg", "jpeg", "webp", "gif"} else ("pdf" if ext == "pdf" else "other")
            found.append({
                "prefix": pfx,
                "key": key,
                "kind": kind,
                "size": it.get("size"),
                "last_modified": it.get("last_modified"),
                "public_url": it.get("public_url"),
            })

    images = [x for x in found if x["kind"] == "image"]
    pdfs   = [x for x in found if x["kind"] == "pdf"]
    others = [x for x in found if x["kind"] == "other"]

    return {
        "ok": True,
        "query_code": code,
        "tried_prefixes": prefixes,
        "counts": {"images": len(images), "pdfs": len(pdfs), "others": len(others)},
        "images": images, "pdfs": pdfs, "others": others,
        "errors": errors,
        "config": _summarize_config(),
    }

# ========= FastAPI router opcional =========
try:
    from fastapi import APIRouter, Query
    router = APIRouter()

    @router.get("/r2/config")
    def r2_config():
        return {"ok": True, "config": _summarize_config()}

    @router.get("/r2/list")
    def r2_list(prefix: str = "", max_keys: int = 200, style: Optional[str] = None):
        s3 = _new_s3_client(style)
        if not R2_BUCKET:
            return {"ok": False, "error": "R2_BUCKET no configurado", "config": _summarize_config(style)}
        items = []
        token = None
        try:
            while True:
                params = {"Bucket": R2_BUCKET, "Prefix": prefix, "MaxKeys": max_keys}
                if token: params["ContinuationToken"] = token
                resp = s3.list_objects_v2(**params)
                for obj in resp.get("Contents", []) or []:
                    key = obj["Key"]
                    if not key.endswith("/"):
                        items.append({"key": key, "public_url": _safe_key_url(key)})
                if not resp.get("IsTruncated"):
                    break
                token = resp.get("NextContinuationToken")
            return {"ok": True, "style": style or R2_ADDRESSING_STYLE, "count": len(items), "items": items,
                    "config": _summarize_config(style)}
        except Exception as e:
            return {"ok": False, "error": str(e), "config": _summarize_config(style)}

    @router.get("/r2/list_all")
    def r2_list_all(max_page: int = 1000, style: Optional[str] = None):
        s3 = _new_s3_client(style)
        if not R2_BUCKET:
            return {"ok": False, "error": "R2_BUCKET no configurado", "config": _summarize_config(style)}
        keys = []
        token = None
        try:
            while True:
                kwargs = {"Bucket": R2_BUCKET, "MaxKeys": max(1, min(max_page, 1000))}
                if token: kwargs["ContinuationToken"] = token
                resp = s3.list_objects_v2(**kwargs)
                for obj in resp.get("Contents", []) or []:
                    keys.append({"key": obj["Key"], "public_url": _safe_key_url(obj["Key"])})
                if resp.get("IsTruncated"):
                    token = resp.get("NextContinuationToken")
                else:
                    break
            return {"ok": True, "total": len(keys), "items": keys, "config": _summarize_config(style)}
        except Exception as e:
            return {"ok": False, "error": str(e), "config": _summarize_config(style)}

    @router.get("/r2/head")
    def r2_head(key: str = Query(..., description="Clave exacta en el bucket"), style: Optional[str] = None):
        # usa head_key() que ya está path-style por defecto
        return head_key(key)

    @router.get("/r2/find")
    def r2_find(code: str = Query(..., description="Código de producto, ej: SH-S8"), limit_per_prefix: int = 50):
        return find_media_for_code(code=code, limit_per_prefix=limit_per_prefix)

except Exception:
    router = None
