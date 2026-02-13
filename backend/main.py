# main.py
import os
import json
import base64
import traceback
import time
import logging
import threading  # <--- Necesario para Thread Local y Lock
from datetime import datetime, timedelta
from queue import Queue, Empty
from http.client import ResponseNotReady, CannotSendRequest
from xmlrpc.client import ProtocolError
from typing import Optional
from urllib.parse import quote
import urllib.request
import urllib.parse
# ... otros imports ...
import ssl
import requests
import psycopg2 
from psycopg2.extras import RealDictCursor 

# --- IMPORTANTE: Importar odooly correctamente ---
import odooly as odoo

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from odooly import Client
import redis

# ==== Sync & DB (opcionales) ====
try:
    from sync_worker import sync_products, sync_partners
    HAS_SYNC = True
except Exception:
    HAS_SYNC = False

try:
    from db import fetch_products  # para endpoint rápido
    HAS_DB = True
except Exception:
    HAS_DB = False

# Opcionales (solo si los usás para R2 debug)
try:
    from r2_debug import list_keys, head_key, find_media_for_code
    HAS_R2_DEBUG = True
except Exception:
    HAS_R2_DEBUG = False

# ───────────────────────── App & CORS ─────────────────────────
app = Flask(__name__)
CORS(app, supports_credentials=True)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("salbom")
FIREBASE_BUCKET = os.getenv("FIREBASE_BUCKET", "app-salbom.firebasestorage.app").strip()

# ─────────────────────── Config Odoo/env ──────────────────────
ODOO_SERVER   = os.getenv("ODOO_SERVER")
ODOO_DB       = os.getenv("ODOO_DB")
ODOO_USER     = os.getenv("ODOO_USER")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD")
DATABASE_URL = os.getenv("DATABASE_URL")
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "").rstrip("/")

# ───────────────────── Redis (cache opcional) ─────────────────
REDIS_URL = os.getenv("REDIS_URL")
redis_client = None
if REDIS_URL:
    try:
        redis_client = redis.Redis.from_url(REDIS_URL)
        redis_client.ping()
        log.info("[CACHE] Redis conectado")
    except Exception as e:
        log.warning(f"[CACHE] Falló conexión a Redis ({e}). Seguimos sin cache.")
        redis_client = None

CACHE_EXPIRATION = 300  # seg

def cache_get(k):
    if not redis_client:
        return None
    try:
        v = redis_client.get(k)
        if v:
            return json.loads(v)
    except Exception as e:
        log.warning(f"[CACHE] get {k} error: {e}")
    return None

def cache_setex(k, ttl, v):
    if not redis_client:
        return
    try:
        redis_client.setex(k, ttl, json.dumps(v))
    except Exception as e:
        log.warning(f"[CACHE] setex {k} error: {e}")

def get_cache_or_execute(key: str, ttl: int = 300, fallback_fn=None):
    cached = cache_get(key)
    if cached is not None:
        log.info(f"✅ Redis hit: {key}")
        return cached
    result = None
    try:
        result = fallback_fn() if fallback_fn else None
    except Exception as e:
        log.error(f"[fallback_fn:{key}] {e}")
    if result is not None:
        cache_setex(key, ttl, result)
    return result

# Helper para calcular rango de fechas del mes seleccionado
def get_month_range(year, month):
    # Primer día del mes
    start_date = datetime(year, month, 1)
    # Primer día del mes siguiente
    if month == 12:
        next_month = datetime(year + 1, 1, 1)
    else:
        next_month = datetime(year, month + 1, 1)
    return start_date, next_month

# -------------------------------------------------------------------------
# GESTIÓN DE CONEXIONES ROBUSTA (Thread Local + Login Lock)
# -------------------------------------------------------------------------

# Almacenamiento local para cada hilo
_thread_local = threading.local()

# Lock global SOLO para el momento de crear/loguear el cliente
# Esto evita que dos hilos intenten hacer el handshake SSL/XMLRPC al mismo tiempo
# y corrompan el estado del socket (causa del CannotSendRequest).
_login_lock = threading.Lock()

def is_connection_error(e):
    """Detecta si el error es por conexión rota o estado inválido de Odoo/XMLRPC"""
    msg = str(e)
    return any(x in msg for x in [
        "CannotSendRequest", "ResponseNotReady", "RemoteDisconnected", 
        "ProtocolError", "Connection reset", "Broken pipe", "Idle", "Request-sent"
    ])

def get_odoo_client():
    """
    Obtiene un cliente Odoo único para el hilo actual (Thread-Safe).
    Usa un Lock durante la creación para evitar condiciones de carrera en el login.
    """
    # 1. Si este hilo ya tiene cliente vivo, lo devuelve (Rápido, sin lock)
    if hasattr(_thread_local, 'client') and _thread_local.client:
        return _thread_local.client

    # 2. Si no, entramos en modo exclusivo para crear la conexión
    with _login_lock:
        # Doble chequeo por si otro hilo lo creó mientras esperábamos el lock (raro en thread-local, pero buena práctica)
        if hasattr(_thread_local, 'client') and _thread_local.client:
            return _thread_local.client
            
        try:
            # Creamos la conexión de forma segura
            client = odoo.Client(ODOO_SERVER, ODOO_DB, ODOO_USER, ODOO_PASSWORD)
            _thread_local.client = client
            return client
        except Exception as e:
            log.error(f"❌ Error conectando a Odoo (Login): {str(e)}")
            raise e

def release_odoo_client(client, destroy=False):
    """
    Si destroy=True, borramos la referencia para forzar reconexión la próxima vez.
    """
    if destroy:
        if hasattr(_thread_local, 'client'):
            # Eliminamos la referencia para que el GC se encargue y el próximo get_odoo_client cree uno nuevo
            del _thread_local.client

def execute_odoo_operation(func):
    """
    Ejecuta una función 'func(client)' con reintentos automáticos.
    Si la conexión falla por 'Idle' o 'Request-sent', limpia el Thread Local y prueba de nuevo.
    """
    max_retries = 3
    last_error = None
    
    for attempt in range(1, max_retries + 1):
        client = None
        try:
            client = get_odoo_client()
            return func(client)  # Ejecutamos la lógica del endpoint
        except Exception as e:
            last_error = e
            # Si es error de conexión, marcamos para destruir y reintentamos
            if is_connection_error(e):
                log.warning(f"⚠️ [Intento {attempt}] Conexión inestable ({e}). Renovando cliente...")
                release_odoo_client(client, destroy=True)
                time.sleep(0.2) 
                continue 
            else:
                # Si es error de lógica (ej: usuario no encontrado), fallamos directo
                raise e
        
        # Si llegamos acá, todo salió bien
        break
            
    # Si salimos del loop sin retornar, lanzamos el último error capturado
    if last_error:
        raise last_error

# Handler Legacy para endpoints que aún no usan execute_odoo_operation
def handle_connection_error(e):
    try:
        if is_connection_error(e):
            log.warning('⚠️ Conexión fallida a Odoo (Legacy Handler). Reset Thread Local.')
            release_odoo_client(None, destroy=True)
    except Exception:
        pass

# ───────── Background Sync (opción B, gratis) ─────────
import random
BACKGROUND_SYNC_INTERVAL = int(os.getenv("BACKGROUND_SYNC_INTERVAL", "600"))  # cada 10 min por defecto
ENABLE_BACKGROUND_SYNC = os.getenv("ENABLE_BACKGROUND_SYNC", "1") == "1"

def acquire_lock(lock_key: str, ttl: int) -> bool:
    """Intenta tomar un lock en Redis para evitar que múltiples réplicas sincronicen a la vez."""
    if not redis_client:
        return True
    try:
        return bool(redis_client.set(lock_key, "1", nx=True, ex=ttl))
    except Exception:
        return True  # si Redis falla, seguimos (hay una sola réplica en free)

def release_lock(lock_key: str):
    if not redis_client:
        return
    try:
        redis_client.delete(lock_key)
    except Exception:
        pass

def periodic_sync_loop(interval_sec: int):
    """
    Loop de sincronización en segundo plano. 
    Ahora incluye la actualización de la tabla de ofertas en PostgreSQL.
    """
    if not HAS_SYNC:
        log.info("SYNC: módulo sync_worker no disponible; deshabilitado.")
        return

    # Pequeño jitter inicial para evitar colisiones en reinicios
    time.sleep(random.randint(3, 12))

    while True:
        # Intentamos tomar el lock en Redis para que solo una instancia sincronice
        if acquire_lock("salbom:sync_lock", ttl=interval_sec):
            try:
                log.info("🔄 Iniciando ciclo de sincronización periódica...")
                
                # 1. Sincronización base de Odoo (Productos y Partners)
                p = sync_products()
                c = sync_partners()
                
                # 2. Sincronización de Ofertas (Tarifa 70) a PostgreSQL
                # Realizamos una llamada interna al endpoint de ofertas
                with app.test_client() as c_sync:
                    res = c_sync.post('/admin/sync-offers')
                    offers_data = res.get_json()
                    offers_count = offers_data.get('count', 0) if offers_data else 0

                log.info(f"✅ SYNC OK: productos={p}, partners={c}, ofertas_skus={offers_count}")

            except Exception as e:
                log.error(f"❌ SYNC ERROR: {e}\n{traceback.format_exc()}")
            finally:
                release_lock("salbom:sync_lock")
        
        # Esperar hasta el próximo ciclo
        time.sleep(interval_sec)

# ───────────── NO-PG (mem) y utilidades varias ───────────────
USE_DB = False
_MEM_PEDIDOS_CACHE = []

def _scalar_id(x):
    """Convierte un id que puede venir como [123] o recordset en un int plano."""
    try:
        if isinstance(x, (list, tuple)) and x:
            return int(x[0])
        return int(x)
    except Exception:
        return None

def safe_log_error(endpoint: str, metodo: str, status_code, mensaje: str, detalle: dict):
    try:
        log.error(f"[NO-PG LOG] {endpoint} {metodo} {status_code} {mensaje} {detalle}")
    except Exception:
        pass

# ───────────────────────── DEBUG R2 ───────────────────────────
if HAS_R2_DEBUG:
    @app.route("/debug/r2/config", methods=["GET"])
    def r2_config():
        from r2_debug import _summarize_config
        return jsonify({"ok": True, "config": _summarize_config()})

    @app.route("/debug/r2/list", methods=["GET"])
    def r2_list():
        prefix   = request.args.get("prefix", "")
        max_keys = int(request.args.get("max_keys", 200))
        return jsonify(list_keys(prefix=prefix, max_keys=max_keys))

    @app.route("/debug/r2/head", methods=["GET"])
    def r2_head():
        key = request.args.get("key")
        if not key:
            return jsonify({"error": "Parámetro key requerido"}), 400
        return jsonify(head_key(key))

    @app.route("/debug/r2/find", methods=["GET"])
    def r2_find():
        code = request.args.get("code")
        if not code:
            return jsonify({"error": "Parámetro code requerido"}), 400
        return jsonify(find_media_for_code(code))
    
# --- HERRAMIENTA DE REPARACIÓN (SOLUCIÓN DEFINITIVA) ---
@app.route('/fix-schema', methods=['GET'])
def fix_schema_manual():
    conn = get_pg_connection()
    if not conn: return jsonify({"error": "No DB connection"}), 500
    
    log_msgs = []
    try:
        cur = conn.cursor()
        
        # 1. Asegurar restricción UNIQUE en app_users (para evitar error ON CONFLICT)
        try:
            cur.execute("ALTER TABLE app_users ADD CONSTRAINT app_users_cuit_key UNIQUE (cuit);")
            log_msgs.append("Constraint UNIQUE CUIT: OK")
        except:
            conn.rollback()
            log_msgs.append("Constraint UNIQUE CUIT: Ya existía")

        # 2. Limpiar app_user_roles de columnas problemáticas si fuera necesario
        # (Opcional, pero para tu tranquilidad quitamos el requerimiento de email en los SELECTs de arriba)
        
        conn.commit()
        return jsonify({"status": "Reparación Finalizada", "detalles": log_msgs})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


# ───────────────────────── ENDPOINTS ─────────────────────────

# ---------------------------------------------------------------
# HELPERS POSTGRESQL (Gestión de Roles)
# ---------------------------------------------------------------

def get_pg_connection():
    if not DATABASE_URL:
        return None
    try:
        # sslmode='require' es necesario para Render/Heroku
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        log.error(f"❌ Error conectando a Postgres: {e}")
        return None

def init_roles_table():
    """
    Inicializa la tabla de roles.
    CORRECCIÓN: Elimina la restricción de Primary Key vieja para permitir pre-asignados.
    """
    if not DATABASE_URL: return
    conn = get_pg_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        
        # 1. Crear tabla si no existe
        cur.execute("""
            CREATE TABLE IF NOT EXISTS app_user_roles (
                user_id INTEGER,
                role_name TEXT NOT NULL
            );
        """)
        
        # 2. AGREGAR COLUMNAS FALTANTES
        for col in ['email', 'name', 'cuit']:
            cur.execute(f"ALTER TABLE app_user_roles ADD COLUMN IF NOT EXISTS {col} TEXT;")

        # --- CORRECCIÓN CRÍTICA ---
        # 3. Eliminar la restricción PRIMARY KEY vieja (si existe) que impide guardar NULLs
        try:
            cur.execute("ALTER TABLE app_user_roles DROP CONSTRAINT IF EXISTS app_user_roles_pkey;")
        except Exception as e:
            log.warning(f"Nota: No se pudo borrar PK (quizás no existía): {e}")

        # 4. Permitir explícitamente que user_id sea NULL
        try:
            cur.execute("ALTER TABLE app_user_roles ALTER COLUMN user_id DROP NOT NULL;")
        except Exception as e:
            log.warning(f"Nota: No se pudo alterar columna user_id: {e}")
        # --------------------------

        # 5. Índices para evitar duplicados
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_cuit ON app_user_roles (cuit) WHERE cuit IS NOT NULL;")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_email ON app_user_roles (email) WHERE email IS NOT NULL;")

        conn.commit()
        cur.close()
        log.info("✅ Tabla 'app_user_roles' LIBERADA y lista para pre-asignaciones.")
    except Exception as e:
        if conn: conn.rollback()
        log.error(f"⚠️ Init Roles Error: {e}")
    finally:
        if conn: conn.close()
# --- ENDPOINTS GESTIÓN USUARIOS (Pre-asignación) ---

