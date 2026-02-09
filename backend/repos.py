# repos.py
import os
import json
import time
import traceback
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
import psycopg2.extras

# =========================================================
# Conexión a Postgres
# =========================================================

DATABASE_URL = (
    os.getenv("DATABASE_URL")
    or os.getenv("POSTGRES_URL")
    or os.getenv("DATABASE_URI")
)

if not DATABASE_URL:
    raise RuntimeError("Falta la variable de entorno DATABASE_URL / POSTGRES_URL / DATABASE_URI")

# Render suele requerir sslmode=require
if "sslmode=" not in DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        # psycopg2 requiere postgresql://
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    sep = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{sep}sslmode=require"

def _connect():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)

_CONN = None
def _get_conn():
    global _CONN
    try:
        if _CONN is None or _CONN.closed:
            _CONN = _connect()
        else:
            with _CONN.cursor() as cur:
                cur.execute("SELECT 1")
        return _CONN
    except Exception:
        try:
            _CONN = _connect()
        except Exception:
            raise
        return _CONN

def db_execute(sql: str, params: Tuple | List | Dict = None, commit: bool = True):
    conn = _get_conn()
    for _ in range(2):
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
            if commit:
                conn.commit()
            return
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(0.2)
            conn = _connect()
        except Exception as e:
            if commit:
                conn.rollback()
            raise e

def db_execute_many(sql: str, seq_params: List[Tuple], commit: bool = True):
    conn = _get_conn()
    for _ in range(2):
        try:
            with conn.cursor() as cur:
                psycopg2.extras.execute_batch(cur, sql, seq_params, page_size=100)
            if commit:
                conn.commit()
            return
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(0.2)
            conn = _connect()
        except Exception as e:
            if commit:
                conn.rollback()
            raise e

def db_query(sql: str, params: Tuple | List | Dict = None) -> List[Dict[str, Any]]:
    conn = _get_conn()
    for _ in range(2):
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchall()
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(0.2)
            conn = _connect()
        except Exception as e:
            raise e

# =========================================================
# Bootstrap de tablas
# =========================================================

def _init_schema():
    # Transporte del cliente
    db_execute("""
    CREATE TABLE IF NOT EXISTS transporte_cliente (
        cliente_id      BIGINT PRIMARY KEY,
        transporte      TEXT,
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """)

    # Direcciones del cliente (lista)
    db_execute("""
    CREATE TABLE IF NOT EXISTS direcciones_cliente (
        cliente_id      BIGINT NOT NULL,
        idx             INTEGER NOT NULL,
        contacto        TEXT,
        calle           TEXT,
        ciudad          TEXT,
        estado          TEXT,
        codigo_postal   TEXT,
        es_principal    BOOLEAN,
        es_entrega      BOOLEAN,
        PRIMARY KEY (cliente_id, idx)
    )
    """)

    # Cache de pedidos creados desde la app
    db_execute("""
    CREATE TABLE IF NOT EXISTS pedido_cache (
        id                BIGSERIAL PRIMARY KEY,
        cliente_id        BIGINT,
        moneda            TEXT,
        tipo_cambio       NUMERIC,
        base_imponible    NUMERIC,
        impuestos_totales NUMERIC,
        total             NUMERIC,
        payload_json      JSONB,
        respuesta_json    JSONB,
        created_at        TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """)

    # Log de errores API
    db_execute("""
    CREATE TABLE IF NOT EXISTS api_error_log (
        id           BIGSERIAL PRIMARY KEY,
        endpoint     TEXT,
        metodo       TEXT,
        status_code  TEXT,
        mensaje      TEXT,
        detalle_json JSONB,
        created_at   TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """)

    # Cache de productos
    db_execute("""
    CREATE TABLE IF NOT EXISTS productos_cache (
        id           BIGINT PRIMARY KEY,         -- product.template id
        name         TEXT,
        default_code TEXT,
        list_price   NUMERIC,
        write_date   TIMESTAMP,
        updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """)
    db_execute("CREATE INDEX IF NOT EXISTS idx_productos_cache_name ON productos_cache USING GIN (to_tsvector('spanish', coalesce(name,'')))")
    db_execute("CREATE INDEX IF NOT EXISTS idx_productos_cache_code ON productos_cache (default_code)")

    # Cache de clientes por vendedor
    db_execute("""
    CREATE TABLE IF NOT EXISTS clientes_vendedor_cache (
        vendedor_cuit TEXT NOT NULL,
        cliente_id    BIGINT NOT NULL,
        name          TEXT,
        vat           TEXT,
        updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (vendedor_cuit, cliente_id)
    )
    """)

    # Assets externos (imágenes / PDFs) por producto
    db_execute("""
    CREATE TABLE IF NOT EXISTS product_asset (
        id               BIGSERIAL PRIMARY KEY,
        product_tmpl_id  BIGINT NOT NULL,
        kind             TEXT NOT NULL CHECK (kind IN ('image','pdf')),
        variant          TEXT,
        title            TEXT,
        sort_order       INTEGER DEFAULT 0,
        url              TEXT NOT NULL,     -- URL pública (CDN / r2.dev)
        key              TEXT,              -- clave en el bucket (opcional)
        meta             JSONB,             -- ej: {"w":1600,"h":900,"sha":"abc123"}
        created_at       TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """)
    db_execute("CREATE INDEX IF NOT EXISTS idx_product_asset_prod ON product_asset(product_tmpl_id)")
    db_execute("CREATE INDEX IF NOT EXISTS idx_product_asset_kind ON product_asset(kind)")
    db_execute("CREATE INDEX IF NOT EXISTS idx_product_asset_sort ON product_asset(product_tmpl_id, kind, sort_order)")