@app.route('/odoo-users', methods=['GET'])
def get_odoo_users():
    """
    OPTIMIZADO: Trae usuarios Odoo + CUITs en solo 2 consultas (Batch).
    Evita bloqueos y timeouts.
    """
    client = get_odoo_client()
    try:
        # 1. Traer usuarios activos (Lote grande)
        users = client.env['res.users'].search_read(
            [('active', '=', True)], 
            ['name', 'login', 'partner_id', 'share'],
            limit=500 
        )
        
        # 2. Extraer IDs de partners para pedir CUITs de una sola vez
        partner_ids = [u['partner_id'][0] for u in users if u.get('partner_id')]
        
        # 3. Pedir CUITs en bloque (Batch Request)
        partners_data = []
        if partner_ids:
            partners_data = client.env['res.partner'].read(partner_ids, ['vat'])
        
        # 4. Mapa rápido en memoria { id_partner: cuit }
        vat_map = {p['id']: p.get('vat', '') for p in partners_data}

        # 5. Cruzar datos
        data = []
        for u in users:
            cuit = ''
            if u.get('partner_id'):
                pid = u['partner_id'][0]
                cuit = vat_map.get(pid, '')
            
            tipo = "Portal" if u.get('share') else "Interno"

            data.append({
                "name": u['name'],
                "email": u['login'],
                "cuit": cuit,
                "odoo_id": u['id'],
                "tipo_odoo": tipo 
            })
            
        return jsonify(data)
    except Exception as e:
        log.error(f"Error Odoo Users: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route('/admin/preasignar', methods=['POST'])
def preasignar_rol():
    data = request.get_json()
    email = data.get('email')
    cuit = data.get('cuit')
    name = data.get('name')
    role = data.get('role')

    if not role: return jsonify({"error": "Falta rol"}), 400

    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        msg = ""
        
        if cuit:
            # Lógica CUIT (Ignora email para no fallar)
            cur.execute("SELECT id FROM app_users WHERE cuit = %s", (cuit,))
            row = cur.fetchone()
            if row:
                user_id = row[0]
                cur.execute("""
                    INSERT INTO app_user_roles (user_id, role_name, cuit, name) 
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (user_id) DO UPDATE SET role_name = EXCLUDED.role_name;
                """, (user_id, role, cuit, name))
                cur.execute("UPDATE app_users SET role = %s WHERE id = %s", (role, user_id))
                msg = "Usuario existente actualizado."
            else:
                cur.execute("""
                    INSERT INTO app_user_roles (cuit, role_name, name) 
                    VALUES (%s, %s, %s)
                    ON CONFLICT (cuit) DO UPDATE 
                    SET role_name = EXCLUDED.role_name, name = EXCLUDED.name;
                """, (cuit, role, name))
                msg = "Rol pre-asignado correctamente."
        elif email:
             cur.execute("""
                INSERT INTO app_user_roles (email, role_name, name) 
                VALUES (%s, %s, %s)
                ON CONFLICT (email) DO UPDATE 
                SET role_name = EXCLUDED.role_name, name = EXCLUDED.name;
            """, (email, role, name))
             msg = "Rol pre-asignado por Email."
        else:
            return jsonify({"error": "Falta CUIT o Email"}), 400

        conn.commit()
        return jsonify({"message": msg})
    except Exception as e:
        conn.rollback()
        log.error(f"Error preasignar: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# --- INICIALIZAR TABLA DE CONFIGURACIONES GENERALES ---
def init_config_table():
    if not DATABASE_URL: return
    conn = get_pg_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        # Tabla simple: Clave (ej: 'popup_tc') -> Valor (JSON text)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS app_configurations (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        """)
        conn.commit()
        cur.close()
        log.info("✅ Tabla 'app_configurations' verificada.")
    except Exception as e:
        log.error(f"❌ Error tabla config: {e}")
    finally:
        if conn: conn.close()

init_config_table()

# --- ENDPOINTS PARA CONFIGURACIÓN (Generic Key-Value) ---

@app.route('/config/<string:key>', methods=['GET'])
def get_app_config(key):
    pg_conn = get_pg_connection()
    if not pg_conn: return jsonify({})
    try:
        cur = pg_conn.cursor()
        cur.execute("SELECT value FROM app_configurations WHERE key = %s", (key,))
        row = cur.fetchone()
        cur.close()
        
        if row and row[0]:
            return jsonify(json.loads(row[0]))
        return jsonify({}) # Retorna vacío si no existe
    except Exception as e:
        log.error(f"Error getting config {key}: {e}")
        return jsonify({}), 500
    finally:
        if pg_conn: pg_conn.close()

@app.route('/config/<string:key>', methods=['POST'])
def save_app_config(key):
    data = request.get_json() or {}
    pg_conn = get_pg_connection()
    if not pg_conn: return jsonify({"error": "No DB"}), 500
    
    try:
        cur = pg_conn.cursor()
        json_val = json.dumps(data)
        
        # Upsert (Insert or Update)
        sql = """
            INSERT INTO app_configurations (key, value)
            VALUES (%s, %s)
            ON CONFLICT (key) 
            DO UPDATE SET value = EXCLUDED.value;
        """
        cur.execute(sql, (key, json_val))
        pg_conn.commit()
        cur.close()
        return jsonify({"ok": True})
    except Exception as e:
        if pg_conn: pg_conn.rollback()
        log.error(f"Error saving config {key}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if pg_conn: pg_conn.close()

# Ejecutar la inicialización al arrancar
init_roles_table()

# ---------- Endpoint rápido desde Postgres (opcional) ----------
from flask import jsonify as _jsonify  # alias para evitar shadowing

@app.get("/productos_rapido")
def productos_rapido():
    if not HAS_DB:
        return _jsonify({"ok": False, "error": "DB local no disponible"}), 501
    try:
        q = (request.args.get("q") or "").strip()
        page = max(1, int(request.args.get("page", 1)))
        limit = max(1, min(200, int(request.args.get("limit", 50))))
        offset = (page - 1) * limit
        rows = fetch_products(q=q, limit=limit, offset=offset)
        return _jsonify({"ok": True, "rows": rows, "page": page, "limit": limit})
    except Exception as e:
        return _jsonify({"ok": False, "error": str(e)}), 500
# ---------------------------------------------------------------

def fb_url(path: str) -> str:
    # https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media
    return f"https://firebasestorage.googleapis.com/v0/b/{FIREBASE_BUCKET}/o/{quote(path, safe='')}?alt=media"

# ---------------------------------------------------------------

@app.route("/facturas", methods=["GET"])
def get_facturas():
    client = get_odoo_client()
    try:
        cuit = request.args.get("cuit")
        if not cuit:
            return jsonify({"error": "CUIT no proporcionado"}), 400

        partner = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner:
            return jsonify({"error": "CUIT inválido"}), 404

        user = client.env["res.users"].search([("partner_id", "=", partner.id)], limit=1)
        if not user:
            return jsonify({"error": "Usuario no encontrado"}), 404

        hoy = datetime.today()
        inicio_mes = hoy.replace(day=1)
        key = f"facturas:{user.id}"

        def query():
            facturas_raw = client.env["account.move"].search_read(
                [
                    ("invoice_user_id", "=", user.id),
                    ("move_type", "=", "out_invoice"),
                    ("state", "=", "posted"),
                    ("invoice_date", ">=", inicio_mes.strftime("%Y-%m-%d")),
                ],
                ["id", "name", "invoice_date", "amount_total", "partner_id"],
            )
            return [
                {
                    "id": f["id"],
                    "name": f["name"],
                    "invoice_date": f["invoice_date"],
                    "amount_total": f["amount_total"],
                    "partner_id": f["partner_id"][0] if isinstance(f["partner_id"], list) else f["partner_id"],
                }
                for f in facturas_raw
            ]

        facturas = get_cache_or_execute(key, fallback_fn=query) or []
        return jsonify(facturas)
    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /facturas:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

# ... (imports anteriores se mantienen)

# ---------------------------------------------------------------

# main.py

@app.route("/productos", methods=["GET"])
def get_productos():
    client = get_odoo_client()
    pg_conn = None
    try:
        search   = (request.args.get("search") or "").strip()
        limit    = int(request.args.get("limit", 20))
        offset   = int(request.args.get("offset", 0))
        as_array = str(request.args.get("format", "")).lower() in ("array", "arr", "list")
        no_tag   = str(request.args.get("no_tag_filter", "false")).lower() == "true"
        marca_id = request.args.get("marca_id")
        categ_id = request.args.get("categ_id")

        # 1. Obtener mapeo de ofertas desde PostgreSQL (Persistencia SKU)
        offer_map = {}
        pg_conn = get_pg_connection()
        if pg_conn:
            cur = pg_conn.cursor()
            cur.execute("SELECT sku, price_offer FROM app_product_offers WHERE is_active = TRUE")
            rows = cur.fetchall()
            offer_map = {r[0]: float(r[1]) for r in rows}
            cur.close()

        # 2. Detectar campo marca en Odoo
        posibles_campos = ["product_brand_id", "x_brand", "x_marca", "brand_id", "x_studio_marca"]
        campo_marca = None
        try:
            res_fields = client.env["product.template"].fields_get(posibles_campos, attributes=["string"])
            for candidato in posibles_campos:
                if candidato in res_fields:
                    campo_marca = candidato
                    break
        except Exception: pass

        # 3. Construir Dominio de Búsqueda
        domain = []
        if not no_tag: 
            domain.append(["product_tag_ids", "ilike", "APP"])
        
        if search:
            for term in search.split():
                domain.append("|")
                domain.append("|")
                domain.append(["name", "ilike", term])
                domain.append(["default_code", "ilike", term])
                domain.append(["categ_id.complete_name", "ilike", term])

        if marca_id and campo_marca: 
            domain.append([campo_marca, "=", int(marca_id)])
        if categ_id: 
            domain.append(["categ_id", "=", int(categ_id)])

        base_fields = ["id", "name", "list_price", "default_code", "write_date", "categ_id"]
        if campo_marca: 
            base_fields.append(campo_marca)

        # 4. Consulta a Odoo (Templates)
        productos = client.env["product.template"].search_read(
            domain or [], base_fields, offset=0, limit=1000
        ) or []

        # 5. Calcular Stock (Solo para la página solicitada)
        total = len(productos)
        page_slice = productos[offset: offset + limit]
        stock_data_map = _compute_stock_states(client, page_slice)

        def get_fb_url(p):
            return f"https://firebasestorage.googleapis.com/v0/b/{FIREBASE_BUCKET}/o/{quote(p, safe='')}?alt=media"

        # 6. Normalización de Resultados
        norm = []
        for r in page_slice:
            brand_name = ""
            if campo_marca:
                pb = r.get(campo_marca)
                if isinstance(pb, (list, tuple)) and len(pb) >= 2: brand_name = pb[1]
                elif isinstance(pb, str): brand_name = pb

            pid = int(r.get("id"))
            sku = (r.get("default_code") or "").strip()
            wd = str(r.get("write_date") or "")
            
            # Imágenes de Firebase por SKU
            code_path = f"products/{sku}/{sku}.webp" if sku else None
            md_path    = code_path or f"products/{pid}/md.webp"
            thumb_path = code_path or f"products/{pid}/thumb.webp"

            # Lógica de Precios con persistencia de PG
            list_price = float(r.get("list_price") or 0)
            offer_price = offer_map.get(sku, None)
            
            # Validar que la oferta sea menor al precio de lista
            if offer_price is not None and offer_price >= list_price: 
                offer_price = None

            st_info = stock_data_map.get(pid, {'state': 'green', 'quantity': 0})

            norm.append({
                "id": pid,
                "name": r.get("name") or "",
                "list_price": list_price,
                "price_offer": offer_price,
                "default_code": sku,
                "write_date": wd,
                "categ_id": r.get("categ_id"),
                "brand": brand_name,
                "image_thumb_url": get_fb_url(thumb_path) + (f"&v={wd}" if thumb_path else ""),
                "image_md_url":    get_fb_url(md_path)    + (f"&v={wd}" if md_path else ""),
                "stock_state": st_info['state'],
                "stock_qty": st_info['quantity']
            })

        if pg_conn: pg_conn.close()
        
        if as_array: 
            return jsonify(norm)
        return jsonify({"total": total, "items": norm, "limit": limit, "offset": offset})

    except Exception as e:
        if pg_conn: pg_conn.close()
        handle_connection_error(e)
        log.error("❌ /productos error: " + str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route("/marcas", methods=["GET"])
def get_marcas():
    client = get_odoo_client()
    try:
        # Usamos una clave de caché distinta para diferenciarla de la lista completa anterior
        key = "marcas_filtradas_app"

        def query():
            # 1. Buscar TODOS los productos con etiqueta 'APP'
            # Solo traemos el campo 'product_brand_id' para que sea rápido
            products = client.env["product.template"].search_read(
                [("product_tag_ids", "ilike", "APP")], 
                ["product_brand_id"]
            )
            
            # 2. Extraer los IDs únicos de las marcas usadas en esos productos
            brand_ids = set()
            for p in products:
                pb = p.get("product_brand_id")
                # Odoo devuelve many2one como [id, "Nombre"] o False
                if pb and isinstance(pb, (list, tuple)) and len(pb) > 0:
                    brand_ids.add(pb[0])
            
            if not brand_ids:
                return []

            # 3. Buscar los detalles (nombre) solo de esas marcas
            return client.env["product.brand"].search_read(
                [("id", "in", list(brand_ids))], 
                ["id", "name"],
                order="name asc"
            )

        return jsonify(get_cache_or_execute(key, fallback_fn=query))

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /marcas: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)


@app.route("/categorias", methods=["GET"])
def get_categorias():
    client = get_odoo_client()
    try:
        key = "categorias_filtradas_app"

        def query():
            # 1. Buscar TODOS los productos con etiqueta 'APP'
            products = client.env["product.template"].search_read(
                [("product_tag_ids", "ilike", "APP")], 
                ["categ_id"]
            )
            
            # 2. Extraer IDs únicos de categorías
            categ_ids = set()
            for p in products:
                pc = p.get("categ_id")
                if pc and isinstance(pc, (list, tuple)) and len(pc) > 0:
                    categ_ids.add(pc[0])
            
            if not categ_ids:
                return []

            # 3. Buscar los detalles de esas categorías
            return client.env["product.category"].search_read(
                [("id", "in", list(categ_ids))], 
                ["id", "name"],
                order="name asc"
            )

        return jsonify(get_cache_or_execute(key, fallback_fn=query))

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /categorias: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

# ---------------------------------------------------------------
# ADMIN: OBTENER PROMOCIONES (MEJORADO PARA EDICIÓN)
# ---------------------------------------------------------------
@app.route('/admin/promociones', methods=['GET'])
def get_admin_promociones():
    client = get_odoo_client()
    try:
        q = request.args.get('q', '').strip()
        month = request.args.get('month')
        year = request.args.get('year')
        sort_by = request.args.get('sort_by', 'date_start')
        order_dir = request.args.get('order_dir', 'desc')
        status_filter = request.args.get('status', 'active') 

        if sort_by not in ['date_start', 'date_end']: sort_by = 'date_start'
        if order_dir not in ['asc', 'desc']: order_dir = 'desc'

        PRICELIST_ID = 70
        domain = [('pricelist_id', '=', PRICELIST_ID)]
        
        # Filtro Texto (Nombre producto o categoría)
        if q:
            domain.append('|')
            domain.append(('product_tmpl_id.name', 'ilike', q))
            domain.append(('categ_id.name', 'ilike', q))

        # Filtro Mes/Año
        if month and year:
            try:
                m, y = int(month), int(year)
                start_date_month = datetime(y, m, 1)
                end_date_month = datetime(y + 1, 1, 1) if m == 12 else datetime(y, m + 1, 1)
                
                s_str = start_date_month.strftime("%Y-%m-%d")
                e_str = end_date_month.strftime("%Y-%m-%d")

                domain.append(('date_start', '<', e_str))
                domain.append('|')
                domain.append(('date_end', '=', False))
                domain.append(('date_end', '>=', s_str))
            except: pass

        # Filtro Estado
        today_str = datetime.now().strftime("%Y-%m-%d")
        if status_filter == 'active':
             domain.append('|')
             domain.append(('date_end', '=', False))
             domain.append(('date_end', '>=', today_str))
        elif status_filter == 'expired':
             domain.append(('date_end', '<', today_str))

        order_sql = f"{sort_by} {order_dir}"
        
        # AGREGAMOS 'applied_on' y 'categ_id' para saber qué estamos editando
        fields = [
            'product_tmpl_id', 'categ_id', 'applied_on', 
            'fixed_price', 'date_start', 'date_end', 'min_quantity'
        ]
        
        items = client.env['product.pricelist.item'].search_read(
            domain, fields, order=order_sql, limit=300
        )

        resultado = []
        now = datetime.now()

        for item in items:
            # Detectar si es Producto o Categoría
            applied_on = item.get('applied_on')
            target_type = 'product'
            target_id = None
            name = "Desconocido"
            
            if applied_on == '2_product_category':
                target_type = 'category'
                cat = item.get('categ_id') # [id, name]
                if cat:
                    target_id = cat[0]
                    name = cat[1]
            else:
                # Por defecto '1_product'
                prod = item.get('product_tmpl_id') # [id, name]
                if prod:
                    target_id = prod[0]
                    name = prod[1]

            # Fechas y Estado
            start_str = item.get('date_start')
            end_str = item.get('date_end')
            
            estado = "activa"
            if start_str:
                dt_s = datetime.strptime(str(start_str)[:10], "%Y-%m-%d")
                if dt_s > now: estado = "futura"
            
            if end_str and estado == "activa":
                dt_e = datetime.strptime(str(end_str)[:10], "%Y-%m-%d")
                if dt_e + timedelta(hours=23, minutes=59) < now: 
                    estado = "vencida"

            # Imagen (solo si es producto)
            img_url = None
            if target_type == 'product' and target_id:
                img_url = f"{PUBLIC_BASE_URL}/producto/{target_id}/imagen"

            resultado.append({
                'id': item['id'],
                'target_type': target_type,
                'target_id': target_id,
                'name': name,
                'price': item.get('fixed_price') or 0.0,
                'min_qty': item.get('min_quantity') or 0,
                'date_start': start_str or None,
                'date_end': end_str or None,
                'status': estado,
                'img_url': img_url
            })

        return jsonify(resultado)

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /admin/promociones: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        release_odoo_client(client)

# ---------------------------------------------------------------
# ADMIN: EDITAR PROMOCIÓN (PUT)
# ---------------------------------------------------------------
@app.route('/admin/promociones/editar/<int:promo_id>', methods=['PUT'])
def edit_admin_promocion(promo_id):
    client = get_odoo_client()
    try:
        data = request.get_json() or {}
        
        target_type = data.get('target_type') 
        target_id = data.get('target_id')
        price = data.get('price')
        min_qty = data.get('min_qty', 0)
        date_start = data.get('date_start') 
        date_end = data.get('date_end')     

        vals = {
            'fixed_price': float(price),
            'min_quantity': int(min_qty),
            # Asumimos que date_start/end ya vienen formateados o False
            'date_start': date_start if date_start else False,
            'date_end': date_end if date_end else False,
        }

        # Si cambian el target (de producto A a producto B)
        if target_type == 'category':
            vals['applied_on'] = '2_product_category'
            vals['categ_id'] = int(target_id)
            vals['product_tmpl_id'] = False # Limpiar producto si había
        else:
            vals['applied_on'] = '1_product'
            vals['product_tmpl_id'] = int(target_id)
            vals['categ_id'] = False # Limpiar categoría si había

        client.env['product.pricelist.item'].write([promo_id], vals)
        
        return jsonify({'ok': True})

    except Exception as e:
        log.error(f"❌ /admin/promociones/editar: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        release_odoo_client(client)


# ---------------------------------------------------------------
# ADMIN: ELIMINAR PROMOCIÓN (DELETE)
# ---------------------------------------------------------------
@app.route('/admin/promociones/eliminar/<int:promo_id>', methods=['DELETE'])
def delete_admin_promocion(promo_id):
    client = get_odoo_client()
    try:
        client.env['product.pricelist.item'].unlink([promo_id])
        return jsonify({'ok': True})
    except Exception as e:
        log.error(f"❌ /admin/promociones/eliminar: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        release_odoo_client(client)

# ---------------------------------------------------------------
# OBTENER INFORMACIÓN DETALLADA (ATRIBUTOS) DE UN PRODUCTO
# ---------------------------------------------------------------
# main.py

@app.route('/producto/<int:product_id>/info', methods=['GET'])
def get_product_attributes(product_id):
    # Cache key v14 para invalidar
    key = f"prod_info_v14:{product_id}"

    def query():
        client = get_odoo_client()
        try:
            # 1. Atributos (Corrección Nombres)
            lines = client.env['product.template.attribute.line'].search_read(
                [('product_tmpl_id', '=', product_id)], ['attribute_id', 'value_ids']
            )
            attributes_list = []
            for line in lines:
                attr_name = line['attribute_id'][1] if line['attribute_id'] else "Atributo"
                vids = line.get('value_ids') or []
                values_str = ""

                if vids:
                    # IDs a Nombres reales
                    if isinstance(vids[0], int):
                        vals = client.env['product.attribute.value'].read(vids, ['name'])
                        names = [v['name'] for v in vals]
                        values_str = ", ".join(names)
                    else:
                        values_str = str(vids)

                if values_str:
                    attributes_list.append({'k': attr_name, 'v': values_str})

            # 2. Descripción
            pdata = client.env['product.template'].read([product_id], ['description_sale'])[0]
            desc = pdata.get('description_sale') or ""

            # 3. Stock State y Qty
            st_map = _compute_stock_states(client, [{'id': product_id}])
            st_data = st_map.get(product_id, {'state': 'green', 'quantity': 0})

            return {
                'attributes': attributes_list,
                'description': desc,
                'stock_state': st_data.get('state', 'green'),
                'stock_qty': st_data.get('quantity', 0)
            }
        finally:
            release_odoo_client(client)

    return jsonify(get_cache_or_execute(key, ttl=20, fallback_fn=query))

# ---------------------------------------------------------------
# ADMIN: CREAR PROMOCIÓN (TARIFA 70) - CON HORA EXACTA
# ---------------------------------------------------------------
@app.route('/admin/promociones/crear', methods=['POST'])
def create_admin_promocion():
    client = get_odoo_client()
    try:
        data = request.get_json() or {}
        
        target_type = data.get('target_type') 
        target_id = data.get('target_id')
        price = data.get('price')
        min_qty = data.get('min_qty', 0)
        
        # Recibimos fechas strings. Pueden venir como "YYYY-MM-DD" o "YYYY-MM-DD HH:MM:SS"
        date_start = data.get('date_start') 
        date_end = data.get('date_end')     

        if not target_type or not target_id or price is None:
            return jsonify({'error': 'Faltan datos obligatorios'}), 400

        PRICELIST_ID = 70
        
        # Helper para formatear fecha
        def format_dt(dt_str, is_end=False):
            if not dt_str: return False
            dt_str = str(dt_str).strip()
            # Si ya tiene hora (largo > 10), lo usamos tal cual. Si no, agregamos default.
            if len(dt_str) > 10:
                return dt_str
            if is_end:
                return f"{dt_str} 23:59:59"
            return f"{dt_str} 00:00:00"

        vals = {
            'pricelist_id': PRICELIST_ID,
            'compute_price': 'fixed',
            'fixed_price': float(price),
            'min_quantity': int(min_qty),
            'date_start': format_dt(date_start, is_end=False),
            'date_end': format_dt(date_end, is_end=True),
        }

        if target_type == 'category':
            vals['applied_on'] = '2_product_category'
            vals['categ_id'] = int(target_id)
        else:
            vals['applied_on'] = '1_product'
            vals['product_tmpl_id'] = int(target_id)

        new_item = client.env['product.pricelist.item'].create(vals)
        
        return jsonify({'ok': True, 'id': int(new_item)})

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /admin/promociones/crear: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        release_odoo_client(client)

# ---------------------------------------------------------------
# ADMIN: PRODUCTOS SIMPLES (SOLO TAG 'APP') PARA DROPDOWN
# ---------------------------------------------------------------
@app.route('/admin/productos-simple', methods=['GET'])
def get_admin_productos_simple():
    client = get_odoo_client()
    try:
        # Solo productos que tengan la etiqueta APP
        domain = [("product_tag_ids", "ilike", "APP")]
        
        # Traemos solo ID y Nombre para que sea liviano
        products = client.env["product.template"].search_read(
            domain, ['id', 'name', 'default_code'], order='name asc', limit=1000
        )
        
        # Formatear para el dropdown
        lista = []
        for p in products:
            code = f"[{p['default_code']}] " if p.get('default_code') else ""
            lista.append({
                'id': p['id'],
                'name': f"{code}{p['name']}"
            })
            
        return jsonify(lista)
    except Exception as e:
        log.error(f"❌ /admin/productos-simple: {str(e)}")
        return jsonify([])
    finally:
        release_odoo_client(client)

@app.route("/producto/<int:producto_id>/imagen", methods=["GET"])
def get_imagen_producto(producto_id):
    client = get_odoo_client()
    try:
        producto = client.env["product.template"].browse(producto_id)
        if not producto.exists():
            return jsonify({"error": "Producto no encontrado"}), 404
        return jsonify({"image_128": getattr(producto, "image_128", "") or ""})
    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /producto/<id>/imagen:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route("/clientes_del_comercial", methods=["GET"])
def get_clientes_del_comercial():
    client = get_odoo_client()
    try:
        cuit = request.args.get("cuit")
        if not cuit:
            return jsonify({"error": "CUIT no proporcionado"}), 400

        key = f"clientes_del_comercial:{cuit}"

        def query():
            partner = client.env["res.partner"].search([["vat", "=", cuit]], limit=1)
            if not partner:
                return []

            partner_id = _scalar_id(getattr(partner, "id", None))
            if not partner_id:
                return []

            user = client.env["res.users"].search([["partner_id", "=", partner_id]], limit=1)
            if not user:
                return []

            user_id = _scalar_id(getattr(user, "id", None))
            if not user_id:
                return []

            return client.env["res.partner"].search_read(
                [["user_id", "=", user_id], ["customer_rank", ">", 0]],
                ["id", "name", "vat"]
            ) or []

        return jsonify(get_cache_or_execute(key, fallback_fn=query) or [])
    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /clientes_del_comercial:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route('/plazos-pago', methods=['GET'])
def obtener_plazos_pago():
    client = get_odoo_client()
    try:
        def query():
            # ⚠️ ACTUALIZADO: Agregados 31 y 22 a la lista permitida del backend
            ids_permitidos = [1, 21, 22, 24, 31, 12, 23, 29, 26, 28, 20] 
            domain = [('id', 'in', ids_permitidos)]
            plazos = client.env['account.payment.term'].search_read(domain, ['id', 'name'])
            plazos.sort(key=lambda x: x['name'])
            return [{"id": p["id"], "nombre": p["name"]} for p in plazos]

        return jsonify(get_cache_or_execute(
            "plazos_pago_filtrados_v2", # Cambié la key para forzar recarga de caché
            fallback_fn=query
        ))
    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /plazos-pago: {str(e)}")
        return jsonify({"error": f"Error al obtener plazos: {str(e)}"}), 500
    finally:
        release_odoo_client(client)

@app.route("/mis_ventas", methods=["GET"])
def get_mis_ventas():
    # 1. Params
    cuit = request.args.get("cuit")
    lim_arg = request.args.get("limit", "3")
    try:
        limit = max(1, min(int(str(lim_arg).strip().strip('"')), 50))
    except:
        limit = 3
        
    now = datetime.today()
    try:
        req_month = int(request.args.get("month", now.month))
        req_year = int(request.args.get("year", now.year))
        start_date, end_date = get_month_range(req_year, req_month)
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
    except:
        start_str = None
        end_str = None

    if not cuit:
        return jsonify({"error": "CUIT no proporcionado"}), 400

    # 2. Lógica
    def logic(client):
        partner = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner:
             return jsonify({"error": "Vendedor no encontrado"}), 404
        
        domain = [
            ("invoice_user_id.partner_id.vat", "=", cuit), 
            ("move_type", "=", "out_invoice"),
            ("state", "=", "posted")
        ]
        if start_str and end_str:
            domain.append(("invoice_date", ">=", start_str))
            domain.append(("invoice_date", "<", end_str))

        facturas = client.env["account.move"].search_read(
            domain,
            ["name", "partner_id", "invoice_date", "amount_total", "payment_state"],
            order="invoice_date desc",
            limit=limit,
        )

        ventas = [{
            "numero_factura": f["name"],
            "cliente": f["partner_id"][1] if f["partner_id"] else "Desconocido",
            "fecha": f["invoice_date"] or "Sin fecha",
            "total": f["amount_total"] or 0,
            "estado_pago": f["payment_state"],
        } for f in facturas]

        return jsonify({"ventas": ventas})

    # 3. Ejecutar
    try:
        return execute_odoo_operation(logic)
    except Exception as e:
        log.error(f"❌ /mis_ventas Error final: {e}")
        return jsonify({"error": str(e)}), 500
    

@app.route("/mis_pedidos", methods=["GET"])
def get_mis_pedidos():
    client = get_odoo_client()
    try:
        cuit = request.args.get("cuit")
        if not cuit:
            return jsonify({"error": "CUIT no proporcionado"}), 400

        q = request.args.get("q", "").strip() 
        date_filter = request.args.get("date", "") 
        status_filter = request.args.get("state", "").strip() 

        try:
            limit = int(request.args.get("limit", 20))
            offset = int(request.args.get("offset", 0))
        except ValueError:
            limit = 20
            offset = 0

        partner = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner:
            return jsonify({"error": "CUIT no encontrado"}), 404
        
        partner_id = int(partner[0].id)
        user = client.env["res.users"].search([("partner_id", "=", partner_id)], limit=1)
        
        if not user:
            return jsonify({"error": "Usuario vendedor no encontrado"}), 404
            
        user_id = int(user[0].id)

        domain = [("user_id", "=", user_id)]

        if date_filter:
            domain.append(("date_order", ">=", f"{date_filter} 00:00:00"))
            domain.append(("date_order", "<=", f"{date_filter} 23:59:59"))
        
        if status_filter:
            domain.append(("state", "ilike", status_filter))

        if q:
            domain.append("|")
            domain.append(("name", "ilike", q))
            domain.append(("partner_id.name", "ilike", q))

        pedidos = client.env["sale.order"].search_read(
            domain,
            ["name", "partner_id", "date_order", "amount_total", "state"],
            order="date_order desc",
            limit=limit,
            offset=offset
        )

        items = [{
            "numero_pedido": p["name"],
            "cliente": p["partner_id"][1] if p["partner_id"] else "Desconocido",
            "fecha": p["date_order"] or "Sin fecha",
            "total": p["amount_total"] or 0,
            "estado": p["state"],
        } for p in pedidos]

        return jsonify({"items": items})

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /mis_pedidos:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route("/pedido_pdf")
def pedido_pdf():
    client = get_odoo_client()
    try:
        pedido_name = request.args.get("pedidoId")
        if not pedido_name:
            return jsonify({"error": "Parámetro pedidoId requerido"}), 400

        order = client.env['sale.order'].search([('name', '=', pedido_name)], limit=1)
        if not order:
            return jsonify({"error": "Pedido no encontrado"}), 404

        attachment_name = f"{order.name}.pdf"
        existing_attachment = client.env['ir.attachment'].search([
            ('res_model', '=', 'sale.order'),
            ('res_id', '=', order.id),
            ('name', '=', attachment_name)
        ], limit=1, order='create_date desc')

        if not existing_attachment:
            try:
                log.info(f"🔄 Intentando generar PDF vía HTTP para {order.name}...")
                
                base_odoo = ODOO_SERVER.rstrip('/')
                auth_url = f"{base_odoo}/web/session/authenticate"
                report_url = f"{base_odoo}/report/pdf/sale.report_saleorder/{order.id}"
                
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE

                cj = urllib.request.HTTPCookieProcessor()
                opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx), urllib.request.HTTPHandler(), cj)
                
                auth_data = json.dumps({
                    "jsonrpc": "2.0",
                    "method": "call",
                    "params": {
                        "db": ODOO_DB,
                        "login": ODOO_USER,
                        "password": ODOO_PASSWORD
                    }
                }).encode('utf-8')
                
                req_auth = urllib.request.Request(auth_url, data=auth_data, headers={'Content-Type': 'application/json'})
                opener.open(req_auth)

                req_report = urllib.request.Request(report_url)
                with opener.open(req_report) as response:
                    pdf_content = response.read()

                if pdf_content.startswith(b'%PDF'):
                    log.info(f"✅ PDF descargado vía HTTP ({len(pdf_content)} bytes)")
                    vals = {
                        'name': attachment_name,
                        'type': 'binary',
                        'datas': base64.b64encode(pdf_content).decode('utf-8'),
                        'res_model': 'sale.order',
                        'res_id': order.id,
                        'mimetype': 'application/pdf'
                    }
                    existing_attachment = client.env['ir.attachment'].create(vals)
                else:
                    log.error("⚠️ El contenido descargado no parece un PDF.")
            
            except Exception as e_http:
                log.error(f"⚠️ Falló generación HTTP: {e_http}")

        if not existing_attachment:
             return jsonify({"error": "PDF no disponible y no se pudo generar automáticamente."}), 404

        base = PUBLIC_BASE_URL or (request.url_root.rstrip("/"))
        return {
            "nombre_archivo": existing_attachment.name,
            "pdf_url": f"{base}/descargar_pdf?attachment_id={existing_attachment.id}"
        }

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /pedido_pdf:\n{traceback.format_exc()}")
        return jsonify({"error": "Error interno"}), 500
    finally:
        release_odoo_client(client)

@app.route("/mis_facturas", methods=["GET"])
def get_mis_facturas():
    client = get_odoo_client()
    try:
        cuit = request.args.get("cuit")
        if not cuit:
            return jsonify({"error": "CUIT no proporcionado"}), 400

        q = request.args.get("q", "").strip() 
        date_filter = request.args.get("date", "") 
        status_filter = request.args.get("payment_state", "").strip() 

        try:
            limit = int(request.args.get("limit", 20))
            offset = int(request.args.get("offset", 0))
        except ValueError:
            limit = 20
            offset = 0

        partner = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner:
            return jsonify({"error": "CUIT no encontrado"}), 404
        
        partner_id = int(partner[0].id)
        user = client.env["res.users"].search([("partner_id", "=", partner_id)], limit=1)
        
        if not user:
            return jsonify({"error": "Usuario vendedor no encontrado"}), 404
            
        user_id = int(user[0].id)

        domain = [
            ("invoice_user_id", "=", user_id),
            ("move_type", "=", "out_invoice"),
            ("state", "=", "posted") 
        ]

        if date_filter:
            domain.append(("invoice_date", "=", date_filter))
        
        if status_filter:
            domain.append(("payment_state", "ilike", status_filter))

        if q:
            domain.append("|")
            domain.append(("name", "ilike", q))
            domain.append(("partner_id.name", "ilike", q))

        # ACTUALIZACIÓN: Se agregan amount_untaxed y amount_tax a los campos leídos de account.move
        facturas = client.env["account.move"].search_read(
            domain,
            [
                "name", "partner_id", "invoice_date", "amount_total", 
                "payment_state", "state", "amount_untaxed", "amount_tax"
            ],
            order="invoice_date desc",
            limit=limit,
            offset=offset
        )

        ventas = [{
            "numero_factura": f["name"],
            "cliente": f["partner_id"][1] if f["partner_id"] else "Desconocido",
            "fecha": f["invoice_date"] or "Sin fecha",
            "total": f["amount_total"] or 0,
            "estado_pago": f["payment_state"],
            "state": f["state"],
            "amount_untaxed": f.get("amount_untaxed", 0), # Nuevo campo para el reporte
            "amount_tax": f.get("amount_tax", 0)           # Nuevo campo para el reporte
        } for f in facturas]

        return jsonify({"items": ventas})

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /mis_facturas:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

# main.py (Reemplaza solo esta función)

# main.py (Fragmento actualizado para productos relacionados)

@app.route("/producto/<int:producto_id>/relacionados", methods=["GET"])
def producto_relacionados(producto_id: int):
    client = get_odoo_client()
    pg_conn = None
    try:
        lim_arg = request.args.get("limit", "10")
        try:
            limit = int(str(lim_arg).strip().strip('"'))
        except Exception:
            limit = 10
        limit = max(1, min(limit, 50))

        tmpl = client.env["product.template"].browse(producto_id)
        if not tmpl or not tmpl.exists():
            return jsonify({"items": []}), 200

        # 1. Obtener mapeo de ofertas desde PostgreSQL (Cruce por SKU)
        offer_map = {}
        pg_conn = get_pg_connection()
        if pg_conn:
            cur = pg_conn.cursor()
            cur.execute("SELECT sku, price_offer FROM app_product_offers WHERE is_active = TRUE")
            rows = cur.fetchall()
            offer_map = {r[0]: float(r[1]) for r in rows}
            cur.close()

        # Buscamos campos de productos relacionados en Odoo
        candidates = [
            getattr(tmpl, "optional_product_ids", None),
            getattr(tmpl, "alternative_product_ids", None)
        ]
        related = next((c for c in candidates if c and not callable(c)), [])

        def get_fb_url(sku):
            if not sku: return None
            return f"https://firebasestorage.googleapis.com/v0/b/{FIREBASE_BUCKET}/o/products%2F{quote(sku.strip())}%2F{quote(sku.strip())}.webp?alt=media"

        items = []
        for t in list(related)[:limit]:
            try:
                sku = (t.default_code or "").strip()
                list_price = float(t.list_price or 0.0)
                
                # Cruce con tabla de ofertas
                offer_price = offer_map.get(sku, None)
                
                # Validar que la oferta sea menor al precio de lista
                if offer_price is not None and offer_price >= list_price:
                    offer_price = None

                items.append({
                    "id": int(t.id),
                    "name": t.name or "",
                    "list_price": list_price,
                    "price_offer": offer_price, # Enviamos el precio de oferta a la App
                    "default_code": sku,
                    "categ_id": [t.categ_id.id, t.categ_id.name] if t.categ_id else None,
                    "image_md_url": get_fb_url(sku),
                    "image_thumb_url": get_fb_url(sku),
                    "write_date": str(t.write_date or "")
                })
            except Exception:
                continue

        return jsonify({"items": items})
    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /producto/<id>/relacionados error: {e}")
        return jsonify({"items": []}), 200
    finally:
        if pg_conn: pg_conn.close()
        release_odoo_client(client)

@app.route("/descargar_pdf")
def descargar_pdf():
    client = get_odoo_client()
    try:
        attachment_id = request.args.get("attachment_id")
        if not attachment_id:
            return jsonify({"error": "Parámetro attachment_id requerido"}), 400

        attachment = client.env['ir.attachment'].browse(int(attachment_id))
        if not attachment.exists():
            return jsonify({"error": "Archivo no encontrado"}), 404

        pdf_data = base64.b64decode(attachment.datas)
        return Response(
            pdf_data,
            mimetype='application/pdf',
            headers={"Content-Disposition": f"inline; filename={attachment.name}"}
        )
    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /descargar_pdf:\n{traceback.format_exc()}")
        return jsonify({"error": "Error interno"}), 500
    finally:
        release_odoo_client(client)

@app.route("/factura_pdf")
def factura_pdf():
    client = get_odoo_client()
    try:
        factura_name = request.args.get("facturaId")
        if not factura_name:
            return jsonify({"error": "Parámetro facturaId requerido"}), 400

        invoice = client.env['account.move'].search([('name', '=', factura_name)], limit=1)
        if not invoice:
            return jsonify({"error": "Factura no encontrada"}), 404

        factura_numero = factura_name.split(' ')[1] if ' ' in factura_name else factura_name
        attachments = client.env['ir.attachment'].search([
            ('res_model', '=', 'account.move'),
            ('res_id', '=', invoice.id)
        ])
        attachment_pdf = next((att for att in attachments if factura_numero in att.name and att.name.endswith('.pdf')), None)
        if not attachment_pdf:
            return jsonify({"error": "Archivo no encontrado"}), 404

        base = PUBLIC_BASE_URL or (request.url_root.rstrip("/"))
        return {
            "nombre_archivo": attachment_pdf.name,
            "pdf_url": f"{base}/descargar_pdf?attachment_id={attachment_pdf.id}"
        }
    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /factura_pdf:\n{traceback.format_exc()}")
        return jsonify({"error": "Error interno"}), 500
    finally:
        release_odoo_client(client)

# --- AGREGAR AL INICIO JUNTO A init_roles_table ---

def init_discounts_table():
    """Crea o actualiza la tabla de descuentos."""
    if not DATABASE_URL:
        return
    conn = get_pg_connection()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS app_payment_discounts (
                payment_term_id INTEGER PRIMARY KEY,
                discount NUMERIC(5,2) DEFAULT 0,
                min_amount NUMERIC(12,2) DEFAULT 0
            );
        """)
        
        # Migración 1: discount2
        try:
            cur.execute("ALTER TABLE app_payment_discounts ADD COLUMN discount2 NUMERIC(5,2) DEFAULT 0;")
            conn.commit()
        except Exception:
            conn.rollback()

        # Migración 2: allow_in_offer (NUEVO)
        try:
            cur.execute("ALTER TABLE app_payment_discounts ADD COLUMN allow_in_offer BOOLEAN DEFAULT FALSE;")
            conn.commit()
        except Exception:
            conn.rollback()

        conn.commit()
        cur.close()
        log.info("✅ Tabla 'app_payment_discounts' verificada.")
    except Exception as e:
        log.error(f"❌ Error tabla descuentos: {e}")
    finally:
        if conn: conn.close()

init_discounts_table()


# --- NUEVOS ENDPOINTS PARA EL PANEL ADMIN ---
# ====== DESCUENTOS ======

@app.route('/admin/plazos-descuentos', methods=['GET'])
def get_payment_discounts_config():
    pg_conn = get_pg_connection()
    if not pg_conn:
        return jsonify({})
    try:
        cur = pg_conn.cursor()
        # Traemos también allow_in_offer
        cur.execute("SELECT payment_term_id, discount, min_amount, discount2, allow_in_offer FROM app_payment_discounts")
        rows = cur.fetchall()
        cur.close()
        
        config = {}
        for r in rows:
            config[str(r[0])] = {
                "descuento": float(r[1]),
                "min_compra": float(r[2]),
                "descuento2": float(r[3] if len(r) > 3 and r[3] is not None else 0),
                "oferta": bool(r[4] if len(r) > 4 and r[4] is not None else False) # Nuevo campo
            }
        return jsonify(config)
    except Exception as e:
        log.error(f"Error getting discounts: {e}")
        return jsonify({}), 500
    finally:
        if pg_conn: pg_conn.close()

@app.route('/admin/plazos-descuentos', methods=['POST'])
def save_payment_discounts_config():
    data = request.get_json() or {}
    pg_conn = get_pg_connection()
    if not pg_conn:
        return jsonify({"error": "No DB connection"}), 500
    
    try:
        cur = pg_conn.cursor()
        
        sql = """
            INSERT INTO app_payment_discounts (payment_term_id, discount, min_amount, discount2, allow_in_offer)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (payment_term_id) 
            DO UPDATE SET 
                discount = EXCLUDED.discount, 
                min_amount = EXCLUDED.min_amount,
                discount2 = EXCLUDED.discount2,
                allow_in_offer = EXCLUDED.allow_in_offer;
        """
        
        for pid_str, vals in data.items():
            pid = int(pid_str)
            desc1 = float(vals.get('descuento', 0))
            min_a = float(vals.get('min_compra', 0))
            desc2 = float(vals.get('descuento2', 0))
            allow = bool(vals.get('oferta', False)) # Nuevo
            
            cur.execute(sql, (pid, desc1, min_a, desc2, allow))
            
        pg_conn.commit()
        cur.close()
        return jsonify({"ok": True})
    except Exception as e:
        if pg_conn: pg_conn.rollback()
        log.error(f"Error saving discounts: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if pg_conn: pg_conn.close()


# --- REEMPLAZO TOTAL DE LA LÓGICA DE DESCUENTOS ---
# Busca y reemplaza la función 'calcular_descuentos' existente con esta:

@app.route('/calcular-descuentos', methods=['POST'])
def calcular_descuentos():
    """
    Nueva lógica:
    - Ya NO mira historial de compras.
    - Mira la tabla app_payment_discounts en PG.
    - Aplica si payment_term_id coincide Y total_pedido >= min_amount.
    """
    pg_conn = None
    try:
        data = request.get_json() or {}
        payment_term_id = data.get('payment_term_id')
        total_amount = data.get('amount_total', 0) # El frontend debe enviar esto ahora

        # Descuentos base (se mantienen en 0 o según lógica manual si quieres)
        # En el nuevo esquema, Discount 1 es el que manda según la regla.
        descuento1 = 0
        descuento2 = 0 
        descuento3 = 0

        if payment_term_id and DATABASE_URL:
            pg_conn = get_pg_connection()
            if pg_conn:
                cur = pg_conn.cursor()
                cur.execute(
                    "SELECT discount, min_amount FROM app_payment_discounts WHERE payment_term_id = %s", 
                    (payment_term_id,)
                )
                row = cur.fetchone()
                cur.close()
                
                if row:
                    rule_discount = float(row[0])
                    rule_min = float(row[1])
                    
                    # Verificamos si cumple el mínimo
                    if float(total_amount) >= rule_min:
                        descuento1 = rule_discount

        return jsonify({
            "discount1": descuento1,
            "discount2": descuento2,
            "discount3": descuento3,
            "applied_rule": True
        })

    except Exception as e:
        log.error(f"❌ /calcular-descuentos: {e}")
        # En caso de error, devolvemos 0 para no bloquear la venta
        return jsonify({
            "discount1": 0, "discount2": 0, "discount3": 0
        })
    finally:
        if pg_conn: pg_conn.close()

# ====== Pedidos ======
@app.route('/clients', methods=['GET'])
def get_clients():
    cuit_solicitante = request.args.get('cuit')
    
    # 1. Obtener Datos Locales
    conn = get_pg_connection()
    rol = "VENDEDOR"
    user_odoo_id = None
    if conn:
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT role, id FROM app_users WHERE cuit = %s", (cuit_solicitante,))
            ud = cur.fetchone()
            if ud:
                rol = ud['role']
                user_odoo_id = ud['id']
        except: pass
        finally: conn.close()

    # 2. Lógica Odoo con REINTENTO AUTOMÁTICO
    def _fetch_clients(client_inst):
        domain = [('active', '=', True)]
        es_super_admin = (user_odoo_id in [1, 2])
        
        if rol == 'ADMIN' or es_super_admin:
            # Admin ve todo
            pass 
        else:
            # Vendedor ve asignados o a sí mismo
            user_filter = ['|', ('user_id', '=', user_odoo_id)]
            if cuit_solicitante: user_filter.append(('vat', '=', cuit_solicitante))
            
            if len(user_filter) > 1: domain.extend(user_filter)
            else: domain.append(('user_id', '=', user_odoo_id))

        return client_inst.env['res.partner'].search_read(
            domain=domain,
            fields=['id', 'name', 'vat', 'street', 'city', 'state_id', 'zip', 'email'],
            limit=2500
        )

    client = get_odoo_client()
    try:
        data = _fetch_clients(client)
        return jsonify(data)
    except Exception as e:
        error_msg = str(e)
        # DETECCIÓN DE CONEXIÓN ROTA
        if "Request-sent" in error_msg or "Idle" in error_msg or "CannotSendRequest" in error_msg:
            log.warning(f"⚠️ Conexión trabada en /clients. Reintentando... ({error_msg})")
            try:
                release_odoo_client(client)
                client = get_odoo_client()
                data = _fetch_clients(client) # Reintentar
                log.info("✅ Reintento exitoso en /clients")
                return jsonify(data)
            except Exception as e2:
                log.error(f"❌ Fallo final en /clients: {e2}")
                return jsonify({"error": str(e2)}), 500
        else:
            log.error(f"Error crítico en /clients: {e}")
            return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route('/crear-pedido', methods=['POST'])
def crear_pedido():
    def _logic(client):
        data = request.get_json() or {}
        
        transaction_id = data.get('transaction_id')
        if not transaction_id:
            transaction_id = f"draft_{int(time.time()*1000)}" 

        cliente_cuit = data.get('cliente_cuit') or data.get('partner_vat')
        items = data.get('items', [])
        global_term_id = data.get('payment_term_id')
        
        if not cliente_cuit: return jsonify({"error": "Falta cliente_cuit"}), 400
        if not items: return jsonify({"error": "El pedido no tiene items"}), 400

        # Buscar cliente
        cliente = client.env['res.partner'].search([('vat', '=', cliente_cuit)], limit=1)
        if not cliente: return jsonify({"error": "Cliente no encontrado"}), 404
        cliente = cliente[0]

        order_lines_cmd = []
        
        for item in items:
            try:
                raw_id = item.get('product_id')
                # Usamos el helper corregido que ya filtra números gigantes
                variant_id = _get_variant_id(client, raw_id)
                
                if not variant_id:
                    continue

                qty = float(item.get('qty', 1))
                price = float(item.get('price_unit', 0))
                
                order_lines_cmd.append((0, 0, {
                    'product_id': variant_id,
                    'product_uom_qty': qty,
                    'price_unit': price,
                }))
            except (ValueError, TypeError):
                continue

        if not order_lines_cmd:
            return jsonify({
                "error": "No se pudieron procesar los productos. Intente vaciar el carrito.",
                "code": "EMPTY_LINES"
            }), 400

        vals = {
            "partner_id": cliente.id,
            "partner_invoice_id": cliente.id,
            "partner_shipping_id": cliente.id,
            "payment_term_id": int(global_term_id) if global_term_id else False,
            "order_line": order_lines_cmd,
            "origin": "APP SALBOM"
        }

        try:
            order = client.env['sale.order'].create(vals)
            
            # --- CORRECCIÓN ---
            # Eliminado: order._amount_all() (Esto causaba el error 'has no attribute')
            # Odoo calcula los totales automáticamente al crear.
            
            # Forzamos lectura fresca de los totales por seguridad
            datos_frescos = order.read(['amount_total', 'name', 'currency_id'])[0]
            
            # Obtener nombre de moneda de forma segura
            currency_name = "USD"
            if datos_frescos.get('currency_id'):
                # currency_id viene como (id, nombre) en read()
                currency_name = datos_frescos['currency_id'][1]

            return jsonify({
                "pedido_id": order.id,
                "nro_pedido": datos_frescos.get('name'),
                "total": datos_frescos.get('amount_total'),
                "currency": currency_name
            }), 200

        except Exception as e_odoo:
            err_msg = str(e_odoo)
            if "MissingError" in err_msg or "Record does not exist" in err_msg:
                log.error(f"❌ Error de integridad: {err_msg}")
                return jsonify({
                    "error": "Uno o más productos seleccionados ya no están disponibles. Vacíe el carrito e intente nuevamente.",
                    "code": "PRODUCT_MISSING"
                }), 409
            raise e_odoo

    try:
        return execute_odoo_operation(_logic)
    except Exception as e:
        log.error(f"❌ Error fatal en crear-pedido: {e}")
        return jsonify({"error": "Error al procesar el pedido. Intente nuevamente."}), 500

# -------------------------------------------------------------------------
# HELPER: RESOLVER VARIANTE (CORREGIDO)
# -------------------------------------------------------------------------
def _get_variant_id(client, tmpl_id):
    """
    Busca la variante correcta de forma segura.
    CORRECCIÓN: Valida el tamaño del entero ANTES de buscar para evitar error XML-RPC.
    """
    try:
        if not tmpl_id: return None
        val_id = int(tmpl_id)
        
        # --- NUEVO: Validación de seguridad previa ---
        # Si el número es mayor al límite de 32 bits (2,147,483,647), 
        # Odoo crashea solo con intentar buscarlo. Retornamos None inmediatamente.
        if val_id > 2147483647:
            return None
        
        # 1. Buscar si hay una variante vinculada a este template
        variants = client.env['product.product'].search([('product_tmpl_id', '=', val_id)], limit=1)
        if variants:
            return int(variants[0])
        
        # 2. Si no, verificar si el ID ya es una variante válida
        exists = client.env['product.product'].search_count([('id', '=', val_id)])
        if exists:
            return val_id
            
        return None
    except Exception:
        return None
    
@app.route('/usuario-perfil/editar', methods=['POST'])
def editar_perfil():
    client = get_odoo_client()
    try:
        data = request.get_json() or {}
        cuit = data.get('cuit')
        new_name = data.get('name')
        new_email = data.get('email')
        new_phone = data.get('phone')
        new_image = data.get('image_128')

        if not cuit:
            return jsonify({"error": "CUIT requerido"}), 400

        partner_rs = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner_rs:
            return jsonify({"error": "Partner no encontrado"}), 404
        
        partner_id = int(partner_rs[0].id)
        user_rs = client.env["res.users"].search([("partner_id", "=", partner_id)], limit=1)
        user_id = int(user_rs[0].id) if user_rs else None

        vals_partner = {}
        if new_name: vals_partner['name'] = new_name
        if new_email: vals_partner['email'] = new_email
        if new_phone: vals_partner['mobile'] = new_phone 

        if new_image:
            if ',' in new_image:
                new_image = new_image.split(',')[1]
            vals_partner['image_1920'] = new_image

        if vals_partner:
            client.env["res.partner"].write([partner_id], vals_partner)

        if user_id:
            vals_user = {}
            if new_name: vals_user['name'] = new_name
            if new_email: vals_user['login'] = new_email 
            if new_image: vals_user['image_1920'] = new_image
            
            if vals_user:
                client.env["res.users"].write([user_id], vals_user)

        return jsonify({"ok": True, "message": "Perfil actualizado correctamente"})

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /usuario-perfil/editar:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route('/actualizar-pedido', methods=['POST'])
def actualizar_pedido():
    def _is_xmlrpc_conn_error(exc: Exception) -> bool:
        s = f"{type(exc).__name__}:{exc}"
        return ("CannotSendRequest" in s) or ("ResponseNotReady" in s) or ("RemoteDisconnected" in s) or ("Idle" in s)

    def _do_update_and_summarize(client):
        data = request.get_json() or {}
        order_id            = data.get('order_id') or data.get('pedido_id')
        cliente_cuit        = data.get('cliente_cuit') or data.get('partner_vat')
        items               = data.get('items', [])
        payment_term_id     = data.get('payment_term_id')
        partner_shipping_id = data.get('partner_shipping_id')
        carrier_id          = data.get('carrier_id')

        if not order_id:
            return jsonify({"error": "Falta order_id"}), 400
        if not cliente_cuit:
            return jsonify({"error": "Falta cliente_cuit"}), 400
        if not items or not isinstance(items, list):
            return jsonify({"error": "Faltan items"}), 400

        order = client.env['sale.order'].browse(int(order_id))
        if not order.exists():
            return jsonify({"error": f"Pedido {order_id} no encontrado"}), 404
        if str(order.state) not in ('draft', 'sent', 'cancel'):
            return jsonify({"error": f"El pedido {order_id} no es borrador (state={order.state})"}), 400

        cliente = client.env['res.partner'].search([('vat', '=', cliente_cuit)], limit=1)
        if not cliente:
            return jsonify({"error": "Cliente no encontrado"}), 404
        cliente = cliente[0]

        pricelist_id = cliente.property_product_pricelist.id if cliente.property_product_pricelist else None
        if not pricelist_id:
            return jsonify({"error": "Cliente sin lista de precios"}), 400

        order_lines_cmd, vistos = [(5, 0, 0)], set()
        for it in items:
            tmpl_id = it.get('product_id')
            qty     = it.get('product_uom_qty') or it.get('qty') or 1
            price   = it.get('price_unit')
            name    = it.get('name')

            d1 = float(it.get('discount1', 0) or 0.0)
            d2 = float(it.get('discount2', 0) or 0.0)
            d3 = float(it.get('discount3', 0) or 0.0)
            discount_eq = 100.0 * (1.0 - (1.0 - d1/100.0)*(1.0 - d2/100.0)*(1.0 - d3/100.0))

            if not tmpl_id or price is None:
                return jsonify({"error": f"Producto {tmpl_id} inválido (falta price_unit)"}), 400
            try:
                q = float(qty)
                if q <= 0: raise ValueError()
            except Exception:
                return jsonify({"error": f"Cantidad inválida para producto {tmpl_id}"}), 400
            if tmpl_id in vistos:
                return jsonify({"error": f"Producto duplicado: {tmpl_id}"}), 400
            vistos.add(tmpl_id)

            variant = client.env['product.product'].search([('product_tmpl_id', '=', tmpl_id)], limit=1)
            if not variant:
                return jsonify({"error": f"Variante no encontrada para template {tmpl_id}"}), 404

            lv = {
                "product_id": variant[0].id,
                "product_uom_qty": q,
                "price_unit": float(price),
                "discount": round(discount_eq, 4),
                "discount1": d1,
                "discount2": d2,
                "discount3": d3
            }
            if name:
                lv["name"] = str(name)
            order_lines_cmd.append((0, 0, lv))

        ship_id = None
        try:
            if partner_shipping_id and str(partner_shipping_id).isdigit():
                ship_id = int(partner_shipping_id)
        except:
            ship_id = None

        vals = {
            "partner_id": cliente.id,
            "partner_invoice_id": cliente.id,
            "partner_shipping_id": ship_id if ship_id else (order.partner_shipping_id.id or cliente.id),
            "pricelist_id": pricelist_id,
            "payment_term_id": int(payment_term_id) if payment_term_id else order.payment_term_id.id,
            "order_line": order_lines_cmd,
        }
        try:
            if carrier_id and str(carrier_id).isdigit():
                vals["carrier_id"] = int(carrier_id)
        except:
            pass

        order.write(vals)
        try:
            order._amount_all()
        except Exception:
            pass

        currency        = order.currency_id.name if order.currency_id else "USD"
        amount_untaxed  = float(order.amount_untaxed or 0.0)
        amount_total    = float(order.amount_total or 0.0)

        groups, tax_totals_raw = [], None
        try:
            tt = getattr(order, 'tax_totals_json', None) or getattr(order, 'tax_totals', None)
            if isinstance(tt, str):
                try: tt = json.loads(tt)
                except: tt = None
            if isinstance(tt, dict):
                tax_totals_raw = tt
                gbs = tt.get('groups_by_subtotal') or {}
                tmp = []
                for _k, arr in (gbs.items() if isinstance(gbs, dict) else []):
                    if isinstance(arr, list):
                        for g in arr:
                            name = g.get('tax_group_name') or g.get('name') or g.get('group_name')
                            amount = float(g.get('tax_group_amount') or g.get('amount') or 0.0)
                            base = float(g.get('base') or 0.0)
                            if name:
                                tmp.append({"name": name, "amount": amount, "base": base})
                groups = tmp
        except Exception as e:
            log.warning(f"tax_totals parse: {e}")

        return jsonify({
            "pedido_id": order.id,
            "nro_pedido": order.name,
            "currency": currency,
            "base_imponible": round(amount_untaxed, 2),
            "impuestos": round(amount_total - amount_untaxed, 2),
            "total": round(amount_total, 2),
            "groups": groups,
            "tax_totals": tax_totals_raw
        })

    client = get_odoo_client()
    try:
        try:
            return _do_update_and_summarize(client)
        except Exception as e:
            if _is_xmlrpc_conn_error(e):
                release_odoo_client(client)
                client = get_odoo_client()
                return _do_update_and_summarize(client)
            raise
    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ actualizar_pedido:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route('/confirmar-pedido', methods=['POST'])
def confirmar_pedido():
    data = request.get_json() or {}
    order_id = data.get('order_id') or data.get('pedido_id')
    name     = data.get('name') or data.get('nro_pedido')

    if not order_id and not name:
        return jsonify({"error": "Falta order_id o name"}), 400

    client = get_odoo_client()
    try:
        Order = client.env['sale.order']
        order = None

        if order_id:
            try:
                order = Order.browse(int(order_id))
                if not order or not order.exists():
                    order = None
            except Exception:
                order = None

        if (order is None) and name:
            res = Order.search([('name', '=', name)], limit=1)
            if res:
                order = res[0]

        if not order:
            return jsonify({"error": f"Pedido no encontrado (order_id={order_id}, name={name})"}), 404

        if str(order.state) == 'sent':
            return jsonify({"pedido_id": order.id, "name": order.name, "state": str(order.state)})

        try:
            if hasattr(order, 'action_quotation_sent'):
                order.action_quotation_sent()
            else:
                order.write({"state": "sent"})
        except Exception:
            try:
                order.write({"state": "sent"})
            except Exception as e2:
                log.error("❌ no se pudo marcar como enviado:\n" + traceback.format_exc())
                return jsonify({"error": str(e2)}), 500

        return jsonify({"pedido_id": order.id, "name": order.name, "state": str(order.state)})
    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ confirmar_pedido:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route('/usuario-perfil', methods=['GET'])
def usuario_perfil():
    client = get_odoo_client()
    pg_conn = None
    try:
        cuit = request.args.get("cuit")
        if not cuit:
            return jsonify({"error": "CUIT requerido"}), 400

        # 1. Buscar Partner en Odoo (Para nombre, email, foto)
        partner_rs = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner_rs:
            return jsonify({"error": "CUIT inválido"}), 404

        partner_id = int(partner_rs[0].id)

        # 2. Leer datos base de Odoo
        p_fields = ["name", "email", "image_128", "image_1920", "id", "phone", "mobile"]
        partner = client.env["res.partner"].read([partner_id], p_fields)[0] if partner_id else {}

        # 3. Buscar Usuario Odoo (opcional, para login/display_name)
        user_rs = client.env["res.users"].search([("partner_id", "=", partner_id)], limit=1)
        user_id = int(user_rs[0].id) if user_rs else None
        
        # 4. Procesar datos visuales
        display_name = partner.get("name") or ""
        email = partner.get("email") or ""
        phone = partner.get("mobile") or partner.get("phone") or ""

        # Imagen
        raw_img = partner.get("image_128") or partner.get("image_1920") or None
        if isinstance(raw_img, (bytes, bytearray)):
            img_b64 = base64.b64encode(raw_img).decode("ascii")
        elif isinstance(raw_img, str) and raw_img.strip():
            img_b64 = raw_img
        else:
            img_b64 = None

        # --- 5. BUSCAR ROL EN LA NUEVA TABLA DE APP (app_users) ---
        # Esta es la parte crítica: ignoramos app_user_roles y usamos la tabla de registro
        role_name = "Cliente" 
        
        if DATABASE_URL:
            pg_conn = get_pg_connection()
            if pg_conn:
                try:
                    cur = pg_conn.cursor()
                    # Buscamos el rol real asignado por el admin
                    cur.execute("SELECT role FROM app_users WHERE cuit = %s", (cuit,))
                    row = cur.fetchone()
                    if row and row[0]:
                        role_name = row[0]
                    cur.close()
                except Exception as e:
                    log.error(f"Error buscando rol en app_users: {e}")

        return jsonify({
            "name": display_name,
            "email": email,
            "phone": phone,
            "image_128": img_b64,
            "partner_id": partner_id,
            "user_id": user_id,
            "role": role_name  # <--- Rol correcto sincronizado
        })

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /usuario-perfil:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)
        if pg_conn: pg_conn.close()

# ---------------------------------------------------------------
# GESTIÓN DE USUARIOS (PANEL ADMIN)
# ---------------------------------------------------------------

@app.route('/users/<int:user_id>/role', methods=['PUT'])
def update_user_role(user_id):
    pg_conn = None
    try:
        data = request.get_json() or {}
        new_role = data.get('role')

        if not new_role:
            return jsonify({'error': 'Falta el campo role'}), 400
        
        if not DATABASE_URL:
            return jsonify({'error': 'No hay base de datos configurada en DATABASE_URL'}), 500

        pg_conn = get_pg_connection()
        if not pg_conn:
             return jsonify({'error': 'No se pudo conectar a la base de datos'}), 500
             
        cur = pg_conn.cursor()

        # UPSERT: Insertar, y si el ID ya existe, actualizar el rol
        sql = """
            INSERT INTO app_user_roles (user_id, role_name)
            VALUES (%s, %s)
            ON CONFLICT (user_id)
            DO UPDATE SET role_name = EXCLUDED.role_name;
        """
        cur.execute(sql, (user_id, new_role))
        pg_conn.commit()
        cur.close()

        return jsonify({'success': True, 'message': 'Rol guardado correctamente en PostgreSQL'})

    except Exception as e:
        log.error(f"❌ /users/{user_id}/role: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        if pg_conn: pg_conn.close()

# ===== Datos auxiliares cliente ======

@app.route('/obtener-metodo-entrega', methods=['GET'])
def obtener_metodo_entrega():
    client = get_odoo_client()
    try:
        raw_id = request.args.get("cliente_id")
        if not raw_id:
            return jsonify({"error": "Falta cliente_id"}), 400
        
        data = client.env['res.partner'].read([int(raw_id)], ["property_delivery_carrier_id"])
        
        if not data:
            return jsonify({"error": "Cliente no encontrado"}), 404
            
        carrier_field = data[0].get("property_delivery_carrier_id")
        
        if not carrier_field:
            return jsonify({"error": "Cliente sin método de entrega asociado"}), 404

        carrier_name = carrier_field[1] if isinstance(carrier_field, (list, tuple)) else str(carrier_field)
        
        return jsonify({"carrier_name": carrier_name})

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /obtener-metodo-entrega: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route('/cliente-direccion-entrega', methods=['GET'])
def cliente_direccion_entrega():
    client = get_odoo_client()
    try:
        cliente_id = request.args.get("cliente_id")
        if not cliente_id:
            return jsonify({"error": "Falta cliente_id"}), 400

        cid = int(cliente_id)
        key = f"cliente_dir_entrega:{cid}"

        def query():
            partner = client.env['res.partner'].browse(cid)
            if not partner.exists():
                return None
            delivery = client.env['res.partner'].search_read(
                [('parent_id', '=', partner.id), ('type', '=', 'delivery')],
                ['id', 'name', 'street', 'street2', 'city', 'zip', 'state_id'],
                limit=1
            )
            target = delivery[0] if delivery else None
            if not target:
                p = client.env['res.partner'].read([partner.id], ['name','street','street2','city','zip','state_id'])[0]
                state_name = p['state_id'][1] if isinstance(p['state_id'], list) and len(p['state_id']) > 1 else None
                return {
                    "source": "partner",
                    "name": p.get('name') or "",
                    "street": ' '.join([x for x in [p.get('street'), p.get('street2')] if x]) or "",
                    "city": p.get('city') or "",
                    "state": state_name or "",
                    "zip": p.get('zip') or "",
                }
            state_name = target['state_id'][1] if isinstance(target['state_id'], list) and len(target['state_id']) > 1 else ""
            return {
                "source": "delivery_child",
                "name": target.get('name') or "",
                "street": ' '.join([x for x in [target.get('street'), target.get('street2')] if x]) or "",
                "city": target.get('city') or "",
                "state": state_name or "",
                "zip": target.get('zip') or "",
            }

        data = get_cache_or_execute(key, ttl=CACHE_EXPIRATION, fallback_fn=query)
        if not data:
            return jsonify({"error": "Cliente no encontrado o sin dirección disponible"}), 404
        return jsonify(data)
    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /cliente-direccion-entrega:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route("/cliente-direcciones", methods=["GET"])
def get_cliente_direcciones():
    client = get_odoo_client()
    try:
        raw_id = request.args.get("cliente_id")
        if not raw_id:
            return jsonify({"error": "cliente_id es requerido"}), 400
        cliente_id = int(raw_id)

        cache_key = f"cliente-direcciones:{cliente_id}"

        def query():
            fields = ["name", "street", "city", "zip", "state_id"]
            parents = client.env["res.partner"].read([cliente_id], fields)
            
            if not parents:
                return []
            
            p = parents[0]
            
            def get_st(val):
                return val[1] if (isinstance(val, (list, tuple)) and len(val) > 1) else ""

            principal = {
                "id": p["id"],
                "name": p["name"] or "DIRECCIÓN PRINCIPAL",
                "street": p["street"] or "",
                "city": p["city"] or "",
                "state": get_st(p["state_id"]),
                "zip": p["zip"] or "",
                "source": "partner",
            }

            children = client.env["res.partner"].search_read(
                [("parent_id", "=", cliente_id), ("type", "=", "delivery")],
                ["id", "name", "street", "city", "zip", "state_id"]
            ) or []

            deliveries = []
            for ch in children:
                deliveries.append({
                    "id": ch["id"],
                    "name": ch["name"] or "DOMICILIO DE ENTREGA",
                    "street": ch["street"] or "",
                    "city": ch["city"] or "",
                    "state": get_st(ch["state_id"]),
                    "zip": ch["zip"] or "",
                    "source": "delivery_child",
                })

            result = [principal] + deliveries
            
            result.sort(key=lambda x: 0 if x.get("source") == "delivery_child" else 1)
            return result

        try:
            data = get_cache_or_execute(cache_key, fallback_fn=query)
        except NameError: 
            data = query()
            
        return jsonify(data)

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /cliente-direcciones: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

# ===== Vendedor / KPI =====

@app.route("/pedidos-vendedor", methods=["GET"])
def get_pedidos_vendedor():
    client = get_odoo_client()
    try:
        log.info("📦 Iniciando pedidos-vendedor")
        cuit = request.args.get("cuit")
        fecha_inicio = request.args.get("fecha_inicio")
        fecha_fin = request.args.get("fecha_fin")

        if not cuit:
            return jsonify({"error": "CUIT requerido"}), 400

        partner = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner:
            return jsonify({"error": "CUIT no válido"}), 404

        user = client.env["res.users"].search([("partner_id", "=", partner.id)], limit=1)
        if not user:
            return jsonify({"error": "No se encontró el usuario para ese CUIT"}), 404

        domain = [("user_id", "=", user.id), ("state", "!=", "cancel")]
        if fecha_inicio:
            domain.append(("date_order", ">=", fecha_inicio))
        if fecha_fin:
            domain.append(("date_order", "<=", fecha_fin))

        pedidos = client.env["sale.order"].search_read(
            domain,
            ["name", "partner_id", "date_order", "amount_total", "state"],
            order="date_order desc",
            limit=50
        )
        resultado = [{
            "pedido_id": p["name"],
            "cliente": p["partner_id"][1] if p["partner_id"] else "Desconocido",
            "fecha": p["date_order"],
            "total": p["amount_total"],
            "estado_pago": p["state"]
        } for p in pedidos]

        return jsonify(resultado)
    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /pedidos-vendedor:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route("/clientes-del-vendedor", methods=["GET"])
def clientes_del_vendedor():
    client = get_odoo_client()
    pg_conn = None
    try:
        cuit = request.args.get("cuit")
        q = (request.args.get("q") or "").strip().lower()
        
        if not cuit:
            return jsonify({"error": "CUIT requerido"}), 400

        # 1. Identificar al usuario en Odoo
        partner = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner:
            return jsonify({"items": [], "is_admin": False}) # Devolver vacío en lugar de error 404 para evitar que el front se rompa
        
        user = client.env["res.users"].search([("partner_id", "=", partner.id)], limit=1)
        
        # 2. Verificar Rol con Manejo de Errores (Evita el error HTML <)
        is_admin = False
        try:
            pg_conn = get_pg_connection()
            if pg_conn and user:
                cur = pg_conn.cursor()
                cur.execute("SELECT role_name FROM app_user_roles WHERE user_id = %s", (user.id,))
                row = cur.fetchone()
                if row and row[0].upper() == 'ADMIN':
                    is_admin = True
                cur.close()
        except Exception as pg_e:
            log.error(f"⚠️ Error verificando rol en PG: {pg_e}")
        finally:
            if pg_conn: pg_conn.close()

        # 3. Definir Dominio de Búsqueda
        # Si no hay usuario (caso raro) o no es admin, filtramos por su ID.
        if is_admin:
            domain = [("customer_rank", ">", 0)]
        else:
            user_id = user.id if user else 0
            domain = [("user_id", "=", user_id), ("customer_rank", ">", 0)]

        # Agregamos filtro de búsqueda si existe
        if q:
            domain += ["|", ("name", "ilike", q), ("vat", "ilike", q)]

        # 4. Consulta optimizada
        clientes_raw = client.env["res.partner"].search_read(
            domain,
            ["id", "name", "vat", "street", "city", "state_id", "zip"],
            limit=1000, # Límite razonable para evitar timeout
            order="name asc"
        )

        return jsonify({
            "items": clientes_raw,
            "is_admin": is_admin
        })

    except Exception as e:
        log.error(f"❌ Error en clientes-del-vendedor: {e}")
        return jsonify({"error": str(e), "items": []}), 500
    finally:
        release_odoo_client(client)

# 2. ACTUALIZAR LISTADO PARA SOPORTAR 'atendidos'
@app.route("/clientes-por-estado", methods=["GET"])
def clientes_por_estado():
    cuit = request.args.get("cuit")
    estado = request.args.get("estado")
    
    # Calcular fechas
    now = datetime.today()
    try:
        req_month = int(request.args.get("month", now.month))
        req_year = int(request.args.get("year", now.year))
        start_date, end_date = get_month_range(req_year, req_month)
    except Exception:
        # Fallback
        start_date = now.replace(day=1)
        end_date = (start_date + timedelta(days=32)).replace(day=1)

    if not cuit: return jsonify({"error": "CUIT requerido"}), 400

    def logic(client):
        partner_recs = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner_recs: return jsonify({"error": "CUIT inválido"}), 404
        partner_id = partner_recs[0].id
        
        user_recs = client.env["res.users"].search([("partner_id", "=", partner_id)], limit=1)
        if not user_recs: return jsonify({"error": "Usuario no encontrado"}), 404
        user_id = user_recs[0].id

        # Clientes del vendedor (base)
        all_partners = client.env["res.partner"].search_read(
            [("user_id", "=", user_id), ("active", "=", True), ("customer_rank", ">", 0)],
            ["id", "name", "vat", "city", "state_id", "phone", "email"]
        )
        partners_map = {p["id"]: p for p in all_partners}
        for p in all_partners:
            st = p.get("state_id")
            p["state"] = st[1] if isinstance(st, (list, tuple)) and len(st) > 1 else ""

        target_ids = set()

        if estado == 'atendidos':
            # --- NUEVA LÓGICA: ATENDIDOS ---
            # Buscar pedidos en el rango de fechas exacto
            s_str = start_date.strftime("%Y-%m-%d")
            e_str = end_date.strftime("%Y-%m-%d")
            
            orders = client.env["sale.order"].search_read(
                [
                    ("user_id", "=", user_id),
                    ("date_order", ">=", s_str),
                    ("date_order", "<", e_str),
                    ("state", "!=", "cancel")
                ],
                ["partner_id"]
            )
            for o in orders:
                if o.get("partner_id"):
                    target_ids.add(o["partner_id"][0])
                    
        else:
            # --- LÓGICA ORIGINAL (Riesgo/Perdidos) ---
            # Usan fecha ancla futura para calcular riesgo relativo a hoy/fin de mes
            anchor = end_date # Fin del mes consultado
            d_90  = (anchor - timedelta(days=90)).strftime("%Y-%m-%d")
            d_150 = (anchor - timedelta(days=150)).strftime("%Y-%m-%d")
            d_180 = (anchor - timedelta(days=180)).strftime("%Y-%m-%d") 
            end_s = anchor.strftime("%Y-%m-%d")

            moves = client.env["account.move"].search_read(
                [
                    ("invoice_user_id", "=", user_id),
                    ("move_type", "=", "out_invoice"),
                    ("state", "=", "posted"),
                    ("invoice_date", ">=", d_180),
                    ("invoice_date", "<", end_s)
                ],
                ["partner_id", "invoice_date"]
            )
            
            ids_90, ids_150, ids_180 = set(), set(), set()
            for m in moves:
                if not m.get("partner_id"): continue
                pid = m["partner_id"][0]
                inv = str(m["invoice_date"])
                if inv >= d_90: ids_90.add(pid)
                if inv >= d_150: ids_150.add(pid)
                if inv >= d_180: ids_180.add(pid)

            all_ids = set(partners_map.keys())
            
            if estado == 'completo': target_ids = ids_90
            elif estado == 'riesgo-medio': target_ids = ids_150 - ids_90
            elif estado == 'riesgo-alto': target_ids = ids_180 - ids_150
            elif estado == 'perdidos': target_ids = all_ids - ids_180

        # Si hay IDs en target que no son míos (ej: compraron antes de ser asignados), los buscamos
        missing_ids = target_ids - set(partners_map.keys())
        if missing_ids:
            extras = client.env["res.partner"].search_read(
                [("id", "in", list(missing_ids))],
                ["id", "name", "vat", "city", "state_id", "phone", "email"]
            )
            for p in extras:
                st = p.get("state_id")
                p["state"] = st[1] if isinstance(st, (list, tuple)) and len(st) > 1 else ""
                partners_map[p["id"]] = p

        result = [partners_map[pid] for pid in target_ids if pid in partners_map]
        result.sort(key=lambda x: x["name"])
        
        return jsonify({"items": result, "total": len(result)})

    try:
        return execute_odoo_operation(logic)
    except Exception as e:
        log.error(f"❌ /clientes-por-estado Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/mis_comprobantes_propios", methods=["GET"])
def get_mis_comprobantes_propios():
    client = get_odoo_client()
    try:
        cuit = request.args.get("cuit")
        if not cuit:
            return jsonify({"error": "CUIT no proporcionado"}), 400

        # Filtros
        q = request.args.get("q", "").strip() 
        date_filter = request.args.get("date", "") 
        status_filter = request.args.get("payment_state", "").strip() 

        # Paginación
        try:
            limit = int(request.args.get("limit", 20))
            offset = int(request.args.get("offset", 0))
        except ValueError:
            limit = 20
            offset = 0

        # 1. Identificar al Partner (El usuario mismo)
        partner = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner:
            return jsonify({"error": "CUIT no encontrado"}), 404
        
        partner_id = int(partner[0].id)

        # 2. Definir dominio: Buscar donde el partner sea EL USUARIO
        # move_type 'out_invoice' = Factura de Venta (La empresa le vendió al usuario -> El usuario es Cliente)
        # move_type 'in_invoice'  = Factura de Compra (El usuario le facturó a la empresa -> El usuario es Proveedor)
        domain = [
            ("partner_id", "=", partner_id),
            ("state", "=", "posted"),
            ("move_type", "in", ["out_invoice", "in_invoice", "out_refund", "in_refund"]) 
        ]

        # --- Filtros ---
        if date_filter:
            domain.append(("invoice_date", "=", date_filter))
        
        if status_filter:
            domain.append(("payment_state", "ilike", status_filter))

        if q:
            # Buscamos por número de factura
            domain.append(("name", "ilike", q))

        # 3. Buscar
        facturas = client.env["account.move"].search_read(
            domain,
            ["name", "invoice_date", "amount_total", "payment_state", "state", "move_type", "currency_id"],
            order="invoice_date desc",
            limit=limit,
            offset=offset
        )

        items = []
        for f in facturas:
            # Determinar rol
            m_type = f.get("move_type")
            rol = "CLIENTE" # Por defecto
            if m_type in ["in_invoice", "in_refund"]:
                rol = "PROVEEDOR"
            
            # Formatear moneda si viene
            currency_symbol = "$" # Default
            if f.get("currency_id"):
                # currency_id viene como (id, 'ARS')
                curr = f["currency_id"]
                if isinstance(curr, (list, tuple)) and len(curr) > 1:
                    currency_symbol = curr[1]

            items.append({
                "numero_factura": f["name"],
                "fecha": f["invoice_date"] or "Sin fecha",
                "total": f["amount_total"] or 0,
                "estado_pago": f["payment_state"],
                "rol": rol, # Para la etiqueta en el frontend
                "tipo_comprobante": m_type,
                "moneda": currency_symbol
            })

        return jsonify({"items": items})

    except Exception as e:
        handle_connection_error(e)
        log.error(f"❌ /mis_comprobantes_propios:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.route('/tipo-cambio', methods=['GET'])
def get_tipo_cambio():
    """Obtiene la cotización del USD desde Odoo"""
    client = get_odoo_client()
    try:
        # Buscamos la moneda USD
        currency = client.env['res.currency'].search_read(
            [('name', '=', 'USD')], 
            ['rate', 'inverse_rate'], 
            limit=1
        )
        
        if not currency:
            return jsonify({"rate": 1450, "source": "fallback_backend"}), 200

        data = currency[0]
        rate = data.get('rate', 0)
        inverse = data.get('inverse_rate', 0)

        # Lógica de seguridad para obtener el valor ARS (ej: 1450)
        final_rate = 1450
        if inverse and inverse > 1:
            final_rate = inverse
        elif rate and rate > 0:
            final_rate = 1.0 / rate

        return jsonify({
            "rate": final_rate,
            "inverse_rate": final_rate, 
            "source": "odoo"
        })

    except Exception as e:
        log.error(f"❌ Error obteniendo tipo de cambio: {e}")
        return jsonify({"rate": 1450, "error": str(e)}), 200
    finally:
        release_odoo_client(client)

@app.route("/kpi-vendedor", methods=["GET"])
def get_kpi_vendedor():
    cuit = request.args.get("cuit")
    now = datetime.today()
    try:
        req_month = int(request.args.get("month", now.month))
        req_year = int(request.args.get("year", now.year))
    except ValueError:
        req_month = now.month
        req_year = now.year

    if not cuit:
        return jsonify({"error": "CUIT requerido"}), 400

    def logic(client):
        partner_recs = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner_recs:
            return jsonify({"error": "CUIT inválido"}), 404
        partner_id = partner_recs[0].id
        
        user_recs = client.env["res.users"].search([("partner_id", "=", partner_id)], limit=1)
        if not user_recs:
            return jsonify({"error": "Usuario no encontrado"}), 404
        user_id = user_recs[0].id
        
        # Fechas
        start_date, end_date = get_month_range(req_year, req_month)
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")

        # --- A. TOTAL PEDIDOS ---
        pedidos_mes = client.env["sale.order"].search_read(
            [
                ("user_id", "=", user_id),
                ("date_order", ">=", start_str),
                ("date_order", "<", end_str),
                ("state", "!=", "cancel") 
            ],
            ["amount_total", "partner_id"]
        )
        pedidos_count = len(pedidos_mes)

        # --- B. TOTAL FACTURADO (Base Facturas) ---
        facturas_mes = client.env["account.move"].search_read(
            [
                ("invoice_user_id", "=", user_id),
                ("move_type", "=", "out_invoice"),
                ("state", "=", "posted"),
                ("invoice_date", ">=", start_str),
                ("invoice_date", "<", end_str)
            ],
            ["amount_total", "partner_id"]
        )
        total_facturado = sum(f["amount_total"] for f in facturas_mes)

        # --- C. CLIENTES NUEVOS ---
        partners_invoice_this_month = set()
        for f in facturas_mes:
            if f.get("partner_id"): partners_invoice_this_month.add(f["partner_id"][0])
        
        clientes_nuevos = 0
        if partners_invoice_this_month:
            old_buyers = client.env["account.move"].search_count([
                ("move_type", "=", "out_invoice"),
                ("state", "=", "posted"),
                ("invoice_date", "<", start_str),
                ("partner_id", "in", list(partners_invoice_this_month))
            ])
            # Nota: para exactitud total deberíamos comparar sets, pero por rendimiento simplificado:
            # Si quieres exactitud de "quién es nuevo", hay que traer IDs viejos. 
            # Dejamos tu lógica original o la mejoramos levemente:
            old_buyers_data = client.env["account.move"].search_read(
                [
                    ("move_type", "=", "out_invoice"),
                    ("state", "=", "posted"),
                    ("invoice_date", "<", start_str),
                    ("partner_id", "in", list(partners_invoice_this_month))
                ],
                ["partner_id"]
            )
            old_ids = set(x["partner_id"][0] for x in old_buyers_data if x["partner_id"])
            clientes_nuevos = len(partners_invoice_this_month - old_ids)

        # --- D. CLIENTES PERDIDOS ---
        six_months_ago = (start_date - timedelta(days=180)).strftime("%Y-%m-%d")
        
        # Mis clientes cartera
        my_client_data = client.env["res.partner"].search_read(
            [("user_id", "=", user_id), ("active", "=", True), ("customer_rank", ">", 0)],
            ["id"]
        )
        all_ids_set = set(p["id"] for p in my_client_data)

        # Quienes compraron en los ultimos 6 meses hasta fin de mes actual
        recent_ids = set()
        if all_ids_set:
            recent_moves = client.env["account.move"].search_read(
                [
                    ("move_type", "=", "out_invoice"),
                    ("state", "=", "posted"),
                    ("invoice_date", ">=", six_months_ago),
                    ("invoice_date", "<", end_str),
                    ("partner_id", "in", list(all_ids_set))
                ],
                ["partner_id"] 
            )
            for m in recent_moves:
                if m.get("partner_id"): recent_ids.add(m["partner_id"][0])
        
        clientes_perdidos = len(all_ids_set - recent_ids)

        # --- E. CLIENTES ATENDIDOS (NUEVO) ---
        # Clientes únicos que metieron pedido en este mes
        atendidos_ids = set()
        for p in pedidos_mes:
            if p.get("partner_id"):
                atendidos_ids.add(p["partner_id"][0])
        clientes_atendidos = len(atendidos_ids)

        return jsonify({
            "periodo": f"{req_month}/{req_year}",
            "total_pedidos": pedidos_count,
            "total_facturado": total_facturado,
            "clientes_nuevos": clientes_nuevos,
            "clientes_perdidos": clientes_perdidos,
            "clientes_atendidos": clientes_atendidos # <--- DATO NUEVO
        })

    try:
        return execute_odoo_operation(logic)
    except Exception as e:
        log.error(f"❌ /kpi-vendedor Error: {e}")
        return jsonify({"error": str(e)}), 500

# ===== Cache de pedido (in-memory) =====

@app.route("/pedido-cache", methods=["POST"])
def pedido_cache():
    try:
        body = request.get_json() or {}
        cid = int(body.get("cliente_id"))
        entry = {
            "id": len(_MEM_PEDIDOS_CACHE) + 1,
            "creado_en": datetime.utcnow().isoformat(),
            "cliente_id": cid,
            "moneda": body.get("moneda"),
            "tipo_cambio": body.get("tipo_cambio"),
            "base_imponible": body.get("base_imponible"),
            "impuestos_totales": body.get("impuestos_totales"),
            "total": body.get("total"),
            "payload": body.get("payload") or {},
            "respuesta": body.get("respuesta") or {},
        }
        _MEM_PEDIDOS_CACHE.append(entry)
        return jsonify({"id": entry["id"], "creado_en": entry["creado_en"]})
    except Exception as e:
        handle_connection_error(e)
        safe_log_error("/pedido-cache", "POST", None, str(e), {"body": request.get_json(silent=True)})
        return jsonify({"error": str(e)}), 500

# ====== Endpoints de diagnóstico ======

@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "env": {"server": bool(ODOO_SERVER), "db": bool(ODOO_DB), "user": bool(ODOO_USER)},
    })

@app.get("/_diag")
def diag():
    data = {
        "env": {
            "ODOO_SERVER": bool(ODOO_SERVER),
            "ODOO_DB": bool(ODOO_DB),
            "ODOO_USER": bool(ODOO_USER),
            "ODOO_PASSWORD": bool(ODOO_PASSWORD),
            "REDIS_URL": bool(REDIS_URL),
            "DATABASE_URL": bool(os.getenv("DATABASE_URL")),
            "R2_PUBLIC_BASE_URL": bool(os.getenv("R2_PUBLIC_BASE_URL")),
            "PUBLIC_BASE_URL": PUBLIC_BASE_URL or None,
        },
        "ok": True,
        "checks": {}
    }
    # Odoo
    try:
        c = get_odoo_client()
        data["checks"]["odoo"] = {"ok": True, "uid": getattr(c, "uid", None)}
        release_odoo_client(c)
    except Exception as e:
        data["checks"]["odoo"] = {"ok": False, "error": str(e)}
        data["ok"] = False

    # Redis
    try:
        if redis_client:
            redis_client.ping()
            data["checks"]["redis"] = {"ok": True}
        else:
            data["checks"]["redis"] = {"ok": True, "note": "sin REDIS_URL (cache deshabilitado)"}
    except Exception as e:
        data["checks"]["redis"] = {"ok": False, "error": str(e)}
        data["ok"] = False

    return jsonify(data), 200 if data["ok"] else 500

@app.get("/odoo/ping")
def odoo_ping():
    client = get_odoo_client()
    try:
        login = request.args.get("login") or (ODOO_USER or "").strip()
        ids = client.env["res.users"].search([("login", "=", login)])
        try:
            ids = list(ids)
        except Exception:
            pass
        return jsonify({"ok": True, "login": login, "user_ids": [int(x) for x in ids]})
    except Exception as e:
        handle_connection_error(e)
        return jsonify({"ok": False, "error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.get("/odoo/partners/count")
def odoo_partners_count():
    client = get_odoo_client()
    try:
        cnt = client.env["res.partner"].search_count([])
        return jsonify({"ok": True, "count": int(cnt)})
    except Exception as e:
        handle_connection_error(e)
        return jsonify({"ok": False, "error": str(e)}), 500
    finally:
        release_odoo_client(client)

@app.get("/odoo/invoices/partners")
def odoo_invoices_partners():
    client = get_odoo_client()
    try:
        limit = int(request.args.get("limit", "10"))
        limit = max(1, min(limit, 200))
        rows = client.env["account.move"].search_read(
            [("move_type", "in", ["out_invoice", "out_refund"])],
            ["id", "partner_id"],
            limit=limit
        ) or []
        flat = []
        for r in rows:
            pid = r.get("partner_id")
            if isinstance(pid, (list, tuple)) and pid:
                flat.append(int(pid[0]))
            elif isinstance(pid, int):
                flat.append(pid)
        return jsonify({"ok": True, "partners": flat})
    except Exception as e:
        handle_connection_error(e)
        return jsonify({"ok": False, "error": str(e)}), 500
    finally:
        release_odoo_client(client)

# main.py - Agregar a las funciones de inicialización
def init_offers_cache_table():
    if not DATABASE_URL: return
    conn = get_pg_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS app_product_offers (
                sku TEXT PRIMARY KEY,
                price_offer NUMERIC(12,2),
                is_active BOOLEAN DEFAULT TRUE,
                last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        cur.close()
        log.info("✅ Tabla 'app_product_offers' verificada.")
    except Exception as e:
        log.error(f"❌ Error tabla ofertas: {e}")
    finally:
        if conn: conn.close()

init_offers_cache_table()

# Endpoint para que el Admin o un Cron fuerce la actualización desde Odoo
@app.route("/admin/sync-offers", methods=["POST"])
def sync_offers_to_pg():
    """
    Sincronización total de Tarifa 70. 
    Busca SKUs tanto en variantes como en plantillas de producto.
    """
    client = get_odoo_client()
    pg_conn = get_pg_connection()
    try:
        now_str = datetime.now().strftime("%Y-%m-%d")
        
        # 1. Buscamos TODOS los items de la tarifa 70 que expiren hoy o en el futuro (o no tengan fin)
        domain = [
            ('pricelist_id', '=', 70),
            '|', ('date_end', '=', False), ('date_end', '>=', now_str)
        ]
        
        # Traemos los IDs de productos, plantillas y categorías
        items = client.env['product.pricelist.item'].search_read(
            domain, 
            ['product_tmpl_id', 'product_id', 'categ_id', 'applied_on', 'fixed_price']
        )

        if not items:
            log.info("⚠️ Odoo no devolvió ningún ítem para la Tarifa 70.")
            return jsonify({"ok": True, "count": 0, "message": "No hay datos en Odoo"})

        cur = pg_conn.cursor()
        cur.execute("UPDATE app_product_offers SET is_active = FALSE")
        
        sync_count = 0
        for it in items:
            price = float(it['fixed_price'])
            applied_on = it.get('applied_on')
            sku = None

            # CASO A: Oferta aplicada a una VARIANTE específica
            if applied_on == '0_product_variant' and it.get('product_id'):
                variant_id = it['product_id'][0]
                # Buscamos el SKU en la variante
                variant_data = client.env['product.product'].read([variant_id], ['default_code'])[0]
                sku = (variant_data.get('default_code') or "").strip()

            # CASO B: Oferta aplicada al MODELO (Template)
            elif applied_on == '1_product' and it.get('product_tmpl_id'):
                tmpl_id = it['product_tmpl_id'][0]
                tmpl_data = client.env['product.template'].read([tmpl_id], ['default_code'])[0]
                sku = (tmpl_data.get('default_code') or "").strip()

            # CASO C: Oferta aplicada a una CATEGORÍA
            elif applied_on == '2_product_category' and it.get('categ_id'):
                cat_id = it['categ_id'][0]
                prods = client.env['product.template'].search_read(
                    [('categ_id', 'child_of', cat_id)], ['default_code']
                )
                for p in prods:
                    p_sku = (p.get('default_code') or "").strip()
                    if p_sku:
                        _upsert_offer_row(cur, p_sku, price)
                        sync_count += 1
                continue # Saltamos el upsert de abajo porque ya lo hicimos en el loop

            # Si encontramos un SKU válido en Caso A o B, guardamos
            if sku:
                _upsert_offer_row(cur, sku, price)
                sync_count += 1
            
        pg_conn.commit()
        cur.close()
        log.info(f"✅ Sincronización finalizada. SKUs activos: {sync_count}")
        return jsonify({"ok": True, "count": sync_count})
    except Exception as e:
        if pg_conn: pg_conn.rollback()
        log.error(f"❌ Error crítico en sync-offers: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        release_odoo_client(client)
        if pg_conn: pg_conn.close()

def _upsert_offer_row(cursor, sku, price):
    """Helper para insertar o actualizar la oferta en Postgres."""
    cursor.execute("""
        INSERT INTO app_product_offers (sku, price_offer, is_active, last_sync)
        VALUES (%s, %s, TRUE, CURRENT_TIMESTAMP)
        ON CONFLICT (sku) DO UPDATE SET 
            price_offer = EXCLUDED.price_offer,
            is_active = TRUE,
            last_sync = CURRENT_TIMESTAMP;
    """, (sku, price))

# ========= DEBUG ROUTES (temporales) =========
@app.get("/__routes")
def __routes():
    from flask import jsonify
    routes = []
    for r in app.url_map.iter_rules():
        methods = sorted([m for m in r.methods if m not in ("HEAD", "OPTIONS")])
        routes.append({"rule": str(r), "methods": methods})
    return jsonify({"count": len(routes), "routes": routes})


# ========= /DEBUG ROUTES =========

@app.get("/__try_login_now")
def __try_login_now():
    import os, sys
    import odooly
    from odooly import Client

    server = os.getenv("ODOO_SERVER") or ""
    db     = os.getenv("ODOO_DB") or ""
    user   = os.getenv("ODOO_USER") or ""
    pwd    = os.getenv("ODOO_PASSWORD") or ""

    server_eff = server if server.endswith("/") else server + "/"
    def det(s): 
        return {"repr": repr(s), "len": len(s), "codes": [ord(c) for c in s]}

    out = {
        "python": sys.version,
        "odooly_version": getattr(odooly, "__version__", "unknown"),
        "env": {
            "server": det(server),
            "server_eff": det(server_eff),
            "db": det(db),
            "user": det(user),
            "pass": {"len": len(pwd), "head": pwd[:4], "tail": (pwd[-4:] if len(pwd)>=4 else "")},
        },
        "tries": {}
    }

    # A) password-mode
    try:
        c = Client(server_eff)
        c.login(user, pwd, db)
        out["tries"]["password_mode"] = {
            "ok": True,
            "users_count": int(c.env['res.users'].search_count([])),
            "me": c.env['res.users'].search_read([('login','=',user)], ['id','login','name'], limit=1),
        }
        return out, 200
    except Exception as e:
        out["tries"]["password_mode"] = {"ok": False, "error": str(e)}

    # B) api_key-mode
    try:
        c2 = Client(server_eff)
        c2.login(user, database=db, api_key=pwd)
        out["tries"]["api_key_mode"] = {
            "ok": True,
            "users_count": int(c2.env['res.users'].search_count([])),
            "me": c2.env['res.users'].search_read([('login','=',user)], ['id','login','name'], limit=1),
        }
        return out, 200
    except Exception as e:
        out["tries"]["api_key_mode"] = {"ok": False, "error": str(e)}
        return out, 500
    
# --- HELPER: CÁLCULO SEMÁFORO DE STOCK ---
# main.py

# main.py

def _compute_stock_states(client, product_templates):
    """
    Calcula el estado de stock Y la cantidad exacta.
    CORRECCIÓN: Sanitización de tipos (int) para evitar error XMLRPC y búsqueda recursiva de ubicación.
    """
    if not product_templates:
        return {}

    try:
        # Aseguramos que los IDs sean enteros limpios
        tmpl_ids = [int(p['id']) for p in product_templates]
        
        # 1. Obtener Variantes
        variants = client.env['product.product'].search_read(
            [('product_tmpl_id', 'in', tmpl_ids)],
            ['id', 'product_tmpl_id']
        )
        if not variants:
            return {}

        all_vid = []
        variant_to_tmpl = {}
        for v in variants:
            tid = v['product_tmpl_id'][0]
            vid = int(v['id']) # Force int
            all_vid.append(vid)
            variant_to_tmpl[vid] = tid

        # -------------------------------------------------------
        # 2. OBTENER UBICACIONES (PASO A PASO SEGURO)
        # -------------------------------------------------------
        # Paso A: Buscar la ubicación Padre (MLOG/Stock)
        # Usamos 'ilike' en complete_name para encontrar la ruta exacta
        parent_locs = client.env['stock.location'].search([('complete_name', 'ilike', 'MLOG/Stock')])
        
        # Fallback: Si no encuentra MLOG, busca 'Stock' genérico interno
        if not parent_locs:
            print("⚠️ No se encontró 'MLOG/Stock', buscando 'Stock' genérico interno.")
            parent_locs = client.env['stock.location'].search([('usage', '=', 'internal'), ('name', '=', 'Stock')])

        final_loc_ids = []

        if parent_locs:
            # Tomamos el primer ID y lo forzamos a int
            parent_id = int(parent_locs[0])
            
            # Paso B: Buscar todos los hijos de ese ID
            # Esto incluye la ubicación padre y todas las estanterías/sub-ubicaciones dentro
            child_locs = client.env['stock.location'].search([('id', 'child_of', parent_id)])
            
            # Convertimos a lista de enteros limpios para evitar errores de XMLRPC
            final_loc_ids = [int(x) for x in child_locs]
            print(f"📍 Calculando stock en {len(final_loc_ids)} ubicaciones (Raíz ID: {parent_id})")
        else:
            # Fallback final: Todas las internas si falla todo lo anterior
            print("⚠️ Usando todas las ubicaciones internas (Fallback total).")
            all_internal = client.env['stock.location'].search([('usage', '=', 'internal')])
            final_loc_ids = [int(x) for x in all_internal]

        # -------------------------------------------------------
        # 3. STOCK ACTUAL (Usando lista explícita de IDs)
        # -------------------------------------------------------
        quants = client.env['stock.quant'].read_group(
            [
                ('product_id', 'in', all_vid), 
                ('location_id', 'in', final_loc_ids) # Usamos IN con la lista sanitizada
            ],
            ['product_id', 'quantity'],
            ['product_id']
        )
        
        stock_by_tmpl = {t: 0 for t in tmpl_ids}
        for q in quants:
            # q['product_id'] suele venir como (id, "Nombre") o solo ID
            raw_prod = q['product_id']
            vid = raw_prod[0] if isinstance(raw_prod, (list, tuple)) else raw_prod
            vid = int(vid)
            
            qty = q['quantity']
            
            if vid in variant_to_tmpl:
                stock_by_tmpl[variant_to_tmpl[vid]] += qty

        # -------------------------------------------------------
        # 4. ÚLTIMA COMPRA (Para el semáforo)
        # -------------------------------------------------------
        moves = client.env['stock.move'].search_read(
            [
                ('product_id', 'in', all_vid),
                ('state', '=', 'done'),
                ('purchase_line_id', '!=', False)
            ],
            ['product_id', 'product_uom_qty', 'date'],
            order='date desc',
            limit=len(all_vid) * 3
        )

        last_purchase_by_tmpl = {}
        for m in moves:
            raw_prod = m['product_id']
            vid = raw_prod[0] if isinstance(raw_prod, (list, tuple)) else raw_prod
            vid = int(vid)

            if vid in variant_to_tmpl:
                tid = variant_to_tmpl[vid]
                if tid not in last_purchase_by_tmpl:
                    last_purchase_by_tmpl[tid] = m['product_uom_qty'] or 0

        # 5. RESULTADOS
        results = {}
        for tid in tmpl_ids:
            current = stock_by_tmpl.get(tid, 0)
            last_qty = last_purchase_by_tmpl.get(tid, 0)
            
            state = 'green'
            if last_qty > 0:
                ratio = current / last_qty
                if ratio <= 0.10: state = 'red'
                elif ratio <= 0.50: state = 'orange'
                else: state = 'green'
            else:
                # Si hay stock pero no hay compra registrada, verde. Si es 0, rojo.
                if current <= 0: state = 'red'
                else: state = 'green'

            results[tid] = {'state': state, 'quantity': current}
            
        return results

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ ERROR CRÍTICO STOCK: {e}")
        return {}

# --- AGREGAR EN main.py ---

def init_newsletter_table():
    """Crea la tabla de suscriptores si no existe."""
    if not DATABASE_URL:
        return
    conn = get_pg_connection()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS newsletter_subscribers (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        cur.close()
        log.info("✅ Tabla 'newsletter_subscribers' verificada.")
    except Exception as e:
        log.error(f"❌ Error tabla newsletter: {e}")
    finally:
        if conn: conn.close()

# Inicializamos la tabla al arrancar
init_newsletter_table()

@app.route('/subscribe', methods=['POST'])
def subscribe_newsletter():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()

    if not email or '@' not in email:
        return jsonify({"error": "Email inválido"}), 400

    pg_conn = get_pg_connection()
    if not pg_conn:
        return jsonify({"error": "Error de base de datos"}), 500

    try:
        cur = pg_conn.cursor()
        # Intentamos insertar, si ya existe no hacemos nada (ON CONFLICT DO NOTHING)
        cur.execute("""
            INSERT INTO newsletter_subscribers (email) 
            VALUES (%s) 
            ON CONFLICT (email) DO NOTHING
        """, (email,))
        
        pg_conn.commit()
        cur.close()
        return jsonify({"ok": True, "message": "Suscripción exitosa"})
    except Exception as e:
        pg_conn.rollback()
        log.error(f"❌ /subscribe error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if pg_conn: pg_conn.close()

# main.py

# main.py

# --- INICIALIZAR TABLA FAVORITOS ---
def init_favorites_table():
    if not DATABASE_URL: return
    conn = get_pg_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS app_user_favorites (
                user_id INTEGER,
                product_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, product_id)
            );
        """)
        conn.commit()
        cur.close()
        log.info("✅ Tabla 'app_user_favorites' verificada.")
    except Exception as e:
        log.error(f"❌ Error tabla favoritos: {e}")
    finally:
        if conn: conn.close()

init_favorites_table()

# --- ENDPOINTS FAVORITOS (CORREGIDOS) ---

@app.route('/favoritos/toggle', methods=['POST'])
def toggle_favorito():
    data = request.get_json() or {}
    cuit = data.get('cuit')
    product_id = data.get('product_id')

    if not cuit or not product_id:
        return jsonify({"error": "Datos incompletos"}), 400

    pg_conn = get_pg_connection()
    client = get_odoo_client()
    
    try:
        # 1. Obtener User ID desde Odoo
        partner = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner: return jsonify({"error": "Usuario no encontrado"}), 404
        
        # CORRECCIÓN: Accedemos a [0] para sacar el ID escalar
        partner_id = int(partner[0].id)
        
        user = client.env["res.users"].search([("partner_id", "=", partner_id)], limit=1)
        if not user: return jsonify({"error": "Usuario sin login"}), 404
        
        # CORRECCIÓN: Accedemos a [0] para evitar el error "argument must be... not list"
        user_id = int(user[0].id)
        
        # 2. Toggle en PostgreSQL
        cur = pg_conn.cursor()
        
        # Verificar si existe
        cur.execute("SELECT 1 FROM app_user_favorites WHERE user_id = %s AND product_id = %s", (user_id, product_id))
        exists = cur.fetchone()
        
        is_favorite = False
        if exists:
            # Borrar
            cur.execute("DELETE FROM app_user_favorites WHERE user_id = %s AND product_id = %s", (user_id, product_id))
            is_favorite = False
        else:
            # Insertar
            cur.execute("INSERT INTO app_user_favorites (user_id, product_id) VALUES (%s, %s)", (user_id, product_id))
            is_favorite = True
            
        pg_conn.commit()
        cur.close()
        
        return jsonify({"ok": True, "is_favorite": is_favorite})

    except Exception as e:
        if pg_conn: pg_conn.rollback()
        log.error(f"❌ /favoritos/toggle: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if pg_conn: pg_conn.close()
        release_odoo_client(client)

@app.route('/favoritos', methods=['GET'])
def get_favoritos():
    cuit = request.args.get('cuit')
    if not cuit: return jsonify({"error": "CUIT requerido"}), 400

    pg_conn = get_pg_connection()
    client = get_odoo_client()
    
    try:
        # 1. Obtener User ID (Misma corrección aplicada aquí)
        partner = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner: return jsonify({"items": []}) 
        
        partner_id = int(partner[0].id)
        
        user = client.env["res.users"].search([("partner_id", "=", partner_id)], limit=1)
        if not user: return jsonify({"items": []})
        
        user_id = int(user[0].id)

        # 2. Obtener IDs de productos favoritos desde PG
        cur = pg_conn.cursor()
        cur.execute("SELECT product_id FROM app_user_favorites WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        rows = cur.fetchall()
        cur.close()
        
        fav_ids = [r[0] for r in rows]
        
        if not fav_ids:
            return jsonify({"items": []})

        # 3. Obtener detalles de productos desde Odoo
        
        # A. Mapa de ofertas (PG)
        offer_map = {}
        cur = pg_conn.cursor()
        cur.execute("SELECT sku, price_offer FROM app_product_offers WHERE is_active = TRUE")
        offer_rows = cur.fetchall()
        cur.close()
        offer_map = {r[0]: float(r[1]) for r in offer_rows}

        # B. Consulta Odoo
        prods_odoo = client.env["product.template"].search_read(
            [("id", "in", fav_ids)],
            ["id", "name", "list_price", "default_code", "write_date", "categ_id"]
        )
        
        # C. Stock
        stock_map = _compute_stock_states(client, prods_odoo)

        def get_fb_url(path):
            return f"https://firebasestorage.googleapis.com/v0/b/{FIREBASE_BUCKET}/o/{quote(path, safe='')}?alt=media"

        # D. Normalizar
        items = []
        for p in prods_odoo:
            pid = p["id"]
            sku = (p["default_code"] or "").strip()
            wd = str(p["write_date"] or "")
            list_price = float(p.get("list_price") or 0)
            
            # Oferta
            offer_price = offer_map.get(sku, None)
            if offer_price is not None and offer_price >= list_price:
                offer_price = None

            # Imagen
            code_path = f"products/{sku}/{sku}.webp" if sku else None
            md_path    = code_path or f"products/{pid}/md.webp"
            thumb_path = code_path or f"products/{pid}/thumb.webp"
            
            st_info = stock_map.get(pid, {'state': 'green', 'quantity': 0})

            items.append({
                "id": pid,
                "name": p.get("name"),
                "list_price": list_price,
                "price_offer": offer_price,
                "default_code": sku,
                "image_thumb_url": get_fb_url(thumb_path) + f"&v={wd}",
                "image_md_url": get_fb_url(md_path) + f"&v={wd}",
                "stock_state": st_info['state'],
                "stock_qty": st_info['quantity'],
                "categ_id": p.get("categ_id"),
            })

        return jsonify({"items": items})

    except Exception as e:
        log.error(f"❌ /favoritos: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if pg_conn: pg_conn.close()
        release_odoo_client(client)

# --- AGREGAR EN main.py ---

from werkzeug.security import generate_password_hash, check_password_hash

# 1. ACTUALIZAR TABLAS (Puedes reemplazar tu init_db o agregar esta función)
# main.py

def init_auth_tables():
    if not DATABASE_URL: return
    conn = get_pg_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        # Aseguramos que cuit sea UNIQUE para que el ON CONFLICT funcione
        cur.execute("""
            CREATE TABLE IF NOT EXISTS app_users (
                id SERIAL PRIMARY KEY,
                cuit VARCHAR(20) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role VARCHAR(50) DEFAULT 'PENDING', 
                name VARCHAR(255),
                push_token VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            );
        """)
        
        # Si la tabla ya existe pero no tiene el UNIQUE, lo agregamos:
        try:
            cur.execute("ALTER TABLE app_users ADD CONSTRAINT unique_cuit_auth UNIQUE (cuit);")
        except:
            conn.rollback() # Ya existe o error, no importa

        conn.commit()
        cur.close()
        log.info("✅ Tabla 'app_users' sincronizada correctamente.")
    except Exception as e:
        log.error(f"❌ Error init_auth_tables: {e}")
    finally:
        if conn: conn.close()

# Ejecutar al inicio
init_auth_tables()

def send_expo_push_notification(token, title, body, data=None):
    """Envía una notificación a través de los servidores de Expo"""
    if not token: 
        return
    
    try:
        url = "https://exp.host/--/api/v2/push/send"
        message = {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
        }
        res = requests.post(url, json=message)
        print(f"📡 Notificación enviada a {token}: {res.status_code}")
    except Exception as e:
        print(f"❌ Error enviando notificación: {e}")

@app.route('/auth/update_token', methods=['POST'])
def update_token():
    data = request.get_json() or {}
    cuit = data.get('cuit')
    token = data.get('push_token')

    if not cuit or not token:
        return jsonify({"error": "Datos incompletos"}), 400

    pg_conn = get_pg_connection()
    try:
        cur = pg_conn.cursor()
        # Guardamos el token en la base de datos
        cur.execute("UPDATE app_users SET push_token = %s WHERE cuit = %s", (token, cuit))
        pg_conn.commit()
        cur.close()
        return jsonify({"ok": True})
    except Exception as e:
        if pg_conn: pg_conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if pg_conn: pg_conn.close()


# ==========================================
# ENDPOINTS DE AUTENTICACIÓN (LOGIN/REGISTRO)
# ==========================================

@app.route('/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    cuit = data.get('cuit', '').strip()
    password = data.get('password', '').strip()

    if not cuit or not password:
        return jsonify({"error": "Faltan datos"}), 400

    pg_conn = get_pg_connection()
    client = get_odoo_client()

    try:
        cur = pg_conn.cursor()
        
        # A. Verificar si ya tiene cuenta en la APP (Postgres)
        cur.execute("SELECT id FROM app_users WHERE cuit = %s", (cuit,))
        if cur.fetchone():
            return jsonify({"error": "Ya existe una cuenta para este CUIT. Intente iniciar sesión."}), 409

        # B. Verificar si existe en ODOO (Sistema Central)
        # Buscamos por CUIT (vat) para ver si es cliente nuestro
        partner = client.env["res.partner"].search_read([("vat", "=", cuit)], ["id", "name"], limit=1)
        
        if not partner:
            # CUIT NO EXISTE EN ODOO -> Bloquear ingreso
            return jsonify({
                "error": "El CUIT no figura en nuestra base de clientes.",
                "action": "CONTACT_ADMIN" # Señal para el frontend
            }), 404

        partner_name = partner[0]['name']

        # C. Crear usuario PENDIENTE en Postgres (Con contraseña hasheada)
        hashed_pw = generate_password_hash(password)
        
        # Insertamos con rol 'PENDING' por defecto
        cur.execute(
            "INSERT INTO app_users (cuit, password_hash, role, name) VALUES (%s, %s, 'PENDING', %s) RETURNING id",
            (cuit, hashed_pw, partner_name)
        )
        pg_conn.commit()
        cur.close()

        return jsonify({
            "ok": True,
            "message": "Solicitud enviada. Pendiente de aprobación.",
            "status": "PENDING"
        })

    except Exception as e:
        if pg_conn: pg_conn.rollback()
        log.error(f"❌ /auth/register: {e}")
        return jsonify({"error": "Error interno del servidor"}), 500
    finally:
        if pg_conn: pg_conn.close()
        release_odoo_client(client)


@app.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    cuit = data.get('cuit', '').strip()
    password = data.get('password', '').strip()

    if not cuit or not password:
        return jsonify({"error": "Credenciales incompletas"}), 400

    pg_conn = get_pg_connection()
    # Nota: El login es contra Postgres, no necesitamos molestar a Odoo aquí
    
    try:
        cur = pg_conn.cursor()
        cur.execute("SELECT id, password_hash, role, name, is_active FROM app_users WHERE cuit = %s", (cuit,))
        user = cur.fetchone()
        cur.close()

        if not user:
            return jsonify({"error": "Usuario no registrado. Cree una cuenta primero."}), 404

        uid, pwd_hash, role, name, is_active = user

        # 1. Verificar Hash de contraseña
        if not check_password_hash(pwd_hash, password):
            return jsonify({"error": "Contraseña incorrecta."}), 401

        # 2. Verificar Estado Activo
        if not is_active:
            return jsonify({"error": "Su cuenta ha sido desactivada."}), 403

        # 3. Verificar Rol PENDIENTE
        if role == 'PENDING':
            return jsonify({
                "error": "Su cuenta está pendiente de aprobación.",
                "status": "PENDING"
            }), 403

        # Login Exitoso
        return jsonify({
            "ok": True,
            "user_id": uid,
            "cuit": cuit,
            "name": name,
            "role": role
        })

    except Exception as e:
        log.error(f"❌ /auth/login: {e}")
        return jsonify({"error": "Error de conexión"}), 500
    finally:
        if pg_conn: pg_conn.close()

def send_push_notification(token, title, body):
    if not token or not token.startswith('ExponentPushToken'):
        return
    
    url = "https://exp.host/--/api/v2/push/send"
    message = {
        "to": token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": { "someData": "goes here" },
    }
    requests.post(url, json=message)


# ==========================================
# ENDPOINTS DE ADMINISTRACIÓN DE USUARIOS
# ==========================================

# 1. Obtener SOLO los pendientes (para la pestaña "Solicitudes")
@app.route('/admin/users/pending', methods=['GET'])
def get_pending_users():
    pg_conn = get_pg_connection()
    try:
        cur = pg_conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, cuit, name, created_at, role FROM app_users WHERE role = 'PENDING' ORDER BY created_at DESC")
        users = cur.fetchall()
        return jsonify(users)
    except Exception as e:
        log.error(f"❌ /admin/users/pending: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if pg_conn: pg_conn.close()


# 2. Obtener TODOS los usuarios (para la pestaña "Usuarios")
@app.route('/admin/users/all', methods=['GET'])
def get_all_app_users():
    pg_conn = get_pg_connection()
    try:
        cur = pg_conn.cursor(cursor_factory=RealDictCursor)
        # Traemos todos menos los pendientes si quieres separarlos, o todos juntos.
        # Aquí traemos TODOS para que el admin tenga control total.
        cur.execute("SELECT id, cuit, name, role, is_active, created_at FROM app_users ORDER BY created_at DESC")
        users = cur.fetchall()
        return jsonify(users)
    except Exception as e:
        log.error(f"❌ /admin/users/all: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if pg_conn: pg_conn.close()

# main.py

@app.route('/users', methods=['GET'])
def get_users_unified():
    conn = get_pg_connection()
    if not conn: return jsonify([]), 500
    try:
        cur = conn.cursor()
        # Mantenemos la consulta sin 'email' para evitar el error anterior
        cur.execute("""
            SELECT name, cuit, role, id FROM app_users WHERE is_active = TRUE
            UNION ALL
            SELECT name, cuit, role_name as role, -1 as id 
            FROM app_user_roles 
            WHERE user_id IS NULL
        """)
        rows = cur.fetchall()
        
        users = []
        # Usamos un contador para generar IDs únicos negativos para los pre-asignados
        temp_id_counter = -1
        
        for r in rows:
            current_id = r[3]
            
            # Si el ID es -1 (viene de app_user_roles), le asignamos uno único
            if current_id == -1:
                current_id = temp_id_counter
                temp_id_counter -= 1 # El siguiente será -2, -3, etc.
            
            users.append({
                "name": r[0],
                "cuit": r[1],
                "role": r[2],
                "id": current_id # Ahora cada usuario tendrá un ID diferente
            })
        return jsonify(users)
    except Exception as e:
        log.error(f"Error get_users: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

# 3. Aprobar Usuario (Pasa de PENDING a Cliente)
@app.route('/admin/users/approve', methods=['POST'])
def approve_user():
    data = request.get_json() or {}
    user_db_id = data.get('id')
    new_role = data.get('role', 'Cliente') 

    if not user_db_id: return jsonify({"error": "ID requerido"}), 400

    pg_conn = get_pg_connection()
    try:
        cur = pg_conn.cursor()
        
        # 1. Actualizar Rol
        cur.execute("UPDATE app_users SET role = %s WHERE id = %s", (new_role, user_db_id))
        
        # 2. Obtener Token del Usuario para avisarle
        cur.execute("SELECT push_token, name FROM app_users WHERE id = %s", (user_db_id,))
        row = cur.fetchone()
        
        pg_conn.commit()
        cur.close()

        # 3. Enviar Notificación (Si tiene token)
        if row and row[0]:
            push_token = row[0]
            user_name = row[1] or "Usuario"
            send_expo_push_notification(
                token=push_token,
                title="¡Cuenta Aprobada! 🎉",
                body=f"Hola {user_name}, ya podés ingresar a la App de Sal-Bom."
            )

        return jsonify({"ok": True})
    except Exception as e:
        if pg_conn: pg_conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if pg_conn: pg_conn.close()

# 4. Cambiar Rol Genérico (Para la pestaña de edición completa)
@app.route('/admin/users/role', methods=['POST'])
def update_app_user_role():
    data = request.get_json() or {}
    user_id = data.get('id')
    new_role = data.get('role')
    
    if not user_id or not new_role:
        return jsonify({"error": "Faltan datos (id, role)"}), 400

    pg_conn = get_pg_connection()
    try:
        cur = pg_conn.cursor()
        cur.execute("UPDATE app_users SET role = %s WHERE id = %s", (new_role, user_id))
        pg_conn.commit()
        return jsonify({"ok": True})
    except Exception as e:
        if pg_conn: pg_conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if pg_conn: pg_conn.close()

# --- GESTIÓN DE CARRITO PERSISTENTE ---

def init_cart_table():
    if not DATABASE_URL: return
    conn = get_pg_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        # Tabla simple: Un usuario -> Un JSON gigante con sus items (o filas por item)
        # Usaremos filas por usuario para simplicidad: user_id | items_json
        cur.execute("""
            CREATE TABLE IF NOT EXISTS app_user_carts (
                user_id INTEGER PRIMARY KEY,
                items_json TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        cur.close()
        log.info("✅ Tabla 'app_user_carts' verificada.")
    except Exception as e:
        log.error(f"❌ Error tabla carrito: {e}")
    finally:
        if conn: conn.close()

init_cart_table()

@app.route('/cart/save', methods=['POST'])
def update_cart():
    data = request.json or {}
    cuit = data.get('cuit')
    items = data.get('items', [])
    
    if not cuit: return jsonify({"error": "Falta CUIT"}), 400

    def _execute_save(client_inst):
        user = client_inst.env['res.users'].search([('login', '=', cuit)], limit=1)
        if not user: return False
        
        lines_clean = []
        
        for i in items:
            try:
                raw_pid = i.get('product_id') or i.get('id')
                
                # Al llamar a este helper corregido, si raw_pid es gigante
                # retornará None inmediatamente sin romper Odoo.
                pid = _get_variant_id(client_inst, raw_pid)
                
                if not pid: continue
                
                raw_qty = i.get('quantity') or i.get('product_uom_qty') or 1
                qty = float(raw_qty)

                lines_clean.append({'product_id': pid, 'qty': qty})
            except Exception:
                continue

        if not lines_clean: return True

        if hasattr(client_inst.env, 'app.user.cart'):
            client_inst.env['app.user.cart'].create_or_update_cart(user[0], lines_clean)
        return True

    try:
        execute_odoo_operation(_execute_save)
        return jsonify({"status": "ok"}), 200
    except Exception as e:
        log.error(f"❌ Error en /cart/save: {e}")
        return jsonify({"status": "error", "detail": str(e)}), 200

@app.route('/cart/load', methods=['GET'])
def load_cart():
    """Recupera el carrito guardado del usuario"""
    cuit = request.args.get('cuit')
    if not cuit: return jsonify({"items": []})

    pg_conn = get_pg_connection()
    client = get_odoo_client()
    try:
        # 1. Obtener User ID
        partner = client.env["res.partner"].search([("vat", "=", cuit)], limit=1)
        if not partner: return jsonify({"items": []})
        partner_id = int(partner[0].id)
        
        user = client.env["res.users"].search([("partner_id", "=", partner_id)], limit=1)
        if not user: return jsonify({"items": []})
        user_id = int(user[0].id)

        # 2. Leer de Postgres
        cur = pg_conn.cursor()
        cur.execute("SELECT items_json FROM app_user_carts WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
        cur.close()

        if row and row[0]:
            items = json.loads(row[0])
            return jsonify({"items": items})
        
        return jsonify({"items": []})

    except Exception as e:
        log.error(f"❌ /cart/load: {e}")
        return jsonify({"items": []}) # Si falla, devolvemos vacío para no bloquear
    finally:
        if pg_conn: pg_conn.close()
        release_odoo_client(client)

# ---------- Disparar sync manual (protegido por token) ----------
SYNC_TOKEN = os.getenv("SYNC_TOKEN")

@app.post("/admin/sync_now")
def admin_sync_now():
    if not HAS_SYNC:
        return jsonify({"ok": False, "error": "sync_worker no disponible"}), 501
    token = request.headers.get("X-Sync-Token")
    if SYNC_TOKEN and token != SYNC_TOKEN:
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    try:
        p = sync_products()
        c = sync_partners()
        return jsonify({"ok": True, "synced_products": p, "synced_partners": c})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
# ─────────────────────────── Run ──────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    # Lanzar sync en background si está habilitado
    if ENABLE_BACKGROUND_SYNC:
        try:
            import threading
            t = threading.Thread(target=periodic_sync_loop, args=(BACKGROUND_SYNC_INTERVAL,), daemon=True)
            t.start()
            log.info(f"Background sync habilitado cada {BACKGROUND_SYNC_INTERVAL}s")
        except Exception as e:
            log.warning(f"No se pudo iniciar background sync: {e}")
    app.run(host="0.0.0.0", port=port)