_init_schema()

# =========================================================
# Transporte cliente
# =========================================================

def get_transporte_cliente_db(cliente_id: int) -> Optional[str]:
    rows = db_query("SELECT transporte FROM transporte_cliente WHERE cliente_id=%s", (cliente_id,))
    return rows[0]["transporte"] if rows else None

def upsert_transporte_cliente_db(cliente_id: int, transporte: Optional[str], when: Optional[datetime]):
    db_execute("""
        INSERT INTO transporte_cliente (cliente_id, transporte, updated_at)
        VALUES (%s, %s, COALESCE(%s, NOW()))
        ON CONFLICT (cliente_id) DO UPDATE
        SET transporte = EXCLUDED.transporte,
            updated_at = EXCLUDED.updated_at
    """, (cliente_id, transporte, when))

# =========================================================
# Direcciones del cliente
# =========================================================

def get_direcciones_db(cliente_id: int) -> List[Dict[str, Any]]:
    return db_query("""
        SELECT contacto, calle, ciudad, estado, codigo_postal, es_principal, es_entrega
        FROM direcciones_cliente
        WHERE cliente_id=%s
        ORDER BY idx ASC
    """, (cliente_id,))

def replace_direcciones_db(cliente_id: int, direcciones: List[Dict[str, Any]]):
    db_execute("DELETE FROM direcciones_cliente WHERE cliente_id=%s", (cliente_id,))
    if not direcciones:
        return
    rows: List[Tuple] = []
    for i, d in enumerate(direcciones):
        rows.append((
            cliente_id,
            i,
            d.get("contacto"),
            d.get("calle"),
            d.get("ciudad"),
            d.get("estado"),
            d.get("codigo_postal"),
            bool(d.get("es_principal")),
            bool(d.get("es_entrega")),
        ))
    db_execute_many("""
        INSERT INTO direcciones_cliente
        (cliente_id, idx, contacto, calle, ciudad, estado, codigo_postal, es_principal, es_entrega)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, rows)

# =========================================================
# Pedido cache + Log de errores
# =========================================================

def insert_pedido_cache_db(
    cliente_id: int,
    moneda: Optional[str],
    tipo_cambio: Optional[float],
    base_imponible: Optional[float],
    impuestos_totales: Optional[float],
    total: Optional[float],
    payload: Dict[str, Any],
    respuesta: Dict[str, Any],
) -> Tuple[int, str]:
    db_execute("""
        INSERT INTO pedido_cache
        (cliente_id, moneda, tipo_cambio, base_imponible, impuestos_totales, total, payload_json, respuesta_json)
        VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb)
    """, (
        cliente_id, moneda, tipo_cambio, base_imponible, impuestos_totales, total,
        json.dumps(payload or {}), json.dumps(respuesta or {})
    ))
    row = db_query("""
        SELECT id, to_char(created_at,'YYYY-MM-DD HH24:MI:SS') AS ts
        FROM pedido_cache ORDER BY id DESC LIMIT 1
    """)
    if not row:
        return -1, ""
    return int(row[0]["id"]), row[0]["ts"]

def log_api_error_db(endpoint: str, metodo: str, status_code: Any, mensaje: str, detalle: Dict[str, Any]):
    try:
        db_execute("""
            INSERT INTO api_error_log (endpoint, metodo, status_code, mensaje, detalle_json)
            VALUES (%s, %s, %s, %s, %s::jsonb)
        """, (
            endpoint, metodo,
            str(status_code) if status_code is not None else None,
            mensaje, json.dumps(detalle or {})
        ))
    except Exception:
        traceback.print_exc()

# =========================================================
# Productos cache: upsert + búsqueda paginada
# =========================================================

def upsert_productos_db(productos: List[Dict[str, Any]]):
    """
    Espera items con keys: id, name, default_code, list_price, write_date (string o timestamp).
    """
    if not productos:
        return
    rows: List[Tuple] = []
    for p in productos:
        pid = p.get("id")
        if not pid:
            continue
        rows.append((
            int(pid),
            p.get("name"),
            p.get("default_code"),
            float(p.get("list_price") or 0.0),
            p.get("write_date"),
        ))
    db_execute_many("""
        INSERT INTO productos_cache (id, name, default_code, list_price, write_date)
        VALUES (%s,%s,%s,%s,%s)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            default_code = EXCLUDED.default_code,
            list_price = EXCLUDED.list_price,
            write_date = EXCLUDED.write_date,
            updated_at = NOW()
    """, rows)

def search_productos_db(search: Optional[str], limit: int, offset: int) -> Dict[str, Any]:
    limit = max(1, min(200, int(limit or 20)))
    offset = max(0, int(offset or 0))

    if search:
        query = """
            WITH filtro AS (
                SELECT *
                FROM productos_cache
                WHERE
                    to_tsvector('spanish', coalesce(name,'')) @@ plainto_tsquery('spanish', %(q)s)
                    OR lower(coalesce(default_code,'')) LIKE lower('%%' || %(q)s || '%%')
            )
            SELECT (SELECT count(*) FROM filtro) AS total,
                   json_agg(row_to_json(t)) AS items
            FROM (
                SELECT id, name, default_code, list_price, write_date
                FROM filtro
                ORDER BY write_date DESC NULLS LAST, id DESC
                LIMIT %(limit)s OFFSET %(offset)s
            ) t
        """
        params = {"q": search, "limit": limit, "offset": offset}
    else:
        query = """
            WITH filtro AS (SELECT * FROM productos_cache)
            SELECT (SELECT count(*) FROM filtro) AS total,
                   json_agg(row_to_json(t)) AS items
            FROM (
                SELECT id, name, default_code, list_price, write_date
                FROM filtro
                ORDER BY write_date DESC NULLS LAST, id DESC
                LIMIT %(limit)s OFFSET %(offset)s
            ) t
        """
        params = {"limit": limit, "offset": offset}

    rows = db_query(query, params)
    if not rows:
        return {"total": 0, "items": []}
    row = rows[0]
    return {"total": int(row.get("total") or 0), "items": row.get("items") or []}

# =========================================================
# Clientes por vendedor: cache simple
# =========================================================

def replace_clientes_vendedor_db(vendedor_cuit: str, clientes: List[Dict[str, Any]]):
    db_execute("DELETE FROM clientes_vendedor_cache WHERE vendedor_cuit=%s", (vendedor_cuit,))
    if not clientes:
        return
    data: List[Tuple] = []
    for c in clientes:
        cid = c.get("id")
        if not cid:
            continue
        data.append((vendedor_cuit, int(cid), c.get("name"), c.get("vat")))
    db_execute_many("""
        INSERT INTO clientes_vendedor_cache (vendedor_cuit, cliente_id, name, vat)
        VALUES (%s,%s,%s,%s)
    """, data)

def get_clientes_vendedor_db(vendedor_cuit: str, limit: int = 500, offset: int = 0) -> Dict[str, Any]:
    limit = max(1, min(1000, int(limit or 500)))
    offset = max(0, int(offset or 0))
    rows = db_query("""
        WITH cte AS (
            SELECT * FROM clientes_vendedor_cache WHERE vendedor_cuit=%s
        )
        SELECT
            (SELECT count(*) FROM cte) AS total,
            json_agg(row_to_json(t)) AS items
        FROM (
            SELECT cliente_id AS id, name, vat
            FROM cte
            ORDER BY name ASC NULLS LAST
            LIMIT %s OFFSET %s
        ) t
    """, (vendedor_cuit, limit, offset))
    if not rows:
        return {"total": 0, "items": []}
    r = rows[0]
    return {"total": int(r.get("total") or 0), "items": r.get("items") or []}

# =========================================================
# Assets externos (imágenes / PDFs) por producto
# =========================================================

def replace_product_assets_db(product_tmpl_id: int, assets: List[Dict[str, Any]]):
    """
    Reemplaza todos los assets de un product_tmpl_id.
    Cada asset debe tener:
      - kind: 'image' | 'pdf'
      - url:  URL pública absoluta (CDN / r2.dev)
    Opcionales:
      - variant: 'orig' | 'xl' | 'md' | 'sm' | 'thumb' | None
      - title: texto
      - sort_order: int
      - key: clave en bucket
      - meta: dict (ej. tamaños, hash, etc.)
    """
    db_execute("DELETE FROM product_asset WHERE product_tmpl_id=%s", (product_tmpl_id,))
    if not assets:
        return
    rows: List[Tuple] = []
    for a in assets:
        rows.append((
            product_tmpl_id,
            a.get("kind"),
            a.get("variant"),
            a.get("title"),
            int(a.get("sort_order") or 0),
            a.get("url"),
            a.get("key"),
            json.dumps(a.get("meta") or {})
        ))
    db_execute_many("""
        INSERT INTO product_asset
        (product_tmpl_id, kind, variant, title, sort_order, url, key, meta)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
    """, rows)

def get_product_assets_db(product_tmpl_id: int) -> List[Dict[str, Any]]:
    return db_query("""
        SELECT kind, variant, title, sort_order, url, key, meta
        FROM product_asset
        WHERE product_tmpl_id=%s
        ORDER BY kind, sort_order, variant NULLS LAST
    """, (product_tmpl_id,))
